import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# 1. Load H1 and D1 data
df_d1 = pd.read_csv('ea/python/xauusd_d1.csv')
df_d1['time'] = pd.to_datetime(df_d1['time'])
df_d1['iso_year'] = df_d1['time'].dt.isocalendar().year
df_d1['iso_week'] = df_d1['time'].dt.isocalendar().week
df_d1['day_name'] = df_d1['time'].dt.day_name()

df_h1 = pd.read_csv('ea/python/xauusd_h1.csv')
df_h1['time'] = pd.to_datetime(df_h1['time'])
df_h1['date_str'] = df_h1['time'].dt.strftime('%Y-%m-%d')

weeks = []
for (yr, wk), g in df_d1.groupby(['iso_year', 'iso_week']):
    mon = g[g['day_name'] == 'Monday']
    tue = g[g['day_name'] == 'Tuesday']
    fri = g[g['day_name'] == 'Friday']
    if not mon.empty and not fri.empty:
        w = {
            'year': yr, 'week': wk,
            'mon_date': mon.iloc[0]['time'].strftime('%Y-%m-%d'),
            'mon_open': mon.iloc[0]['open'],
            'mon_high': mon.iloc[0]['high'],
            'mon_low': mon.iloc[0]['low'],
            'mon_close': mon.iloc[0]['close'],
            'fri_date': fri.iloc[-1]['time'].strftime('%Y-%m-%d'),
            'fri_open': fri.iloc[-1]['open'],
            'fri_close': fri.iloc[-1]['close'],
        }
        if not tue.empty:
            w['tue_date'] = tue.iloc[0]['time'].strftime('%Y-%m-%d')
            w['tue_open'] = tue.iloc[0]['open']
            w['tue_high'] = tue.iloc[0]['high']
            w['tue_low'] = tue.iloc[0]['low']
            w['tue_close'] = tue.iloc[0]['close']
        weeks.append(w)

wdf = pd.DataFrame(weeks).sort_values(['year', 'week']).reset_index(drop=True)
wdf['prev_fri_close'] = wdf['fri_close'].shift(1)
wdf['prev_mon_open'] = wdf['mon_open'].shift(1)
wdf['prev_week_diff'] = wdf['prev_fri_close'] - wdf['prev_mon_open']
wdf['prev_week_pct'] = (wdf['prev_fri_close'] - wdf['prev_mon_open']) / wdf['prev_mon_open'] * 100
wdf['prev_week_bullish'] = wdf['prev_week_diff'] > 0

sub = wdf.dropna(subset=['prev_week_bullish', 'tue_date', 'tue_open']).copy()
h1_dates = set(df_h1['date_str'].unique())
sub = sub[sub['tue_date'].isin(h1_dates)].copy().reset_index(drop=True)

h1_by_date = {d: g.sort_values('time').reset_index(drop=True) for d, g in df_h1.groupby('date_str')}

print("=" * 85)
print("      AGGRESSIVE SNOWBALL EXPERIMENT: XAUUSD TUESDAY DUMP (2018 - 2026)")
print("=" * 85)
print(f"Total Available Tuesdays with H1 data: {len(sub)}")

# ==============================================================================
# STRATEGY 1: DOWNWARD PYRAMIDING SNOWBALL (Trend Snowball + Freeroll)
# - Enter Layer 1 at Tuesday Open
# - If price drops by step_usd: Move Layer 1 to Breakeven (Freeroll), Enter Layer 2
# - If price drops further: Trail BE, Enter Layer 3
# - If price hits initial SL: Exit all active layers
# - Exit all at Tuesday Close or Trailing Stop
# ==============================================================================
def simulate_pyramiding_snowball(min_gain_pct=0.5, step_usd=5.0, lots=[0.10, 0.15, 0.20, 0.30], initial_sl=20.0, use_freeroll=True):
    total_dollar_pnl = 0.0
    total_trades_count = 0
    weeks_traded = 0
    history = []
    
    for _, row in sub.iterrows():
        # Relaxed condition for higher frequency!
        if row['prev_week_pct'] < min_gain_pct or not row['prev_week_bullish']:
            continue
            
        tue_date = row['tue_date']
        bars = h1_by_date.get(tue_date)
        if bars is None or len(bars) == 0:
            continue
            
        weeks_traded += 1
        tue_open = bars.iloc[0]['open']
        
        # Positions: list of dicts: {'entry': float, 'lot': float, 'sl': float, 'active': bool, 'exit_pnl': float}
        positions = []
        # Layer 1
        positions.append({
            'layer': 1,
            'entry': tue_open,
            'lot': lots[0],
            'sl': tue_open + initial_sl,
            'active': True,
            'pnl': 0.0
        })
        next_entry_target = tue_open - step_usd
        next_layer_idx = 1
        
        week_pnl = 0.0
        stopped_out = False
        
        for _, bar in bars.iterrows():
            high = bar['high']
            low = bar['low']
            
            # 1. Check Stop Losses on active positions
            for pos in positions:
                if pos['active'] and high >= pos['sl']:
                    # Stopped out
                    loss_pts = pos['entry'] - pos['sl'] # negative
                    dollar = loss_pts * 10.0 * pos['lot'] * 10.0 # 0.10 lot * 100 oz = 10 oz -> $10 per $1 move
                    pos['pnl'] = dollar
                    pos['active'] = False
                    week_pnl += dollar
                    stopped_out = True
                    
            if stopped_out and all(not p['active'] for p in positions):
                break
                
            # 2. Check if price moved down to trigger next snowball layer
            while next_layer_idx < len(lots) and low <= next_entry_target and not stopped_out:
                entry_p = next_entry_target
                lot_size = lots[next_layer_idx]
                
                # Move previous positions to Breakeven (Freeroll) or Trailing
                if use_freeroll:
                    for prev_pos in positions:
                        if prev_pos['active']:
                            # Trail SL down to lock profit or BE
                            prev_pos['sl'] = min(prev_pos['sl'], entry_p + step_usd)
                            
                positions.append({
                    'layer': next_layer_idx + 1,
                    'entry': entry_p,
                    'lot': lot_size,
                    'sl': entry_p + step_usd * 1.5,
                    'active': True,
                    'pnl': 0.0
                })
                next_layer_idx += 1
                next_entry_target -= step_usd
                
        # Close remaining active positions at Tuesday close
        tue_close = bars.iloc[-1]['close']
        for pos in positions:
            if pos['active']:
                pts = pos['entry'] - tue_close
                dollar = pts * 10.0 * pos['lot'] * 10.0
                pos['pnl'] = dollar
                pos['active'] = False
                week_pnl += dollar
                
        total_dollar_pnl += week_pnl
        total_trades_count += len(positions)
        history.append({
            'date': tue_date,
            'week_pnl': week_pnl,
            'layers_fired': len(positions),
            'prev_pct': row['prev_week_pct']
        })
        
    hdf = pd.DataFrame(history)
    if len(hdf) == 0:
        return {'weeks': 0, 'trades': 0, 'net_pnl': 0, 'wr': 0, 'pf': 0, 'max_dd': 0, 'avg_layers': 0}
        
    cum = hdf['week_pnl'].cumsum()
    peak = cum.cummax()
    dd = peak - cum
    max_dd = dd.max()
    
    wins = hdf[hdf['week_pnl'] > 0]
    losses = hdf[hdf['week_pnl'] < 0]
    wr = len(wins) / len(hdf) * 100
    pf = wins['week_pnl'].sum() / abs(losses['week_pnl'].sum()) if abs(losses['week_pnl'].sum()) > 0 else 99.0
    
    return {
        'weeks': weeks_traded,
        'total_positions': total_trades_count,
        'avg_layers': total_trades_count / weeks_traded,
        'win_rate': wr,
        'profit_factor': pf,
        'net_pnl': total_dollar_pnl,
        'max_dd': max_dd,
        'hdf': hdf
    }

# ==============================================================================
# STRATEGY 2: PULLBACK ACCUMULATION SNOWBALL (Morning Fade Trap)
# - Layer 1 at Tuesday Open
# - Layer 2 at Open + step_usd (e.g. +$5 bounce)
# - Layer 3 at Open + 2*step_usd (e.g. +$10 bounce)
# - Aggregate SL at Open + 3*step_usd
# - Exit all at Tuesday Close or TP
# ==============================================================================
def simulate_accumulation_snowball(min_gain_pct=0.5, step_usd=5.0, lots=[0.10, 0.20, 0.30], sl_from_open=25.0, tp_from_open=20.0):
    total_dollar_pnl = 0.0
    total_trades_count = 0
    weeks_traded = 0
    history = []
    
    for _, row in sub.iterrows():
        if row['prev_week_pct'] < min_gain_pct or not row['prev_week_bullish']:
            continue
            
        tue_date = row['tue_date']
        bars = h1_by_date.get(tue_date)
        if bars is None or len(bars) == 0:
            continue
            
        weeks_traded += 1
        tue_open = bars.iloc[0]['open']
        
        # Grid limit levels above Open:
        # Layer 1: Open
        # Layer 2: Open + step_usd
        # Layer 3: Open + 2*step_usd
        grid_levels = [tue_open + i * step_usd for i in range(len(lots))]
        sl_price = tue_open + sl_from_open
        tp_price = tue_open - tp_from_open
        
        filled_layers = []
        week_pnl = 0.0
        hit_sl = False
        hit_tp = False
        
        # Fill layer 1 immediately at Open
        filled_layers.append({'entry': tue_open, 'lot': lots[0]})
        next_fill_idx = 1
        
        for _, bar in bars.iterrows():
            high = bar['high']
            low = bar['low']
            
            # Check SL
            if high >= sl_price:
                hit_sl = True
                break
                
            # Check TP
            if low <= tp_price:
                hit_tp = True
                break
                
            # Check fills for pending limit layers
            while next_fill_idx < len(lots) and high >= grid_levels[next_fill_idx]:
                filled_layers.append({'entry': grid_levels[next_fill_idx], 'lot': lots[next_fill_idx]})
                next_fill_idx += 1
                
        if hit_sl:
            for pos in filled_layers:
                loss_pts = pos['entry'] - sl_price # negative
                week_pnl += loss_pts * 10.0 * pos['lot'] * 10.0
        elif hit_tp:
            for pos in filled_layers:
                win_pts = pos['entry'] - tp_price
                week_pnl += win_pts * 10.0 * pos['lot'] * 10.0
        else:
            # Exit at Tuesday close
            tue_close = bars.iloc[-1]['close']
            for pos in filled_layers:
                pts = pos['entry'] - tue_close
                week_pnl += pts * 10.0 * pos['lot'] * 10.0
                
        total_dollar_pnl += week_pnl
        total_trades_count += len(filled_layers)
        history.append({
            'date': tue_date,
            'week_pnl': week_pnl,
            'layers_filled': len(filled_layers)
        })
        
    hdf = pd.DataFrame(history)
    if len(hdf) == 0:
        return {'weeks': 0, 'trades': 0, 'net_pnl': 0, 'wr': 0, 'pf': 0, 'max_dd': 0}
        
    cum = hdf['week_pnl'].cumsum()
    peak = cum.cummax()
    dd = peak - cum
    max_dd = dd.max()
    
    wins = hdf[hdf['week_pnl'] > 0]
    losses = hdf[hdf['week_pnl'] < 0]
    wr = len(wins) / len(hdf) * 100
    pf = wins['week_pnl'].sum() / abs(losses['week_pnl'].sum()) if abs(losses['week_pnl'].sum()) > 0 else 99.0
    
    return {
        'weeks': weeks_traded,
        'total_positions': total_trades_count,
        'avg_layers': total_trades_count / weeks_traded,
        'win_rate': wr,
        'profit_factor': pf,
        'net_pnl': total_dollar_pnl,
        'max_dd': max_dd,
        'hdf': hdf
    }

print("\n" + "=" * 85)
print("TEST 1: DOWNWARD PYRAMIDING SNOWBALL (Scaling 0.10 -> 0.15 -> 0.20 -> 0.30 on Dumps)")
print("=" * 85)

pyramid_results = []
for min_pct in [0.0, 0.5, 1.0, 1.5, 2.0]:
    for step in [5.0, 7.5, 10.0]:
        res = simulate_pyramiding_snowball(min_gain_pct=min_pct, step_usd=step, lots=[0.10, 0.15, 0.20, 0.30], initial_sl=20.0)
        pyramid_results.append({
            'MinPct': f">={min_pct:.1f}%",
            'Step': f"${step:.1f}",
            'Active Wks': res['weeks'],
            'Total Trades': res['total_positions'],
            'Trades/Yr': f"{res['total_positions']/8.7:.1f}",
            'WinRate': f"{res['win_rate']:.1f}%",
            'PF': f"{res['profit_factor']:.2f}",
            'Net PnL': f"${res['net_pnl']:,.2f}",
            'Max DD': f"${res['max_dd']:,.2f}"
        })
print(pd.DataFrame(pyramid_results).to_string(index=False))

print("\n" + "=" * 85)
print("TEST 2: PULLBACK ACCUMULATION SNOWBALL (Fade Morning Bounce: 0.10 -> 0.20 -> 0.30)")
print("=" * 85)

accum_results = []
for min_pct in [0.0, 0.5, 1.0, 1.5]:
    for step in [5.0, 7.5]:
        for tp in [15.0, 20.0, 25.0]:
            res = simulate_accumulation_snowball(min_gain_pct=min_pct, step_usd=step, lots=[0.10, 0.20, 0.30], sl_from_open=25.0, tp_from_open=tp)
            accum_results.append({
                'MinPct': f">={min_pct:.1f}%",
                'Step': f"${step:.1f}",
                'TP': f"${tp:.0f}",
                'Active Wks': res['weeks'],
                'Total Trades': res['total_positions'],
                'Trades/Yr': f"{res['total_positions']/8.7:.1f}",
                'WinRate': f"{res['win_rate']:.1f}%",
                'PF': f"{res['profit_factor']:.2f}",
                'Net PnL': f"${res['net_pnl']:,.2f}",
                'Max DD': f"${res['max_dd']:,.2f}"
            })

adf = pd.DataFrame(accum_results).sort_values('Net PnL', ascending=False)
print(adf.head(15).to_string(index=False))
