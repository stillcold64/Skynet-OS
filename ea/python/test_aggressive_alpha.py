import sys
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

def simulate_aggressive_alpha(
    df_data,
    upward_buffer=10.0,
    entry_mode='BREAKDOWN',
    reversal_drop=3.0,
    initial_sl=20.0,
    step_usd=10.0,
    lots=[0.20, 0.40, 0.60, 1.00], # Alpha bullet lots
    trail_lock_thresh=2000.0, # Only lock when profit > $2,000! Let it run!
    trail_giveback_pct=0.30, # Allow 30% giveback from peak
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
        target_high = tue_open + upward_buffer
        
        entered = False
        entry_idx = -1
        entry_price = 0.0
        current_high = tue_open
        
        for idx, bar in t_bars.iterrows():
            if bar['high'] > current_high:
                current_high = bar['high']
                
            if entry_mode == 'BREAKDOWN':
                if current_high >= target_high and (current_high - bar['low']) >= reversal_drop:
                    entry_price = current_high - reversal_drop
                    entry_idx = idx
                    entered = True
                    break
            elif entry_mode == 'LIMIT':
                if bar['high'] >= target_high:
                    entry_price = target_high
                    entry_idx = idx
                    entered = True
                    break
            elif entry_mode == 'TOUCH':
                if bar['high'] >= target_high:
                    entry_price = target_high
                    entry_idx = idx
                    entered = True
                    break
                    
        if not entered: continue
        
        positions = [{'lot': lots[0], 'open_p': entry_price, 'sl': entry_price + initial_sl}]
        pnl = 0.0
        closed = False
        highest_float = 0.0
        
        for idx in range(entry_idx, len(t_bars)):
            bar = t_bars.iloc[idx]
            b_high = bar['high']
            b_low = bar['low']
            b_time = bar['time']
            
            # Floating profit at bar low
            float_pnl = sum((p['open_p'] - b_low) * p['lot'] * 100.0 for p in positions)
            if float_pnl > highest_float:
                highest_float = float_pnl
                
            # Trailing Profit Lock ONLY when huge profit (> $2000+)
            if trail_lock_thresh > 0 and highest_float >= trail_lock_thresh:
                current_pnl = sum((p['open_p'] - bar['close']) * p['lot'] * 100.0 for p in positions)
                if current_pnl <= highest_float * (1.0 - trail_giveback_pct):
                    pnl = current_pnl
                    closed = True
                    break
                    
            # Exit hour
            if b_time.hour >= exit_hour:
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
                    # True Freeroll: Calculate Volume-Weighted Average Price
                    tot_vol = sum(p['lot'] for p in positions) + lots[active_count]
                    tot_val = sum(p['open_p'] * p['lot'] for p in positions) + next_trigger * lots[active_count]
                    vwap_be = tot_val / tot_vol
                    
                    # Set SL of ALL positions to vwap_be (Zero Risk Freeroll)
                    for p in positions:
                        p['sl'] = min(p['sl'], vwap_be)
                        
                    positions.append({
                        'lot': lots[active_count],
                        'open_p': next_trigger,
                        'sl': vwap_be
                    })
                    
        if not closed:
            last_bar = t_bars.iloc[-1]
            pnl = sum((p['open_p'] - last_bar['close']) * p['lot'] * 100.0 for p in positions)
            
        trades.append({
            'year': y,
            'week': w,
            'pnl': pnl,
            'layers': len(positions)
        })
        
    tdf = pd.DataFrame(trades)
    if len(tdf) == 0: return 0, 0, 0, 0, 0, 0
    wins = tdf[tdf['pnl'] > 0]
    losses = tdf[tdf['pnl'] <= 0]
    wr = len(wins) / len(tdf) * 100
    net = tdf['pnl'].sum()
    pf = wins['pnl'].sum() / abs(losses['pnl'].sum()) if len(losses) > 0 and losses['pnl'].sum() != 0 else 999.0
    
    eq = 5000 + np.cumsum(tdf['pnl'].values)
    peak = np.maximum.accumulate(eq)
    mdd = np.max(peak - eq)
    min_b = np.min(eq)
    
    return len(tdf), wr, net, pf, mdd, min_b, wins['pnl'].max() if len(wins)>0 else 0

# Test across 2024-2026 and Full 2018-2026
df_2024 = df.iloc[-16105:].copy()

print("="*85)
print("AGGRESSIVE ALPHA SNOWBALL - PURE GROWTH TEST (NO PREMATURE PROFIT CAPPING)")
print("="*85)

for lot_preset, lot_label in [
    ([0.10, 0.20, 0.40, 0.80], "Lot: 0.10 -> 0.20 -> 0.40 -> 0.80 (Total 1.50 lots)"),
    ([0.20, 0.40, 0.60, 1.00], "Lot: 0.20 -> 0.40 -> 0.60 -> 1.00 (Total 2.20 lots)"),
    ([0.30, 0.60, 1.00, 1.50], "Lot: 0.30 -> 0.60 -> 1.00 -> 1.50 (Total 3.40 lots)"),
    ([0.50, 1.00, 1.50, 2.50], "Lot: 0.50 -> 1.00 -> 1.50 -> 2.50 (Total 5.50 lots)")
]:
    print(f"\n--- {lot_label} ---")
    for buf in [8.0, 10.0, 15.0]:
        for step in [8.0, 10.0, 12.0]:
            # 2024-2026
            n, wr, net_24, pf_24, mdd_24, minb_24, maxw_24 = simulate_aggressive_alpha(
                df_2024, upward_buffer=buf, step_usd=step, lots=lot_preset, trail_lock_thresh=3000.0, exit_hour=21
            )
            # Full 2018-2026
            n_all, wr_all, net_all, pf_all, mdd_all, minb_all, maxw_all = simulate_aggressive_alpha(
                df, upward_buffer=buf, step_usd=step, lots=lot_preset, trail_lock_thresh=3000.0, exit_hour=21
            )
            if net_24 > 0:
                print(f"Buf=${buf:4.1f}, Step=${step:4.1f} | 2024-26 Net: ${net_24:8,.2f} (MaxWin: ${maxw_24:7,.2f}) | 8.5yr Net: ${net_all:10,.2f} | PF: {pf_all:4.2f} | 8.5yr MaxDD: ${mdd_all:7,.2f}")
