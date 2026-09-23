import pandas as pd
import numpy as np

# Load H1
df = pd.read_csv('ea/python/xauusd_h1.csv')
df['time'] = pd.to_datetime(df['time'])
df = df.sort_values('time').reset_index(drop=True)

# We want to match the tester period of 16105 bars
df_test = df.iloc[-16105:].copy().reset_index(drop=True)

# Build weekly candles from D1 or H1
# In MT5: CopyRates(_Symbol, PERIOD_W1, 0, 3, weeklyRates)
# weeklyRates[1] is the PREVIOUS completed week candle (Mon Open to Fri Close)
# Let's resample df to W-SUN or W-FRI
df['date'] = df['time'].dt.date
df['iso_year'] = df['time'].dt.isocalendar().year
df['iso_week'] = df['time'].dt.isocalendar().week

weekly = df.groupby(['iso_year', 'iso_week']).agg(
    open=('open', 'first'),
    high=('high', 'max'),
    low=('low', 'min'),
    close=('close', 'last'),
    start_time=('time', 'first'),
    end_time=('time', 'last')
).reset_index()

weekly['gain_pct'] = (weekly['close'] - weekly['open']) / weekly['open'] * 100.0

# Map previous week gain to each week
weekly_dict = {}
for i in range(len(weekly)):
    y = weekly.loc[i, 'iso_year']
    w = weekly.loc[i, 'iso_week']
    if i > 0:
        prev_gain = weekly.loc[i-1, 'gain_pct']
        prev_close = weekly.loc[i-1, 'close']
        prev_open = weekly.loc[i-1, 'open']
        weekly_dict[(y, w)] = {
            'prev_gain': prev_gain,
            'prev_close': prev_close,
            'prev_open': prev_open
        }

print(f"Total weekly records: {len(weekly_dict)}")

# Let's inspect test bars
test_tuesdays = []
df_test['iso_year'] = df_test['time'].dt.isocalendar().year
df_test['iso_week'] = df_test['time'].dt.isocalendar().week
df_test['dow'] = df_test['time'].dt.dayofweek # 0=Mon, 1=Tue

tue_groups = df_test[df_test['dow'] == 1].groupby(['iso_year', 'iso_week'])

trades = []
for (y, w), t_df in tue_groups:
    w_info = weekly_dict.get((y, w))
    if not w_info:
        continue
    
    # Filter: MinPriorWeekGainPct = 0.8, RequireFridayGreen = true
    if w_info['prev_gain'] < 0.8 or w_info['prev_close'] <= w_info['prev_open']:
        continue
    
    # Tuesday trading simulation
    # Entry at first bar of Tuesday (usually 00:00 or 01:00)
    # Check if hour==0 and min < 15: wait
    t_bars = t_df.sort_values('time').reset_index(drop=True)
    if len(t_bars) == 0:
        continue
    
    # Find entry bar
    entry_bar = None
    for idx, row in t_bars.iterrows():
        if row['time'].hour == 0 and row['time'].minute < 15:
            continue
        entry_bar = row
        start_idx = idx
        break
        
    if entry_bar is None:
        continue
        
    entry_price = entry_bar['open']
    entry_time = entry_bar['time']
    initial_sl = entry_price + 15.0 # InpInitialSLUSD = 15.0
    step = 7.5
    be_buf = 1.0
    
    # Track positions: list of dicts {'lot': ..., 'open_p': ..., 'sl': ...}
    lots = [0.20, 0.40, 0.60, 1.00]
    positions = [{'lot': lots[0], 'open_p': entry_price, 'sl': initial_sl, 'ticket': 1}]
    
    pnl = 0.0
    closed = False
    exit_time = None
    exit_reason = ""
    
    # Iterate through Tuesday bars
    for idx in range(start_idx, len(t_bars)):
        bar = t_bars.iloc[idx]
        b_high = bar['high']
        b_low = bar['low']
        b_close = bar['close']
        b_time = bar['time']
        
        # 1. Check Exit Hour (22:00)
        if b_time.hour >= 22:
            # Close all active positions at bar close or open
            for pos in positions:
                pnl += (pos['open_p'] - bar['open']) * pos['lot'] * 100.0
            exit_time = b_time
            exit_reason = "EOD"
            closed = True
            break
            
        # 2. Check SL hits on active positions
        # Check if high >= sl
        sl_hit = False
        for pos in positions:
            if b_high >= pos['sl']:
                sl_hit = True
                break
                
        if sl_hit:
            # In MT5, if price hits SL, position closes at SL
            for pos in positions:
                if b_high >= pos['sl']:
                    pnl += (pos['open_p'] - pos['sl']) * pos['lot'] * 100.0
                else:
                    # If some positions didn't hit SL? All had same or higher SL
                    pnl += (pos['open_p'] - pos['sl']) * pos['lot'] * 100.0
            exit_time = b_time
            exit_reason = "SL"
            closed = True
            break
            
        # 3. Check Layer triggers
        lowest_entry = min(p['open_p'] for p in positions)
        active_count = len(positions)
        
        if active_count < 4:
            next_target = lowest_entry - step
            if b_low <= next_target:
                # Trigger next layer
                # Update SL of existing positions
                trail_sl = next_target + step - be_buf
                for p in positions:
                    new_sl = min(p['open_p'] - be_buf, trail_sl)
                    if new_sl < p['sl']:
                        p['sl'] = new_sl
                # Add new position
                new_lot = lots[active_count]
                new_sl = next_target + step # = lowest_entry
                positions.append({'lot': new_lot, 'open_p': next_target, 'sl': new_sl, 'ticket': active_count + 1})
                
    if not closed:
        # Close at end of Tuesday
        last_bar = t_bars.iloc[-1]
        for pos in positions:
            pnl += (pos['open_p'] - last_bar['close']) * pos['lot'] * 100.0
        exit_reason = "End of Day"
        exit_time = last_bar['time']
        
    trades.append({
        'week': f"{y}-W{w}",
        'entry_time': entry_time,
        'entry_price': entry_price,
        'exit_time': exit_time,
        'exit_reason': exit_reason,
        'pnl': pnl,
        'layers': len(positions)
    })

tdf = pd.DataFrame(trades)
print(f"Total triggered Tuesdays: {len(tdf)}")
if len(tdf) > 0:
    wins = tdf[tdf['pnl'] > 0]
    losses = tdf[tdf['pnl'] <= 0]
    print(f"Wins: {len(wins)}, Losses: {len(losses)}, WinRate: {len(wins)/len(tdf)*100:.1f}%")
    print(f"Total PnL: ${tdf['pnl'].sum():,.2f}")
    print(f"Gross Profit: ${wins['pnl'].sum():,.2f}")
    print(f"Gross Loss: ${losses['pnl'].sum():,.2f}")
    print(tdf.head(15))
