import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append('ea/python')
import pandas as pd
import numpy as np

# Load H1
df = pd.read_csv('ea/python/xauusd_h1.csv')
df['time'] = pd.to_datetime(df['time'])
df = df.sort_values('time').reset_index(drop=True)

df['iso_year'] = df['time'].dt.isocalendar().year
df['iso_week'] = df['time'].dt.isocalendar().week
df['dow'] = df['time'].dt.dayofweek

# Weekly data
weekly = df.groupby(['iso_year', 'iso_week']).agg(
    open=('open', 'first'),
    high=('high', 'max'),
    low=('low', 'min'),
    close=('close', 'last')
).reset_index()
weekly['gain_pct'] = (weekly['close'] - weekly['open']) / weekly['open'] * 100.0

weekly_dict = {}
for i in range(len(weekly)):
    y = weekly.loc[i, 'iso_year']
    w = weekly.loc[i, 'iso_week']
    if i > 0:
        weekly_dict[(y, w)] = {
            'prev_gain': weekly.loc[i-1, 'gain_pct'],
            'prev_close': weekly.loc[i-1, 'close'],
            'prev_open': weekly.loc[i-1, 'open']
        }

def get_detailed_trades(df_data, buffer=15.0, step=8.0, sl=20.0, lots=[0.50, 1.00, 1.50, 2.50], lock_thresh=3000.0, exit_hour=21):
    tue_groups = df_data[df_data['dow'] == 1].groupby(['iso_year', 'iso_week'])
    trades = []
    
    for (y, w), t_df in tue_groups:
        w_info = weekly_dict.get((y, w))
        if not w_info or w_info['prev_gain'] < 0.8 or w_info['prev_close'] <= w_info['prev_open']:
            continue
            
        t_bars = t_df.sort_values('time').reset_index(drop=True)
        if len(t_bars) < 10: continue
        
        tue_open = t_bars.iloc[0]['open']
        target_high = tue_open + buffer
        
        entered = False
        entry_idx = -1
        entry_price = 0.0
        current_high = tue_open
        
        for idx, bar in t_bars.iterrows():
            if bar['high'] > current_high:
                current_high = bar['high']
            if current_high >= target_high and (current_high - bar['low']) >= 3.0:
                entry_price = current_high - 3.0
                entry_idx = idx
                entered = True
                break
                
        if not entered: continue
        
        positions = [{'lot': lots[0], 'open_p': entry_price, 'sl': entry_price + sl}]
        pnl = 0.0
        closed = False
        highest_float = 0.0
        exit_reason = ""
        
        for idx in range(entry_idx, len(t_bars)):
            bar = t_bars.iloc[idx]
            b_high = bar['high']
            b_low = bar['low']
            b_time = bar['time']
            
            float_pnl = sum((p['open_p'] - b_low) * p['lot'] * 100.0 for p in positions)
            if float_pnl > highest_float:
                highest_float = float_pnl
                
            if lock_thresh > 0 and highest_float >= lock_thresh:
                current_pnl = sum((p['open_p'] - bar['close']) * p['lot'] * 100.0 for p in positions)
                if current_pnl <= highest_float * 0.70:
                    pnl = current_pnl
                    closed = True
                    exit_reason = "ProfitLock"
                    break
                    
            if b_time.hour >= exit_hour:
                pnl = sum((p['open_p'] - bar['open']) * p['lot'] * 100.0 for p in positions)
                closed = True
                exit_reason = "EOD"
                break
                
            if any(b_high >= p['sl'] for p in positions):
                pnl = sum((p['open_p'] - p['sl']) * p['lot'] * 100.0 for p in positions)
                closed = True
                exit_reason = "SL"
                break
                
            lowest_entry = min(p['open_p'] for p in positions)
            active_count = len(positions)
            if active_count < len(lots):
                next_trigger = lowest_entry - step
                if b_low <= next_trigger:
                    tot_vol = sum(p['lot'] for p in positions) + lots[active_count]
                    tot_val = sum(p['open_p'] * p['lot'] for p in positions) + next_trigger * lots[active_count]
                    vwap_be = tot_val / tot_vol
                    for p in positions:
                        p['sl'] = min(p['sl'], vwap_be)
                    positions.append({
                        'lot': lots[active_count],
                        'open_p': next_trigger,
                        'sl': vwap_be
                    })
                    
        if not closed:
            last_bar = t_bars.iloc[-1]
            pnl = sum((p['open_p'] - last_bar['close']) * p['lot'] * 100.0 for p in positions)
            exit_reason = "EOD_Last"
            
        trades.append({
            'year': y,
            'week': w,
            'entry_price': entry_price,
            'pnl': pnl,
            'layers': len(positions),
            'exit_reason': exit_reason,
            'is_win': pnl > 0
        })
        
    return pd.DataFrame(trades)

# Analyze 2024-2026
df_2024 = df.iloc[-16105:].copy()
tdf_24 = get_detailed_trades(df_2024)

print("="*70)
print("OPTION 3 (SUPREME ALPHA) - TRADE STATISTICS (2024-2026)")
print("="*70)
total_trades = len(tdf_24)
wins = tdf_24[tdf_24['pnl'] > 0]
losses = tdf_24[tdf_24['pnl'] <= 0]
be_trades = tdf_24[tdf_24['pnl'].between(-50, 50)]

print(f"Total Triggered Trades: {total_trades}")
print(f"Wins: {len(wins)} ({len(wins)/total_trades*100:.1f}%)")
print(f"Losses: {len(losses)} ({len(losses)/total_trades*100:.1f}%)")
print(f"  - ในจำนวนนี้เป็นเสมอตัว/หลุด Freeroll (ขาดทุน ~$0 ถึง -$50): {len(be_trades)} ครั้ง")
print(f"  - ขาดทุนเต็มไม้ SL (โดนลากเกิน $20): {len(losses) - len(be_trades)} ครั้ง")
print(f"Total Net Profit: ${tdf_24['pnl'].sum():,.2f}")
print(f"Gross Profit: ${wins['pnl'].sum():,.2f} (เฉลี่ยชนะครั้งละ ${wins['pnl'].mean():,.2f})")
print(f"Gross Loss: ${losses['pnl'].sum():,.2f} (เฉลี่ยแพ้ครั้งละ ${losses['pnl'].mean():,.2f})")
print(f"Profit Factor: {wins['pnl'].sum() / abs(losses['pnl'].sum()):.2f}")

# Longest losing streak
streak = 0
max_streak = 0
for w in tdf_24['is_win']:
    if not w:
        streak += 1
        if streak > max_streak:
            max_streak = streak
    else:
        streak = 0
print(f"Longest Consecutive Losing Streak: {max_streak} สัปดาห์ติดต่อกัน")

print("\nYear-by-Year Breakdown:")
for yr, g in tdf_24.groupby('year'):
    w_cnt = len(g[g['pnl'] > 0])
    l_cnt = len(g[g['pnl'] <= 0])
    print(f"Year {yr}: Total {len(g):2d} ไม้ | ชนะ {w_cnt:2d} | แพ้ {l_cnt:2d} | Net: ${g['pnl'].sum():10,.2f}")

# Full 8.5 Years stats
tdf_all = get_detailed_trades(df)
print("\n" + "="*70)
print("OPTION 3 - FULL 8.5 YEARS (2018-2026)")
print("="*70)
tot_all = len(tdf_all)
w_all = tdf_all[tdf_all['pnl'] > 0]
l_all = tdf_all[tdf_all['pnl'] <= 0]
print(f"Total Trades: {tot_all}")
print(f"Wins: {len(w_all)} ({len(w_all)/tot_all*100:.1f}%) | Losses: {len(l_all)} ({len(l_all)/tot_all*100:.1f}%)")
print(f"Net Profit: ${tdf_all['pnl'].sum():,.2f} | PF: {w_all['pnl'].sum()/abs(l_all['pnl'].sum()):.2f}")
streak_all = 0
max_streak_all = 0
for w in tdf_all['is_win']:
    if not w:
        streak_all += 1
        if streak_all > max_streak_all:
            max_streak_all = streak_all
    else:
        streak_all = 0
print(f"Max Losing Streak (All-time): {max_streak_all} สัปดาห์ติดต่อกัน")
