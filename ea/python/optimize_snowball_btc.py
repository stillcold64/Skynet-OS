"""
DCASnowball EA - Bitcoin (BTCUSD) M15 Optimizer
Simulates Asymmetric 10-40-60 Pyramiding + Free-Roll + 200 EMA Trend Filter on BTC M15 data.
Target Capital: $5,000 USD
"""

import os
import json
import urllib.request
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime

def fetch_binance_btc_15m(num_candles=6000):
    cache_file = os.path.join(os.path.dirname(__file__), "data_btc_15m.csv")
    if os.path.exists(cache_file):
        df = pd.read_csv(cache_file, parse_dates=['timestamp'])
        df.set_index('timestamp', inplace=True)
        if len(df) >= num_candles * 0.8:
            print(f"[*] Loaded {len(df)} 15m candles from cache: {cache_file}")
            return df

    print(f"[*] Fetching {num_candles} 15m BTCUSDT candles from Binance...")
    all_candles = []
    end_time = None
    batch_size = 1000

    while len(all_candles) < num_candles:
        url = f"https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit={batch_size}"
        if end_time:
            url += f"&endTime={end_time}"
        try:
            req = urllib.request.urlopen(url, timeout=10)
            data = json.loads(req.read().decode())
            if not data:
                break
            all_candles = data + all_candles
            end_time = data[0][0] - 1  # Older data
        except Exception as e:
            print(f"[!] Fetch warning: {e}")
            break

    # Parse into DataFrame
    records = []
    for c in all_candles:
        records.append({
            'timestamp': pd.to_datetime(c[0], unit='ms'),
            'Open': float(c[1]),
            'High': float(c[2]),
            'Low': float(c[3]),
            'Close': float(c[4]),
            'Volume': float(c[5])
        })
    df = pd.DataFrame(records).drop_duplicates(subset=['timestamp']).sort_values('timestamp')
    df.set_index('timestamp', inplace=True)
    df.to_csv(cache_file)
    print(f"[OK] Fetched and saved {len(df)} 15m candles ({df.index[0]} to {df.index[-1]})")
    return df

def calc_trix(series: pd.Series, period: int = 14) -> pd.Series:
    ema1 = series.ewm(span=period, adjust=False).mean()
    ema2 = ema1.ewm(span=period, adjust=False).mean()
    ema3 = ema2.ewm(span=period, adjust=False).mean()
    trix = ema3.pct_change() * 10000.0
    return trix

def run_snowball_btc_sim(
    df: pd.DataFrame,
    initial_cap: float = 5000.0,
    total_lot_budget: float = 0.08,
    step_usd: float = 500.0,
    free_roll_trigger_usd: float = 60.0,
    buffer_usd: float = 10.0,
    cashflow_target_usd: float = 200.0,
    donchian_period: int = 20,
    use_trix: bool = True,
    trix_period: int = 14,
    ma_period: int = 200,
    close_on_ma_exit: bool = True,
    exit_atr_buffer: float = 0.2,
    exit_cooldown_bars: int = 4,
    hard_dd_pct: float = 50.0
):
    close = df['Close'].values
    high = df['High'].values
    low = df['Low'].values
    n = len(df)

    # Technical indicators
    ema = df['Close'].ewm(span=ma_period, adjust=False).mean().values
    trix = calc_trix(df['Close'], trix_period).values if use_trix else np.zeros(n)
    tr = np.maximum(high - low, np.maximum(np.abs(high - np.roll(close, 1)), np.abs(low - np.roll(close, 1))))
    atr = pd.Series(tr).rolling(14).mean().bfill().values

    # Donchian channel
    donchian_high = pd.Series(high).rolling(donchian_period).max().shift(1).values

    balance = initial_cap
    equity = initial_cap
    peak_equity = initial_cap
    max_dd_pct = 0.0
    daily_cuts = 0
    last_exit_idx = -100

    positions = [] # list of dicts: {'open': price, 'lot': lot, 'sl': sl, 'be_locked': bool}
    trade_history = []
    equity_curve = []

    # 10% - 40% - 60% Layer Sizing
    lot_l1 = round(total_lot_budget * 0.10, 2)
    lot_l2 = round(total_lot_budget * 0.40, 2)
    lot_l3 = round(total_lot_budget * 0.60, 2)
    if lot_l1 < 0.01: lot_l1 = 0.01
    if lot_l2 < 0.01: lot_l2 = 0.01
    if lot_l3 < 0.01: lot_l3 = 0.01

    is_free_roll_active = False

    warmup = max(ma_period, donchian_period, trix_period) + 20

    for i in range(warmup, n):
        cur_open = df['Open'].iloc[i]
        cur_high = high[i]
        cur_low = low[i]
        cur_close = close[i]
        cur_ema = ema[i]
        cur_atr = atr[i]

        # Calculate floating profit of open positions
        floating_profit = 0.0
        total_open_lots = 0.0
        weighted_cost = 0.0

        for pos in positions:
            pnl = (cur_close - pos['open']) * pos['lot']
            floating_profit += pnl
            total_open_lots += pos['lot']
            weighted_cost += (pos['open'] * pos['lot'])

        avg_price = (weighted_cost / total_open_lots) if total_open_lots > 0 else 0.0
        cur_equity = balance + floating_profit

        if cur_equity > peak_equity:
            peak_equity = cur_equity
        cur_dd = (peak_equity - cur_equity) / peak_equity * 100.0 if peak_equity > 0 else 0.0
        if cur_dd > max_dd_pct:
            max_dd_pct = cur_dd

        equity_curve.append(cur_equity)

        # 1. Hard Drawdown Cut (-50%)
        if cur_dd >= hard_dd_pct:
            balance = cur_equity
            positions = []
            trade_history.append({'pnl': floating_profit, 'reason': 'HARD_DD_CUT', 'bar': i})
            is_free_roll_active = False
            last_exit_idx = i
            continue

        # 2. Cashflow Harvesting (Close basket when target $ reached)
        if len(positions) > 0 and floating_profit >= cashflow_target_usd:
            balance += floating_profit
            trade_history.append({'pnl': floating_profit, 'reason': 'CASHFLOW_HARVEST', 'bar': i, 'layers': len(positions)})
            positions = []
            is_free_roll_active = False
            last_exit_idx = i
            continue

        # 3. Free-Roll Activation (Lock breakeven when floating >= trigger)
        if len(positions) > 0 and not is_free_roll_active and floating_profit >= free_roll_trigger_usd:
            be_sl = avg_price + (buffer_usd / total_open_lots)
            for pos in positions:
                pos['sl'] = be_sl
                pos['be_locked'] = True
            is_free_roll_active = True

        # 4. Check SL hit on low
        if len(positions) > 0 and is_free_roll_active:
            # If low penetrated breakeven SL
            sl_level = positions[0]['sl']
            if sl_level is not None and cur_low <= sl_level:
                # Closed at Breakeven / Buffer
                realized = sum((sl_level - pos['open']) * pos['lot'] for pos in positions)
                balance += realized
                trade_history.append({'pnl': realized, 'reason': 'FREE_ROLL_EXIT', 'bar': i, 'layers': len(positions)})
                positions = []
                is_free_roll_active = False
                last_exit_idx = i
                continue

        # 5. Trend Exit (Close if Close < 200 EMA - buffer)
        if len(positions) > 0 and close_on_ma_exit:
            exit_buf = cur_atr * exit_atr_buffer
            if cur_close < (cur_ema - exit_buf):
                realized = sum((cur_close - pos['open']) * pos['lot'] for pos in positions)
                balance += realized
                trade_history.append({'pnl': realized, 'reason': 'EMA_TREND_EXIT', 'bar': i, 'layers': len(positions)})
                positions = []
                is_free_roll_active = False
                last_exit_idx = i
                continue

        # 6. Entry Logic (Donchian Breakout + TRIX)
        if len(positions) == 0:
            if (i - last_exit_idx) >= exit_cooldown_bars:
                # Must be above 200 EMA
                if cur_close > cur_ema:
                    # Breakout
                    if cur_close > donchian_high[i]:
                        # TRIX slope confirmation
                        trix_ok = True
                        if use_trix:
                            trix_ok = (trix[i] > trix[i-1]) and (trix[i] > -10.0)
                        if trix_ok:
                            positions.append({'open': cur_close, 'lot': lot_l1, 'sl': None, 'be_locked': False})
                            is_free_roll_active = False

        # 7. Pyramiding Layers (Layer 2 & 3 on step price increase)
        elif len(positions) == 1:
            if cur_close >= positions[0]['open'] + step_usd:
                positions.append({'open': cur_close, 'lot': lot_l2, 'sl': positions[0]['sl'], 'be_locked': is_free_roll_active})
        elif len(positions) == 2:
            if cur_close >= positions[1]['open'] + step_usd:
                positions.append({'open': cur_close, 'lot': lot_l3, 'sl': positions[0]['sl'], 'be_locked': is_free_roll_active})

    # Close any remaining at end
    if len(positions) > 0:
        final_pnl = sum((close[-1] - pos['open']) * pos['lot'] for pos in positions)
        balance += final_pnl
        trade_history.append({'pnl': final_pnl, 'reason': 'END_OF_DATA', 'bar': n-1, 'layers': len(positions)})

    total_profit = balance - initial_cap
    wins = [t['pnl'] for t in trade_history if t['pnl'] > 0]
    losses = [t['pnl'] for t in trade_history if t['pnl'] < 0]
    gross_win = sum(wins) if wins else 0.0
    gross_loss = abs(sum(losses)) if losses else 0.001
    profit_factor = gross_win / gross_loss
    win_rate = (len(wins) / len(trade_history) * 100.0) if trade_history else 0.0
    harvest_count = len([t for t in trade_history if t['reason'] == 'CASHFLOW_HARVEST'])

    return {
        'total_profit': total_profit,
        'final_balance': balance,
        'profit_pct': (total_profit / initial_cap) * 100.0,
        'max_dd_pct': max_dd_pct,
        'profit_factor': profit_factor,
        'win_rate': win_rate,
        'total_trades': len(trade_history),
        'harvest_count': harvest_count,
        'equity_curve': equity_curve
    }

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def main():
    df = fetch_binance_btc_15m(num_candles=6000)

    print("==========================================================")
    print("   [*] Optimizing DCASnowball EA on BTCUSDT (15M) ")
    print("   Target Capital: $5,000 USD | Pyramiding: 10%-40%-60%")
    print("==========================================================")

    # Search Space
    step_list = [300, 500, 750, 1000, 1200]
    free_roll_list = [40, 60, 80, 100]
    cashflow_list = [150, 200, 250, 300, 400]
    donchian_list = [15, 20, 25]
    lot_budget_list = [0.06, 0.08, 0.10] # e.g. 0.08 Lot = 0.01 + 0.03 + 0.04
    trix_list = [True]

    results = []
    total_combos = len(step_list) * len(free_roll_list) * len(cashflow_list) * len(donchian_list) * len(lot_budget_list) * len(trix_list)
    print(f"[*] Running Grid Search over {total_combos} combinations...")

    count = 0
    for step in step_list:
        for fr in free_roll_list:
            for cf in cashflow_list:
                if cf <= fr: continue # Cashflow must be greater than Free-Roll
                for don in donchian_list:
                    for lot in lot_budget_list:
                        for use_tx in trix_list:
                            res = run_snowball_btc_sim(
                                df=df,
                                initial_cap=5000.0,
                                total_lot_budget=lot,
                                step_usd=step,
                                free_roll_trigger_usd=fr,
                                buffer_usd=10.0,
                                cashflow_target_usd=cf,
                                donchian_period=don,
                                use_trix=use_tx,
                                trix_period=14,
                                ma_period=200,
                                close_on_ma_exit=True,
                                exit_atr_buffer=0.2,
                                exit_cooldown_bars=4,
                                hard_dd_pct=50.0
                            )
                            count += 1
                            if res['max_dd_pct'] < 50.0:
                                results.append({
                                    'LotBudget': lot,
                                    'StepUSD': step,
                                    'FreeRollUSD': fr,
                                    'CashflowUSD': cf,
                                    'Donchian': don,
                                    'TRIX': use_tx,
                                    'ProfitUSD': round(res['total_profit'], 2),
                                    'ProfitPct': round(res['profit_pct'], 1),
                                    'MaxDD_Pct': round(res['max_dd_pct'], 1),
                                    'ProfitFactor': round(res['profit_factor'], 2),
                                    'WinRatePct': round(res['win_rate'], 1),
                                    'Trades': res['total_trades'],
                                    'Harvests': res['harvest_count']
                                })

    res_df = pd.DataFrame(results)
    # Filter for quality: Profit > 0, MaxDD < 35%, ProfitFactor >= 1.5
    filtered = res_df[(res_df['ProfitUSD'] > 0) & (res_df['MaxDD_Pct'] < 40.0) & (res_df['ProfitFactor'] >= 1.4)]
    sorted_df = filtered.sort_values(by=['ProfitFactor', 'ProfitUSD'], ascending=[False, False])

    output_csv = os.path.join(os.path.dirname(__file__), "btc_snowball_opt_results.csv")
    sorted_df.to_csv(output_csv, index=False)
    print(f"\n[+] Optimization complete! Saved {len(sorted_df)} viable parameter sets to {output_csv}")

    print("\n[TOP 10] Best Parameter Sets for BTC M15 ($5,000 Capital):")
    print(sorted_df.head(10).to_string(index=False))

    # Run best set for chart generation
    if len(sorted_df) > 0:
        best = sorted_df.iloc[0]
        print(f"\n[*] Generating Equity Curve for Best Set (PF: {best['ProfitFactor']}, Profit: +${best['ProfitUSD']}, DD: {best['MaxDD_Pct']}%)...")
        best_run = run_snowball_btc_sim(
            df=df,
            initial_cap=5000.0,
            total_lot_budget=best['LotBudget'],
            step_usd=best['StepUSD'],
            free_roll_trigger_usd=best['FreeRollUSD'],
            buffer_usd=10.0,
            cashflow_target_usd=best['CashflowUSD'],
            donchian_period=int(best['Donchian']),
            use_trix=best['TRIX'],
            trix_period=14,
            ma_period=200,
            close_on_ma_exit=True,
            exit_atr_buffer=0.2,
            exit_cooldown_bars=4,
            hard_dd_pct=50.0
        )

        plt.figure(figsize=(12, 6))
        plt.plot(best_run['equity_curve'], label=f"DCASnowball BTC ($5k) - Net Profit: +${best['ProfitUSD']} ({best['ProfitPct']}%)", color='#00c853', lw=1.8)
        plt.axhline(y=5000.0, color='gray', linestyle='--', alpha=0.7, label='Initial Balance ($5,000)')
        plt.title(f"DCASnowball EA - BTCUSDT M15 Growth Simulation ($5,000 Capital)\nLot: {best['LotBudget']} | Step: ${best['StepUSD']} | FreeRoll: ${best['FreeRollUSD']} | Target: ${best['CashflowUSD']} | PF: {best['ProfitFactor']} | MaxDD: {best['MaxDD_Pct']}%", fontsize=11)
        plt.xlabel("15-Minute Bars")
        plt.ylabel("Equity ($)")
        plt.grid(True, alpha=0.3)
        plt.legend(loc="upper left")
        chart_path = os.path.join(os.path.dirname(__file__), "btc_snowball_growth_chart.png")
        plt.savefig(chart_path, dpi=150, bbox_inches='tight')
        plt.close()
        print(f"[OK] Chart saved to {chart_path}")

if __name__ == "__main__":
    main()
