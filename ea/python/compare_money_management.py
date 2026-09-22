import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# 1. Load data & extract trades for the best 2 sets
from monte_carlo_tuesday_edge import get_trade_pnls

# Set 1: Gain >= 2.5%, SL $20, TP $20 (N=52, WR 59.6%)
pnls_set1, trades_set1 = get_trade_pnls(min_gain_pct=2.5, sl_pts=20.0, tp_pts=20.0)

# Set 2: Gain >= 3.0%, SL $40, TP $20 (N=36, WR 75.0%)
pnls_set2, trades_set2 = get_trade_pnls(min_gain_pct=3.0, sl_pts=40.0, tp_pts=20.0)

def analyze_streaks(pnls):
    wins = pnls > 0
    max_win_streak = 0
    max_loss_streak = 0
    curr_win = 0
    curr_loss = 0
    for w in wins:
        if w:
            curr_win += 1
            curr_loss = 0
            if curr_win > max_win_streak: max_win_streak = curr_win
        else:
            curr_loss += 1
            curr_win = 0
            if curr_loss > max_loss_streak: max_loss_streak = curr_loss
    return max_win_streak, max_loss_streak

w_strk1, l_strk1 = analyze_streaks(pnls_set1)
w_strk2, l_strk2 = analyze_streaks(pnls_set2)

print("=" * 80)
print("STREAK ANALYSIS (HISTORICAL)")
print("=" * 80)
print(f"Set 1 (N={len(pnls_set1)}): Max Winning Streak = {w_strk1}, Max Losing Streak = {l_strk1}")
print(f"Set 2 (N={len(pnls_set2)}): Max Winning Streak = {w_strk2}, Max Losing Streak = {l_strk2}")

# Simulate Money Management Models (Initial Balance = $5,000, Base lot = 0.10, $1/pt/0.10 lot)
INITIAL_BALANCE = 5000.0
BASE_LOT = 0.10 # $1 PnL per $1 gold price move per 0.10 lot ($10/oz * 0.10)

def simulate_money_management(pnls, initial_balance=5000.0, base_lot=0.10):
    """
    Simulates:
    1. Fixed Lot (0.10)
    2. Martingale (x2 on loss, cap at 3 consecutive losses, reset on win)
    3. Martingale Moderate (x1.5 on loss, cap at 4 losses)
    4. Anti-Martingale / Paroli (x1.5 on win, cap at 3 consecutive wins, reset on loss)
    5. Anti-Martingale Aggressive (x2.0 on win, cap at 2 consecutive wins, reset on loss)
    6. Fixed Fractional (Risk 2% of equity per trade, lot sized by SL)
    """
    models = {
        '1. Fixed Lot (Base)': [],
        '2. Martingale 2.0x (Cap 3)': [],
        '3. Martingale 1.5x (Cap 4)': [],
        '4. Anti-Martingale 1.5x (Cap 3)': [],
        '5. Anti-Martingale 2.0x (Cap 2)': [],
    }
    
    # 1. Fixed Lot
    bal = initial_balance
    eq_fixed = [bal]
    for p in pnls:
        dollar_pnl = p * 10.0 * base_lot # 1 lot = 100 oz, 0.1 lot = 10 oz -> $10 per $1 move
        bal += dollar_pnl
        eq_fixed.append(bal)
    models['1. Fixed Lot (Base)'] = np.array(eq_fixed)

    # 2. Martingale 2.0x (Cap at 3 losses = max 4x base)
    bal = initial_balance
    eq_mart = [bal]
    curr_multiplier = 1.0
    loss_count = 0
    for p in pnls:
        dollar_pnl = p * 10.0 * (base_lot * curr_multiplier)
        bal += dollar_pnl
        eq_mart.append(bal)
        if p > 0:
            curr_multiplier = 1.0
            loss_count = 0
        else:
            loss_count += 1
            if loss_count < 3:
                curr_multiplier *= 2.0
            else:
                curr_multiplier = 1.0 # Reset after hitting cap to prevent ruin
                loss_count = 0
    models['2. Martingale 2.0x (Cap 3)'] = np.array(eq_mart)

    # 3. Martingale 1.5x (Cap at 4 losses)
    bal = initial_balance
    eq_mart_mod = [bal]
    curr_multiplier = 1.0
    loss_count = 0
    for p in pnls:
        dollar_pnl = p * 10.0 * (base_lot * curr_multiplier)
        bal += dollar_pnl
        eq_mart_mod.append(bal)
        if p > 0:
            curr_multiplier = 1.0
            loss_count = 0
        else:
            loss_count += 1
            if loss_count < 4:
                curr_multiplier *= 1.5
            else:
                curr_multiplier = 1.0
                loss_count = 0
    models['3. Martingale 1.5x (Cap 4)'] = np.array(eq_mart_mod)

    # 4. Anti-Martingale 1.5x (Cap at 3 wins)
    bal = initial_balance
    eq_anti_mod = [bal]
    curr_multiplier = 1.0
    win_count = 0
    for p in pnls:
        dollar_pnl = p * 10.0 * (base_lot * curr_multiplier)
        bal += dollar_pnl
        eq_anti_mod.append(bal)
        if p > 0:
            win_count += 1
            if win_count < 3:
                curr_multiplier *= 1.5
            else:
                curr_multiplier = 1.0
                win_count = 0
        else:
            curr_multiplier = 1.0
            win_count = 0
    models['4. Anti-Martingale 1.5x (Cap 3)'] = np.array(eq_anti_mod)

    # 5. Anti-Martingale 2.0x (Cap at 2 wins)
    bal = initial_balance
    eq_anti_agg = [bal]
    curr_multiplier = 1.0
    win_count = 0
    for p in pnls:
        dollar_pnl = p * 10.0 * (base_lot * curr_multiplier)
        bal += dollar_pnl
        eq_anti_agg.append(bal)
        if p > 0:
            win_count += 1
            if win_count < 2:
                curr_multiplier *= 2.0
            else:
                curr_multiplier = 1.0
                win_count = 0
        else:
            curr_multiplier = 1.0
            win_count = 0
    models['5. Anti-Martingale 2.0x (Cap 2)'] = np.array(eq_anti_agg)

    return models

def get_stats(eq_series, initial_balance=5000.0):
    final_bal = eq_series[-1]
    net_profit = final_bal - initial_balance
    ret_pct = net_profit / initial_balance * 100
    peak = np.maximum.accumulate(eq_series)
    dd = peak - eq_series
    max_dd = dd.max()
    max_dd_pct = (dd / peak).max() * 100
    calmar = net_profit / max_dd if max_dd > 0 else 99.0
    return {
        'Final Balance': f"${final_bal:,.2f}",
        'Net Profit': f"${net_profit:,.2f}",
        'Return (%)': f"{ret_pct:.1f}%",
        'Max Drawdown ($)': f"${max_dd:,.2f}",
        'Max DD (%)': f"{max_dd_pct:.1f}%",
        'Profit / MaxDD': f"{calmar:.2f}"
    }

print("\n" + "=" * 80)
print("MONEY MANAGEMENT SIMULATION: SET 2 (GAIN >= 3%, SL $40, TP $20, WR 75%)")
print("=" * 80)
models_s2 = simulate_money_management(pnls_set2)
res_s2 = []
for name, eq in models_s2.items():
    st = get_stats(eq)
    st['Model'] = name
    res_s2.append(st)
print(pd.DataFrame(res_s2)[['Model', 'Final Balance', 'Net Profit', 'Return (%)', 'Max Drawdown ($)', 'Max DD (%)', 'Profit / MaxDD']].to_string(index=False))

print("\n" + "=" * 80)
print("MONEY MANAGEMENT SIMULATION: SET 1 (GAIN >= 2.5%, SL $20, TP $20, WR 59.6%)")
print("=" * 80)
models_s1 = simulate_money_management(pnls_set1)
res_s1 = []
for name, eq in models_s1.items():
    st = get_stats(eq)
    st['Model'] = name
    res_s1.append(st)
print(pd.DataFrame(res_s1)[['Model', 'Final Balance', 'Net Profit', 'Return (%)', 'Max Drawdown ($)', 'Max DD (%)', 'Profit / MaxDD']].to_string(index=False))

# Plot Comparative Equity Curves
plt.style.use('dark_background')
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))

colors = {
    '1. Fixed Lot (Base)': '#888888',
    '2. Martingale 2.0x (Cap 3)': '#ff3366',
    '3. Martingale 1.5x (Cap 4)': '#ff9933',
    '4. Anti-Martingale 1.5x (Cap 3)': '#00ffcc',
    '5. Anti-Martingale 2.0x (Cap 2)': '#33ccff'
}

for name, eq in models_s2.items():
    ax1.plot(eq, label=name, color=colors[name], linewidth=2.2 if 'Anti' in name or 'Fixed' in name else 1.8)
ax1.set_title('Set 2 (High Win Rate 75%): Money Management Comparison ($5,000 Account)', fontsize=12)
ax1.set_ylabel('Account Balance ($)')
ax1.legend(loc='upper left')
ax1.grid(True, alpha=0.2)

for name, eq in models_s1.items():
    ax2.plot(eq, label=name, color=colors[name], linewidth=2.2 if 'Anti' in name or 'Fixed' in name else 1.8)
ax2.set_title('Set 1 (Balanced 1:1 R:R 59.6%): Money Management Comparison ($5,000 Account)', fontsize=12)
ax2.set_xlabel('Trade Number')
ax2.set_ylabel('Account Balance ($)')
ax2.legend(loc='upper left')
ax2.grid(True, alpha=0.2)

plt.tight_layout()
plt.savefig('ea/python/money_management_comparison.png', dpi=150)
print("\nSaved chart to ea/python/money_management_comparison.png")
