"""
Diagnostic & Comparative Stress Test: Upward Momentum Snowball vs Dip Snowball
Evaluates:
1. Upward Pyramiding Snowball (as in DavidDruzGridEA, scaling lots 0.20 -> 0.40 -> 0.60 as price climbs)
2. Dip Accumulation Snowball (scaling lots on pullbacks)
3. Trailing / Breakeven buffer tuning
"""

import numpy as np
import pandas as pd
import yfinance as yf

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
    snowball_mode: str = "UPWARD", # "UPWARD" (Pyramiding) or "DIP" (Pullback accumulation)
    lots: list = [0.20, 0.40, 0.60], # Weight distribution
    step_usd: float = 5.0,           # $5.00 distance (500 pts)
    cashflow_target: float = 150.0,
    use_freeroll: bool = True,
    be_buffer_usd: float = 1.0,      # Lock BE + $1.00 buffer
    ma_period: int = 200,
    buffer_atr_mult: float = 0.2
):
    close = df['Close'].values
    high = df['High'].values
    low = df['Low'].values
    
    ema = df['Close'].ewm(span=ma_period, adjust=False).mean().values
    atr = calc_atr(df, 14).bfill().values
    
    balance = initial_cap
    peak_equity = initial_cap
    max_dd_pct = 0.0
    
    max_layers = len(lots)
    positions = []
    is_freeroll = False
    be_price = 0.0
    
    wins = 0
    losses = 0
    be_exits = 0
    harvests = 0
    
    n = len(df)
    start_idx = ma_period + 25
    
    for i in range(start_idx, n):
        cur_close = close[i]
        cur_high = high[i]
        cur_low = low[i]
        cur_ema = ema[i]
        cur_atr = atr[i]
        
        # Open PnL
        open_pnl = sum([(cur_close - p['open']) * p['oz'] for p in positions])
        equity = balance + open_pnl
        if equity > peak_equity:
            peak_equity = equity
        dd = ((peak_equity - equity) / peak_equity) * 100.0 if peak_equity > 0 else 0
        if dd > max_dd_pct:
            max_dd_pct = dd
            
        # Hard SL -50%
        if dd >= 50.0:
            balance += open_pnl
            positions = []
            break
            
        # Check Free-Roll Lock
        if use_freeroll and len(positions) > 0 and not is_freeroll:
            # If basket profit >= $50, lock Breakeven
            if open_pnl >= 50.0:
                total_oz = sum([p['oz'] for p in positions])
                total_cost = sum([p['open'] * p['oz'] for p in positions])
                avg_cost = total_cost / total_oz
                be_price = avg_cost + be_buffer_usd # Lock BE + buffer
                is_freeroll = True
                
        # Check Free-Roll Exit (only on bar close or low breach if locked)
        if is_freeroll and len(positions) > 0:
            if cur_close <= be_price:
                exit_pnl = sum([(cur_close - p['open']) * p['oz'] for p in positions])
                balance += exit_pnl
                be_exits += 1
                positions = []
                is_freeroll = False
                continue
                
        # Cashflow Target Hit
        if len(positions) > 0 and open_pnl >= cashflow_target:
            balance += open_pnl
            wins += 1
            harvests += 1
            positions = []
            is_freeroll = False
            continue
            
        # 200 EMA Trend Exit
        if len(positions) > 0:
            exit_threshold = cur_ema - (cur_atr * buffer_atr_mult)
            if cur_close < exit_threshold:
                balance += open_pnl
                if open_pnl < 0:
                    losses += 1
                else:
                    wins += 1
                positions = []
                is_freeroll = False
                continue
                
        # Entry Logic
        is_bullish = cur_close > cur_ema
        don_high = np.max(high[i-20:i])
        
        # Base Buy
        if len(positions) == 0:
            if is_bullish and cur_close >= don_high:
                positions.append({'open': cur_close, 'lot': lots[0], 'oz': lots[0] * 100.0})
                is_freeroll = False
        # Additions
        elif len(positions) < max_layers and is_bullish:
            if snowball_mode == "UPWARD":
                highest_buy = max([p['open'] for p in positions])
                if cur_close >= highest_buy + step_usd:
                    layer_idx = len(positions)
                    positions.append({'open': cur_close, 'lot': lots[layer_idx], 'oz': lots[layer_idx] * 100.0})
            elif snowball_mode == "DIP":
                lowest_buy = min([p['open'] for p in positions])
                if cur_close <= lowest_buy - step_usd and cur_close > cur_ema:
                    layer_idx = len(positions)
                    positions.append({'open': cur_close, 'lot': lots[layer_idx], 'oz': lots[layer_idx] * 100.0})

    # Remaining
    if len(positions) > 0:
        open_pnl = sum([(close[-1] - p['open']) * p['oz'] for p in positions])
        balance += open_pnl
        if open_pnl >= 0:
            wins += 1
        else:
            losses += 1
            
    net_profit = balance - initial_cap
    total_rounds = wins + losses + be_exits
    win_rate = (wins / total_rounds * 100.0) if total_rounds > 0 else 0.0
    
    return {
        'net_profit': net_profit,
        'final_balance': balance,
        'max_dd_pct': max_dd_pct,
        'win_rate': win_rate,
        'wins': wins,
        'losses': losses,
        'be_exits': be_exits,
        'harvests': harvests
    }

if __name__ == "__main__":
    df = yf.download('GC=F', period='720d', interval='1h', progress=False)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    print("\n" + "="*85)
    print(" >>> COMPARATIVE STRESS TEST: UPWARD SNOWBALL vs DIP SNOWBALL")
    print("="*85)

    experiments = [
        # (Name, Mode, Lots, Step, Target, FreeRoll, BE_Buf)
        ("1. Current Grid Baseline (Flat 0.33, No FreeRoll)", "UPWARD", [0.33, 0.33, 0.34], 5.0, 100.0, False, 0.0),
        ("2. Upward Snowball 10-40-60 (No FreeRoll)", "UPWARD", [0.10, 0.40, 0.60], 5.0, 150.0, False, 0.0),
        ("3. Upward Snowball 20-30-50 (No FreeRoll)", "UPWARD", [0.20, 0.30, 0.50], 5.0, 150.0, False, 0.0),
        ("4. Upward Snowball 10-40-60 + FreeRoll Lock (+$1.00)", "UPWARD", [0.10, 0.40, 0.60], 5.0, 150.0, True, 1.0),
        ("5. Upward Snowball 20-30-50 + FreeRoll Lock (+$1.00)", "UPWARD", [0.20, 0.30, 0.50], 5.0, 150.0, True, 1.0),
        ("6. Dip Snowball 10-40-60 (No FreeRoll)", "DIP", [0.10, 0.40, 0.60], 4.0, 150.0, False, 0.0),
        ("7. Dip Snowball 10-40-60 + FreeRoll Lock (+$1.00)", "DIP", [0.10, 0.40, 0.60], 4.0, 150.0, True, 1.0),
        ("8. High-Yield Upward Snowball (0.2-0.4-0.6, Target $200)", "UPWARD", [0.20, 0.40, 0.60], 5.0, 200.0, False, 0.0),
        ("9. High-Yield Upward Snowball + FreeRoll (Target $200)", "UPWARD", [0.20, 0.40, 0.60], 5.0, 200.0, True, 1.0),
    ]

    results = []
    for name, mode, lots, step, tgt, fr, be_buf in experiments:
        res = run_simulation(df, initial_cap=10000.0, snowball_mode=mode, lots=lots, step_usd=step, cashflow_target=tgt, use_freeroll=fr, be_buffer_usd=be_buf)
        results.append({
            "Experiment": name,
            "Net Profit ($)": f"${res['net_profit']:,.2f}",
            "Max DD (%)": f"{res['max_dd_pct']:.2f}%",
            "Win Rate (%)": f"{res['win_rate']:.1f}%",
            "Wins": res['wins'],
            "BE Exits": res['be_exits'],
            "Losses": res['losses']
        })

    print(pd.DataFrame(results).to_string(index=False))
