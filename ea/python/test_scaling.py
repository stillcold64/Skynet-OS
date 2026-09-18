import yfinance as yf
import pandas as pd
import numpy as np
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from stress_test_whipsaw import run_simulation

df = yf.download('GC=F', period='720d', interval='1h', progress=False)
if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.get_level_values(0)

# 1. Baseline: 0.03 lot, $50 target, no buffer
r1 = run_simulation(df, initial_cap=10000.0, lot_size=0.03, cashflow_target=50.0, ema_exit_buffer_atr=0.0)

# 2. Optimized: 0.05 lot, $100 target, 0.2 ATR buffer
r2 = run_simulation(df, initial_cap=10000.0, lot_size=0.05, cashflow_target=100.0, ema_exit_buffer_atr=0.2)

# 3. Growth: 0.08 lot, $150 target, 0.2 ATR buffer
r3 = run_simulation(df, initial_cap=10000.0, lot_size=0.08, cashflow_target=150.0, ema_exit_buffer_atr=0.2)

# 4. Aggressive: 0.10 lot, $200 target, 0.2 ATR buffer
r4 = run_simulation(df, initial_cap=10000.0, lot_size=0.10, cashflow_target=200.0, ema_exit_buffer_atr=0.2)

print("="*75)
print(" SCALING COMPARISON (GC=F 720 Days / ~2 Years)")
print("="*75)
print(f"{'Config':<35} {'Net Profit':<15} {'Max DD':<12} {'Win Rate':<10}")
print("-"*75)
print(f"{'1. Current (0.03 lot, $50 target)':<35} ${r1['net_profit']:,.2f}    {r1['max_dd_pct']:.2f}%       {r1['win_rate']:.1f}%")
print(f"{'2. Tuned (0.05 lot, $100 target)':<35} ${r2['net_profit']:,.2f}    {r2['max_dd_pct']:.2f}%       {r2['win_rate']:.1f}%")
print(f"{'3. Growth (0.08 lot, $150 target)':<35} ${r3['net_profit']:,.2f}    {r3['max_dd_pct']:.2f}%       {r3['win_rate']:.1f}%")
print(f"{'4. High-Yield (0.10 lot, $200 target)':<35} ${r4['net_profit']:,.2f}    {r4['max_dd_pct']:.2f}%       {r4['win_rate']:.1f}%")
