import pandas as pd
import numpy as np

# Load daily data
df = pd.read_csv('ea/python/xauusd_d1.csv')
df['time'] = pd.to_datetime(df['time'])
df['iso_year'] = df['time'].dt.isocalendar().year
df['iso_week'] = df['time'].dt.isocalendar().week
df['day_name'] = df['time'].dt.day_name()

weeks = []
for (yr, wk), g in df.groupby(['iso_year', 'iso_week']):
    mon = g[g['day_name'] == 'Monday']
    tue = g[g['day_name'] == 'Tuesday']
    fri = g[g['day_name'] == 'Friday']
    if not mon.empty and not fri.empty:
        w = {
            'year': yr, 'week': wk,
            'mon_date': mon.iloc[0]['time'],
            'mon_open': mon.iloc[0]['open'],
            'mon_high': mon.iloc[0]['high'],
            'mon_low': mon.iloc[0]['low'],
            'mon_close': mon.iloc[0]['close'],
            'fri_date': fri.iloc[-1]['time'],
            'fri_open': fri.iloc[-1]['open'],
            'fri_high': fri.iloc[-1]['high'],
            'fri_low': fri.iloc[-1]['low'],
            'fri_close': fri.iloc[-1]['close'],
        }
        if not tue.empty:
            w['tue_date'] = tue.iloc[0]['time']
            w['tue_open'] = tue.iloc[0]['open']
            w['tue_high'] = tue.iloc[0]['high']
            w['tue_low'] = tue.iloc[0]['low']
            w['tue_close'] = tue.iloc[0]['close']
        weeks.append(w)

wdf = pd.DataFrame(weeks).sort_values(['year', 'week']).reset_index(drop=True)
wdf['prev_fri_close'] = wdf['fri_close'].shift(1)
wdf['prev_mon_open'] = wdf['mon_open'].shift(1)
wdf['prev_fri_high'] = wdf['fri_high'].shift(1)
wdf['prev_fri_low'] = wdf['fri_low'].shift(1)
wdf['prev_week_bullish'] = wdf['prev_fri_close'] > wdf['prev_mon_open']
wdf['prev_week_diff'] = wdf['prev_fri_close'] - wdf['prev_mon_open']
wdf['prev_week_pct'] = (wdf['prev_fri_close'] - wdf['prev_mon_open']) / wdf['prev_mon_open'] * 100

# Next week outcomes
wdf['week_bearish'] = wdf['fri_close'] < wdf['mon_open']
wdf['mon_bearish'] = wdf['mon_close'] < wdf['mon_open']
wdf['tue_bearish'] = wdf['tue_close'] < wdf['tue_open']
wdf['tue_drop_usd'] = wdf['tue_open'] - wdf['tue_low']
wdf['tue_drop_pct'] = (wdf['tue_open'] - wdf['tue_low']) / wdf['tue_open'] * 100
wdf['tue_return_usd'] = wdf['tue_close'] - wdf['tue_open']
wdf['tue_return_pct'] = (wdf['tue_close'] - wdf['tue_open']) / wdf['tue_open'] * 100
wdf['tue_lower_low'] = wdf['tue_low'] < wdf['mon_low']
wdf['tue_drop_from_mon_close'] = wdf['mon_close'] - wdf['tue_low']

sub = wdf.dropna(subset=['prev_week_bullish', 'tue_open', 'tue_close']).copy()

print("=" * 60)
print(f"TOTAL SAMPLE WEEKS: {len(sub)} (from {sub['mon_date'].min().strftime('%Y-%m-%d')} to {sub['mon_date'].max().strftime('%Y-%m-%d')})")
print("=" * 60)

print("\n--- 1. BASELINE ACROSS ALL WEEKS ---")
print(f"Overall Bearish Week Rate: {sub['week_bearish'].mean()*100:.2f}%")
print(f"Overall Bearish Monday Rate: {sub['mon_bearish'].mean()*100:.2f}%")
print(f"Overall Bearish Tuesday Rate: {sub['tue_bearish'].mean()*100:.2f}%")
print(f"Overall Tuesday Avg Max Drop: ${sub['tue_drop_usd'].mean():.2f} ({sub['tue_drop_pct'].mean():.2f}%)")
print(f"Overall Tuesday Avg Return: ${sub['tue_return_usd'].mean():.2f}")

print("\n--- 2. HYPOTHESIS: PREV WEEK BULLISH (Fri Close > Mon Open) ---")
bull = sub[sub['prev_week_bullish'] == True].copy()
print(f"Occurrences: {len(bull)} out of {len(sub)} ({len(bull)/len(sub)*100:.1f}%)")
print(f"Next Week Bearish Win Rate: {bull['week_bearish'].mean()*100:.2f}%")
print(f"Next Monday Bearish Win Rate: {bull['mon_bearish'].mean()*100:.2f}%")
print(f"Next Tuesday Bearish Win Rate: {bull['tue_bearish'].mean()*100:.2f}%")
print(f"Next Tuesday Makes Lower Low than Monday: {bull['tue_lower_low'].mean()*100:.2f}%")
print(f"Next Tuesday Avg Max Drop: ${bull['tue_drop_usd'].mean():.2f} ({bull['tue_drop_pct'].mean():.2f}%)")
print(f"Next Tuesday Avg Net Return: ${bull['tue_return_usd'].mean():.2f}")

print("\n--- 3. COMPARISON: PREV WEEK BEARISH (Fri Close < Mon Open) ---")
bear = sub[sub['prev_week_bullish'] == False].copy()
print(f"Occurrences: {len(bear)} ({len(bear)/len(sub)*100:.1f}%)")
print(f"Next Week Bearish Win Rate: {bear['week_bearish'].mean()*100:.2f}%")
print(f"Next Monday Bearish Win Rate: {bear['mon_bearish'].mean()*100:.2f}%")
print(f"Next Tuesday Bearish Win Rate: {bear['tue_bearish'].mean()*100:.2f}%")
print(f"Next Tuesday Avg Max Drop: ${bear['tue_drop_usd'].mean():.2f}")
print(f"Next Tuesday Avg Net Return: ${bear['tue_return_usd'].mean():.2f}")
