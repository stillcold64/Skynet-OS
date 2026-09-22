import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
import numpy as np

# Load daily data
df = pd.read_csv('ea/python/xauusd_d1.csv')
df['time'] = pd.to_datetime(df['time'])
df['iso_year'] = df['time'].dt.isocalendar().year
df['iso_week'] = df['time'].dt.isocalendar().week
df['day_name'] = df['time'].dt.day_name()

# Calculate 14-day ATR for normalization
df['prev_close'] = df['close'].shift(1)
df['tr'] = np.maximum(df['high'] - df['low'], 
                      np.maximum(abs(df['high'] - df['prev_close']), 
                                 abs(df['low'] - df['prev_close'])))
df['atr14'] = df['tr'].rolling(14).mean()

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
            'fri_atr14': fri.iloc[-1]['atr14'],
        }
        if not tue.empty:
            w['tue_date'] = tue.iloc[0]['time']
            w['tue_open'] = tue.iloc[0]['open']
            w['tue_high'] = tue.iloc[0]['high']
            w['tue_low'] = tue.iloc[0]['low']
            w['tue_close'] = tue.iloc[0]['close']
        weeks.append(w)

wdf = pd.DataFrame(weeks).sort_values(['year', 'week']).reset_index(drop=True)

# Previous week stats
wdf['prev_fri_close'] = wdf['fri_close'].shift(1)
wdf['prev_mon_open'] = wdf['mon_open'].shift(1)
wdf['prev_fri_high'] = wdf['fri_high'].shift(1)
wdf['prev_fri_low'] = wdf['fri_low'].shift(1)
wdf['prev_fri_atr'] = wdf['fri_atr14'].shift(1)

wdf['prev_week_diff'] = wdf['prev_fri_close'] - wdf['prev_mon_open']
wdf['prev_week_pct'] = (wdf['prev_fri_close'] - wdf['prev_mon_open']) / wdf['prev_mon_open'] * 100
wdf['prev_week_atr_ratio'] = wdf['prev_week_diff'] / wdf['prev_fri_atr']
wdf['prev_week_bullish'] = wdf['prev_week_diff'] > 0

# Targets in current week
wdf['week_bearish'] = wdf['fri_close'] < wdf['mon_open']
wdf['mon_bearish'] = wdf['mon_close'] < wdf['mon_open']
wdf['mon_return_pct'] = (wdf['mon_close'] - wdf['mon_open']) / wdf['mon_open'] * 100

wdf['tue_bearish'] = wdf['tue_close'] < wdf['tue_open']
wdf['tue_drop_usd'] = wdf['tue_open'] - wdf['tue_low']
wdf['tue_drop_pct'] = (wdf['tue_open'] - wdf['tue_low']) / wdf['tue_open'] * 100
wdf['tue_rise_usd'] = wdf['tue_high'] - wdf['tue_open'] # adverse excursion
wdf['tue_rise_pct'] = (wdf['tue_high'] - wdf['tue_open']) / wdf['tue_open'] * 100
wdf['tue_return_usd'] = wdf['tue_close'] - wdf['tue_open'] # short PnL = tue_open - tue_close
wdf['tue_short_pnl_usd'] = wdf['tue_open'] - wdf['tue_close']
wdf['tue_short_pnl_pct'] = (wdf['tue_open'] - wdf['tue_close']) / wdf['tue_open'] * 100

# Tue drop from Monday close
wdf['tue_drop_from_mon_close'] = wdf['mon_close'] - wdf['tue_low']
wdf['tue_lower_low'] = wdf['tue_low'] < wdf['mon_low']

sub = wdf.dropna(subset=['prev_week_bullish', 'tue_open', 'tue_close']).copy()

print("=" * 80)
print("PART 1: PARAMETER SWEEP - FILTERING OUT NARROW WEEKS ('ไม่ทำระยะแคบเกินไป')")
print("=" * 80)

print("\n--- A. SWEEP BY PERCENTAGE GAIN (% GAIN FROM MON OPEN TO FRI CLOSE) ---")
pct_thresholds = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]
results_pct = []
for th in pct_thresholds:
    df_th = sub[sub['prev_week_pct'] >= th]
    n = len(df_th)
    if n == 0: continue
    w_bear_wr = df_th['week_bearish'].mean() * 100
    mon_bear_wr = df_th['mon_bearish'].mean() * 100
    tue_bear_wr = df_th['tue_bearish'].mean() * 100
    tue_drop_avg = df_th['tue_drop_usd'].mean()
    tue_drop_pct_avg = df_th['tue_drop_pct'].mean()
    tue_short_pnl = df_th['tue_short_pnl_usd'].mean()
    tue_lower_low = df_th['tue_lower_low'].mean() * 100
    heavy_drop_1pct = (df_th['tue_drop_pct'] >= 1.0).mean() * 100
    heavy_drop_2pct = (df_th['tue_drop_pct'] >= 2.0).mean() * 100
    results_pct.append({
        'Min Gain (%)': f'>={th:.1f}%',
        'N (Weeks)': n,
        'Next Wk Bear %': f'{w_bear_wr:.1f}%',
        'Next Mon Bear %': f'{mon_bear_wr:.1f}%',
        'Next Tue Bear %': f'{tue_bear_wr:.1f}%',
        'Tue LL %': f'{tue_lower_low:.1f}%',
        'Avg Tue Drop ($)': f'${tue_drop_avg:.2f}',
        'Avg Tue Drop (%)': f'{tue_drop_pct_avg:.2f}%',
        'Tue Drop>=1%': f'{heavy_drop_1pct:.1f}%',
        'Tue Short PnL ($)': f'${tue_short_pnl:.2f}'
    })
print(pd.DataFrame(results_pct).to_string(index=False))

print("\n--- B. SWEEP BY DOLLAR GAIN (USD GAIN FROM MON OPEN TO FRI CLOSE) ---")
usd_thresholds = [0, 10, 20, 30, 40, 50, 60, 75, 100]
results_usd = []
for th in usd_thresholds:
    df_th = sub[sub['prev_week_diff'] >= th]
    n = len(df_th)
    if n == 0: continue
    w_bear_wr = df_th['week_bearish'].mean() * 100
    mon_bear_wr = df_th['mon_bearish'].mean() * 100
    tue_bear_wr = df_th['tue_bearish'].mean() * 100
    tue_drop_avg = df_th['tue_drop_usd'].mean()
    tue_drop_pct_avg = df_th['tue_drop_pct'].mean()
    tue_short_pnl = df_th['tue_short_pnl_usd'].mean()
    tue_lower_low = df_th['tue_lower_low'].mean() * 100
    heavy_drop_1pct = (df_th['tue_drop_pct'] >= 1.0).mean() * 100
    heavy_drop_2pct = (df_th['tue_drop_pct'] >= 2.0).mean() * 100
    results_usd.append({
        'Min Gain ($)': f'>=${th}',
        'N (Weeks)': n,
        'Next Wk Bear %': f'{w_bear_wr:.1f}%',
        'Next Mon Bear %': f'{mon_bear_wr:.1f}%',
        'Next Tue Bear %': f'{tue_bear_wr:.1f}%',
        'Tue LL %': f'{tue_lower_low:.1f}%',
        'Avg Tue Drop ($)': f'${tue_drop_avg:.2f}',
        'Avg Tue Drop (%)': f'{tue_drop_pct_avg:.2f}%',
        'Tue Drop>=1%': f'{heavy_drop_1pct:.1f}%',
        'Tue Short PnL ($)': f'${tue_short_pnl:.2f}'
    })
print(pd.DataFrame(results_usd).to_string(index=False))

print("\n--- C. SWEEP BY ATR RATIO (WEEK GAIN / ATR14) ---")
atr_thresholds = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5]
results_atr = []
for th in atr_thresholds:
    df_th = sub[sub['prev_week_atr_ratio'] >= th]
    n = len(df_th)
    if n == 0: continue
    w_bear_wr = df_th['week_bearish'].mean() * 100
    mon_bear_wr = df_th['mon_bearish'].mean() * 100
    tue_bear_wr = df_th['tue_bearish'].mean() * 100
    tue_drop_avg = df_th['tue_drop_usd'].mean()
    tue_drop_pct_avg = df_th['tue_drop_pct'].mean()
    tue_short_pnl = df_th['tue_short_pnl_usd'].mean()
    tue_lower_low = df_th['tue_lower_low'].mean() * 100
    heavy_drop_1pct = (df_th['tue_drop_pct'] >= 1.0).mean() * 100
    results_atr.append({
        'Min Gain/ATR': f'>={th:.1f}x',
        'N (Weeks)': n,
        'Next Wk Bear %': f'{w_bear_wr:.1f}%',
        'Next Mon Bear %': f'{mon_bear_wr:.1f}%',
        'Next Tue Bear %': f'{tue_bear_wr:.1f}%',
        'Avg Tue Drop ($)': f'${tue_drop_avg:.2f}',
        'Avg Tue Drop (%)': f'{tue_drop_pct_avg:.2f}%',
        'Tue Drop>=1%': f'{heavy_drop_1pct:.1f}%',
        'Tue Short PnL ($)': f'${tue_short_pnl:.2f}'
    })
print(pd.DataFrame(results_atr).to_string(index=False))
