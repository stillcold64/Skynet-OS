"""
Stress Test & Optimization: Whipsaw & Frequent Cut-Loss Analysis for DavidDruzGridEA
Simulates whether multiple cut-losses can happen in a single day, measures the financial impact,
and optimizes defensive mechanisms (Daily Cut-Loss Limits, Post-Exit Cooldowns, ATR Buffers).
"""

import numpy as np
import pandas as pd
import yfinance as yf

def calc_trix(series: pd.Series, period: int = 14) -> pd.Series:
    ema1 = series.ewm(span=period, adjust=False).mean()
    ema2 = ema1.ewm(span=period, adjust=False).mean()
    ema3 = ema2.ewm(span=period, adjust=False).mean()
    return ema3.pct_change() * 10000

def calc_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df['High']
    low = df['Low']
    close_prev = df['Close'].shift(1)
    tr1 = high - low
    tr2 = (high - close_prev).abs()
    tr3 = (low - close_prev).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def run_simulation(
    df: pd.DataFrame,
    initial_cap: float = 10000.0,
    lot_size: float = 0.05,
    cashflow_target: float = 50.0,
    grid_step_pts: float = 500.0,
    max_layers: int = 3,
    trix_period: int = 14,
    ma_period: int = 200,
    # Defensive Parameters
    max_daily_cuts: int = 999,       # Max trend-exit cuts allowed per calendar day (circuit breaker)
    post_exit_cooldown_bars: int = 0,# Bars to wait after a trend exit before allowing new entry
    ema_exit_buffer_atr: float = 0.0 # ATR buffer below EMA before triggering trend exit
):
    close = df['Close'].values
    high = df['High'].values
    low = df['Low'].values
    dates = pd.to_datetime(df.index).date
    
    ema = df['Close'].ewm(span=ma_period, adjust=False).mean().values
    trix = calc_trix(df['Close'], trix_period).values
    atr = calc_atr(df, 14).bfill().values
    
    balance = initial_cap
    peak_equity = initial_cap
    max_dd_pct = 0.0
    
    positions = []
    oz = lot_size * 100.0
    step_usd = grid_step_pts / 100.0
    
    # Tracking statistics
    daily_cuts = {}       # date -> count of cuts
    daily_pnl = {}        # date -> net realized pnl
    total_wins = 0
    total_losses = 0
    total_harvests = 0
    total_trend_cuts = 0
    
    last_exit_bar = -9999
    current_day = None
    cuts_today = 0
    
    n = len(df)
    start_idx = max(ma_period, trix_period) + 25
    
    for i in range(start_idx, n):
        cur_date = dates[i]
        if cur_date != current_day:
            current_day = cur_date
            cuts_today = 0
            if cur_date not in daily_cuts:
                daily_cuts[cur_date] = 0
                daily_pnl[cur_date] = 0.0
                
        cur_close = close[i]
        cur_high = high[i]
        cur_low = low[i]
        cur_ema = ema[i]
        cur_trix = trix[i]
        prev_trix = trix[i-1]
        cur_atr = atr[i]
        
        # 1. Equity & DD calculation
        open_pnl = sum([(cur_close - p['open']) * oz for p in positions])
        equity = balance + open_pnl
        if equity > peak_equity:
            peak_equity = equity
        dd = ((peak_equity - equity) / peak_equity) * 100.0 if peak_equity > 0 else 0
        if dd > max_dd_pct:
            max_dd_pct = dd
            
        # Hard SL -50%
        if dd >= 50.0:
            balance += open_pnl
            daily_pnl[cur_date] += open_pnl
            positions = []
            break
            
        # 2. Cashflow Target Harvesting ($50 Basket)
        if len(positions) > 0 and open_pnl >= cashflow_target:
            balance += open_pnl
            daily_pnl[cur_date] += open_pnl
            total_wins += len(positions)
            total_harvests += 1
            positions = []
            continue
            
        # 3. EMA Trend Exit Check (with optional ATR buffer)
        if len(positions) > 0:
            exit_threshold = cur_ema - (cur_atr * ema_exit_buffer_atr)
            if cur_close < exit_threshold:
                # Trigger Trend Exit!
                balance += open_pnl
                daily_pnl[cur_date] += open_pnl
                if open_pnl < 0:
                    total_losses += len(positions)
                else:
                    total_wins += len(positions)
                
                cuts_today += 1
                daily_cuts[cur_date] += 1
                total_trend_cuts += 1
                last_exit_bar = i
                positions = []
                continue
                
        # 4. Entry & Grid Scaling Logic
        # Defensive constraints:
        if cuts_today >= max_daily_cuts:
            continue # Daily circuit breaker hit!
        if (i - last_exit_bar) < post_exit_cooldown_bars:
            continue # Post-exit cooldown active!
            
        is_bullish = cur_close > cur_ema
        trix_bull = (cur_trix > 0 and cur_trix > prev_trix)
        don_high = np.max(high[i-20:i])
        
        # Base Buy
        if len(positions) == 0:
            if is_bullish and trix_bull and cur_close >= don_high:
                positions.append({'open': cur_close})
        # Grid Additions (in-trend)
        elif len(positions) < max_layers:
            highest_buy = max([p['open'] for p in positions])
            if cur_close >= highest_buy + step_usd:
                positions.append({'open': cur_close})
                
    # Close remaining at end
    if len(positions) > 0:
        open_pnl = sum([(close[-1] - p['open']) * oz for p in positions])
        balance += open_pnl
        daily_pnl[dates[-1]] += open_pnl
        if open_pnl >= 0:
            total_wins += len(positions)
        else:
            total_losses += len(positions)
        positions = []
        
    net_profit = balance - initial_cap
    total_trades = total_wins + total_losses
    win_rate = (total_wins / total_trades * 100.0) if total_trades > 0 else 0.0
    
    # Cut loss clustering analysis
    cut_counts = list(daily_cuts.values())
    days_with_1_cut = sum([1 for c in cut_counts if c == 1])
    days_with_2_cuts = sum([1 for c in cut_counts if c == 2])
    days_with_3_plus = sum([1 for c in cut_counts if c >= 3])
    max_cuts_single_day = max(cut_counts) if cut_counts else 0
    
    pnl_values = list(daily_pnl.values())
    worst_single_day_pnl = min(pnl_values) if pnl_values else 0.0
    
    return {
        'net_profit': net_profit,
        'max_dd_pct': max_dd_pct,
        'win_rate': win_rate,
        'total_trades': total_trades,
        'harvest_count': total_harvests,
        'trend_cuts': total_trend_cuts,
        'days_1_cut': days_with_1_cut,
        'days_2_cuts': days_with_2_cuts,
        'days_3plus_cuts': days_with_3_plus,
        'max_cuts_in_1_day': max_cuts_single_day,
        'worst_day_loss': worst_single_day_pnl
    }

if __name__ == "__main__":
    print("Loading Gold data (GC=F, 720d, 1h)...")
    df = yf.download('GC=F', period='720d', interval='1h', progress=False)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    print(f"Data ready: {len(df)} candles across ~2 years.")
    
    print("\n" + "="*80)
    print(" >>> STRESS TEST & OPTIMIZATION: WHIPSAW / FREQUENT CUT-LOSS EVALUATION")
    print("="*80)
    
    configs = [
        {"name": "1. Baseline (No Protection)", "max_cuts": 999, "cooldown": 0, "buffer": 0.0},
        {"name": "2. Cooldown Only (4 bars)", "max_cuts": 999, "cooldown": 4, "buffer": 0.0},
        {"name": "3. Cooldown Only (8 bars)", "max_cuts": 999, "cooldown": 8, "buffer": 0.0},
        {"name": "4. Daily Breaker (Max 1 cut/day)", "max_cuts": 1, "cooldown": 0, "buffer": 0.0},
        {"name": "5. Daily Breaker (Max 2 cuts/day)", "max_cuts": 2, "cooldown": 0, "buffer": 0.0},
        {"name": "6. ATR Buffer (0.2 ATR below EMA)", "max_cuts": 999, "cooldown": 0, "buffer": 0.2},
        {"name": "7. ATR Buffer (0.4 ATR below EMA)", "max_cuts": 999, "cooldown": 0, "buffer": 0.4},
        {"name": "8. Defense Combo (Max 2 cuts + Cool 4b + Buff 0.2)", "max_cuts": 2, "cooldown": 4, "buffer": 0.2},
        {"name": "9. Defense Combo (Max 1 cut + Cool 6b + Buff 0.3)", "max_cuts": 1, "cooldown": 6, "buffer": 0.3},
    ]
    
    results = []
    for cfg in configs:
        res = run_simulation(
            df,
            initial_cap=10000.0,
            lot_size=0.05,
            cashflow_target=50.0,
            grid_step_pts=500.0,
            max_layers=3,
            max_daily_cuts=cfg["max_cuts"],
            post_exit_cooldown_bars=cfg["cooldown"],
            ema_exit_buffer_atr=cfg["buffer"]
        )
        results.append({
            "Config Name": cfg["name"],
            "Net Profit ($)": f"${res['net_profit']:,.2f}",
            "Max DD (%)": f"{res['max_dd_pct']:.2f}%",
            "Win Rate (%)": f"{res['win_rate']:.1f}%",
            "Days 1-Cut": res['days_1_cut'],
            "Days 2-Cut": res['days_2_cuts'],
            "Days 3+ Cut": res['days_3plus_cuts'],
            "Max Cuts/Day": res['max_cuts_in_1_day'],
            "Worst Day ($)": f"${res['worst_day_loss']:,.2f}",
            "raw_profit": res['net_profit'],
            "raw_dd": res['max_dd_pct']
        })
        
    res_table = pd.DataFrame(results).drop(columns=['raw_profit', 'raw_dd'])
    print(res_table.to_string(index=False))
    
    # Save results
    pd.DataFrame(results).to_csv("c:\\Users\\Win10\\Desktop\\UHNWI\\ea\\python\\whipsaw_stress_test_results.csv", index=False)
    print("\nSaved detailed report to ea/python/whipsaw_stress_test_results.csv")

    # High frequency 15m stress test
    print("\n" + "="*80)
    print(" >>> 15-MINUTE HIGH-FREQUENCY STRESS TEST (Last 60 Days M15)")
    print("="*80)
    df15 = yf.download('GC=F', period='60d', interval='15m', progress=False)
    if isinstance(df15.columns, pd.MultiIndex):
        df15.columns = df15.columns.get_level_values(0)
    
    results15 = []
    for cfg in configs:
        res = run_simulation(
            df15,
            initial_cap=10000.0,
            lot_size=0.05,
            cashflow_target=50.0,
            grid_step_pts=500.0,
            max_layers=3,
            max_daily_cuts=cfg["max_cuts"],
            post_exit_cooldown_bars=cfg["cooldown"],
            ema_exit_buffer_atr=cfg["buffer"]
        )
        results15.append({
            "Config Name": cfg["name"],
            "Net Profit ($)": f"${res['net_profit']:,.2f}",
            "Max DD (%)": f"{res['max_dd_pct']:.2f}%",
            "Win Rate (%)": f"{res['win_rate']:.1f}%",
            "Days 1-Cut": res['days_1_cut'],
            "Days 2-Cut": res['days_2_cuts'],
            "Days 3+ Cut": res['days_3plus_cuts'],
            "Max Cuts/Day": res['max_cuts_in_1_day'],
            "Worst Day ($)": f"${res['worst_day_loss']:,.2f}"
        })
    res15_table = pd.DataFrame(results15)
    print(res15_table.to_string(index=False))

