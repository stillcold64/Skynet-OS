import sys
sys.path.append('ea/python')
import pandas as pd
from optimize_tuesday_pullback import df, run_backtest

print("=== FULL DATASET TEST (2018-2026: 8.5 YEARS) ===")

# Baseline (Original No-Pullback, Fixed 7.5/15)
res0 = run_backtest(df, upward_buffer=0.0, entry_mode='LIMIT', initial_sl=15.0, step_usd=7.5, trail_lock_profit=0.0, exit_hour=22)
print(f"Original Baseline : Trades: {res0['trades']:3d} | WR: {res0['wr']:4.1f}% | Net: ${res0['net']:10,.2f} | PF: {res0['pf']:5.2f} | MaxDD: ${res0['max_dd']:8,.2f}")

# Config 1: BREAKDOWN (Buffer=10, SL=20, Step=8, Lock=300)
res1 = run_backtest(df, upward_buffer=10.0, entry_mode='BREAKDOWN', initial_sl=20.0, step_usd=8.0, trail_lock_profit=300.0, exit_hour=20)
print(f"Config 1 (BKD $10): Trades: {res1['trades']:3d} | WR: {res1['wr']:4.1f}% | Net: ${res1['net']:10,.2f} | PF: {res1['pf']:5.2f} | MaxDD: ${res1['max_dd']:8,.2f}")

# Config 2: LIMIT (Buffer=20, SL=20, Step=8, Lock=500)
res2 = run_backtest(df, upward_buffer=20.0, entry_mode='LIMIT', initial_sl=20.0, step_usd=8.0, trail_lock_profit=500.0, exit_hour=20)
print(f"Config 2 (LMT $20): Trades: {res2['trades']:3d} | WR: {res2['wr']:4.1f}% | Net: ${res2['net']:10,.2f} | PF: {res2['pf']:5.2f} | MaxDD: ${res2['max_dd']:8,.2f}")

# Config 3: BREAKDOWN (Buffer=15, SL=25, Step=10, Lock=500)
res3 = run_backtest(df, upward_buffer=15.0, entry_mode='BREAKDOWN', initial_sl=25.0, step_usd=10.0, trail_lock_profit=500.0, exit_hour=20)
print(f"Config 3 (BKD $15): Trades: {res3['trades']:3d} | WR: {res3['wr']:4.1f}% | Net: ${res3['net']:10,.2f} | PF: {res3['pf']:5.2f} | MaxDD: ${res3['max_dd']:8,.2f}")

# Config 4: BREAKDOWN (Buffer=10, SL=15, Step=8, Lock=300, Sizing 0.10->0.20->0.40->0.80)
res4 = run_backtest(df, upward_buffer=10.0, entry_mode='BREAKDOWN', initial_sl=15.0, step_usd=8.0, lots=[0.10, 0.20, 0.40, 0.80], trail_lock_profit=500.0, exit_hour=20)
print(f"Config 4 (BKD $10 / 0.10 lot): Trades: {res4['trades']:3d} | WR: {res4['wr']:4.1f}% | Net: ${res4['net']:10,.2f} | PF: {res4['pf']:5.2f} | MaxDD: ${res4['max_dd']:8,.2f}")
