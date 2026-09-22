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
            'fri_close': fri.iloc[-1]['close'],
            'tue_date': tue.iloc[0]['time'].strftime('%Y-%m-%d'),
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

def run_snowball_simulation(min_gain_pct=1.0, step_usd=7.5, lots=[0.10, 0.15, 0.20, 0.30], initial_sl=20.0, lock_profit_pts=2.0):
    history = []
    for _, row in sub.iterrows():
        if row['prev_week_pct'] < min_gain_pct or not row['prev_week_bullish']:
            continue
        tue_date = row['tue_date']
        bars = h1_by_date.get(tue_date)
        if bars is None or len(bars) == 0:
            continue
            
        tue_open = bars.iloc[0]['open']
        positions = [{
            'layer': 1,
            'entry': tue_open,
            'lot': lots[0],
            'sl': tue_open + initial_sl,
            'active': True
        }]
        
        next_step_target = tue_open - step_usd
        next_idx = 1
        week_pnl = 0.0
        stopped_out = False
        
        for _, bar in bars.iterrows():
            high = bar['high']
            low = bar['low']
            
            # Check stops
            for pos in positions:
                if pos['active'] and high >= pos['sl']:
                    loss_pts = pos['entry'] - pos['sl']
                    pnl_dollar = loss_pts * 10.0 * pos['lot'] * 10.0
                    pos['active'] = False
                    week_pnl += pnl_dollar
                    stopped_out = True
                    
            if stopped_out and all(not p['active'] for p in positions):
                break
                
            # Trigger snowball layers
            while next_idx < len(lots) and low <= next_step_target and not stopped_out:
                entry_p = next_step_target
                lot_size = lots[next_idx]
                
                # Lock profit / Breakeven on previous positions
                for prev in positions:
                    if prev['active']:
                        # Trail stop down to lock profit
                        prev['sl'] = min(prev['sl'], prev['entry'] - lock_profit_pts)
                        
                positions.append({
                    'layer': next_idx + 1,
                    'entry': entry_p,
                    'lot': lot_size,
                    'sl': entry_p + step_usd,
                    'active': True
                })
                next_idx += 1
                next_step_target -= step_usd
                
        # Close remaining at market close
        tue_close = bars.iloc[-1]['close']
        for pos in positions:
            if pos['active']:
                pts = pos['entry'] - tue_close
                pnl_dollar = pts * 10.0 * pos['lot'] * 10.0
                week_pnl += pnl_dollar
                
        history.append({
            'date': tue_date,
            'week_pnl': week_pnl,
            'layers': len(positions)
        })
        
    hdf = pd.DataFrame(history)
    cum = hdf['week_pnl'].cumsum()
    peak = cum.cummax()
    dd = peak - cum
    return hdf, cum, dd.max()

# Run 3 configurations:
# Config 1: Baseline Single Trade (Gain >= 2.5%, Flat 0.10)
# Config 2: Moderate Snowball (Gain >= 1.0%, Step $7.5, lots [0.10, 0.15, 0.20, 0.30])
# Config 3: Ruthless Aggressive Snowball (Gain >= 0.5%, Step $7.5, lots [0.10, 0.20, 0.30, 0.50])

print("Simulating Snowball Configurations...")
h_base, cum_base, dd_base = run_snowball_simulation(min_gain_pct=2.5, step_usd=999, lots=[0.10], initial_sl=20.0)
h_mod, cum_mod, dd_mod = run_snowball_simulation(min_gain_pct=1.0, step_usd=7.5, lots=[0.10, 0.15, 0.20, 0.30], initial_sl=20.0)
h_ruthless, cum_ruthless, dd_ruthless = run_snowball_simulation(min_gain_pct=0.5, step_usd=7.5, lots=[0.10, 0.20, 0.30, 0.50], initial_sl=20.0)

print(f"\n1. Baseline Flat Lot (Gain >= 2.5%, Single Order 0.10):")
print(f"   Active Weeks: {len(h_base)} | Total Trades: {h_base['layers'].sum()} | Net PnL: ${cum_base.iloc[-1]:,.2f} | Max DD: ${dd_base:,.2f}")

print(f"\n2. Moderate Snowball (Gain >= 1.0%, Scaling [0.10, 0.15, 0.20, 0.30]):")
print(f"   Active Weeks: {len(h_mod)} | Total Trades: {h_mod['layers'].sum()} | Net PnL: ${cum_mod.iloc[-1]:,.2f} | Max DD: ${dd_mod:,.2f}")

print(f"\n3. Ruthless Aggressive Snowball (Gain >= 0.5%, Scaling [0.10, 0.20, 0.30, 0.50]):")
print(f"   Active Weeks: {len(h_ruthless)} | Total Trades: {h_ruthless['layers'].sum()} | Net PnL: ${cum_ruthless.iloc[-1]:,.2f} | Max DD: ${dd_ruthless:,.2f}")

# Plot
plt.style.use('dark_background')
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 10))

# Convert to datetime for plotting
h_base['dt'] = pd.to_datetime(h_base['date'])
h_mod['dt'] = pd.to_datetime(h_mod['date'])
h_ruthless['dt'] = pd.to_datetime(h_ruthless['date'])

ax1.plot(h_ruthless['dt'], cum_ruthless, color='#ff0055', linewidth=2.4, label=f'Ruthless Snowball (Gain >=0.5%, 0.10-0.50): Net +${cum_ruthless.iloc[-1]:,.0f}')
ax1.plot(h_mod['dt'], cum_mod, color='#00ffcc', linewidth=2.2, label=f'Moderate Snowball (Gain >=1.0%, 0.10-0.30): Net +${cum_mod.iloc[-1]:,.0f}')
ax1.plot(h_base['dt'], cum_base, color='#ffaa00', linewidth=1.8, linestyle='--', label=f'Baseline Safe (Gain >=2.5%, Single 0.10): Net +${cum_base.iloc[-1]:,.0f}')

ax1.set_title('XAUUSD Tuesday Dump: Baseline vs Aggressive Downward Pyramiding Snowball', fontsize=13, pad=12)
ax1.set_ylabel('Cumulative Net PnL ($ USD)', fontsize=12)
ax1.legend(loc='upper left', fontsize=10)
ax1.grid(True, alpha=0.2)

# Subplot 2: Trade Frequency & Distribution of Layers Fired
layer_counts = h_ruthless['layers'].value_counts().sort_index()
bars = ax2.bar([f'{l} Layer(s)' for l in layer_counts.index], layer_counts.values, color=['#555555', '#33ccff', '#00ffcc', '#ff007f'], alpha=0.85)
ax2.set_title('Frequency of Snowball Layers Activated per Tuesday (Gain >= 0.5%)', fontsize=12)
ax2.set_ylabel('Number of Weeks Fired', fontsize=11)
ax2.set_xlabel('Snowball Depth Reached on Tuesday Dump', fontsize=11)
for bar in bars:
    yval = bar.get_height()
    ax2.text(bar.get_x() + bar.get_width()/2.0, yval + 1.5, f'{yval} wks ({yval/len(h_ruthless)*100:.1f}%)', ha='center', va='bottom', color='#ffffff', fontweight='bold')
ax2.grid(True, alpha=0.2, axis='y')

plt.tight_layout()
plt.savefig('ea/python/snowball_ruthless_growth.png', dpi=150)
print("\nSaved chart to ea/python/snowball_ruthless_growth.png")
