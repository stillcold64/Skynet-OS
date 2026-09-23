import pandas as pd
import numpy as np

# Load H1
df = pd.read_csv('ea/python/xauusd_h1.csv')
df['time'] = pd.to_datetime(df['time'])
df = df.sort_values('time').reset_index(drop=True)

# Build ATR on H1 or D1
# Compute 24-period ATR on H1 (representing ~1 day volatility)
df['tr0'] = df['high'] - df['low']
df['tr1'] = (df['high'] - df['close'].shift(1)).abs()
df['tr2'] = (df['low'] - df['close'].shift(1)).abs()
df['tr'] = df[['tr0', 'tr1', 'tr2']].max(axis=1)
df['atr24'] = df['tr'].rolling(24).mean()

df_test = df.iloc[-16105:].copy().reset_index(drop=True)

# Build weekly table
df['iso_year'] = df['time'].dt.isocalendar().year
df['iso_week'] = df['time'].dt.isocalendar().week
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

def run_simulation(entry_hour=1, sl_mult=1.0, step_mult=0.5, lots=[0.20, 0.40, 0.60, 1.00], use_atr=True, fixed_sl=15.0, fixed_step=7.5):
    df_test['iso_year'] = df_test['time'].dt.isocalendar().year
    df_test['iso_week'] = df_test['time'].dt.isocalendar().week
    df_test['dow'] = df_test['time'].dt.dayofweek
    
    tue_groups = df_test[df_test['dow'] == 1].groupby(['iso_year', 'iso_week'])
    
    trades = []
    for (y, w), t_df in tue_groups:
        w_info = weekly_dict.get((y, w))
        if not w_info or w_info['prev_gain'] < 0.8 or w_info['prev_close'] <= w_info['prev_open']:
            continue
            
        t_bars = t_df.sort_values('time').reset_index(drop=True)
        # Find entry bar
        entry_bar = None
        for idx, row in t_bars.iterrows():
            if row['time'].hour < entry_hour:
                continue
            entry_bar = row
            start_idx = idx
            break
            
        if entry_bar is None:
            continue
            
        entry_price = entry_bar['open']
        atr = entry_bar['atr24'] if pd.notnull(entry_bar['atr24']) and entry_bar['atr24'] > 0 else 25.0
        
        if use_atr:
            sl_dist = atr * sl_mult
            step_dist = atr * step_mult
        else:
            sl_dist = fixed_sl
            step_dist = fixed_step
            
        initial_sl = entry_price + sl_dist
        positions = [{'lot': lots[0], 'open_p': entry_price, 'sl': initial_sl}]
        pnl = 0.0
        closed = False
        
        for idx in range(start_idx, len(t_bars)):
            bar = t_bars.iloc[idx]
            b_high = bar['high']
            b_low = bar['low']
            b_time = bar['time']
            
            # Exit at 22:00
            if b_time.hour >= 22:
                for pos in positions:
                    pnl += (pos['open_p'] - bar['open']) * pos['lot'] * 100.0
                closed = True
                break
                
            # Check SL
            sl_hit = False
            for pos in positions:
                if b_high >= pos['sl']:
                    sl_hit = True
                    break
            if sl_hit:
                for pos in positions:
                    pnl += (pos['open_p'] - pos['sl']) * pos['lot'] * 100.0
                closed = True
                break
                
            # Check layers
            lowest_entry = min(p['open_p'] for p in positions)
            active_count = len(positions)
            if active_count < len(lots):
                next_target = lowest_entry - step_dist
                if b_low <= next_target:
                    # Trail existing positions
                    trail_sl = next_target + step_dist - 1.0
                    for p in positions:
                        p['sl'] = min(p['sl'], trail_sl)
                    new_lot = lots[active_count]
                    new_sl = next_target + step_dist
                    positions.append({'lot': new_lot, 'open_p': next_target, 'sl': new_sl})
                    
        if not closed:
            last_bar = t_bars.iloc[-1]
            for pos in positions:
                pnl += (pos['open_p'] - last_bar['close']) * pos['lot'] * 100.0
                
        trades.append(pnl)
        
    res = np.array(trades)
    wins = res[res > 0]
    losses = res[res <= 0]
    wr = len(wins) / len(res) * 100 if len(res) > 0 else 0
    tot = res.sum()
    pf = wins.sum() / abs(losses.sum()) if abs(losses.sum()) > 0 else 999.0
    return len(res), wr, tot, pf

print("--- BASELINE (Original: Entry H=1, Fixed SL=15, Step=7.5) ---")
n, wr, tot, pf = run_simulation(entry_hour=1, use_atr=False, fixed_sl=15.0, fixed_step=7.5)
print(f"Trades: {n}, WinRate: {wr:.1f}%, Profit: ${tot:,.2f}, PF: {pf:.2f}")

print("\n--- TEST: Different Entry Hours (London Session vs Asian Midnight) ---")
for h in [1, 3, 6, 8, 9, 10, 12, 13]:
    n, wr, tot, pf = run_simulation(entry_hour=h, use_atr=False, fixed_sl=15.0, fixed_step=7.5)
    print(f"Hour {h:02d}:00 | Trades: {n}, WinRate: {wr:.1f}%, Profit: ${tot:,.2f}, PF: {pf:.2f}")

print("\n--- TEST: ATR-Adaptive SL & Step at Entry Hour 8-10 ---")
for h in [1, 8, 10]:
    for sl_m in [1.0, 1.5, 2.0]:
        for st_m in [0.5, 0.75, 1.0]:
            n, wr, tot, pf = run_simulation(entry_hour=h, sl_mult=sl_m, step_mult=st_m, use_atr=True)
            print(f"H={h:02d}, SL={sl_m:.1f}xATR, Step={st_m:.2f}xATR | WR: {wr:.1f}%, Profit: ${tot:,.2f}, PF: {pf:.2f}")
