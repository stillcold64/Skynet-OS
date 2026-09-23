import sys
import pandas as pd
import numpy as np

# Load H1 data
df = pd.read_csv('ea/python/xauusd_h1.csv')
df['time'] = pd.to_datetime(df['time'])
df = df.sort_values('time').reset_index(drop=True)

df['iso_year'] = df['time'].dt.isocalendar().year
df['iso_week'] = df['time'].dt.isocalendar().week
df['dow'] = df['time'].dt.dayofweek

# Compute Weekly metrics
all_df = df.copy()
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

print(f"Total bars: {len(df)}, Total weeks: {len(weekly)}")

# Focus backtests:
# Period 1: Full dataset 2018-2026 (51,428 bars)
# Period 2: Brutal bull run 2024-2026 (16,105 bars)

def run_backtest(
    df_data,
    min_gain_pct=0.8,
    upward_buffer=15.0,     # Wait for price to push up Open + buffer
    entry_mode='LIMIT',     # 'LIMIT' (sell at Open+buffer), 'BREAKDOWN' (reversal below high), 'MKT_AFTER_RISE'
    reversal_confirm=3.0,   # Drop from high to confirm entry
    initial_sl=20.0,        # SL above entry
    step_usd=12.0,          # Step for snowball layers
    lots=[0.05, 0.10, 0.20, 0.40],
    basket_tp=0.0,          # 0 = disabled
    trail_lock_profit=500.0,# If profit > $500, trail 50%
    exit_hour=20            # Exit hour (e.g. 18:00 - 20:00 before late night bounce)
):
    df_data = df_data.copy().reset_index(drop=True)
    tue_groups = df_data[df_data['dow'] == 1].groupby(['iso_year', 'iso_week'])
    trades = []
    
    for (y, w), t_df in tue_groups:
        w_info = weekly_dict.get((y, w))
        if not w_info or w_info['prev_gain'] < min_gain_pct or w_info['prev_close'] <= w_info['prev_open']:
            continue
            
        t_bars = t_df.sort_values('time').reset_index(drop=True)
        if len(t_bars) < 10:
            continue
            
        tue_open = t_bars.iloc[0]['open']
        target_high = tue_open + upward_buffer
        
        # Scan for entry condition
        entered = False
        entry_idx = -1
        entry_price = 0.0
        current_high = tue_open
        
        for idx, bar in t_bars.iterrows():
            if bar['high'] > current_high:
                current_high = bar['high']
                
            if entry_mode == 'LIMIT':
                # Did price touch the upward buffer?
                if bar['high'] >= target_high:
                    entry_price = target_high
                    entry_idx = idx
                    entered = True
                    break
            elif entry_mode == 'BREAKDOWN':
                # Price pushed above target_high, then fell back by reversal_confirm
                if current_high >= target_high and (current_high - bar['low']) >= reversal_confirm:
                    entry_price = current_high - reversal_confirm
                    entry_idx = idx
                    entered = True
                    break
            elif entry_mode == 'MKT_AFTER_RISE':
                # Next bar after high reached
                if current_high >= target_high and idx > 0:
                    entry_price = bar['open']
                    entry_idx = idx
                    entered = True
                    break
                    
        if not entered:
            continue # Never reached the upward buffer, no trade
            
        # We entered! Now manage the snowball positions
        positions = [{
            'lot': lots[0],
            'open_p': entry_price,
            'sl': entry_price + initial_sl,
            'ticket': 1
        }]
        
        pnl = 0.0
        closed = False
        highest_float = 0.0
        
        # Traverse remaining bars
        for idx in range(entry_idx, len(t_bars)):
            bar = t_bars.iloc[idx]
            b_high = bar['high']
            b_low = bar['low']
            b_time = bar['time']
            
            # 1. Floating profit at low
            float_pnl = sum((p['open_p'] - b_low) * p['lot'] * 100.0 for p in positions)
            if float_pnl > highest_float:
                highest_float = float_pnl
                
            # 2. Basket Take Profit
            if basket_tp > 0 and float_pnl >= basket_tp:
                pnl = basket_tp
                closed = True
                break
                
            # 3. Trailing Profit Lock
            if trail_lock_profit > 0 and highest_float >= trail_lock_profit:
                current_close_pnl = sum((p['open_p'] - bar['close']) * p['lot'] * 100.0 for p in positions)
                if current_close_pnl <= highest_float * 0.65:
                    pnl = current_close_pnl
                    closed = True
                    break
                    
            # 4. Exit Hour Check
            if b_time.hour >= exit_hour:
                pnl = sum((p['open_p'] - bar['open']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # 5. Check SL hits
            # If any position hits SL, close all or hit SL
            sl_hit = False
            for p in positions:
                if b_high >= p['sl']:
                    sl_hit = True
                    break
            if sl_hit:
                pnl = sum((p['open_p'] - p['sl']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # 6. Pyramiding Snowball Layers
            lowest_entry = min(p['open_p'] for p in positions)
            active_count = len(positions)
            if active_count < len(lots):
                next_trigger = lowest_entry - step_usd
                if b_low <= next_trigger:
                    # Move previous positions SL to lowest_entry + breakeven buffer
                    # Prevent asymmetric loss on Layer 2+
                    # If L1 open=100, L2 open=88 (step=12)
                    # When L2 opens, move L1 SL to 98 (profit +2)
                    # And L2 SL is placed at 98 (loss = 10) instead of 100!
                    # Total basket loss if bounces back to 98: (+2 * 0.05) - (10 * 0.10) = +0.10 - 1.00 = -$90 instead of -$300!
                    for p in positions:
                        p['sl'] = min(p['sl'], lowest_entry + 1.0)
                    new_lot = lots[active_count]
                    new_sl = lowest_entry + 1.0 # Protected SL for new layer!
                    positions.append({
                        'lot': new_lot,
                        'open_p': next_trigger,
                        'sl': new_sl,
                        'ticket': active_count + 1
                    })
                    
        if not closed:
            last_bar = t_bars.iloc[-1]
            pnl = sum((p['open_p'] - last_bar['close']) * p['lot'] * 100.0 for p in positions)
            
        trades.append({
            'year': y,
            'week': w,
            'pnl': pnl,
            'entry_price': entry_price,
            'layers': len(positions)
        })
        
    tdf = pd.DataFrame(trades)
    if len(tdf) == 0:
        return {'trades': 0, 'wr': 0, 'net': 0, 'pf': 0, 'max_dd': 0, 'min_bal': 0, 'tdf': tdf}
        
    wins = tdf[tdf['pnl'] > 0]
    losses = tdf[tdf['pnl'] <= 0]
    wr = len(wins) / len(tdf) * 100
    net = tdf['pnl'].sum()
    gross_w = wins['pnl'].sum() if len(wins) > 0 else 0
    gross_l = abs(losses['pnl'].sum()) if len(losses) > 0 else 0
    pf = gross_w / gross_l if gross_l > 0 else 999.0
    
    eq = 5000 + np.cumsum(tdf['pnl'].values)
    peak = np.maximum.accumulate(eq)
    mdd = np.max(peak - eq)
    min_b = np.min(eq)
    
    return {
        'trades': len(tdf),
        'wr': wr,
        'net': net,
        'pf': pf,
        'max_dd': mdd,
        'min_bal': min_b,
        'gross_w': gross_w,
        'gross_l': gross_l,
        'tdf': tdf
    }

# Run Grid Search across Upward Buffer & Entry Mode on 2024-2026 data
df_2024_2026 = df.iloc[-16105:].copy()

print("="*80)
print("GRID SEARCH: TESTING UPWARD BUFFER BEFORE ENTERING SHORT (2024-2026)")
print("="*80)

results = []
for mode in ['LIMIT', 'BREAKDOWN']:
    for buf in [5.0, 8.0, 10.0, 12.0, 15.0, 20.0, 25.0]:
        for sl in [15.0, 20.0, 25.0, 30.0]:
            for step in [8.0, 10.0, 12.0, 15.0]:
                for lock in [300.0, 500.0, 800.0, 1000.0]:
                    res = run_backtest(
                        df_2024_2026,
                        upward_buffer=buf,
                        entry_mode=mode,
                        initial_sl=sl,
                        step_usd=step,
                        trail_lock_profit=lock,
                        exit_hour=20
                    )
                    if res['trades'] >= 15:
                        results.append({
                            'mode': mode,
                            'buffer': buf,
                            'sl': sl,
                            'step': step,
                            'lock': lock,
                            'trades': res['trades'],
                            'wr': res['wr'],
                            'net': res['net'],
                            'pf': res['pf'],
                            'max_dd': res['max_dd'],
                            'min_bal': res['min_bal']
                        })

res_df = pd.DataFrame(results)
print(f"Total parameter combinations tested: {len(res_df)}")

# Sort by Net Profit & Min Balance (Ensuring capital preservation on $5000)
valid = res_df[res_df['min_bal'] >= 3000].sort_values(['net', 'pf'], ascending=[False, False])
print("\n--- TOP 10 CONFIGURATIONS (Capital >= $3,000 Preserved throughout 2024-2026) ---")
print(valid.head(15).to_string())

# Save results
res_df.to_csv('ea/python/pullback_opt_results.csv', index=False)
