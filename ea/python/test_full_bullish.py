import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append('ea/python')
import pandas as pd
from test_bullish_snowball import df, test_bullish_snowball

print("="*85)
print("TESTING MON_HIGH_BREAK (BULLISH SNOWBALL) ON FULL 8.5 YEARS (2018-2026)")
print("="*85)

for st in [8.0, 10.0, 12.0, 15.0]:
    for ed in [1, 2]: # Exit Tuesday 21:00 or Wednesday 21:00
        n, wr, net, pf, mdd, minb = test_bullish_snowball(
            df, strategy_mode='MON_HIGH_BREAK', step_usd=st, exit_day=ed
        )
        print(f"Step=${st:4.1f} | ExitDay={'Tue 21:00' if ed==1 else 'Wed 21:00'} | Trades: {n:2d} | WR: {wr:4.1f}% | Net: ${net:10,.2f} | PF: {pf:4.2f} | MaxDD: ${mdd:7,.2f}")
