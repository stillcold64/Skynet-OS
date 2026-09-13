"""
Alpha Optimization & Scenario Analyzer for DCA Snowball
Analyzes:
1. Ultra-Alpha (Aggressive Sizing, Limited Deposit $1,000 total like in video)
2. Fast Growth & Exit (ออกแล้วจบ)
3. Bust probability under extreme volatility
"""

import pandas as pd
import numpy as np
import yfinance as yf
import matplotlib.pyplot as plt

def run_alpha_snowball(
    df: pd.DataFrame,
    initial_capital: float = 1000.0,
    max_dca_weeks: int = 10,       # Only DCA for 10 weeks ($1,000 total) like the video
    weekly_dca: float = 50.0,
    lot_size: float = 0.5,         # Ultra Alpha sizing (e.g., 0.5 oz or 0.05 lot on Cent/Standard)
    step_price: float = 15.0,      # Add position every $15
    be_points: float = 10.0,       # Breakeven lock after $10
    trail_dist: float = 25.0,      # Trailing Stop distance in $
    ma_period: int = 50,
    take_profit_mult: float = 5.0  # Exit when reaching 5x (โตไว ออกแล้วจบ)
):
    df = df.copy()
    df['EMA'] = df['Close'].ewm(span=ma_period, adjust=False).mean()

    balance = initial_capital
    total_deposited = initial_capital
    dca_count = 0

    positions = []
    equity_curve = []
    position_counts = []
    dates = []
    status = "RUNNING"
    exit_date = None

    last_dca_bar = -10
    next_id = 1

    for i in range(len(df)):
        date = df.index[i]
        bar_low = float(df['Low'].iloc[i])
        bar_high = float(df['High'].iloc[i])
        bar_close = float(df['Close'].iloc[i])
        ema_val = float(df['EMA'].iloc[i])
        is_bullish = bar_close > ema_val

        # DCA limited to max_dca_weeks
        if dca_count < max_dca_weeks and (i - last_dca_bar >= 5) and is_bullish:
            balance += weekly_dca
            total_deposited += weekly_dca
            dca_count += 1
            last_dca_bar = i

        # Check Stops
        surviving = []
        for pos in positions:
            if pos['sl'] is not None and bar_low <= pos['sl']:
                pnl = (pos['sl'] - pos['open_price']) * pos['vol']
                balance += pnl
            else:
                surviving.append(pos)
        positions = surviving

        # Check Trend Reversal Exit (Close < EMA)
        if not is_bullish and len(positions) > 0:
            for pos in positions:
                pnl = (bar_close - pos['open_price']) * pos['vol']
                balance += pnl
            positions = []

        # Breakeven & Trailing Stop Management
        all_secured = True
        highest_open = 0.0
        for pos in positions:
            if pos['open_price'] > highest_open:
                highest_open = pos['open_price']

            # Breakeven lock
            if bar_high >= pos['open_price'] + be_points:
                if not pos['be']:
                    pos['sl'] = pos['open_price'] + 1.0
                    pos['be'] = True

            # Trailing Stop for secured positions
            if pos['be'] and trail_dist > 0:
                proposed_sl = bar_close - trail_dist
                if proposed_sl > pos['sl']:
                    pos['sl'] = proposed_sl

            if not pos['be']:
                all_secured = False

        # Pyramiding Entry
        if is_bullish:
            if len(positions) == 0:
                positions.append({'id': next_id, 'open_price': bar_close, 'sl': bar_close - 30.0, 'vol': lot_size, 'be': False})
                next_id += 1
            elif all_secured and (bar_close >= highest_open + step_price):
                positions.append({'id': next_id, 'open_price': bar_close, 'sl': bar_close - 30.0, 'vol': lot_size, 'be': False})
                next_id += 1

        # Current Floating & Equity
        floating = sum((bar_close - p['open_price']) * p['vol'] for p in positions)
        equity = balance + floating

        dates.append(date)
        equity_curve.append(equity)
        position_counts.append(len(positions))

        # Check Bust (Account Blown)
        if equity <= 50.0:
            status = "BLOWN_UP"
            exit_date = date
            print(f"[{date.strftime('%Y-%m-%d')}] ACCOUNT BLOWN UP (Margin Stop Out / Equity <= $50)!")
            break

        # Check Target Reached (ออกแล้วจบ)
        if equity >= total_deposited * take_profit_mult:
            status = "TARGET_REACHED_EXIT"
            exit_date = date
            # Close all positions
            for pos in positions:
                pnl = (bar_close - pos['open_price']) * pos['vol']
                balance += pnl
            equity = balance
            positions = []
            print(f"[{date.strftime('%Y-%m-%d')}] TARGET {take_profit_mult}x REACHED! Finished & Exited cleanly at ${equity:,.2f}!")
            break

    res_df = pd.DataFrame({
        'Date': dates,
        'Equity': equity_curve,
        'Positions': position_counts
    }).set_index('Date')

    mult = equity / total_deposited
    return res_df, {
        'status': status,
        'total_deposited': total_deposited,
        'final_equity': equity,
        'multiplier': mult,
        'exit_date': exit_date
    }

def main():
    print("Testing Ultra-Alpha Scenarios (High Leverage, Fixed Deposit $1,500, Target 5x Exit)...")
    df = yf.download('GC=F', start='2023-10-01', end='2026-09-01', interval='1d')
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Test with different lot sizes (Aggressiveness)
    for lot in [0.2, 0.4, 0.6, 0.8, 1.0]:
        print(f"\n--- Testing Lot Size: {lot} ---")
        _, stats = run_alpha_snowball(
            df,
            initial_capital=1000.0,
            max_dca_weeks=10,
            weekly_dca=50.0,
            lot_size=lot,
            step_price=20.0,
            be_points=15.0,
            trail_dist=30.0,
            take_profit_mult=5.0
        )
        print(f"Result: {stats['status']} | Deposited: ${stats['total_deposited']:,.2f} | Final: ${stats['final_equity']:,.2f} ({stats['multiplier']:.2f}x)")

if __name__ == '__main__':
    main()
