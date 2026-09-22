import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
import numpy as np

# Load data
df_d1 = pd.read_csv('ea/python/xauusd_d1.csv')
df_d1['time'] = pd.to_datetime(df_d1['time'])
df_d1['iso_year'] = df_d1['time'].dt.isocalendar().year
df_d1['iso_week'] = df_d1['time'].dt.isocalendar().week
df_d1['day_name'] = df_d1['time'].dt.day_name()

df_h1 = pd.read_csv('ea/python/xauusd_h1.csv')
df_h1['time'] = pd.to_datetime(df_h1['time'])
df_h1['date_str'] = df_h1['time'].dt.strftime('%Y-%m-%d')

weeks = []
for (yr, wk), g in df_d1.groupby(['iso_year', 'iso_week']):
    mon = g[g['day_name'] == 'Monday']
    tue = g[g['day_name'] == 'Tuesday']
    fri = g[g['day_name'] == 'Friday']
    if not mon.empty and not fri.empty and not tue.empty:
        weeks.append({
            'mon_open': mon.iloc[0]['open'],
            'fri_close': fri.iloc[-1]['close'],
            'tue_date': tue.iloc[0]['time'].strftime('%Y-%m-%d'),
        })

wdf = pd.DataFrame(weeks)
wdf['prev_fri_close'] = wdf['fri_close'].shift(1)
wdf['prev_mon_open'] = wdf['mon_open'].shift(1)
wdf['prev_week_diff'] = wdf['prev_fri_close'] - wdf['prev_mon_open']
wdf['prev_week_pct'] = (wdf['prev_fri_close'] - wdf['prev_mon_open']) / wdf['prev_mon_open'] * 100
wdf['prev_week_bullish'] = wdf['prev_week_diff'] > 0

sub = wdf.dropna(subset=['prev_week_bullish', 'tue_date']).copy()
h1_dates = set(df_h1['date_str'].unique())
sub = sub[sub['tue_date'].isin(h1_dates)].copy().reset_index(drop=True)
h1_by_date = {d: g.sort_values('time').reset_index(drop=True) for d, g in df_h1.groupby('date_str')}

def test_config(lots, min_pct=0.8, step=7.5, sl=20.0, buffer_pts=1.0, initial_cap=1000.0):
    balance = initial_cap
    peak = balance
    max_dd = 0
    trades = 0
    super_dumps = 0
    
    for _, row in sub.iterrows():
        if row['prev_week_pct'] < min_pct or not row['prev_week_bullish']:
            continue
        tue_date = row['tue_date']
        bars = h1_by_date.get(tue_date)
        if bars is None or len(bars) == 0:
            continue
            
        trades += 1
        tue_open = bars.iloc[0]['open']
        positions = [{'entry': tue_open, 'lot': lots[0], 'sl': tue_open + sl, 'active': True}]
        next_target = tue_open - step
        next_idx = 1
        stopped_out = False
        week_pnl = 0.0
        
        for _, bar in bars.iterrows():
            high = bar['high']
            low = bar['low']
            for pos in positions:
                if pos['active'] and high >= pos['sl']:
                    loss_pts = pos['entry'] - pos['sl']
                    pos['active'] = False
                    week_pnl += loss_pts * 100.0 * pos['lot']
                    stopped_out = True
            if stopped_out and all(not p['active'] for p in positions):
                break
            while next_idx < len(lots) and low <= next_target and not stopped_out:
                entry_p = next_target
                lot_size = lots[next_idx]
                for prev in positions:
                    if prev['active']:
                        prev['sl'] = min(prev['sl'], entry_p + step - buffer_pts)
                positions.append({'entry': entry_p, 'lot': lot_size, 'sl': entry_p + step, 'active': True})
                next_idx += 1
                next_target -= step
                
        tue_close = bars.iloc[-1]['close']
        for pos in positions:
            if pos['active']:
                week_pnl += (pos['entry'] - tue_close) * 100.0 * pos['lot']
                pos['active'] = False
                
        balance += week_pnl
        if balance > peak: peak = balance
        dd = peak - balance
        if dd > max_dd: max_dd = dd
        if len(positions) >= 3 and week_pnl > 0:
            super_dumps += 1
            
    return balance, balance - initial_cap, max_dd, trades, super_dumps

print("Testing Heavy Aggressive Lot Schedules on $1,000 starting bullet:")
schedules = [
    ("Heavy 10-20-30-50", [0.10, 0.20, 0.30, 0.50]),
    ("Heavy 10-25-50-100", [0.10, 0.25, 0.50, 1.00]),
    ("Apex 15-30-50-100", [0.15, 0.30, 0.50, 1.00]),
    ("Ultra Apex 20-40-60-100", [0.20, 0.40, 0.60, 1.00]),
]

results = []
for name, lots in schedules:
    for min_p in [0.5, 0.8, 1.0]:
        for sl_val in [15.0, 20.0, 25.0]:
            bal, profit, dd, tr, sd = test_config(lots, min_pct=min_p, step=7.5, sl=sl_val, buffer_pts=1.0, initial_cap=1000.0)
            results.append({
                'Name': name,
                'Lots': str(lots),
                'MinPct': min_p,
                'SL': sl_val,
                'FinalBalance': bal,
                'NetProfit': profit,
                'MaxDD': dd,
                'Profit/DD': profit / dd if dd > 0 else 0,
                'SuperDumps': sd
            })

rdf = pd.DataFrame(results).sort_values('NetProfit', ascending=False)
print(rdf.head(10).to_string(index=False))
