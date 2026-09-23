import pandas as pd
import numpy as np

# Load H1
df = pd.read_csv('ea/python/xauusd_h1.csv')
df['time'] = pd.to_datetime(df['time'])
df = df.sort_values('time').reset_index(drop=True)

df['iso_year'] = df['time'].dt.isocalendar().year
df['iso_week'] = df['time'].dt.isocalendar().week
df['dow'] = df['time'].dt.dayofweek

# Weekly gain
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

# Last 16,105 bars (2024 - 2026)
df_test = df.iloc[-16105:].copy().reset_index(drop=True)

def simulate_refined(
    lot_start=0.05, # Conservative base lot for $5,000 bullet
    lot_multiplier=2.0, # 0.05 -> 0.10 -> 0.20 -> 0.40
    entry_hour=8, # London Open
    sl_usd=25.0,
    step_usd=12.0,
    trail_lock_profit=500.0 # Lock profit once basket > $500
):
    tue_groups = df_test[df_test['dow'] == 1].groupby(['iso_year', 'iso_week'])
    trades = []
    lots = [lot_start, lot_start*2, lot_start*4, lot_start*8]
    
    for (y, w), t_df in tue_groups:
        w_info = weekly_dict.get((y, w))
        if not w_info or w_info['prev_gain'] < 0.8 or w_info['prev_close'] <= w_info['prev_open']:
            continue
            
        t_bars = t_df.sort_values('time').reset_index(drop=True)
        entry_bar = t_bars[t_bars['time'].dt.hour >= entry_hour]
        if len(entry_bar) == 0: continue
        entry_bar = entry_bar.iloc[0]
        
        entry_price = entry_bar['open']
        initial_sl = entry_price + sl_usd
        positions = [{'lot': lots[0], 'open_p': entry_price, 'sl': initial_sl}]
        pnl = 0.0
        closed = False
        peak_profit = 0.0
        
        for idx, bar in t_bars[t_bars['time'] >= entry_bar['time']].iterrows():
            # Check floating basket profit at bar low
            float_max = sum((p['open_p'] - bar['low']) * p['lot'] * 100.0 for p in positions)
            if float_max > peak_profit:
                peak_profit = float_max
                
            # Trailing basket profit protection: if gained > $500, don't let it give back > 40%
            if peak_profit >= trail_lock_profit:
                current_pnl = sum((p['open_p'] - bar['close']) * p['lot'] * 100.0 for p in positions)
                if current_pnl <= peak_profit * 0.60:
                    pnl = current_pnl
                    closed = True
                    break
                    
            # EOD exit at 21:00
            if bar['time'].hour >= 21:
                pnl = sum((p['open_p'] - bar['open']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # SL hit
            if any(bar['high'] >= p['sl'] for p in positions):
                pnl = sum((p['open_p'] - p['sl']) * p['lot'] * 100.0 for p in positions)
                closed = True
                break
                
            # Layer trigger
            lowest = min(p['open_p'] for p in positions)
            if len(positions) < len(lots) and bar['low'] <= lowest - step_usd:
                # Trail earlier positions to lowest entry (not too tight)
                for p in positions:
                    p['sl'] = min(p['sl'], lowest + 2.0)
                new_lot = lots[len(positions)]
                new_sl = lowest + sl_usd
                positions.append({'lot': new_lot, 'open_p': lowest - step_usd, 'sl': new_sl})
                
        if not closed:
            pnl = sum((p['open_p'] - t_bars.iloc[-1]['close']) * p['lot'] * 100.0 for p in positions)
            
        trades.append(pnl)
        
    res = np.array(trades)
    wins = res[res > 0]
    losses = res[res <= 0]
    wr = len(wins)/len(res)*100
    net = res.sum()
    pf = wins.sum()/abs(losses.sum()) if abs(losses.sum())>0 else 999
    
    eq = 5000 + np.cumsum(res)
    peak = np.maximum.accumulate(eq)
    mdd = np.max(peak - eq)
    min_b = np.min(eq)
    
    return len(res), wr, net, pf, mdd, min_b

print("--- Testing Refined Sizing & Timing for $5,000 Capital ---")
for lot in [0.05, 0.10, 0.15]:
    for eh in [6, 8, 9, 10]:
        for sl in [20, 25, 30]:
            n, wr, net, pf, mdd, min_b = simulate_refined(lot_start=lot, entry_hour=eh, sl_usd=sl)
            if min_b > 2500 and net > 5000: # Capital preserved > 50% and net profit > 100%
                print(f"Lot={lot:.2f}, Hour={eh:02d}, SL=${sl} | WR: {wr:4.1f}% | Net: ${net:8,.2f} | PF: {pf:4.2f} | MaxDD: ${mdd:6,.2f} | MinBal: ${min_b:7,.2f}")
