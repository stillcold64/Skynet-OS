"""
DCA Snowball (Pyramiding + Margin Free-Roll) Backtester
Simulates the Alpha Strategy from Meawbin Investor on Historical Gold Data (GC=F)
"""

import os
import sys
import numpy as np
import pandas as pd
import yfinance as yf
import matplotlib.pyplot as plt

def run_snowball_simulation(
    df: pd.DataFrame,
    initial_capital: float = 1000.0,
    weekly_dca: float = 50.0,
    lot_multiplier: float = 0.05,  # Contract size in oz per position
    step_price: float = 25.0,      # Distance in $ to open next snowball order
    be_profit: float = 15.0,       # Distance in $ to move SL to Breakeven
    buffer_profit: float = 1.0,    # Buffer over breakeven in $
    initial_sl_dist: float = 50.0, # Initial SL in $ (0 = none)
    ma_period: int = 50,           # EMA Trend period
    trim_threshold: float = 1000.0,# Trim and withdraw capital when profit >= threshold
    allow_dca: bool = True
):
    """
    Simulates the DCA Snowball strategy tick-by-tick / bar-by-bar.
    """
    df = df.copy()
    df['EMA'] = df['Close'].ewm(span=ma_period, adjust=False).mean()

    balance = initial_capital
    equity = initial_capital
    withdrawn_total = 0.0
    total_deposited = initial_capital

    positions = []  # list of dicts: {'id', 'open_price', 'sl', 'volume', 'be_locked'}
    history = []    # closed trades

    equity_curve = []
    balance_curve = []
    benchmark_dca_equity = []
    dates = []
    position_counts = []

    # Benchmark: Regular DCA without leverage/pyramiding
    bench_cash = initial_capital
    bench_units = bench_cash / df['Close'].iloc[0]
    bench_total_dep = initial_capital

    last_dca_day = -10
    next_trade_id = 1
    capital_withdrawn_once = False

    for i in range(len(df)):
        date = df.index[i]
        bar_open = float(df['Open'].iloc[i])
        bar_high = float(df['High'].iloc[i])
        bar_low = float(df['Low'].iloc[i])
        bar_close = float(df['Close'].iloc[i])
        ema_val = float(df['EMA'].iloc[i])

        is_bullish = bar_close > ema_val

        # 1. Weekly DCA Inflow (every 5 bars ~ 1 week)
        if allow_dca and (i - last_dca_day >= 5) and is_bullish:
            balance += weekly_dca
            total_deposited += weekly_dca
            last_dca_day = i
            # Benchmark also gets DCA
            bench_units += weekly_dca / bar_close
            bench_total_dep += weekly_dca

        # 2. Check Exits / Stop Losses for open positions
        surviving_positions = []
        for pos in positions:
            # Check if Low hit SL
            if pos['sl'] is not None and bar_low <= pos['sl']:
                # Stopped out at SL
                exit_price = pos['sl']
                profit = (exit_price - pos['open_price']) * pos['volume']
                balance += profit
                history.append({
                    'id': pos['id'],
                    'open': pos['open_price'],
                    'exit': exit_price,
                    'profit': profit,
                    'reason': 'StopLoss/BE',
                    'date': date
                })
            else:
                surviving_positions.append(pos)
        positions = surviving_positions

        # 3. Check Trend Exit (Close < EMA) -> Close All
        if not is_bullish and len(positions) > 0:
            for pos in positions:
                profit = (bar_close - pos['open_price']) * pos['volume']
                balance += profit
                history.append({
                    'id': pos['id'],
                    'open': pos['open_price'],
                    'exit': bar_close,
                    'profit': profit,
                    'reason': 'TrendReversal',
                    'date': date
                })
            positions = []

        # 4. Check Breakeven Lock for surviving positions
        all_secured = True
        highest_open = 0.0
        for pos in positions:
            if pos['open_price'] > highest_open:
                highest_open = pos['open_price']

            # If price moved up by be_profit, move SL to breakeven
            if bar_high >= pos['open_price'] + be_profit:
                if not pos['be_locked']:
                    pos['sl'] = pos['open_price'] + buffer_profit
                    pos['be_locked'] = True
            
            if not pos['be_locked']:
                all_secured = False

        # 5. Pyramiding Entry (Snowball)
        if is_bullish:
            if len(positions) == 0:
                # Open base position
                sl = (bar_close - initial_sl_dist) if initial_sl_dist > 0 else None
                positions.append({
                    'id': next_trade_id,
                    'open_price': bar_close,
                    'sl': sl,
                    'volume': lot_multiplier,
                    'be_locked': False
                })
                next_trade_id += 1
            else:
                # If all existing positions are secured (Free-roll), and price advanced by step_price
                if all_secured and (bar_close >= highest_open + step_price):
                    sl = (bar_close - initial_sl_dist) if initial_sl_dist > 0 else None
                    positions.append({
                        'id': next_trade_id,
                        'open_price': bar_close,
                        'sl': sl,
                        'volume': lot_multiplier,
                        'be_locked': False
                    })
                    next_trade_id += 1

        # 6. Calculate Floating PnL & Equity
        floating_pnl = sum((bar_close - p['open_price']) * p['volume'] for p in positions)
        equity = balance + floating_pnl

        # 7. Trim / Rebalance Rule (Withdraw principal when profit reaches threshold)
        if not capital_withdrawn_once and (equity >= total_deposited + trim_threshold):
            withdrawn_total += trim_threshold
            balance -= trim_threshold
            equity -= trim_threshold
            capital_withdrawn_once = True
            print(f"[{date.strftime('%Y-%m-%d')}] Rebalance Triggered! Withdrew ${trim_threshold:,.2f} to safe vault (Risk-Free House Money mode active).")

        dates.append(date)
        equity_curve.append(equity)
        balance_curve.append(balance)
        position_counts.append(len(positions))
        benchmark_dca_equity.append(bench_units * bar_close)

    res_df = pd.DataFrame({
        'Date': dates,
        'Close': df['Close'].values[:len(dates)],
        'EMA': df['EMA'].values[:len(dates)],
        'Equity': equity_curve,
        'Balance': balance_curve,
        'Positions': position_counts,
        'Bench_DCA': benchmark_dca_equity
    }).set_index('Date')

    net_total_value = equity + withdrawn_total
    total_return_pct = ((net_total_value - total_deposited) / total_deposited) * 100.0
    bench_return_pct = ((benchmark_dca_equity[-1] - bench_total_dep) / bench_total_dep) * 100.0

    # Max Drawdown calculation
    equity_series = pd.Series(equity_curve)
    peak = equity_series.cummax()
    dd = (peak - equity_series) / peak
    max_dd_pct = dd.max() * 100.0

    stats = {
        'total_deposited': total_deposited,
        'withdrawn_total': withdrawn_total,
        'final_equity': equity,
        'net_total_value': net_total_value,
        'multiplier': net_total_value / total_deposited,
        'total_return_pct': total_return_pct,
        'max_dd_pct': max_dd_pct,
        'total_trades': len(history),
        'bench_total_dep': bench_total_dep,
        'bench_final_value': benchmark_dca_equity[-1],
        'bench_return_pct': bench_return_pct,
        'max_positions_held': max(position_counts)
    }

    return res_df, stats, history

def main():
    print("=" * 65)
    print("   SKYNET OS / UHNWI - DCA SNOWBALL ALPHA BACKTEST ENGINE")
    print("=" * 65)

    print("Fetching Gold (GC=F) historical data from 2023 to 2026...")
    df = yf.download('GC=F', start='2023-01-01', end='2026-09-01', interval='1d')
    # Flatten MultiIndex columns if needed
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # 1. Mega Bull Run Simulation (Full Dataset)
    print("\n[TEST 1] Running Simulation on Full Bull Cycle (2023 - 2026)...")
    res_df, stats, history = run_snowball_simulation(
        df,
        initial_capital=1000.0,
        weekly_dca=50.0,
        lot_multiplier=0.15,   # Aggressive Alpha sizing
        step_price=20.0,       # New position every $20 advance
        be_profit=15.0,        # Breakeven after $15 advance
        buffer_profit=1.0,     # $1 buffer
        initial_sl_dist=40.0,  # $40 initial SL
        ma_period=50,
        trim_threshold=1500.0
    )

    print("\n--- RESULTS: FULL BULL RUN (2023 - 2026) ---")
    print(f"Total Invested (Net Deposit):   ${stats['total_deposited']:,.2f}")
    print(f"Principal Withdrawn (Safe):     ${stats['withdrawn_total']:,.2f}")
    print(f"Active Account Equity:          ${stats['final_equity']:,.2f}")
    print(f"Total Net Portfolio Value:      ${stats['net_total_value']:,.2f}")
    print(f"Snowball Multiplier:            {stats['multiplier']:.2f}x  (+{stats['total_return_pct']:,.2f}%)")
    print(f"Max Open Positions (Snowball):  {stats['max_positions_held']} positions")
    print(f"Max Peak-to-Trough Drawdown:    {stats['max_dd_pct']:.2f}%")
    print(f"Total Completed Trades:         {stats['total_trades']}")
    print("-" * 50)
    print(f"Benchmark (Regular Spot DCA):   ${stats['bench_final_value']:,.2f}  (+{stats['bench_return_pct']:.2f}%)")
    print(f"Alpha Outperformance:          +{stats['total_return_pct'] - stats['bench_return_pct']:,.2f}%")

    # 2. Stress Test: Sideway / Choppy Market (First 9 months of 2023: Jan 2023 - Sep 2023)
    df_chop = df.loc['2023-01-01':'2023-09-30']
    print("\n[TEST 2 - STRESS TEST] Running on Sideway / Choppy Market (Jan 2023 - Sep 2023)...")
    res_chop, stats_chop, _ = run_snowball_simulation(
        df_chop,
        initial_capital=1000.0,
        weekly_dca=50.0,
        lot_multiplier=0.15,
        step_price=20.0,
        be_profit=15.0,
        buffer_profit=1.0,
        initial_sl_dist=40.0,
        ma_period=50,
        trim_threshold=1500.0
    )
    print(f"Total Invested:                 ${stats_chop['total_deposited']:,.2f}")
    print(f"Final Net Value:                ${stats_chop['net_total_value']:,.2f} ({stats_chop['multiplier']:.2f}x)")
    print(f"Max Drawdown:                   {stats_chop['max_dd_pct']:.2f}%")

    # Plot Comparison Chart
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 10), sharex=True, gridspec_kw={'height_ratios': [2, 2, 1]})

    # Ax 1: Gold Price & EMA
    ax1.plot(res_df.index, res_df['Close'], label='Gold Price (GC=F)', color='#f39c12', lw=1.5)
    ax1.plot(res_df.index, res_df['EMA'], label='Trend EMA 50', color='#3498db', linestyle='--', lw=1.2)
    ax1.set_title('Gold Price & DCA Snowball Pyramiding Dynamics (2023 - 2026)', fontsize=14, fontweight='bold')
    ax1.set_ylabel('Gold Price ($)')
    ax1.grid(True, alpha=0.3)
    ax1.legend(loc='upper left')

    # Ax 2: Equity Curve
    ax2.plot(res_df.index, res_df['Equity'] + stats['withdrawn_total'], label='DCA Snowball Alpha (Equity + Safe Vault)', color='#2ecc71', lw=2)
    ax2.plot(res_df.index, res_df['Bench_DCA'], label='Benchmark Regular DCA (Spot)', color='#95a5a6', linestyle='--', lw=1.5)
    ax2.set_ylabel('Portfolio Value ($)')
    ax2.grid(True, alpha=0.3)
    ax2.legend(loc='upper left')

    # Ax 3: Positions Held (Snowball Depth)
    ax3.bar(res_df.index, res_df['Positions'], label='Open Positions (Snowball Layer)', color='#e74c3c', width=1.5)
    ax3.set_ylabel('Layers Count')
    ax3.set_xlabel('Date')
    ax3.grid(True, alpha=0.3)
    ax3.legend(loc='upper left')

    plt.tight_layout()
    chart_path = r'c:\Users\Win10\Desktop\UHNWI\ea\python\snowball_backtest_result.png'
    plt.savefig(chart_path, dpi=150)
    plt.close()
    print(f"\n[OK] Chart saved successfully to: {chart_path}")

if __name__ == '__main__':
    main()
