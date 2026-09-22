import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# 1. Load data
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
            'year': yr, 'week': wk,
            'mon_open': mon.iloc[0]['open'],
            'fri_close': fri.iloc[-1]['close'],
            'tue_date': tue.iloc[0]['time'].strftime('%Y-%m-%d'),
            'tue_open': tue.iloc[0]['open'],
            'tue_high': tue.iloc[0]['high'],
            'tue_low': tue.iloc[0]['low'],
            'tue_close': tue.iloc[0]['close'],
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

print("=" * 85)
print("     MONTE CARLO STRESS TEST: FLAW & FAILURE MODE ANALYSIS (GOLD SNOWBALL)")
print("=" * 85)
print(f"Historical Sample: {len(sub)} Tuesday events (2018 - 2026)")
print("Sizing Structure: [1.00 -> 2.00 -> 3.00 -> 5.00 Lots] on $5,000 Bullet")

# Extract historical PnL list under ideal conditions
def get_base_trades(slippage_usd=0.0):
    trades = []
    lots = [1.00, 2.00, 3.00, 5.00]
    step = 7.5
    sl = 15.0
    buffer_pts = 1.0
    
    for _, row in sub.iterrows():
        if row['prev_week_pct'] < 0.8 or not row['prev_week_bullish']:
            continue
        tue_date = row['tue_date']
        bars = h1_by_date.get(tue_date)
        if bars is None or len(bars) == 0:
            continue
            
        tue_open = bars.iloc[0]['open']
        # Adverse slippage on entry
        entry_1 = tue_open - slippage_usd
        positions = [{'entry': entry_1, 'lot': lots[0], 'sl': entry_1 + sl + slippage_usd, 'active': True}]
        next_target = entry_1 - step
        next_idx = 1
        stopped_out = False
        week_pnl = 0.0
        
        for _, bar in bars.iterrows():
            high = bar['high']
            low = bar['low']
            for pos in positions:
                if pos['active'] and high >= pos['sl']:
                    loss_pts = pos['entry'] - (pos['sl'] + slippage_usd)
                    pos['active'] = False
                    week_pnl += loss_pts * 100.0 * pos['lot']
                    stopped_out = True
            if stopped_out and all(not p['active'] for p in positions):
                break
            while next_idx < len(lots) and low <= next_target and not stopped_out:
                entry_p = next_target - slippage_usd
                lot_size = lots[next_idx]
                for prev in positions:
                    if prev['active']:
                        prev['sl'] = min(prev['sl'], entry_p + step - buffer_pts)
                positions.append({'entry': entry_p, 'lot': lot_size, 'sl': entry_p + step + slippage_usd, 'active': True})
                next_idx += 1
                next_target -= step
                
        tue_close = bars.iloc[-1]['close']
        for pos in positions:
            if pos['active']:
                week_pnl += (pos['entry'] - (tue_close + slippage_usd)) * 100.0 * pos['lot']
                pos['active'] = False
                
        trades.append({
            'date': tue_date,
            'pnl': week_pnl,
            'layers': len(positions),
            'year': int(row['year']),
            'tue_open': tue_open
        })
    return pd.DataFrame(trades)

tdf_ideal = get_base_trades(slippage_usd=0.0)
pnls_ideal = tdf_ideal['pnl'].values
N_trades = len(pnls_ideal)

print(f"\nTotal Triggered Tuesdays: {N_trades} weeks")
print(f"Net Profit Ideal: ${pnls_ideal.sum():,.2f}")

# ------------------------------------------------------------------------------
# TEST 1: MONTE CARLO SEQUENCE SHUFFLING (10,000 RUNS) - LOSING STREAK RISK
# ------------------------------------------------------------------------------
print("\n" + "-" * 85)
print("1. STRESS TEST: CONSECUTIVE LOSING STREAKS & DRAWDOWN IN 10,000 SIMULATED FUTURES")
print("-" * 85)

np.random.seed(42)
N_SIMS = 10000

mc_max_dds = []
mc_max_loss_streaks = []
mc_bust_bullets = [] # Number of times 2+ consecutive losses occur (burning $3,000 - $5,000)

for _ in range(N_SIMS):
    shuffled = np.random.choice(pnls_ideal, size=N_trades, replace=True)
    
    # Max DD
    cum = np.cumsum(shuffled)
    peak = np.maximum.accumulate(cum)
    dd = peak - cum
    mc_max_dds.append(dd.max())
    
    # Loss streak
    max_streak = 0
    curr_streak = 0
    for p in shuffled:
        if p < -500: # Significant loss week
            curr_streak += 1
            if curr_streak > max_streak: max_streak = curr_streak
        elif p > 500:
            curr_streak = 0
    mc_max_loss_streaks.append(max_streak)

mc_max_dds = np.array(mc_max_dds)
mc_max_loss_streaks = np.array(mc_max_loss_streaks)

print(f"Historical Loss Streak: 2 weeks in a row")
print(f"Monte Carlo 50th Percentile (Median Streak): {np.percentile(mc_max_loss_streaks, 50):.0f} consecutive losses")
print(f"Monte Carlo 90th Percentile Worst Streak:   {np.percentile(mc_max_loss_loss := mc_max_loss_streaks, 90):.0f} consecutive losses (Burnt Capital: ~${np.percentile(mc_max_loss_streaks, 90)*1500:,.0f})")
print(f"Monte Carlo 99th Percentile Worst Streak:   {np.percentile(mc_max_loss_streaks, 99):.0f} consecutive losses (Burnt Capital: ~${np.percentile(mc_max_loss_streaks, 99)*1500:,.0f})")
print(f"Monte Carlo Worst-Case Ever in 10,000 runs: {mc_max_loss_streaks.max():.0f} consecutive losses")

prob_3_losses = (mc_max_loss_streaks >= 3).mean() * 100
prob_4_losses = (mc_max_loss_streaks >= 4).mean() * 100
prob_5_losses = (mc_max_loss_streaks >= 5).mean() * 100

print(f"\nProbability of experiencing >= 3 consecutive losses: {prob_3_losses:.2f}% (Busts 1 $5k bullet: -$4,500)")
print(f"Probability of experiencing >= 4 consecutive losses: {prob_4_losses:.2f}% (Requires 2nd $5k bullet: -$6,000)")
print(f"Probability of experiencing >= 5 consecutive losses: {prob_5_losses:.2f}% (Requires 2nd $5k bullet: -$7,500)")

# ------------------------------------------------------------------------------
# TEST 2: REAL-WORLD SLIPPAGE & SPREAD DEGRADATION
# ------------------------------------------------------------------------------
print("\n" + "-" * 85)
print("2. STRESS TEST: SPREAD EXPANSION & EXECUTION SLIPPAGE SENSITIVITY")
print("-" * 85)

slippages = [0.0, 0.25, 0.50, 0.75, 1.00, 1.50]
slip_results = []
for slip in slippages:
    tdf_slip = get_base_trades(slippage_usd=slip)
    net_p = tdf_slip['pnl'].sum()
    wins = tdf_slip[tdf_slip['pnl'] > 0]
    losses = tdf_slip[tdf_slip['pnl'] < 0]
    wr = len(wins) / len(tdf_slip) * 100
    pf = wins['pnl'].sum() / abs(losses['pnl'].sum()) if abs(losses['pnl'].sum()) > 0 else 99
    
    slip_results.append({
        'Slippage ($/oz)': f"${slip:.2f}",
        'Net Profit ($)': f"${net_p:,.2f}",
        'Win Rate (%)': f"{wr:.1f}%",
        'Profit Factor': f"{pf:.2f}",
        'Profit Decay (%)': f"{(pnls_ideal.sum() - net_p) / pnls_ideal.sum() * 100:.1f}%"
    })
print(pd.DataFrame(slip_results).to_string(index=False))

# ------------------------------------------------------------------------------
# TEST 3: MARGIN CALL & LEVERAGE BOTTLENECK ANALYSIS
# ------------------------------------------------------------------------------
print("\n" + "-" * 85)
print("3. REALITY CHECK: MARGIN REQUIREMENT VS BROKER LEVERAGE (EXNESS)")
print("-" * 85)

gold_prices = [1500.0, 2000.0, 2600.0, 3000.0]
leverages = [2000, 1000, 500, 200, 100]
print(f"Layer 1: 1.00 Lot | Layer 2: 2.00 Lots | Layer 3: 3.00 Lots | Layer 4: 5.00 Lots (Total 11.00 Lots)")

margin_table = []
for p in gold_prices:
    nominal_11_lots = p * 100.0 * 11.00 # 1100 oz
    for lev in [2000, 500, 200]:
        req_margin = nominal_11_lots / lev
        free_margin_on_5k = 5000.0 - req_margin
        is_margin_call = free_margin_on_5k <= 0
        margin_table.append({
            'Gold Price': f"${p:,.0f}",
            'Leverage': f"1:{lev}",
            'Margin Req (11 Lots)': f"${req_margin:,.2f}",
            'Free Margin on $5K': f"${free_margin_on_5k:,.2f}",
            'Status': "CRITICAL MARGIN CALL!" if is_margin_call else "OK"
        })
print(pd.DataFrame(margin_table).to_string(index=False))

# ------------------------------------------------------------------------------
# TEST 4: REGIME ANALYSIS - DOES A FIXED $7.5 STEP WORK AT $2,600+ GOLD?
# ------------------------------------------------------------------------------
print("\n" + "-" * 85)
print("4. MARKET REGIME CHECK: 2018-2020 ($1,200-$1,800) vs 2024-2026 ($2,200-$2,700)")
print("-" * 85)

tdf_ideal['period'] = np.where(tdf_ideal['year'] <= 2021, '2018-2021 (Low Gold)', '2022-2026 (High Gold)')
for per, g in tdf_ideal.groupby('period'):
    wins = g[g['pnl'] > 0]
    print(f"Regime: {per:<25} | Weeks: {len(g):<3} | WinRate: {len(wins)/len(g)*100:.1f}% | Net Profit: ${g['pnl'].sum():,.2f} | Avg Win: ${wins['pnl'].mean():,.2f}")

# Plot Monte Carlo Stress Test Failure Analysis
plt.style.use('dark_background')
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 10))

# Subplot 1: Distribution of Consecutive Losses
counts, bins, _ = ax1.hist(mc_max_loss_streaks, bins=range(1, 12), color='#ff3366', alpha=0.75, rwidth=0.85, edgecolor='#333333')
ax1.axvline(2, color='#00ffcc', linewidth=2.5, linestyle='-', label='Historical Max Streak (2 weeks)')
ax1.axvline(np.percentile(mc_max_loss_streaks, 95), color='#ffaa00', linewidth=2.5, linestyle='--', label=f'95th Percentile Worst Streak ({np.percentile(mc_max_loss_streaks, 95):.0f} weeks)')
ax1.set_title('Monte Carlo Stress Test: Distribution of Max Consecutive Losses (10,000 Runs)', fontsize=12)
ax1.set_xlabel('Consecutive Losing Weeks')
ax1.set_ylabel('Simulation Frequency')
ax1.legend(loc='upper right')
ax1.grid(True, alpha=0.2)

# Subplot 2: Slippage Decay Curve
slips_num = [0.0, 0.25, 0.50, 0.75, 1.00, 1.50]
profits_num = [get_base_trades(slippage_usd=s)['pnl'].sum() for s in slips_num]
ax2.plot(slips_num, profits_num, marker='o', color='#33ccff', linewidth=2.5)
ax2.set_title('Profit Decay Under Adverse Slippage & Spread ($0.00 to $1.50 per oz)', fontsize=12)
ax2.set_xlabel('Execution Slippage / Spread Cost ($ USD per oz)')
ax2.set_ylabel('Total Net Profit ($ USD)')
ax2.grid(True, alpha=0.2)
for x, y in zip(slips_num, profits_num):
    ax2.annotate(f'${y:,.0f}', (x, y + 8000), ha='center', fontsize=9, color='#ffffff')

plt.tight_layout()
plt.savefig('ea/python/monte_carlo_flaws_stress_test.png', dpi=150)
print("\nSaved stress test chart to ea/python/monte_carlo_flaws_stress_test.png")
