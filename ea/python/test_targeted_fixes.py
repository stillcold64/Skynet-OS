import pandas as pd
import numpy as np

# Load H1
df = pd.read_csv('ea/python/xauusd_h1.csv')
df['time'] = pd.to_datetime(df['time'])
df = df.iloc[-16105:].copy().reset_index(drop=True)
df['date'] = df['time'].dt.date
df['dow'] = df['time'].dt.dayofweek
df['iso_year'] = df['time'].dt.isocalendar().year
df['iso_week'] = df['time'].dt.isocalendar().week

# Calculate ATR24
df['tr0'] = df['high'] - df['low']
df['tr1'] = (df['high'] - df['close'].shift(1)).abs()
df['tr2'] = (df['low'] - df['close'].shift(1)).abs()
df['tr'] = df[['tr0', 'tr1', 'tr2']].max(axis=1)
df['atr24'] = df['tr'].rolling(24).mean()

# Build weekly table
all_df = pd.read_csv('ea/python/xauusd_h1.csv')
all_df['time'] = pd.to_datetime(all_df['time'])
all_df['iso_year'] = all_df['time'].dt.isocalendar().year
all_df['iso_week'] = all_df['time'].dt.isocalendar().week
weekly = all_df.groupby(['iso_year', 'iso_week']).agg(
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

def simulate_strategy(
    min_gain=0.8,
    entry_hour=1,
    sl_usd=25.0,
    step_usd=10.0,
    target_tp_usd=0.0, # 0 means disabled
    basket_tp_dollars=0.0, # Target dollar gain (e.g. $1500)
    trail_profit_dollars=0.0, # Trail after reaching certain profit
    lots=[0.20, 0.40, 0.60, 1.00],
    exit_hour=18 # Exit at 18:00 instead of 22:00
):
    tue_groups = df[df['dow'] == 1].groupby(['iso_year', 'iso_week'])
    trades = []
    
    for (y, w), t_df in tue_groups:
        w_info = weekly_dict.get((y, w))
        if not w_info or w_info['prev_gain'] < min_gain or w_info['prev_close'] <= w_info['prev_open']:
            continue
            
        t_bars = t_df.sort_values('time').reset_index(drop=True)
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
        initial_sl = entry_price + sl_usd
        positions = [{'lot': lots[0], 'open_p': entry_price, 'sl': initial_sl}]
        pnl = 0.0
        closed = False
        highest_pnl = 0.0
        
        for idx in range(start_idx, len(t_bars)):
            bar = t_bars.iloc[idx]
            b_high = bar['high']
            b_low = bar['low']
            b_time = bar['time']
            
            # Check Basket Floating PnL at bar Low (peak profit)
            floating_max = sum((p['open_p'] - b_low) * p['lot'] * 100.0 for p in positions)
            if floating_max > highest_pnl:
                highest_pnl = floating_max
                
            # Basket Take Profit hit?
            if basket_tp_dollars > 0 and floating_max >= basket_tp_dollars:
                pnl = basket_tp_dollars
                closed = True
                break
                
            # Trail profit from peak?
            if trail_profit_dollars > 0 and highest_pnl >= trail_profit_dollars:
                current_float = sum((p['open_p'] - bar['close']) * p['lot'] * 100.0 for p in positions)
                if current_float <= highest_pnl * 0.70: # Lock 70% of peak profit
                    pnl = current_float
                    closed = True
                    break
            
            # Exit Hour check
            if b_time.hour >= exit_hour:
                pnl = sum((p['open_p'] - bar['open']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # Check SL hit
            if any(b_high >= p['sl'] for p in positions):
                pnl = sum((p['open_p'] - p['sl']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # Check target TP points
            if target_tp_usd > 0 and (entry_price - b_low) >= target_tp_usd:
                pnl = sum((p['open_p'] - (entry_price - target_tp_usd)) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # Check Layer Triggers
            lowest_entry = min(p['open_p'] for p in positions)
            active_count = len(positions)
            if active_count < len(lots):
                next_target = lowest_entry - step_usd
                if b_low <= next_target:
                    # Freeroll: move earlier positions to breakeven + buffer
                    trail_sl = next_target + step_usd - 1.0
                    for p in positions:
                        p['sl'] = min(p['sl'], trail_sl)
                    new_lot = lots[active_count]
                    new_sl = next_target + sl_usd
                    positions.append({'lot': new_lot, 'open_p': next_target, 'sl': new_sl})
                    
        if not closed:
            last_bar = t_bars.iloc[-1]
            pnl = sum((p['open_p'] - last_bar['close']) * p['lot'] * 100.0 for p in positions)
            
        trades.append(pnl)
        
    res = np.array(trades)
    if len(res) == 0: return 0, 0, 0, 0, 0
    wins = res[res > 0]
    losses = res[res <= 0]
    wr = len(wins) / len(res) * 100
    tot = res.sum()
    gross_w = wins.sum() if len(wins) > 0 else 0
    gross_l = abs(losses.sum()) if len(losses) > 0 else 0
    pf = gross_w / gross_l if gross_l > 0 else 999.0
    
    # Balance drawdown from $5000
    eq = 5000 + np.cumsum(res)
    peak = np.maximum.accumulate(eq)
    mdd = np.max(peak - eq)
    min_bal = np.min(eq)
    return len(res), wr, tot, pf, min_bal

print("="*75)
print("TESTING TARGETED FIXES FOR 2024-2026 GOLD")
print("="*75)

print("\n1. Test Basket TP ($500, $1000, $1500, $2000, $2500):")
for btp in [500, 1000, 1500, 2000, 3000, 5000]:
    n, wr, tot, pf, minb = simulate_strategy(basket_tp_dollars=btp, exit_hour=22)
    print(f"Basket TP = ${btp:4d} | Trades: {n:2d} | WinRate: {wr:4.1f}% | Net: ${tot:9,.2f} | PF: {pf:4.2f} | MinBal: ${minb:7,.2f}")

print("\n2. Test Exit Hour (14:00, 16:00, 17:00, 18:00, 20:00, 22:00):")
for eh in [14, 15, 16, 17, 18, 19, 20, 22]:
    n, wr, tot, pf, minb = simulate_strategy(exit_hour=eh)
    print(f"Exit Hour = {eh:02d}:00 | Trades: {n:2d} | WinRate: {wr:4.1f}% | Net: ${tot:9,.2f} | PF: {pf:4.2f} | MinBal: ${minb:7,.2f}")

print("\n3. Combined: London Entry (09:00), Basket TP or Trailing Profit, SL=30, Step=15:")
for btp in [1000, 1500, 2000, 2500]:
    for eh in [17, 18, 20]:
        n, wr, tot, pf, minb = simulate_strategy(entry_hour=9, sl_usd=30.0, step_usd=15.0, basket_tp_dollars=btp, exit_hour=eh)
        print(f"H=09, TP=${btp}, Exit={eh}:00 | WR: {wr:4.1f}% | Net: ${tot:9,.2f} | PF: {pf:4.2f} | MinBal: ${minb:7,.2f}")
