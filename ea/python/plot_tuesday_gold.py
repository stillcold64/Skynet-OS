import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

df_d1 = pd.read_csv('ea/python/xauusd_d1.csv')
df_d1['time'] = pd.to_datetime(df_d1['time'])
df_d1['iso_year'] = df_d1['time'].dt.isocalendar().year
df_d1['iso_week'] = df_d1['time'].dt.isocalendar().week
df_d1['day_name'] = df_d1['time'].dt.day_name()

weeks = []
for (yr, wk), g in df_d1.groupby(['iso_year', 'iso_week']):
    mon = g[g['day_name'] == 'Monday']
    tue = g[g['day_name'] == 'Tuesday']
    fri = g[g['day_name'] == 'Friday']
    if not mon.empty and not fri.empty and not tue.empty:
        w = {
            'year': yr, 'week': wk,
            'mon_date': mon.iloc[0]['time'],
            'mon_open': mon.iloc[0]['open'],
            'mon_close': mon.iloc[0]['close'],
            'fri_close': fri.iloc[-1]['close'],
            'tue_date': tue.iloc[0]['time'],
            'tue_open': tue.iloc[0]['open'],
            'tue_high': tue.iloc[0]['high'],
            'tue_low': tue.iloc[0]['low'],
            'tue_close': tue.iloc[0]['close'],
        }
        weeks.append(w)

wdf = pd.DataFrame(weeks).sort_values(['year', 'week']).reset_index(drop=True)
wdf['prev_fri_close'] = wdf['fri_close'].shift(1)
wdf['prev_mon_open'] = wdf['mon_open'].shift(1)
wdf['prev_week_diff'] = wdf['prev_fri_close'] - wdf['prev_mon_open']
wdf['prev_week_pct'] = (wdf['prev_fri_close'] - wdf['prev_mon_open']) / wdf['prev_mon_open'] * 100
wdf['tue_bearish'] = wdf['tue_close'] < wdf['tue_open']
wdf['tue_drop_usd'] = wdf['tue_open'] - wdf['tue_low']
wdf['tue_short_pnl'] = wdf['tue_open'] - wdf['tue_close']

sub = wdf.dropna(subset=['prev_week_diff']).copy()

# Sweep thresholds
thresholds = np.arange(0.0, 4.5, 0.5)
win_rates = []
avg_drops = []
sample_sizes = []

for th in thresholds:
    f = sub[sub['prev_week_pct'] >= th]
    win_rates.append(f['tue_bearish'].mean() * 100)
    avg_drops.append(f['tue_drop_usd'].mean())
    sample_sizes.append(len(f))

plt.style.use('dark_background')
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(11, 9))

# Chart 1: Win Rate & Drop vs Threshold
color1 = '#00ffcc'
color2 = '#ff007f'
ax1.plot(thresholds, win_rates, marker='o', color=color1, linewidth=2.5, label='Tuesday Bearish Win Rate (%)')
ax1.set_ylabel('Win Rate (%)', color=color1, fontsize=12)
ax1.tick_params(axis='y', labelcolor=color1)
ax1.axhline(50, color='gray', linestyle='--', alpha=0.5, label='50% Neutral Line')
ax1.set_title('Gold (XAUUSD): Tuesday Bearish Tendency vs Prior Week Bullish Gain % (2014-2026)', fontsize=13, pad=12)
ax1.grid(True, alpha=0.2)

ax1_drop = ax1.twinx()
ax1_drop.plot(thresholds, avg_drops, marker='s', color=color2, linewidth=2.5, linestyle=':', label='Avg Tuesday Max Drop ($)')
ax1_drop.set_ylabel('Avg Tuesday Max Drop ($ USD)', color=color2, fontsize=12)
ax1_drop.tick_params(axis='y', labelcolor=color2)

# Annotate sample counts
for th, wr, sz in zip(thresholds, win_rates, sample_sizes):
    ax1.annotate(f'N={sz}\n{wr:.1f}%', (th, wr + 1.2), ha='center', fontsize=8, color='#ffffff')

# Chart 2: Cumulative PnL Curve of Tuesday Short Strategy
sub_15 = sub[sub['prev_week_pct'] >= 1.5].copy()
sub_25 = sub[sub['prev_week_pct'] >= 2.5].copy()

sub_15['cum_pnl'] = sub_15['tue_short_pnl'].cumsum()
sub_25['cum_pnl'] = sub_25['tue_short_pnl'].cumsum()

ax2.plot(sub_15['tue_date'], sub_15['cum_pnl'], color='#ffaa00', linewidth=2, label='Filter: Prev Week Gain >= 1.5% (N=146)')
ax2.plot(sub_25['tue_date'], sub_25['cum_pnl'], color='#00ffcc', linewidth=2.2, label='Filter: Prev Week Gain >= 2.5% (N=71)')
ax2.set_ylabel('Cumulative PnL ($ USD / oz)', fontsize=12)
ax2.set_xlabel('Year', fontsize=12)
ax2.set_title('Cumulative Return: Shorting Gold on Tuesday Open & Exit at Close', fontsize=13, pad=12)
ax2.grid(True, alpha=0.2)
ax2.legend(loc='upper left')

plt.tight_layout()
plt.savefig('ea/python/tuesday_gold_drop_chart.png', dpi=150)
print('Saved chart to ea/python/tuesday_gold_drop_chart.png')
