import sys
sys.stdout.reconfigure(encoding='utf-8')
import pandas as pd
import numpy as np

# Load data
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
    if not mon.empty and not fri.empty and not tue.empty:
        weeks.append({
            'mon_open': mon.iloc[0]['open'],
            'fri_close': fri.iloc[-1]['close'],
            'tue_date': tue.iloc[0]['time'].strftime('%Y-%m-%d'),
        })

wdf = pd.DataFrame(weeks)
wdf['prev_fri_close'] = wdf['fri_close'].shift(1)
wdf['prev_mon_open'] = wdf['mon_open'].shift(1)
wdf['prev_week_diff'] = wdf['prev_fri_close'] - wdf['prev_mon_open']
wdf['prev_week_pct'] = (wdf['prev_fri_close'] - wdf['prev_mon_open']) / wdf['prev_mon_open'] * 100
wdf['prev_week_bullish'] = wdf['prev_week_diff'] > 0

sub = wdf.dropna(subset=['prev_week_bullish', 'tue_date']).copy()
h1_dates = set(df_h1['date_str'].unique())
sub = sub[sub['tue_date'].isin(h1_dates)].copy().reset_index(drop=True)
h1_by_date = {d: g.sort_values('time').reset_index(drop=True) for d, g in df_h1.groupby('date_str')}

def run_weekly_bullet_test(lots, min_pct=0.8, step=7.5, sl=15.0, buffer_pts=1.0, bullet_size=5000.0):
    total_weeks = 0
    win_weeks = 0
    loss_weeks = 0
    super_dump_weeks = 0
    
    total_withdrawn_profit = 0.0
    total_deposited_on_bust = bullet_size
    
    current_account = bullet_size
    week_pnls = []
    
    for _, row in sub.iterrows():
        if row['prev_week_pct'] < min_pct or not row['prev_week_bullish']:
            continue
            
        tue_date = row['tue_date']
        bars = h1_by_date.get(tue_date)
        if bars is None or len(bars) == 0:
            continue
            
        total_weeks += 1
        tue_open = bars.iloc[0]['open']
        positions = [{'entry': tue_open, 'lot': lots[0], 'sl': tue_open + sl, 'active': True}]
        next_target = tue_open - step
        next_idx = 1
        stopped_out = False
        week_pnl = 0.0
        
        for _, bar in bars.iterrows():
            high = bar['high']
            low = bar['low']
            for pos in positions:
                if pos['active'] and high >= pos['sl']:
                    loss_pts = pos['entry'] - pos['sl']
                    pos['active'] = False
                    week_pnl += loss_pts * 100.0 * pos['lot']
                    stopped_out = True
            if stopped_out and all(not p['active'] for p in positions):
                break
            while next_idx < len(lots) and low <= next_target and not stopped_out:
                entry_p = next_target
                lot_size = lots[next_idx]
                for prev in positions:
                    if prev['active']:
                        prev['sl'] = min(prev['sl'], entry_p + step - buffer_pts)
                positions.append({'entry': entry_p, 'lot': lot_size, 'sl': entry_p + step, 'active': True})
                next_idx += 1
                next_target -= step
                
        tue_close = bars.iloc[-1]['close']
        for pos in positions:
            if pos['active']:
                week_pnl += (pos['entry'] - tue_close) * 100.0 * pos['lot']
                pos['active'] = False
                
        week_pnls.append({
            'date': tue_date,
            'week_pnl': week_pnl,
            'layers': len(positions)
        })
        
        if week_pnl > 0:
            win_weeks += 1
            if len(positions) >= 3:
                super_dump_weeks += 1
        else:
            loss_weeks += 1
            
    w_df = pd.DataFrame(week_pnls)
    return w_df

print("=" * 85)
print("     CAPITAL SIMULATION: $5,000 PER WEEK BULLET ALLOCATION")
print("=" * 85)

# Compare 3 Scaling Models for $5,000 Bullet:
# Model 1: 5x Scale of Supreme (Lots [1.00, 2.00, 3.00, 5.00]) - Risk on Fail = -$1,500 (30% of $5k)
# Model 2: 7.5x Scale (Lots [1.50, 3.00, 4.50, 7.50]) - Risk on Fail = -$2,250 (45% of $5k)
# Model 3: 2.5x Scale (Lots [0.50, 1.00, 1.50, 2.50]) - Risk on Fail = -$750 (15% of $5k)

models = [
    ("Model 1: Supreme 5x Scaled (1.00 -> 2.00 -> 3.00 -> 5.00)", [1.00, 2.00, 3.00, 5.00], 1500.0),
    ("Model 2: Heavy 7.5x Scaled (1.50 -> 3.00 -> 4.50 -> 7.50)", [1.50, 3.00, 4.50, 7.50], 2250.0),
    ("Model 3: Balanced 2.5x Scaled (0.50 -> 1.00 -> 1.50 -> 2.50)", [0.50, 1.00, 1.50, 2.50], 750.0),
]

for name, lots, max_loss in models:
    res = run_weekly_bullet_test(lots, min_pct=0.8, step=7.5, sl=15.0)
    total_trades = len(res)
    wins = res[res['week_pnl'] > 0]
    losses = res[res['week_pnl'] < 0]
    super_dumps = res[res['layers'] >= 3]
    
    total_net = res['week_pnl'].sum()
    avg_win = wins['week_pnl'].mean()
    max_single_win = res['week_pnl'].max()
    avg_loss = abs(losses['week_pnl'].mean())
    
    print(f"\n[★] {name}")
    print(f"    - ทุนต่อสัปดาห์ (Bullet Size): $5,000")
    print(f"    - ความเสี่ยงสูงสุดต่อสัปดาห์ที่แพ้ (Max Loss on Fail): -${max_loss:,.2f} ({max_loss/5000*100:.1f}% ของกระสุน)")
    print(f"    - กำไรเฉลี่ยเมื่อเกิดวันอังคารทุบ (Avg Win Week): +${avg_win:,.2f}")
    print(f"    - สถิติกำไรสูงสุดใน 1 วันอังคาร (Max Single Day Harvest): +${max_single_win:,.2f} 🚀")
    print(f"    - จำนวนครั้งที่เกิด Super Dump (สโนว์บอลครบ 3-4 เลเยอร์): {len(super_dumps)} ครั้ง")
    print(f"    - กำไรสุทธิสะสมตลอดการทดสอบ (Total Net PnL): +${total_net:,.2f}")
    print(f"    - อัตราส่วน Win:Loss เฉลี่ยต่อรอบ: {avg_win/avg_loss:.2f} : 1")
