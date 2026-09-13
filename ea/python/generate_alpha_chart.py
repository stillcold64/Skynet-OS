"""
Generates Alpha 5x Snowball & Exit chart
"""

import pandas as pd
import yfinance as yf
import matplotlib.pyplot as plt
from alpha_runner import run_alpha_snowball

df = yf.download('GC=F', start='2023-10-01', end='2026-09-01', interval='1d')
if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.get_level_values(0)

res_df, stats = run_alpha_snowball(
    df,
    initial_capital=1000.0,
    max_dca_weeks=10,
    weekly_dca=50.0,
    lot_size=1.0,
    step_price=20.0,
    be_points=15.0,
    trail_dist=30.0,
    take_profit_mult=5.0
)

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(11, 8), sharex=True)

# 1. Equity curve with 5x Exit point
ax1.plot(res_df.index, res_df['Equity'], color='#10b981', lw=2.5, label='Alpha Snowball Equity ($)')
ax1.axhline(stats['total_deposited'] * 5.0, color='#ef4444', linestyle='--', label=f"5.0x Take-Profit Target (${stats['total_deposited']*5:,.0f})")
if stats['exit_date']:
    ax1.scatter([stats['exit_date']], [stats['final_equity']], color='#f59e0b', s=120, zorder=5, label=f"Target Hit & Clean Exit ({stats['exit_date'].strftime('%Y-%m-%d')})")
ax1.set_title('Alpha Snowball: Fast 5x Compounding & "Target Exit" (2023 - 2026)', fontsize=13, fontweight='bold')
ax1.set_ylabel('Account Equity ($)')
ax1.grid(True, alpha=0.3)
ax1.legend(loc='upper left')

# 2. Pyramiding Layers
ax2.bar(res_df.index, res_df['Positions'], color='#6366f1', width=1.5, label='Active Pyramiding Layers')
ax2.set_title('Pyramiding Layers Active Over Time', fontsize=11)
ax2.set_ylabel('Number of Positions')
ax2.set_xlabel('Date')
ax2.grid(True, alpha=0.3)
ax2.legend(loc='upper left')

plt.tight_layout()
chart_path = r'c:\Users\Win10\Desktop\UHNWI\ea\python\alpha_growth_chart.png'
plt.savefig(chart_path, dpi=150)
plt.close()
print("Saved alpha chart!")
