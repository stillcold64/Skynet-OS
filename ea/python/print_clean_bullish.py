import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append('ea/python')
from test_bullish_snowball import df, df_2024, test_bullish_snowball

print("=== SIZING: [0.10 -> 0.20 -> 0.30 -> 0.50] ===")
# 2024-2026
n, wr, net24, pf24, mdd24, minb24 = test_bullish_snowball(
    df_2024, strategy_mode='MON_HIGH_BREAK', step_usd=10.0, lots=[0.10, 0.20, 0.30, 0.50], exit_day=1
)
print(f"2024-2026 (Exit Tue 21:00): Trades: {n} | WR: {wr:.1f}% | Net: ${net24:,.2f} | PF: {pf24:.2f} | MaxDD: ${mdd24:,.2f} | MinBal: ${minb24:,.2f}")

n, wr, net24_w, pf24_w, mdd24_w, minb24_w = test_bullish_snowball(
    df_2024, strategy_mode='MON_HIGH_BREAK', step_usd=10.0, lots=[0.10, 0.20, 0.30, 0.50], exit_day=2
)
print(f"2024-2026 (Exit Wed 21:00): Trades: {n} | WR: {wr:.1f}% | Net: ${net24_w:,.2f} | PF: {pf24_w:.2f} | MaxDD: ${mdd24_w:,.2f} | MinBal: ${minb24_w:,.2f}")

# Full 8.5 Years
n_a, wr_a, net_all, pf_all, mdd_all, minb_all = test_bullish_snowball(
    df, strategy_mode='MON_HIGH_BREAK', step_usd=10.0, lots=[0.10, 0.20, 0.30, 0.50], exit_day=1
)
print(f"Full 8.5yr (Exit Tue 21:00): Trades: {n_a} | WR: {wr_a:.1f}% | Net: ${net_all:,.2f} | PF: {pf_all:.2f} | MaxDD: ${mdd_all:,.2f} | MinBal: ${minb_all:,.2f}")

n_a, wr_a, net_all_w, pf_all_w, mdd_all_w, minb_all_w = test_bullish_snowball(
    df, strategy_mode='MON_HIGH_BREAK', step_usd=10.0, lots=[0.10, 0.20, 0.30, 0.50], exit_day=2
)
print(f"Full 8.5yr (Exit Wed 21:00): Trades: {n_a} | WR: {wr_a:.1f}% | Net: ${net_all_w:,.2f} | PF: {pf_all_w:.2f} | MaxDD: ${mdd_all_w:,.2f} | MinBal: ${minb_all_w:,.2f}")
