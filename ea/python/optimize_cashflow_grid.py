"""
Cashflow Trend-Grid Optimizer for Gold (XAUUSD / GC=F)
Simulates Cashflow Harvesting ($50 - $100 targets) with TRIX and Drawdown < 50% constraint.
"""

import numpy as np
import pandas as pd
import yfinance as yf

def calc_trix(series: pd.Series, period: int = 14) -> pd.Series:
    ema1 = series.ewm(span=period, adjust=False).mean()
    ema2 = ema1.ewm(span=period, adjust=False).mean()
    ema3 = ema2.ewm(span=period, adjust=False).mean()
    trix = ema3.pct_change() * 10000  # scaled
    return trix

def run_grid_sim(
    df: pd.DataFrame,
    initial_cap: float = 10000.0,
    lot_size: float = 0.05,
    cashflow_target: float = 50.0,  # $50 or $100
    harvest_mode: str = "basket",   # "basket" or "per_order"
    grid_step_pts: float = 500.0,   # in points ($5.00)
    max_layers: int = 3,
    trix_period: int = 14,
    use_trix: bool = True,
    ma_period: int = 200,
    be_profit_pts: float = 0.0,
    trail_mult: float = 0.0,
    trade_dir: str = "BUY",
    use_order_sl: bool = False,
    use_trend_exit: bool = False,
    hard_dd_pct: float = 50.0
):
    close = df['Close'].values
    high = df['High'].values
    low = df['Low'].values
    ema = df['Close'].ewm(span=ma_period, adjust=False).mean().values
    trix = calc_trix(df['Close'], trix_period).values

    balance = initial_cap
    peak_equity = initial_cap
    max_dd_pct = 0.0
    cashflow_harvest_count = 0
    total_trades = 0

    # Positions: list of dicts: {'type': 'BUY'/'SELL', 'open': price, 'lot': lot, 'sl': sl, 'be': bool}
    positions = []
    oz = lot_size * 100.0

    step_usd = grid_step_pts / 100.0
    be_usd = be_profit_pts / 100.0

    n = len(df)
    for i in range(max(ma_period, trix_period) + 20, n):
        cur_close = close[i]
        cur_high = high[i]
        cur_low = low[i]
        cur_ema = ema[i]
        cur_trix = trix[i]
        prev_trix = trix[i-1]

        # Calculate current equity
        open_pnl = 0.0
        for p in positions:
            if p['type'] == 'BUY':
                pnl = (cur_close - p['open']) * oz
            else:
                pnl = (p['open'] - cur_close) * oz
            open_pnl += pnl

        equity = balance + open_pnl
        if equity > peak_equity:
            peak_equity = equity
        dd_pct = ((peak_equity - equity) / peak_equity) * 100.0 if peak_equity > 0 else 0
        if dd_pct > max_dd_pct:
            max_dd_pct = dd_pct

        # Hard SL -50% Emergency Cut
        if hard_dd_pct > 0 and dd_pct >= hard_dd_pct:
            balance += open_pnl
            total_trades += len(positions)
            positions = []
            break

        # 1. Stop Loss & Breakeven Check (if use_order_sl)
        if use_order_sl:
            surviving = []
            for p in positions:
                stopped = False
                if p['type'] == 'BUY':
                    if cur_low <= p['sl']:
                        exit_p = p['sl']
                        pnl = (exit_p - p['open']) * oz
                        balance += pnl
                        stopped = True
                        total_trades += 1
                    else:
                        if not p['be'] and be_usd > 0 and (cur_high - p['open']) >= be_usd:
                            p['sl'] = p['open'] + 0.3
                            p['be'] = True
                else: # SELL
                    if cur_high >= p['sl']:
                        exit_p = p['sl']
                        pnl = (p['open'] - exit_p) * oz
                        balance += pnl
                        stopped = True
                        total_trades += 1
                    else:
                        if not p['be'] and be_usd > 0 and (p['open'] - cur_low) >= be_usd:
                            p['sl'] = p['open'] - 0.3
                            p['be'] = True

                if not stopped:
                    surviving.append(p)
            positions = surviving

        # 2. Cashflow Harvesting Check
        if harvest_mode == "basket" and len(positions) > 0:
            basket_pnl = sum([(cur_close - p['open']) * oz if p['type'] == 'BUY' else (p['open'] - cur_close) * oz for p in positions])
            if basket_pnl >= cashflow_target:
                balance += basket_pnl
                cashflow_harvest_count += 1
                total_trades += len(positions)
                positions = []
        elif harvest_mode == "per_order" and len(positions) > 0:
            surviving = []
            for p in positions:
                pnl = (cur_close - p['open']) * oz if p['type'] == 'BUY' else (p['open'] - cur_close) * oz
                if pnl >= cashflow_target:
                    balance += pnl
                    cashflow_harvest_count += 1
                    total_trades += 1
                else:
                    surviving.append(p)
            positions = surviving

        # 3. Optional Trend Exit Check (Close crosses EMA)
        if use_trend_exit and len(positions) > 0:
            pos_type = positions[0]['type']
            if (pos_type == 'BUY' and cur_close < cur_ema) or (pos_type == 'SELL' and cur_close > cur_ema):
                for p in positions:
                    pnl = (cur_close - p['open']) * oz if p['type'] == 'BUY' else (p['open'] - cur_close) * oz
                    balance += pnl
                    total_trades += 1
                positions = []

        # 4. Entry & Grid Scaling Logic
        is_bullish = cur_close > cur_ema
        is_bearish = cur_close < cur_ema
        trix_bull = (cur_trix > 0 and cur_trix > prev_trix) if use_trix else True
        trix_bear = (cur_trix < 0 and cur_trix < prev_trix) if use_trix else True

        don_high = np.max(high[i-20:i])
        don_low = np.min(low[i-20:i])

        buy_count = sum([1 for p in positions if p['type'] == 'BUY'])
        sell_count = sum([1 for p in positions if p['type'] == 'SELL'])

        # Base Buy
        if buy_count == 0 and sell_count == 0:
            if trade_dir in ["BUY", "BOTH"] and is_bullish and trix_bull and cur_close >= don_high:
                sl = (cur_close - 10.0) if use_order_sl else 0.0
                positions.append({'type': 'BUY', 'open': cur_close, 'sl': sl, 'be': False})
            elif trade_dir in ["SELL", "BOTH"] and is_bearish and trix_bear and cur_close <= don_low:
                sl = (cur_close + 10.0) if use_order_sl else 0.0
                positions.append({'type': 'SELL', 'open': cur_close, 'sl': sl, 'be': False})
        # Grid additions (In-trend)
        elif buy_count > 0 and buy_count < max_layers and trade_dir in ["BUY", "BOTH"]:
            highest_buy = max([p['open'] for p in positions])
            if cur_close >= highest_buy + step_usd:
                sl = (cur_close - 10.0) if use_order_sl else 0.0
                positions.append({'type': 'BUY', 'open': cur_close, 'sl': sl, 'be': False})
        elif sell_count > 0 and sell_count < max_layers and trade_dir in ["SELL", "BOTH"]:
            lowest_sell = min([p['open'] for p in positions])
            if cur_close <= lowest_sell - step_usd:
                sl = (cur_close + 10.0) if use_order_sl else 0.0
                positions.append({'type': 'SELL', 'open': cur_close, 'sl': sl, 'be': False})

    # Close remaining
    for p in positions:
        pnl = (close[-1] - p['open']) * oz if p['type'] == 'BUY' else (p['open'] - close[-1]) * oz
        balance += pnl
        total_trades += 1

    net_profit = balance - initial_cap
    return {
        'net_profit': net_profit,
        'final_balance': balance,
        'max_dd_pct': max_dd_pct,
        'harvest_count': cashflow_harvest_count,
        'total_trades': total_trades,
        'roi_pct': (net_profit / initial_cap) * 100.0
    }

if __name__ == "__main__":
    print("Downloading 720 days of hourly Gold data (GC=F)...")
    df = yf.download('GC=F', period='720d', interval='1h', progress=False)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    print(f"Loaded {len(df)} bars.")

    print("\n--- RUNNING CASHFLOW GRID OPTIMIZATION LOOP ---")
    results = []

    # Parameter combinations to test
    targets = [50.0, 75.0, 100.0]
    lot_sizes = [0.05, 0.08, 0.10]
    step_pts = [300.0, 400.0, 500.0]
    max_layers_list = [2, 3, 4]
    modes = ["basket", "per_order"]
    trix_options = [True, False]

    for target in targets:
        for lot in lot_sizes:
            for step in step_pts:
                for max_l in max_layers_list:
                    for mode in modes:
                        for u_trix in trix_options:
                            res = run_grid_sim(
                                df,
                                initial_cap=10000.0,
                                lot_size=lot,
                                cashflow_target=target,
                                harvest_mode=mode,
                                grid_step_pts=step,
                                max_layers=max_l,
                                trix_period=14,
                                use_trix=u_trix
                            )
                            # DD constraint: strictly < 50%
                            if res['max_dd_pct'] < 50.0:
                                results.append({
                                    'target': target,
                                    'lot': lot,
                                    'step': step,
                                    'max_l': max_l,
                                    'mode': mode,
                                    'use_trix': u_trix,
                                    **res
                                })

    res_df = pd.DataFrame(results)
    if len(res_df) > 0:
        # Sort by Net Profit and Cashflow Count
        res_df = res_df.sort_values(by='net_profit', ascending=False)
        print(f"\nTotal Valid Runs (DD < 50%): {len(res_df)}")
        print("\nTOP 5 BEST CASHFLOW CONFIGURATIONS:")
        cols = ['target', 'lot', 'step', 'max_l', 'mode', 'use_trix', 'net_profit', 'max_dd_pct', 'harvest_count', 'total_trades']
        print(res_df[cols].head(10).to_string(index=False))

        # Save to CSV for reference
        res_df.to_csv("c:\\Users\\Win10\\Desktop\\UHNWI\\ea\\python\\cashflow_grid_opt_results.csv", index=False)
        print("\nSaved optimization results to ea/python/cashflow_grid_opt_results.csv")
    else:
        print("No configurations met the criteria.")
