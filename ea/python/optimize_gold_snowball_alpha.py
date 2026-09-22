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

weeks = []
for (yr, wk), g in df_d1.groupby(['iso_year', 'iso_week']):
    mon = g[g['day_name'] == 'Monday']
    tue = g[g['day_name'] == 'Tuesday']
    fri = g[g['day_name'] == 'Friday']
    if not mon.empty and not fri.empty and not tue.empty:
        w = {
            'year': yr, 'week': wk,
            'mon_date': mon.iloc[0]['time'].strftime('%Y-%m-%d'),
            'mon_open': mon.iloc[0]['open'],
            'mon_close': mon.iloc[0]['close'],
            'fri_close': fri.iloc[-1]['close'],
            'tue_date': tue.iloc[0]['time'].strftime('%Y-%m-%d'),
            'tue_open': tue.iloc[0]['open'],
            'tue_close': tue.iloc[0]['close'],
        }
        weeks.append(w)

wdf = pd.DataFrame(weeks).sort_values(['year', 'week']).reset_index(drop=True)
wdf['prev_fri_close'] = wdf['fri_close'].shift(1)
wdf['prev_mon_open'] = wdf['mon_open'].shift(1)
wdf['prev_week_diff'] = wdf['prev_fri_close'] - wdf['prev_mon_open']
wdf['prev_week_pct'] = (wdf['prev_fri_close'] - wdf['prev_mon_open']) / wdf['prev_mon_open'] * 100
wdf['prev_week_bullish'] = wdf['prev_week_diff'] > 0

sub = wdf.dropna(subset=['prev_week_bullish', 'tue_date']).copy()
h1_dates = set(df_h1['date_str'].unique())
sub = sub[sub['tue_date'].isin(h1_dates)].copy().reset_index(drop=True)

h1_by_date = {d: g.sort_values('time').reset_index(drop=True) for d, g in df_h1.groupby('date_str')}

print("=" * 90)
print("     ALPHA PORTFOLIO OPTIMIZATION: GOLD TUESDAY SNOWBALL (SURVIVAL & HIGH ALPHA)")
print("=" * 90)
print(f"Data range: 2018 - 2026 (8.7 Years) | Total available Tuesday events: {len(sub)}")

def simulate_alpha_snowball(
    initial_cap=2000.0,
    min_gain_pct=0.5,
    initial_sl=20.0,
    step_usd=7.5,
    lots=[0.10, 0.15, 0.20, 0.30],
    lock_be_buffer=1.0,
    basket_tp=0.0, # 0 means exit at EOD close
    use_trailing=True
):
    """
    Simulates a Tuesday Snowball cycle with precise survival checks.
    Lots specify progression: e.g. [0.10, 0.15, 0.20, 0.30]
    """
    balance = initial_cap
    equity_curve = [balance]
    peak_equity = balance
    max_dd_dollars = 0.0
    max_dd_pct = 0.0
    
    total_weeks_traded = 0
    wins = 0
    losses = 0
    breakevens = 0
    super_dumps = 0 # 3+ layers filled and in profit
    
    history = []
    
    for _, row in sub.iterrows():
        # Weekly trigger condition
        if row['prev_week_pct'] < min_gain_pct or not row['prev_week_bullish']:
            continue
            
        tue_date = row['tue_date']
        bars = h1_by_date.get(tue_date)
        if bars is None or len(bars) == 0:
            continue
            
        total_weeks_traded += 1
        tue_open = bars.iloc[0]['open']
        
        # Layer 1
        positions = [{
            'layer': 1,
            'entry': tue_open,
            'lot': lots[0],
            'sl': tue_open + initial_sl,
            'active': True
        }]
        
        next_target = tue_open - step_usd
        next_layer_idx = 1
        stopped_out = False
        week_pnl = 0.0
        
        for _, bar in bars.iterrows():
            high = bar['high']
            low = bar['low']
            
            # Check stops for all active positions
            for pos in positions:
                if pos['active'] and high >= pos['sl']:
                    loss_pts = pos['entry'] - pos['sl']
                    pnl_dollar = loss_pts * 100.0 * pos['lot'] # 1 lot = 100 oz -> $100 per $1 move per 1.0 lot
                    pos['active'] = False
                    week_pnl += pnl_dollar
                    stopped_out = True
                    
            if stopped_out and all(not p['active'] for p in positions):
                break
                
            # Trigger next snowball layers
            while next_layer_idx < len(lots) and low <= next_target and not stopped_out:
                entry_p = next_target
                lot_size = lots[next_layer_idx]
                
                # Freeroll lock: move earlier layers SL into profit/BE
                for prev in positions:
                    if prev['active']:
                        if use_trailing:
                            # Trail stop down
                            prev['sl'] = min(prev['sl'], entry_p + step_usd - lock_be_buffer)
                        else:
                            # Lock BE
                            prev['sl'] = min(prev['sl'], prev['entry'] - lock_be_buffer)
                            
                positions.append({
                    'layer': next_layer_idx + 1,
                    'entry': entry_p,
                    'lot': lot_size,
                    'sl': entry_p + step_usd,
                    'active': True
                })
                next_layer_idx += 1
                next_target -= step_usd
                
            # Optional Basket TP check
            if basket_tp > 0:
                floating_pnl = 0.0
                for pos in positions:
                    if pos['active']:
                        floating_pnl += (pos['entry'] - low) * 100.0 * pos['lot']
                if floating_pnl >= basket_tp:
                    # Take profit on all
                    for pos in positions:
                        if pos['active']:
                            pts = pos['entry'] - low
                            pos['active'] = False
                            week_pnl += pts * 100.0 * pos['lot']
                    break
                    
        # Close remaining active positions at market close
        tue_close = bars.iloc[-1]['close']
        for pos in positions:
            if pos['active']:
                pts = pos['entry'] - tue_close
                week_pnl += pts * 100.0 * pos['lot']
                pos['active'] = False
                
        balance += week_pnl
        equity_curve.append(balance)
        if balance > peak_equity:
            peak_equity = balance
        dd_d = peak_equity - balance
        dd_p = (dd_d / peak_equity) * 100.0 if peak_equity > 0 else 0.0
        if dd_d > max_dd_dollars: max_dd_dollars = dd_d
        if dd_p > max_dd_pct: max_dd_pct = dd_p
        
        if week_pnl > 10.0:
            wins += 1
            if len(positions) >= 3:
                super_dumps += 1
        elif week_pnl < -10.0:
            losses += 1
        else:
            breakevens += 1
            
        history.append({
            'date': tue_date,
            'week_pnl': week_pnl,
            'balance': balance,
            'layers': len(positions)
        })
        
    net_profit = balance - initial_cap
    cagr = ((balance / initial_cap) ** (1 / 8.7) - 1) * 100.0 if balance > 0 else -100.0
    calmar = (net_profit / max_dd_dollars) if max_dd_dollars > 0 else 99.0
    win_rate = (wins / total_weeks_traded * 100.0) if total_weeks_traded > 0 else 0.0
    
    # Calculate consecutive loss streak
    max_loss_streak = 0
    curr_loss = 0
    for h in history:
        if h['week_pnl'] < -10.0:
            curr_loss += 1
            if curr_loss > max_loss_streak: max_loss_streak = curr_loss
        elif h['week_pnl'] > 10.0:
            curr_loss = 0
            
    return {
        'net_profit': net_profit,
        'final_balance': balance,
        'cagr': cagr,
        'max_dd_dollars': max_dd_dollars,
        'max_dd_pct': max_dd_pct,
        'calmar': calmar,
        'total_weeks': total_weeks_traded,
        'wins': wins,
        'losses': losses,
        'breakevens': breakevens,
        'super_dumps': super_dumps,
        'win_rate': win_rate,
        'max_loss_streak': max_loss_streak,
        'history': pd.DataFrame(history),
        'equity_curve': np.array(equity_curve)
    }

# ==============================================================================
# 2. RUN COMPREHENSIVE PARAMETER GRID SEARCH
# ==============================================================================
lot_schedules = {
    'S1_Micro_Survive': [0.05, 0.08, 0.12, 0.15],
    'S2_Balanced_Alpha': [0.08, 0.12, 0.18, 0.25],
    'S3_Heavy_Snowball': [0.10, 0.15, 0.20, 0.30],
    'S4_Ruthless_Alpha': [0.10, 0.20, 0.30, 0.50]
}

grid_results = []

for sched_name, lots in lot_schedules.items():
    for min_pct in [0.5, 0.8, 1.0, 1.5]:
        for sl in [15.0, 20.0, 25.0]:
            for step in [5.0, 7.5, 10.0]:
                for buffer_pts in [1.0, 2.0]:
                    res = simulate_alpha_snowball(
                        initial_cap=2000.0,
                        min_gain_pct=min_pct,
                        initial_sl=sl,
                        step_usd=step,
                        lots=lots,
                        lock_be_buffer=buffer_pts,
                        basket_tp=0.0,
                        use_trailing=True
                    )
                    # Survival constraints:
                    # 1. Max DD < 30% of peak
                    # 2. Final Balance > initial_cap * 3 (must deliver 3x+ alpha)
                    # 3. Max loss streak <= 5
                    is_survived = (res['max_dd_pct'] <= 25.0) and (res['final_balance'] >= 8000.0)
                    
                    grid_results.append({
                        'Schedule': sched_name,
                        'MinPct': min_pct,
                        'SL': sl,
                        'Step': step,
                        'Buffer': buffer_pts,
                        'FinalBal': res['final_balance'],
                        'NetProfit': res['net_profit'],
                        'MaxDD_D': res['max_dd_dollars'],
                        'MaxDD_Pct': res['max_dd_pct'],
                        'Calmar': res['calmar'],
                        'CAGR': res['cagr'],
                        'Trades': res['total_weeks'],
                        'SuperDumps': res['super_dumps'],
                        'LossStreak': res['max_loss_streak'],
                        'Survived': is_survived
                    })

gdf = pd.DataFrame(grid_results)
gdf.to_csv('ea/python/alpha_snowball_grid_results.csv', index=False)
print(f"Total Parameter Combinations Evaluated: {len(gdf)}")

print("\n" + "=" * 95)
print("TIER 1: ULTRA-SURVIVAL (MAX DD <= 25%, STRICT CONSERVATIVE)")
print("=" * 95)
t1 = gdf[gdf['MaxDD_Pct'] <= 25.0].sort_values('Calmar', ascending=False).head(5)
print(t1[['Schedule', 'MinPct', 'SL', 'Step', 'Buffer', 'FinalBal', 'NetProfit', 'MaxDD_Pct', 'Calmar', 'CAGR', 'SuperDumps']].to_string(index=False))

print("\n" + "=" * 95)
print("TIER 2: BALANCED ALPHA (MAX DD <= 35%, HIGH GROWTH & HIGH SURVIVAL)")
print("=" * 95)
t2 = gdf[gdf['MaxDD_Pct'] <= 35.0].sort_values('FinalBal', ascending=False).head(5)
print(t2[['Schedule', 'MinPct', 'SL', 'Step', 'Buffer', 'FinalBal', 'NetProfit', 'MaxDD_Pct', 'Calmar', 'CAGR', 'SuperDumps']].to_string(index=False))

print("\n" + "=" * 95)
print("TIER 3: HIGH-OCTANE ALPHA (MAX DD <= 50%, MAXIMUM CAPITAL EXPLOSION)")
print("=" * 95)
t3 = gdf[gdf['MaxDD_Pct'] <= 50.0].sort_values('FinalBal', ascending=False).head(5)
print(t3[['Schedule', 'MinPct', 'SL', 'Step', 'Buffer', 'FinalBal', 'NetProfit', 'MaxDD_Pct', 'Calmar', 'CAGR', 'SuperDumps']].to_string(index=False))

survived_df = gdf[gdf['Survived'] == True].sort_values('Calmar', ascending=False)
top10 = survived_df.head(10).copy()
for col in ['FinalBal', 'NetProfit', 'MaxDD_D']:
    top10[col] = top10[col].apply(lambda x: f"${x:,.1f}")
top10['MaxDD_Pct'] = top10['MaxDD_Pct'].apply(lambda x: f"{x:.1f}%")
top10['CAGR'] = top10['CAGR'].apply(lambda x: f"{x:.1f}%")
top10['Calmar'] = top10['Calmar'].apply(lambda x: f"{x:.2f}")
print(top10[['Schedule', 'MinPct', 'SL', 'Step', 'Buffer', 'FinalBal', 'NetProfit', 'MaxDD_Pct', 'Calmar', 'CAGR', 'SuperDumps', 'LossStreak']].to_string(index=False))

# Extract the #1 Champion Configuration
best = survived_df.iloc[0]
print("\n" + "=" * 90)
print("CHAMPION PRESET DETAIL:")
print(f"Schedule: {best['Schedule']} | Lots: {lot_schedules[best['Schedule']]}")
print(f"Min Prior Week Gain: >={best['MinPct']}% | Initial SL: ${best['SL']} | Step: ${best['Step']} | BE Buffer: ${best['Buffer']}")
print("=" * 90)

# Simulate and plot Champion vs Benchmark
champ_res = simulate_alpha_snowball(
    initial_cap=2000.0,
    min_gain_pct=best['MinPct'],
    initial_sl=best['SL'],
    step_usd=best['Step'],
    lots=lot_schedules[best['Schedule']],
    lock_be_buffer=best['Buffer'],
    use_trailing=True
)

champ_hdf = champ_res['history']
champ_hdf['dt'] = pd.to_datetime(champ_hdf['date'])

# Compare with S4 Ruthless (High DD variant)
ruthless_res = simulate_alpha_snowball(
    initial_cap=2000.0,
    min_gain_pct=0.5,
    initial_sl=20.0,
    step_usd=7.5,
    lots=lot_schedules['S4_Ruthless_Alpha'],
    lock_be_buffer=1.0,
    use_trailing=True
)
ruthless_hdf = ruthless_res['history']
ruthless_hdf['dt'] = pd.to_datetime(ruthless_hdf['date'])

# Plot
plt.style.use('dark_background')
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 10))

# Subplot 1: Equity Curve
ax1.plot(champ_hdf['dt'], champ_hdf['balance'], color='#00ffcc', linewidth=2.5, label=f"Champion 'Survive & Thrive': ${champ_res['final_balance']:,.0f} (Max DD: {champ_res['max_dd_pct']:.1f}%)")
ax1.plot(ruthless_hdf['dt'], ruthless_hdf['balance'], color='#ff0055', linewidth=1.8, linestyle='--', alpha=0.75, label=f"Raw Ruthless: ${ruthless_res['final_balance']:,.0f} (Max DD: {ruthless_res['max_dd_pct']:.1f}%)")
ax1.axhline(2000, color='gray', linestyle=':', label='Starting Capital ($2,000)')
ax1.set_title('Alpha Portfolio: Gold Tuesday Snowball Survivor Growth (2018 - 2026)', fontsize=13, pad=12)
ax1.set_ylabel('Account Balance ($ USD)', fontsize=12)
ax1.legend(loc='upper left', fontsize=10)
ax1.grid(True, alpha=0.2)

# Subplot 2: Monthly/Weekly PnL Bars of Champion
pos_weeks = champ_hdf[champ_hdf['week_pnl'] >= 0]
neg_weeks = champ_hdf[champ_hdf['week_pnl'] < 0]
ax2.bar(pos_weeks['dt'], pos_weeks['week_pnl'], color='#00ffcc', width=5, alpha=0.85, label='Winning / Dump Week PnL')
ax2.bar(neg_weeks['dt'], neg_weeks['week_pnl'], color='#ff3366', width=5, alpha=0.85, label='Losing Week PnL (Capped)')
ax2.set_title('Weekly Cashflow Harvest per Tuesday Event ($)', fontsize=12)
ax2.set_ylabel('Weekly PnL ($)', fontsize=11)
ax2.legend(loc='upper left')
ax2.grid(True, alpha=0.2)

plt.tight_layout()
plt.savefig('ea/python/alpha_snowball_champion_chart.png', dpi=150)
print("\nSaved chart to ea/python/alpha_snowball_champion_chart.png")
