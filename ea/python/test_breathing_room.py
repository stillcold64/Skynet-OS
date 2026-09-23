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

# Replicate the exact choking issue
df_2024 = df.iloc[-16105:].copy().reset_index(drop=True)

def test_breathing_room(
    buffer=15.0,
    reversal_drop=3.0,
    sl_usd=25.0,
    step_usd=15.0, # Wider step so layers have breathing room!
    lots=[0.20, 0.40, 0.60, 1.00],
    trail_mode='PREV_BAR_HIGH', # 'PREV_BAR_HIGH', 'STEP_TRAILING', 'TIGHT_VWAP'
    trail_dist=10.0
):
    tue_groups = df_2024[df_2024['dow'] == 1].groupby(['iso_year', 'iso_week'])
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
        
        positions = [{'lot': lots[0], 'open_p': entry_price, 'sl': entry_price + sl_usd}]
        pnl = 0.0
        closed = False
        
        for idx in range(entry_idx, len(t_bars)):
            bar = t_bars.iloc[idx]
            b_high = bar['high']
            b_low = bar['low']
            b_time = bar['time']
            
            # EOD Harvest at 21:00
            if b_time.hour >= 21:
                pnl = sum((p['open_p'] - bar['open']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # SL hit
            if any(b_high >= p['sl'] for p in positions):
                pnl = sum((p['open_p'] - p['sl']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # Layer trigger
            lowest_entry = min(p['open_p'] for p in positions)
            active_count = len(positions)
            if active_count < len(lots):
                next_trigger = lowest_entry - step_usd
                if b_low <= next_trigger:
                    if trail_mode == 'TIGHT_VWAP':
                        tot_vol = sum(p['lot'] for p in positions) + lots[active_count]
                        tot_val = sum(p['open_p'] * p['lot'] for p in positions) + next_trigger * lots[active_count]
                        vwap_be = (tot_val / tot_vol) - 1.0 # The tight choking formula!
                        for p in positions: p['sl'] = min(p['sl'], vwap_be)
                        new_sl = vwap_be
                    elif trail_mode == 'STEP_TRAILING':
                        # Trail previous positions to lowest_entry (breathing room = step_usd)
                        for p in positions: p['sl'] = min(p['sl'], lowest_entry)
                        new_sl = lowest_entry + sl_usd
                    elif trail_mode == 'PREV_BAR_HIGH':
                        # Trail to previous H1 bar high
                        prev_h = t_bars.iloc[idx-1]['high'] if idx > 0 else entry_price + sl_usd
                        for p in positions: p['sl'] = min(p['sl'], prev_h)
                        new_sl = prev_h
                        
                    positions.append({'lot': lots[active_count], 'open_p': next_trigger, 'sl': new_sl})
                    
        if not closed:
            last_bar = t_bars.iloc[-1]
            pnl = sum((p['open_p'] - last_bar['close']) * p['lot'] * 100.0 for p in positions)
            
        trades.append(pnl)
        
    res = np.array(trades)
    wins = res[res > 0]
    losses = res[res <= 0]
    wr = len(wins)/len(res)*100
    net = res.sum()
    pf = wins.sum()/abs(losses.sum()) if abs(losses.sum())>0 else 999
    return len(res), wr, net, pf, wins.max() if len(wins)>0 else 0

print("--- Comparing Trailing Modes (Why Tight VWAP Choked the Trades) ---")
print("1. TIGHT VWAP (Current: Chokes after $1.50 bounce):")
n, wr, net, pf, maxw = test_breathing_room(step_usd=8.0, trail_mode='TIGHT_VWAP')
print(f"Trades: {n}, WR: {wr:.1f}%, Net: ${net:,.2f}, PF: {pf:.2f}, MaxWin: ${maxw:,.2f}")

print("\n2. STEP TRAILING (Step $12, SL $25, trail to previous layer entry):")
for st in [10.0, 12.0, 15.0, 20.0]:
    n, wr, net, pf, maxw = test_breathing_room(step_usd=st, sl_usd=25.0, trail_mode='STEP_TRAILING')
    print(f"Step=${st:4.1f} | Trades: {n}, WR: {wr:.1f}%, Net: ${net:8,.2f}, PF: {pf:.2f}, MaxWin: ${maxw:7,.2f}")

print("\n3. PREVIOUS H1 BAR HIGH TRAILING:")
for st in [10.0, 12.0, 15.0]:
    n, wr, net, pf, maxw = test_breathing_room(step_usd=st, sl_usd=25.0, trail_mode='PREV_BAR_HIGH')
    print(f"Step=${st:4.1f} | Trades: {n}, WR: {wr:.1f}%, Net: ${net:8,.2f}, PF: {pf:.2f}, MaxWin: ${maxw:7,.2f}")
