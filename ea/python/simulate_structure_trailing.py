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

def simulate_h1_structure_trailing(
    df_data,
    buffer=15.0,
    reversal_drop=3.0,
    sl_usd=25.0,
    step_usd=12.0,
    lots=[0.20, 0.40, 0.60, 1.00],
    exit_hour=21
):
    tue_groups = df_data[df_data['dow'] == 1].groupby(['iso_year', 'iso_week'])
    trades = []
    
    for (y, w), t_df in tue_groups:
        w_info = weekly_dict.get((y, w))
        if not w_info or w_info['prev_gain'] < 0.8 or w_info['prev_close'] <= w_info['prev_open']:
            continue
            
        t_bars = t_df.sort_values('time').reset_index(drop=True)
        if len(t_bars) < 10: continue
        
        tue_open = t_bars.iloc[0]['open']
        target_high = tue_open + buffer
        
        entered = False
        entry_idx = -1
        entry_price = 0.0
        current_high = tue_open
        
        for idx, bar in t_bars.iterrows():
            if bar['high'] > current_high:
                current_high = bar['high']
            if current_high >= target_high and (current_high - bar['low']) >= reversal_drop:
                entry_price = current_high - reversal_drop
                entry_idx = idx
                entered = True
                break
                
        if not entered: continue
        
        # Initial SL
        positions = [{'lot': lots[0], 'open_p': entry_price, 'sl': entry_price + sl_usd}]
        pnl = 0.0
        closed = False
        
        for idx in range(entry_idx, len(t_bars)):
            bar = t_bars.iloc[idx]
            b_high = bar['high']
            b_low = bar['low']
            b_time = bar['time']
            
            # Trail SL using previous H1 bar high
            if idx > 0:
                prev_bar_high = t_bars.iloc[idx-1]['high'] + 0.50
                for p in positions:
                    if prev_bar_high < p['sl']:
                        p['sl'] = prev_bar_high
                        
            # Check EOD harvest
            if b_time.hour >= exit_hour:
                pnl = sum((p['open_p'] - bar['open']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # Check SL hit
            if any(b_high >= p['sl'] for p in positions):
                pnl = sum((p['open_p'] - p['sl']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # Check Pyramiding layers
            lowest_entry = min(p['open_p'] for p in positions)
            active_count = len(positions)
            if active_count < len(lots):
                next_trigger = lowest_entry - step_usd
                if b_low <= next_trigger:
                    cur_sl = positions[0]['sl']
                    positions.append({'lot': lots[active_count], 'open_p': next_trigger, 'sl': cur_sl})
                    
        if not closed:
            last_bar = t_bars.iloc[-1]
            pnl = sum((p['open_p'] - last_bar['close']) * p['lot'] * 100.0 for p in positions)
            
        trades.append({
            'year': y,
            'week': w,
            'pnl': pnl,
            'layers': len(positions),
            'is_win': pnl > 0
        })
        
    tdf = pd.DataFrame(trades)
    if len(tdf) == 0: return 0, 0, 0, 0, 0, 0
    wins = tdf[tdf['pnl'] > 0]
    losses = tdf[tdf['pnl'] <= 0]
    wr = len(wins)/len(tdf)*100
    net = tdf['pnl'].sum()
    pf = wins['pnl'].sum()/abs(losses['pnl'].sum()) if len(losses)>0 and losses['pnl'].sum()!=0 else 999
    
    eq = 5000 + np.cumsum(tdf['pnl'].values)
    peak = np.maximum.accumulate(eq)
    mdd = np.max(peak - eq)
    min_b = np.min(eq)
    return len(tdf), wr, net, pf, mdd, min_b, wins['pnl'].max() if len(wins)>0 else 0

df_2024 = df.iloc[-16105:].copy()
print("="*75)
print("TESTING H1 PREVIOUS HIGH STRUCTURE TRAILING")
print("="*75)

# Test across different sizing schedules for $5,000 capital
for l_sched, label in [
    ([0.10, 0.20, 0.30, 0.50], "Sizing: 0.10 -> 0.20 -> 0.30 -> 0.50 (Conservative)"),
    ([0.20, 0.40, 0.60, 1.00], "Sizing: 0.20 -> 0.40 -> 0.60 -> 1.00 (Standard Alpha)"),
    ([0.30, 0.60, 0.90, 1.50], "Sizing: 0.30 -> 0.60 -> 0.90 -> 1.50 (High Alpha)")
]:
    print(f"\n--- {label} ---")
    for st in [10.0, 12.0, 15.0]:
        n, wr, net24, pf24, mdd24, minb24, maxw24 = simulate_h1_structure_trailing(
            df_2024, step_usd=st, lots=l_sched
        )
        n_a, wr_a, net_all, pf_all, mdd_all, minb_all, maxw_all = simulate_h1_structure_trailing(
            df, step_usd=st, lots=l_sched
        )
        print(f"Step=${st:4.1f} | 24-26 Net: ${net24:9,.2f} | 24-26 DD: ${mdd24:7,.2f} | WR: {wr:4.1f}% | 8.5yr Net: ${net_all:10,.2f} | 8.5yr DD: ${mdd_all:7,.2f} | MaxWin: ${maxw_all:8,.2f}")
