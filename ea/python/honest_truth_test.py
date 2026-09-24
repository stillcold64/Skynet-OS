import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append('ea/python')
import pandas as pd
import numpy as np

# Load H1
df = pd.read_csv('ea/python/xauusd_h1.csv')
df['time'] = pd.to_datetime(df['time'])
df = df.sort_values('time').reset_index(drop=True)

df['iso_year'] = df['time'].dt.isocalendar().year
df['iso_week'] = df['time'].dt.isocalendar().week
df['dow'] = df['time'].dt.dayofweek

# Weekly data
weekly = df.groupby(['iso_year', 'iso_week']).agg(
    open=('open', 'first'),
    high=('high', 'max'),
    low=('low', 'min'),
    close=('close', 'last')
).reset_index()
weekly['gain_pct'] = (weekly['close'] - weekly['open']) / weekly['open'] * 100.0

weekly_dict = {}
for i in range(len(weekly)):
    y = weekly.loc[i, 'iso_year']
    w = weekly.loc[i, 'iso_week']
    if i > 0:
        weekly_dict[(y, w)] = {
            'prev_gain': weekly.loc[i-1, 'gain_pct'],
            'prev_close': weekly.loc[i-1, 'close'],
            'prev_open': weekly.loc[i-1, 'open']
        }

# Pure honest test: 1 Short trade per Tuesday
def test_pure_tuesday_short(df_data, min_gain=0.8, entry_hour=1, sl_pts=20.0, tp_pts=30.0, exit_at_eod=True):
    tue_groups = df_data[df_data['dow'] == 1].groupby(['iso_year', 'iso_week'])
    trades = []
    
    for (y, w), t_df in tue_groups:
        w_info = weekly_dict.get((y, w))
        if not w_info or w_info['prev_gain'] < min_gain or w_info['prev_close'] <= w_info['prev_open']:
            continue
            
        t_bars = t_df.sort_values('time').reset_index(drop=True)
        # Entry bar
        entry_bars = t_bars[t_bars['time'].dt.hour >= entry_hour]
        if len(entry_bars) == 0: continue
        entry_bar = entry_bars.iloc[0]
        
        entry_price = entry_bar['open']
        sl_price = entry_price + sl_pts if sl_pts > 0 else 999999.0
        tp_price = entry_price - tp_pts if tp_pts > 0 else 0.0
        
        pnl = 0.0
        outcome = "HOLD"
        
        for idx, bar in t_bars[t_bars['time'] >= entry_bar['time']].iterrows():
            hit_sl = bar['high'] >= sl_price
            hit_tp = bar['low'] <= tp_price
            
            if hit_sl and hit_tp:
                # Conservative: assume SL hit first
                pnl = -sl_pts
                outcome = "SL"
                break
            elif hit_sl:
                pnl = -sl_pts
                outcome = "SL"
                break
            elif hit_tp:
                pnl = tp_pts
                outcome = "TP"
                break
                
        if outcome == "HOLD":
            last_close = t_bars.iloc[-1]['close']
            pnl = entry_price - last_close
            outcome = "EOD"
            
        trades.append({
            'year': y,
            'week': w,
            'entry_price': entry_price,
            'pnl_pts': pnl,
            'pnl_usd': pnl * 0.10 * 100.0, # 0.10 lot
            'outcome': outcome
        })
        
    tdf = pd.DataFrame(trades)
    if len(tdf) == 0: return 0, 0, 0, 0, 0
    wins = tdf[tdf['pnl_pts'] > 0]
    losses = tdf[tdf['pnl_pts'] <= 0]
    wr = len(wins)/len(tdf)*100
    net = tdf['pnl_usd'].sum()
    pf = wins['pnl_usd'].sum() / abs(losses['pnl_usd'].sum()) if len(losses)>0 and losses['pnl_usd'].sum()!=0 else 999.0
    return len(tdf), wr, net, pf, len(wins), len(losses)

print("="*80)
print("HONEST RAW TRUTH: SINGLE SHORT TRADE ON TUESDAY (NO SNOWBALL / NO TRICKS)")
print("="*80)

# Period 1: 2024-2026 (The Bull Run)
df_2024 = df.iloc[-16105:].copy()

print("\n--- Period: 2024-2026 (16,105 bars) | Fixed TP & SL | Lot: 0.10 ---")
for mg in [0.8, 1.5, 2.0]:
    for sl in [15.0, 20.0, 30.0, 40.0]:
        for tp in [15.0, 20.0, 30.0, 40.0]:
            n, wr, net, pf, w_c, l_c = test_pure_tuesday_short(df_2024, min_gain=mg, sl_pts=sl, tp_pts=tp)
            if pf > 1.2:
                print(f"MinGain: {mg:.1f}%, SL=${sl:2.0f}, TP=${tp:2.0f} | Trades: {n:2d} | Wins: {w_c:2d}, Loss: {l_c:2d} | WR: {wr:4.1f}% | Net: ${net:7,.2f} | PF: {pf:4.2f}")

print("\n--- Period: Full 8.5 Years (2018-2026) | Fixed TP & SL | Lot: 0.10 ---")
for mg in [0.8, 1.5, 2.0]:
    for sl in [20.0, 30.0, 40.0]:
        for tp in [20.0, 30.0, 40.0]:
            n, wr, net, pf, w_c, l_c = test_pure_tuesday_short(df, min_gain=mg, sl_pts=sl, tp_pts=tp)
            if pf > 1.2:
                print(f"MinGain: {mg:.1f}%, SL=${sl:2.0f}, TP=${tp:2.0f} | Trades: {n:2d} | Wins: {w_c:2d}, Loss: {l_c:2d} | WR: {wr:4.1f}% | Net: ${net:7,.2f} | PF: {pf:4.2f}")
