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
            'prev_open': weekly.loc[i-1, 'open'],
            'prev_high': weekly.loc[i-1, 'high'],
            'prev_low': weekly.loc[i-1, 'low']
        }

# Data 2024-2026 (16,105 bars)
df_2024 = df.iloc[-16105:].copy().reset_index(drop=True)

print("="*80)
print("RESEARCH: BULLISH TREND-FOLLOWING SNOWBALL (GOLD BUY ON MOMENTUM)")
print("="*80)

# Concept 1: Dip-and-Rip / Monday Sweep Low & Tuesday Rally
# Concept 2: Weekly Trend Following: If Previous Week is Bullish, Buy Tuesday / Ride to Friday
# Concept 3: Breakout of Monday High / Prior Week High Snowball

def test_bullish_snowball(
    df_data,
    strategy_mode='TUE_DIP_BUY', # 'TUE_DIP_BUY', 'MON_HIGH_BREAK', 'TUE_OPEN_BULL'
    dip_buffer=10.0,            # Wait for Tuesday to dip Open - dip_buffer before buying
    reversal_bounce=3.0,        # Bounce from low before entering BUY
    initial_sl=20.0,
    step_usd=10.0,
    lots=[0.20, 0.40, 0.60, 1.00],
    exit_day=4,                 # 1=Tue, 2=Wed, 3=Thu, 4=Fri
    exit_hour=21
):
    df_data = df_data.copy().reset_index(drop=True)
    week_groups = df_data.groupby(['iso_year', 'iso_week'])
    trades = []
    
    for (y, w), w_df in week_groups:
        w_info = weekly_dict.get((y, w))
        # Prior week must be bullish or positive
        if not w_info or w_info['prev_gain'] <= 0:
            continue
            
        w_bars = w_df.sort_values('time').reset_index(drop=True)
        if len(w_bars) < 20: continue
        
        # Tuesday bars
        tue_bars = w_bars[w_bars['dow'] == 1]
        if len(tue_bars) < 10: continue
        
        tue_open = tue_bars.iloc[0]['open']
        target_low = tue_open - dip_buffer
        
        entered = False
        entry_idx = -1
        entry_price = 0.0
        current_low = tue_open
        
        if strategy_mode == 'TUE_DIP_BUY':
            # Wait for price to dip below tue_open - dip_buffer, then bounce by reversal_bounce
            for idx, bar in tue_bars.iterrows():
                if bar['low'] < current_low:
                    current_low = bar['low']
                if current_low <= target_low and (bar['high'] - current_low) >= reversal_bounce:
                    entry_price = current_low + reversal_bounce
                    entry_idx = idx
                    entered = True
                    break
        elif strategy_mode == 'TUE_OPEN_BULL':
            # Enter BUY early Tuesday
            first_bar = tue_bars[tue_bars['time'].dt.hour >= 8]
            if len(first_bar) > 0:
                entry_price = first_bar.iloc[0]['open']
                entry_idx = first_bar.index[0]
                entered = True
        elif strategy_mode == 'MON_HIGH_BREAK':
            # Break above Monday High
            mon_bars = w_bars[w_bars['dow'] == 0]
            if len(mon_bars) > 0:
                mon_high = mon_bars['high'].max()
                for idx, bar in tue_bars.iterrows():
                    if bar['high'] >= mon_high + 2.0:
                        entry_price = mon_high + 2.0
                        entry_idx = idx
                        entered = True
                        break
                        
        if not entered: continue
        
        # Open Layer 1 BUY
        positions = [{'lot': lots[0], 'open_p': entry_price, 'sl': entry_price - initial_sl}]
        pnl = 0.0
        closed = False
        
        # Traverse remaining bars from entry
        for idx in range(entry_idx, len(w_bars)):
            bar = w_bars.iloc[idx]
            b_high = bar['high']
            b_low = bar['low']
            b_time = bar['time']
            b_dow = bar['dow']
            
            # Exit condition (EOD on exit_day)
            if b_dow >= exit_day and b_time.hour >= exit_hour:
                pnl = sum((bar['close'] - p['open_p']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # Check SL hit
            if any(b_low <= p['sl'] for p in positions):
                pnl = sum((p['sl'] - p['open_p']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # Pyramiding Snowball on the PUMP (Upward Layers)
            highest_entry = max(p['open_p'] for p in positions)
            active_count = len(positions)
            if active_count < len(lots):
                next_trigger = highest_entry + step_usd
                if b_high >= next_trigger:
                    # Move previous positions' SL to highest_entry - 1.0 (lock profit / freeroll)
                    for p in positions:
                        p['sl'] = max(p['sl'], highest_entry - 1.0)
                    new_sl = highest_entry - 1.0
                    positions.append({'lot': lots[active_count], 'open_p': next_trigger, 'sl': new_sl})
                    
        if not closed:
            last_bar = w_bars.iloc[-1]
            pnl = sum((last_bar['close'] - p['open_p']) * p['lot'] * 100.0 for p in positions)
            
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
    wr = len(wins)/len(tdf)*100
    net = tdf['pnl'].sum()
    pf = wins['pnl'].sum()/abs(losses['pnl'].sum()) if len(losses)>0 and losses['pnl'].sum()!=0 else 999.0
    
    eq = 5000 + np.cumsum(tdf['pnl'].values)
    peak = np.maximum.accumulate(eq)
    mdd = np.max(peak - eq)
    min_b = np.min(eq)
    return len(tdf), wr, net, pf, mdd, min_b

print("--- Testing Strategy 1: TUE_DIP_BUY (Buy after Tuesday dips -$10 to -$15 and bounces +$3) ---")
for dip in [5.0, 8.0, 10.0, 12.0, 15.0]:
    for st in [8.0, 10.0, 12.0]:
        for ed in [1, 2, 4]: # Exit Tue 21:00, Wed 21:00, Fri 21:00
            n, wr, net, pf, mdd, minb = test_bullish_snowball(
                df_2024, strategy_mode='TUE_DIP_BUY', dip_buffer=dip, step_usd=st, exit_day=ed
            )
            if net > 5000:
                print(f"Dip=${dip:4.1f}, Step=${st:4.1f}, ExitDay={ed} | Trades: {n:2d} | WR: {wr:4.1f}% | Net: ${net:9,.2f} | PF: {pf:4.2f} | MaxDD: ${mdd:7,.2f}")

print("\n--- Testing Strategy 2: MON_HIGH_BREAK (Snowball BUY when breaking Monday High) ---")
for st in [8.0, 10.0, 12.0, 15.0]:
    for ed in [1, 2, 4]:
        n, wr, net, pf, mdd, minb = test_bullish_snowball(
            df_2024, strategy_mode='MON_HIGH_BREAK', step_usd=st, exit_day=ed
        )
        print(f"Step=${st:4.1f}, ExitDay={ed} | Trades: {n:2d} | WR: {wr:4.1f}% | Net: ${net:9,.2f} | PF: {pf:4.2f} | MaxDD: ${mdd:7,.2f}")
