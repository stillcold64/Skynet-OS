import pandas as pd
import numpy as np

# Load H1
df = pd.read_csv('ea/python/xauusd_h1.csv')
df['time'] = pd.to_datetime(df['time'])
df = df.sort_values('time').reset_index(drop=True)

df['tr0'] = df['high'] - df['low']
df['tr1'] = (df['high'] - df['close'].shift(1)).abs()
df['tr2'] = (df['low'] - df['close'].shift(1)).abs()
df['tr'] = df[['tr0', 'tr1', 'tr2']].max(axis=1)
df['atr24'] = df['tr'].rolling(24).mean()

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

# Filter to the 16105 bars
df_test = df.iloc[-16105:].copy().reset_index(drop=True)

print("="*70)
print("TESTING DIFFERENT HYPOTHESES ACROSS 2024-2026 (16,105 BARS)")
print("="*70)

def test_config(min_gain=0.8, entry_hour=1, sl_atr=1.0, step_atr=0.5, lots=[0.20, 0.40, 0.60, 1.00], use_trailing=True, be_buffer=1.0):
    df_test['iso_year'] = df_test['time'].dt.isocalendar().year
    df_test['iso_week'] = df_test['time'].dt.isocalendar().week
    df_test['dow'] = df_test['time'].dt.dayofweek
    
    tue_groups = df_test[df_test['dow'] == 1].groupby(['iso_year', 'iso_week'])
    
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
        atr = entry_bar['atr24'] if pd.notnull(entry_bar['atr24']) and entry_bar['atr24'] > 0 else 25.0
        
        sl_dist = atr * sl_atr
        step_dist = atr * step_atr
        
        initial_sl = entry_price + sl_dist
        positions = [{'lot': lots[0], 'open_p': entry_price, 'sl': initial_sl}]
        pnl = 0.0
        closed = False
        
        for idx in range(start_idx, len(t_bars)):
            bar = t_bars.iloc[idx]
            b_high = bar['high']
            b_low = bar['low']
            b_time = bar['time']
            
            # EOD exit at 22:00
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
                
            # Check Layer
            lowest_entry = min(p['open_p'] for p in positions)
            active_count = len(positions)
            if active_count < len(lots):
                next_target = lowest_entry - step_dist
                if b_low <= next_target:
                    if use_trailing:
                        trail_sl = next_target + step_dist - be_buffer
                        for p in positions:
                            p['sl'] = min(p['sl'], trail_sl)
                    new_lot = lots[active_count]
                    new_sl = next_target + sl_dist # Keep generous SL for new layer
                    positions.append({'lot': new_lot, 'open_p': next_target, 'sl': new_sl})
                    
        if not closed:
            last_bar = t_bars.iloc[-1]
            for pos in positions:
                pnl += (pos['open_p'] - last_bar['close']) * pos['lot'] * 100.0
                
        trades.append(pnl)
        
    res = np.array(trades)
    if len(res) == 0:
        return 0, 0, 0, 0, 0, 0
    wins = res[res > 0]
    losses = res[res <= 0]
    wr = len(wins) / len(res) * 100
    tot = res.sum()
    gross_win = wins.sum() if len(wins) > 0 else 0
    gross_loss = abs(losses.sum()) if len(losses) > 0 else 0
    pf = gross_win / gross_loss if gross_loss > 0 else 999.0
    
    # Calculate Max Drawdown from $5,000 start
    equity_curve = 5000 + np.cumsum(res)
    peak = np.maximum.accumulate(equity_curve)
    drawdowns = peak - equity_curve
    max_dd = np.max(drawdowns)
    min_bal = np.min(equity_curve)
    
    return len(res), wr, tot, pf, max_dd, min_bal

# Test 1: Varying Min Prior Week Gain (Macro Exhaustion)
print("\n--- TEST 1: Min Prior Week Gain Filter (Entry H=1, ATR SL=1.0x, Step=0.5x) ---")
for mg in [0.5, 0.8, 1.2, 1.5, 2.0, 2.5, 3.0]:
    n, wr, tot, pf, mdd, minb = test_config(min_gain=mg, entry_hour=1, sl_atr=1.0, step_atr=0.5)
    print(f"MinGain: {mg:4.1f}% | Trades: {n:2d} | WR: {wr:4.1f}% | Net: ${tot:10,.2f} | PF: {pf:5.2f} | MinBal: ${minb:8,.2f}")

# Test 2: Entry Timing (H=1, 7, 8, 9, 10, 12, 14) with MinGain 1.5%
print("\n--- TEST 2: Entry Hour (MinGain 1.5%, ATR SL=1.0x, Step=0.5x) ---")
for h in [1, 6, 8, 9, 10, 12, 13, 14]:
    n, wr, tot, pf, mdd, minb = test_config(min_gain=1.5, entry_hour=h, sl_atr=1.0, step_atr=0.5)
    print(f"Hour: {h:02d}:00 | Trades: {n:2d} | WR: {wr:4.1f}% | Net: ${tot:10,.2f} | PF: {pf:5.2f} | MinBal: ${minb:8,.2f}")

# Test 3: Fixed SL/Step vs ATR-Based with MinGain 1.5%
print("\n--- TEST 3: SL & Step Multipliers at London Open (Hour 09:00, MinGain 1.5%) ---")
for sl in [0.8, 1.0, 1.2, 1.5]:
    for st in [0.3, 0.5, 0.7]:
        n, wr, tot, pf, mdd, minb = test_config(min_gain=1.5, entry_hour=9, sl_atr=sl, step_atr=st)
        print(f"SL={sl:.1f}x, Step={st:.1f}x | Trades: {n:2d} | WR: {wr:4.1f}% | Net: ${tot:10,.2f} | PF: {pf:5.2f} | MinBal: ${minb:8,.2f}")
