import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# 1. Load H1 and D1 data
df_d1 = pd.read_csv('ea/python/xauusd_d1.csv')
df_d1['time'] = pd.to_datetime(df_d1['time'])
df_d1['iso_year'] = df_d1['time'].dt.isocalendar().year
df_d1['iso_week'] = df_d1['time'].dt.isocalendar().week
df_d1['day_name'] = df_d1['time'].dt.day_name()

df_h1 = pd.read_csv('ea/python/xauusd_h1.csv')
df_h1['time'] = pd.to_datetime(df_h1['time'])
df_h1['date_str'] = df_h1['time'].dt.strftime('%Y-%m-%d')

# Weekly aggregation
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
            'mon_close': mon.iloc[0]['close'],
            'fri_date': fri.iloc[-1]['time'].strftime('%Y-%m-%d'),
            'fri_open': fri.iloc[-1]['open'],
            'fri_close': fri.iloc[-1]['close'],
        }
        if not tue.empty:
            w['tue_date'] = tue.iloc[0]['time'].strftime('%Y-%m-%d')
            w['tue_open'] = tue.iloc[0]['open']
            w['tue_high'] = tue.iloc[0]['high']
            w['tue_low'] = tue.iloc[0]['low']
            w['tue_close'] = tue.iloc[0]['close']
        weeks.append(w)

wdf = pd.DataFrame(weeks).sort_values(['year', 'week']).reset_index(drop=True)
wdf['prev_fri_close'] = wdf['fri_close'].shift(1)
wdf['prev_mon_open'] = wdf['mon_open'].shift(1)
wdf['prev_week_diff'] = wdf['prev_fri_close'] - wdf['prev_mon_open']
wdf['prev_week_pct'] = (wdf['prev_fri_close'] - wdf['prev_mon_open']) / wdf['prev_mon_open'] * 100
wdf['prev_week_bullish'] = wdf['prev_week_diff'] > 0

sub = wdf.dropna(subset=['prev_week_bullish', 'tue_date', 'tue_open']).copy()
h1_dates = set(df_h1['date_str'].unique())
sub = sub[sub['tue_date'].isin(h1_dates)].copy().reset_index(drop=True)

h1_by_date = {d: g.sort_values('time').reset_index(drop=True) for d, g in df_h1.groupby('date_str')}

def get_trade_pnls(min_gain_pct=2.5, sl_pts=20.0, tp_pts=20.0, exit_at_close=False):
    pnls = []
    trades = []
    for _, row in sub.iterrows():
        if row['prev_week_pct'] < min_gain_pct or not row['prev_week_bullish']:
            continue
        tue_date = row['tue_date']
        bars = h1_by_date.get(tue_date)
        if bars is None or len(bars) == 0:
            continue

        entry_price = bars.iloc[0]['open']
        sl_price = entry_price + sl_pts if sl_pts > 0 else 999999
        tp_price = entry_price - tp_pts if tp_pts > 0 else 0

        pnl = None
        if exit_at_close or (sl_pts == 0 and tp_pts == 0):
            pnl = entry_price - bars.iloc[-1]['close']
        else:
            for i, bar in bars.iterrows():
                high = bar['high']
                low = bar['low']
                hit_sl = high >= sl_price
                hit_tp = low <= tp_price
                if hit_sl and hit_tp:
                    pnl = -sl_pts
                    break
                elif hit_sl:
                    pnl = -sl_pts
                    break
                elif hit_tp:
                    pnl = tp_pts
                    break
            if pnl is None:
                pnl = entry_price - bars.iloc[-1]['close']

        pnls.append(pnl)
        trades.append({'date': tue_date, 'pnl': pnl})
    return np.array(pnls), pd.DataFrame(trades)

# Define Core Sets for Monte Carlo Analysis
sets = [
    {
        'name': 'Set 1: Gain >= 2.5%, SL $20, TP $20 (1:1 R:R Balanced)',
        'min_pct': 2.5, 'sl': 20.0, 'tp': 20.0, 'exit_close': False
    },
    {
        'name': 'Set 2: Gain >= 3.0%, SL $40, TP $20 (High Win Rate)',
        'min_pct': 3.0, 'sl': 40.0, 'tp': 20.0, 'exit_close': False
    },
    {
        'name': 'Set 3: Gain >= 2.5%, Hold to Tuesday Close (Trend Reversal)',
        'min_pct': 2.5, 'sl': 0.0, 'tp': 0.0, 'exit_close': True
    },
    {
        'name': 'Set 4: Gain >= 3.0%, Hold to Tuesday Close (Aggressive Trend)',
        'min_pct': 3.0, 'sl': 0.0, 'tp': 0.0, 'exit_close': True
    }
]

print("=" * 80)
print("       MONTE CARLO SIMULATION & EDGE VALIDATION REPORT (XAUUSD)")
print("=" * 80)
print(f"Number of Iterations per Set: 10,000 Resamplings")
print("-" * 80)

np.random.seed(42)
N_SIMS = 10000

monte_results = {}

for s in sets:
    pnls, tdf = get_trade_pnls(min_gain_pct=s['min_pct'], sl_pts=s['sl'], tp_pts=s['tp'], exit_at_close=s['exit_close'])
    N_trades = len(pnls)
    if N_trades == 0:
        continue
        
    actual_wr = (pnls > 0).mean() * 100
    actual_net = pnls.sum()
    actual_avg = pnls.mean()
    actual_wins = pnls[pnls > 0]
    actual_losses = abs(pnls[pnls < 0])
    actual_pf = actual_wins.sum() / actual_losses.sum() if actual_losses.sum() > 0 else 99.0

    # 1. Bootstrapping (with replacement) 10,000 runs
    sim_win_rates = []
    sim_pfs = []
    sim_avgs = []
    sim_max_dds = []
    sim_final_equities = []

    for _ in range(N_SIMS):
        sample = np.random.choice(pnls, size=N_trades, replace=True)
        # Win rate
        wr = (sample > 0).mean() * 100
        sim_win_rates.append(wr)
        
        # Avg PnL
        sim_avgs.append(sample.mean())
        
        # Profit Factor
        w = sample[sample > 0].sum()
        l = abs(sample[sample < 0].sum())
        pf = w / l if l > 0 else 99.0
        sim_pfs.append(pf)
        
        # Max Drawdown ($)
        equity = np.cumsum(sample)
        sim_final_equities.append(equity[-1])
        peak = np.maximum.accumulate(equity)
        dd = peak - equity
        sim_max_dds.append(dd.max())

    sim_win_rates = np.array(sim_win_rates)
    sim_pfs = np.array(sim_pfs)
    sim_avgs = np.array(sim_avgs)
    sim_max_dds = np.array(sim_max_dds)
    sim_final_equities = np.array(sim_final_equities)

    # 2. Permutation / Null Hypothesis test (Is this edge significantly better than random?)
    # Null hypothesis: randomly selected Tuesdays across all weeks have same or better PnL
    # Extract ALL Tuesdays PnL
    all_tue_pnls = []
    for _, row in sub.iterrows():
        bars = h1_by_date.get(row['tue_date'])
        if bars is not None and len(bars) > 0:
            if s['exit_close'] or (s['sl'] == 0 and s['tp'] == 0):
                all_tue_pnls.append(bars.iloc[0]['open'] - bars.iloc[-1]['close'])
            else:
                p = None
                e = bars.iloc[0]['open']
                for _, b in bars.iterrows():
                    if b['high'] >= e + s['sl']:
                        p = -s['sl']
                        break
                    elif b['low'] <= e - s['tp']:
                        p = s['tp']
                        break
                if p is None:
                    p = e - bars.iloc[-1]['close']
                all_tue_pnls.append(p)
    all_tue_pnls = np.array(all_tue_pnls)

    # Permutation test p-value: chance that N random Tuesdays achieve mean PnL >= actual_avg
    random_means = [np.random.choice(all_tue_pnls, size=N_trades, replace=True).mean() for _ in range(N_SIMS)]
    p_value = (np.array(random_means) >= actual_avg).mean()

    # Risk of Ruin calculation (Assuming account size = $1,000, 1 oz lot)
    # Probability that equity drops by >= $200 (20% DD), >= $300 (30% DD)
    prob_dd_200 = (sim_max_dds >= 200).mean() * 100
    prob_dd_300 = (sim_max_dds >= 300).mean() * 100
    prob_positive = (sim_final_equities > 0).mean() * 100

    monte_results[s['name']] = {
        'N_trades': N_trades,
        'actual_wr': actual_wr,
        'actual_pf': actual_pf,
        'actual_avg': actual_avg,
        'actual_net': actual_net,
        'wr_ci_low': np.percentile(sim_win_rates, 2.5),
        'wr_ci_high': np.percentile(sim_win_rates, 97.5),
        'avg_ci_low': np.percentile(sim_avgs, 2.5),
        'avg_ci_high': np.percentile(sim_avgs, 97.5),
        'pf_ci_low': np.percentile(sim_pfs, 2.5),
        'pf_ci_high': np.percentile(sim_pfs, 97.5),
        'dd_median': np.median(sim_max_dds),
        'dd_95th': np.percentile(sim_max_dds, 95),
        'dd_99th': np.percentile(sim_max_dds, 99),
        'p_value': p_value,
        'prob_dd_200': prob_dd_200,
        'prob_positive': prob_positive,
        'sim_final_equities': sim_final_equities,
        'sim_max_dds': sim_max_dds,
        'pnls': pnls
    }

    print(f"\n[+] {s['name']}")
    print(f"    - Historical Sample: {N_trades} trades | Net Profit: ${actual_net:.2f}")
    print(f"    - Actual Win Rate: {actual_wr:.1f}%  --> 95% Confidence Interval: [{np.percentile(sim_win_rates, 2.5):.1f}% - {np.percentile(sim_win_rates, 97.5):.1f}%]")
    print(f"    - Actual Profit Factor: {actual_pf:.2f}  --> 95% Confidence Interval: [{np.percentile(sim_pfs, 2.5):.2f} - {np.percentile(sim_pfs, 97.5):.2f}]")
    print(f"    - Expectancy (Avg $/trade): ${actual_avg:.2f}  --> 95% CI: [${np.percentile(sim_avgs, 2.5):.2f} - ${np.percentile(sim_avgs, 97.5):.2f}]")
    print(f"    - Max Drawdown Distribution:")
    print(f"        * 50th Percentile (Median DD): ${np.median(sim_max_dds):.2f}")
    print(f"        * 95th Percentile (Conservative DD): ${np.percentile(sim_max_dds, 95):.2f}")
    print(f"        * 99th Percentile (Worst-Case DD): ${np.percentile(sim_max_dds, 99):.2f}")
    print(f"    - Statistical Significance (P-Value vs Random Tuesday): p = {p_value:.4f} {'(GENUINE EDGE, p < 0.05)' if p_value < 0.05 else '(NOT STATISTICALLY SIGNIFICANT)'}")
    print(f"    - Probability of Ending in Profit: {prob_positive:.1f}%")
    print(f"    - Risk of Drawdown >= $200 (20% of $1000): {prob_dd_200:.2f}%")

# 3. Plot Monte Carlo Fan Chart & Drawdown Distribution
fig, axes = plt.subplots(2, 2, figsize=(15, 11))
plt.style.use('dark_background')

# Plot 1: Monte Carlo Equity Curves Fan for Set 1
ax1 = axes[0, 0]
set1_pnls = monte_results[sets[0]['name']]['pnls']
N_t1 = len(set1_pnls)
sim_curves = []
for _ in range(300):
    sample = np.random.choice(set1_pnls, size=N_t1, replace=True)
    curve = np.cumsum(sample)
    ax1.plot(range(1, N_t1 + 1), curve, color='#00ffcc', alpha=0.08)
    sim_curves.append(curve)
sim_curves = np.array(sim_curves)
ax1.plot(range(1, N_t1 + 1), np.median(sim_curves, axis=0), color='#ffffff', linewidth=2.5, label='Median Simulation')
ax1.plot(range(1, N_t1 + 1), np.percentile(sim_curves, 5, axis=0), color='#ff3366', linewidth=2, linestyle='--', label='5th Percentile (Pessimistic)')
ax1.plot(range(1, N_t1 + 1), np.percentile(sim_curves, 95, axis=0), color='#33ff33', linewidth=2, linestyle='--', label='95th Percentile (Optimistic)')
ax1.set_title(f"Monte Carlo Equity Fan: {sets[0]['name']}", fontsize=11)
ax1.set_xlabel('Trade Number')
ax1.set_ylabel('Cumulative PnL ($ / oz)')
ax1.legend(loc='upper left')
ax1.grid(True, alpha=0.2)

# Plot 2: Drawdown Distribution for Set 1
ax2 = axes[0, 1]
dd_data = monte_results[sets[0]['name']]['sim_max_dds']
ax2.hist(dd_data, bins=40, color='#ff9900', alpha=0.75, edgecolor='#333333')
ax2.axvline(np.median(dd_data), color='#ffffff', linestyle='-', linewidth=2, label=f'Median: ${np.median(dd_data):.1f}')
ax2.axvline(np.percentile(dd_data, 95), color='#ff0055', linestyle='--', linewidth=2, label=f'95th Percentile: ${np.percentile(dd_data, 95):.1f}')
ax2.set_title('Max Drawdown Distribution (10,000 Sims)', fontsize=11)
ax2.set_xlabel('Max Drawdown ($)')
ax2.set_ylabel('Frequency')
ax2.legend()
ax2.grid(True, alpha=0.2)

# Plot 3: Monte Carlo Equity Fan for Set 2 (High Win Rate)
ax3 = axes[1, 0]
set2_pnls = monte_results[sets[1]['name']]['pnls']
N_t2 = len(set2_pnls)
sim_curves2 = []
for _ in range(300):
    sample = np.random.choice(set2_pnls, size=N_t2, replace=True)
    curve = np.cumsum(sample)
    ax3.plot(range(1, N_t2 + 1), curve, color='#ffcc00', alpha=0.08)
    sim_curves2.append(curve)
sim_curves2 = np.array(sim_curves2)
ax3.plot(range(1, N_t2 + 1), np.median(sim_curves2, axis=0), color='#ffffff', linewidth=2.5, label='Median Simulation')
ax3.plot(range(1, N_t2 + 1), np.percentile(sim_curves2, 5, axis=0), color='#ff3366', linewidth=2, linestyle='--', label='5th Percentile')
ax3.plot(range(1, N_t2 + 1), np.percentile(sim_curves2, 95, axis=0), color='#33ff33', linewidth=2, linestyle='--', label='95th Percentile')
ax3.set_title(f"Monte Carlo Equity Fan: {sets[1]['name']}", fontsize=11)
ax3.set_xlabel('Trade Number')
ax3.set_ylabel('Cumulative PnL ($ / oz)')
ax3.legend(loc='upper left')
ax3.grid(True, alpha=0.2)

# Plot 4: Comparison of Edge Significance (P-Value & Profit Probability)
ax4 = axes[1, 1]
names_short = ['Set 1\n(1:1 R:R)', 'Set 2\n(High WR)', 'Set 3\n(Exit Close)', 'Set 4\n(Aggressive)']
probs_pos = [monte_results[s['name']]['prob_positive'] for s in sets]
bars = ax4.bar(names_short, probs_pos, color=['#00ffcc', '#ffaa00', '#ff007f', '#00ccff'], alpha=0.85)
ax4.set_ylim(80, 100)
ax4.set_ylabel('Probability of Profit (%)')
ax4.set_title('Monte Carlo Probability of Ending in Net Profit (%)', fontsize=11)
for bar in bars:
    yval = bar.get_height()
    ax4.text(bar.get_x() + bar.get_width()/2.0, yval + 0.3, f'{yval:.1f}%', ha='center', va='bottom', color='#ffffff', fontweight='bold')
ax4.grid(True, alpha=0.2, axis='y')

plt.tight_layout()
plt.savefig('ea/python/monte_carlo_tuesday_chart.png', dpi=150)
print("\nSaved Monte Carlo chart to ea/python/monte_carlo_tuesday_chart.png")
