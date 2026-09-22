import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
import numpy as np

# 1. Load H1 and D1 data
print("Loading H1 and D1 data...")
df_d1 = pd.read_csv('ea/python/xauusd_d1.csv')
df_d1['time'] = pd.to_datetime(df_d1['time'])
df_d1['iso_year'] = df_d1['time'].dt.isocalendar().year
df_d1['iso_week'] = df_d1['time'].dt.isocalendar().week
df_d1['day_name'] = df_d1['time'].dt.day_name()

df_h1 = pd.read_csv('ea/python/xauusd_h1.csv')
df_h1['time'] = pd.to_datetime(df_h1['time'])
df_h1['date_str'] = df_h1['time'].dt.strftime('%Y-%m-%d')

# Compute rolling ATR on D1
df_d1['prev_close'] = df_d1['close'].shift(1)
df_d1['tr'] = np.maximum(df_d1['high'] - df_d1['low'], 
                         np.maximum(abs(df_d1['high'] - df_d1['prev_close']), 
                                    abs(df_d1['low'] - df_d1['prev_close'])))
df_d1['atr14'] = df_d1['tr'].rolling(14).mean()

# Extract weekly summaries
weeks = []
for (yr, wk), g in df_d1.groupby(['iso_year', 'iso_week']):
    mon = g[g['day_name'] == 'Monday']
    tue = g[g['day_name'] == 'Tuesday']
    fri = g[g['day_name'] == 'Friday']
    if not mon.empty and not fri.empty:
        w = {
            'year': yr, 'week': wk,
            'mon_date': mon.iloc[0]['time'].strftime('%Y-%m-%d'),
            'mon_open': mon.iloc[0]['open'],
            'mon_high': mon.iloc[0]['high'],
            'mon_low': mon.iloc[0]['low'],
            'mon_close': mon.iloc[0]['close'],
            'fri_date': fri.iloc[-1]['time'].strftime('%Y-%m-%d'),
            'fri_open': fri.iloc[-1]['open'],
            'fri_high': fri.iloc[-1]['high'],
            'fri_low': fri.iloc[-1]['low'],
            'fri_close': fri.iloc[-1]['close'],
            'fri_atr14': fri.iloc[-1]['atr14'],
        }
        if not tue.empty:
            w['tue_date'] = tue.iloc[0]['time'].strftime('%Y-%m-%d')
            w['tue_open'] = tue.iloc[0]['open']
            w['tue_high'] = tue.iloc[0]['high']
            w['tue_low'] = tue.iloc[0]['low']
            w['tue_close'] = tue.iloc[0]['close']
        weeks.append(w)

wdf = pd.DataFrame(weeks).sort_values(['year', 'week']).reset_index(drop=True)

# Previous week features
wdf['prev_fri_close'] = wdf['fri_close'].shift(1)
wdf['prev_mon_open'] = wdf['mon_open'].shift(1)
wdf['prev_fri_high'] = wdf['fri_high'].shift(1)
wdf['prev_fri_low'] = wdf['fri_low'].shift(1)
wdf['prev_fri_atr'] = wdf['fri_atr14'].shift(1)

wdf['prev_week_diff'] = wdf['prev_fri_close'] - wdf['prev_mon_open']
wdf['prev_week_pct'] = (wdf['prev_fri_close'] - wdf['prev_mon_open']) / wdf['prev_mon_open'] * 100
wdf['prev_week_bullish'] = wdf['prev_week_diff'] > 0

# Monday features in current week
wdf['mon_is_bullish'] = wdf['mon_close'] > wdf['mon_open']
wdf['mon_swept_fri_high'] = wdf['mon_high'] > wdf['prev_fri_high']

sub = wdf.dropna(subset=['prev_week_bullish', 'tue_date', 'tue_open']).copy()
# Filter only weeks that have H1 data
h1_dates = set(df_h1['date_str'].unique())
sub = sub[sub['tue_date'].isin(h1_dates)].copy().reset_index(drop=True)
print(f"Total Tuesday candidates with H1 data (2018-2026): {len(sub)}")

# Pre-group H1 bars by date for ultra fast lookup
h1_by_date = {d: g.sort_values('time').reset_index(drop=True) for d, g in df_h1.groupby('date_str')}

def backtest_tuesday_h1(min_gain_pct=1.5, min_gain_usd=0, mon_filter='ALL', sl_pts=20.0, tp_pts=30.0, exit_at_close=False):
    """
    Backtest selling Gold on Tuesday Open using H1 bars.
    mon_filter: 'ALL', 'MON_BULL' (Mon close > Mon open), 'MON_BEAR' (Mon close < Mon open), 'SWEPT_FRI_HIGH'
    """
    trades = []
    for _, row in sub.iterrows():
        # Condition check
        if min_gain_pct > 0 and row['prev_week_pct'] < min_gain_pct:
            continue
        if min_gain_usd > 0 and row['prev_week_diff'] < min_gain_usd:
            continue
        if not row['prev_week_bullish']:
            continue
            
        if mon_filter == 'MON_BULL' and not row['mon_is_bullish']:
            continue
        elif mon_filter == 'MON_BEAR' and row['mon_is_bullish']:
            continue
        elif mon_filter == 'SWEPT_FRI_HIGH' and not row['mon_swept_fri_high']:
            continue

        tue_date = row['tue_date']
        bars = h1_by_date.get(tue_date)
        if bars is None or len(bars) == 0:
            continue

        entry_price = bars.iloc[0]['open'] # Short at Tuesday first H1 open
        sl_price = entry_price + sl_pts if sl_pts > 0 else 999999
        tp_price = entry_price - tp_pts if tp_pts > 0 else 0

        pnl = 0.0
        outcome = 'HOLD_CLOSE'
        exit_price = bars.iloc[-1]['close']

        # Traverse hourly bars to simulate execution
        for i, bar in bars.iterrows():
            high = bar['high']
            low = bar['low']

            # Check if both hit in same hour (assume conservative: SL hit first)
            hit_sl = (high >= sl_price) if sl_pts > 0 else False
            hit_tp = (low <= tp_price) if tp_pts > 0 else False

            if hit_sl and hit_tp:
                # Ambiguous: conservative assumption -> SL hit
                pnl = -sl_pts
                outcome = 'SL'
                exit_price = sl_price
                break
            elif hit_sl:
                pnl = -sl_pts
                outcome = 'SL'
                exit_price = sl_price
                break
            elif hit_tp:
                pnl = tp_pts
                outcome = 'TP'
                exit_price = tp_price
                break

        if outcome == 'HOLD_CLOSE':
            # Closed at end of Tuesday
            exit_price = bars.iloc[-1]['close']
            pnl = entry_price - exit_price # Short PnL

        trades.append({
            'date': tue_date,
            'entry': entry_price,
            'exit': exit_price,
            'pnl': pnl,
            'outcome': outcome,
            'prev_pct': row['prev_week_pct'],
            'prev_diff': row['prev_week_diff']
        })

    tdf = pd.DataFrame(trades)
    if len(tdf) == 0:
        return {'n': 0, 'wr': 0, 'pf': 0, 'net_pnl': 0, 'avg_pnl': 0, 'max_dd': 0}

    n = len(tdf)
    win_trades = tdf[tdf['pnl'] > 0]
    loss_trades = tdf[tdf['pnl'] < 0]
    wr = len(win_trades) / n * 100
    gross_win = win_trades['pnl'].sum()
    gross_loss = abs(loss_trades['pnl'].sum())
    pf = gross_win / gross_loss if gross_loss > 0 else 99.0
    net_pnl = tdf['pnl'].sum()
    avg_pnl = tdf['pnl'].mean()
    
    # Max Drawdown
    cum = tdf['pnl'].cumsum()
    peak = cum.cummax()
    dd = peak - cum
    max_dd = dd.max()

    return {
        'n': n,
        'wr': wr,
        'pf': pf,
        'net_pnl': net_pnl,
        'avg_pnl': avg_pnl,
        'max_dd': max_dd
    }

print("\n" + "=" * 90)
print("PART 2: TUESDAY SHORT STRATEGY - EXIT AT TUESDAY CLOSE (NO FIXED TP/SL)")
print("=" * 90)
results_close = []
for min_pct in [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]:
    res = backtest_tuesday_h1(min_gain_pct=min_pct, sl_pts=0, tp_pts=0)
    results_close.append({
        'Min Gain (%)': f'>={min_pct:.1f}%',
        'Trades': res['n'],
        'Win Rate (%)': f"{res['wr']:.1f}%",
        'Profit Factor': f"{res['pf']:.2f}",
        'Net PnL ($)': f"${res['net_pnl']:.2f}",
        'Avg PnL ($)': f"${res['avg_pnl']:.2f}",
        'Max DD ($)': f"${res['max_dd']:.2f}"
    })
print(pd.DataFrame(results_close).to_string(index=False))

print("\n" + "=" * 90)
print("PART 3: GRID OPTIMIZATION: MIN WEEK GAIN % vs SL / TP on TUESDAY")
print("=" * 90)

grid_results = []
for min_pct in [1.0, 1.5, 2.0, 2.5, 3.0]:
    for sl in [15.0, 20.0, 25.0, 30.0, 40.0]:
        for tp in [15.0, 20.0, 30.0, 40.0, 50.0]:
            res = backtest_tuesday_h1(min_gain_pct=min_pct, sl_pts=sl, tp_pts=tp)
            if res['n'] >= 15:
                grid_results.append({
                    'MinPct': min_pct,
                    'SL': sl,
                    'TP': tp,
                    'Trades': res['n'],
                    'WinRate': res['wr'],
                    'PF': res['pf'],
                    'NetPnL': res['net_pnl'],
                    'AvgPnL': res['avg_pnl'],
                    'MaxDD': res['max_dd']
                })

gdf = pd.DataFrame(grid_results)
gdf_sorted = gdf.sort_values('PF', ascending=False)

print("\nTOP 15 PARAMETER COMBINATIONS BY PROFIT FACTOR (H1 EXECUTION 2018-2026):")
top15 = gdf_sorted.head(15).copy()
top15['WinRate'] = top15['WinRate'].apply(lambda x: f"{x:.1f}%")
top15['PF'] = top15['PF'].apply(lambda x: f"{x:.2f}")
top15['NetPnL'] = top15['NetPnL'].apply(lambda x: f"${x:.1f}")
top15['AvgPnL'] = top15['AvgPnL'].apply(lambda x: f"${x:.2f}")
top15['MaxDD'] = top15['MaxDD'].apply(lambda x: f"${x:.1f}")
print(top15.to_string(index=False))

print("\n" + "=" * 90)
print("PART 4: INFLUENCE OF MONDAY PRICE ACTION ON TUESDAY DROP")
print("=" * 90)

for filter_name in ['ALL', 'MON_BULL', 'MON_BEAR', 'SWEPT_FRI_HIGH']:
    res = backtest_tuesday_h1(min_gain_pct=1.5, sl_pts=25.0, tp_pts=30.0, mon_filter=filter_name)
    print(f"Filter: {filter_name:<15} | Trades: {res['n']:<3} | WinRate: {res['wr']:.1f}% | PF: {res['pf']:.2f} | Net PnL: ${res['net_pnl']:.1f} | Max DD: ${res['max_dd']:.1f}")
