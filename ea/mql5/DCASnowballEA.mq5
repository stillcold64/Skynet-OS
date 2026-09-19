//+------------------------------------------------------------------+
//|                                              DCASnowballEA.mq5   |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                             https://github.com/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/stillcold64/Skynet-OS"
#property version   "2.00"
#property description "Alpha Asymmetric DCA Snowball EA (10-40-60 Upward Pyramiding + Free-Roll + 200 EMA Cut)"

#include "Include/RiskManager.mqh"
#include "Include/TradeManager.mqh"
#include "Include/TrendEngine.mqh"

enum ENUM_LOT_MODE
{
   LOT_MODE_RISK_PCT,       // คำนวณ Lot อัตโนมัติจาก % ความเสี่ยง
   LOT_MODE_FIXED,          // ใช้ Fixed Lot ต่อชุด
   LOT_MODE_CAPITAL_SCALED  // คำนวณ Lot อัตโนมัติตามสัดส่วนเงินทุน (เช่น 1.00 Lot ต่อ $10,000)
};

enum ENUM_SNOWBALL_STEP_MODE
{
   SNOWBALL_STEP_POINTS,    // ระบุระยะเป็น Points (เช่น 500 = $5.00 ทองคำ)
   SNOWBALL_STEP_USD        // ระบุระยะเป็นราคา Dollar USD ($) (แนะนำสำหรับ BTC เช่น $1,000 หรือ $1,200)
};

//--- INPUT PARAMETERS ---
sinput group "=== 1. กลยุทธ์ตามเทรนด์หลัก (Trend Strategy) ==="
input ENUM_TIMEFRAMES      Inp_Timeframe         = PERIOD_M15;            // Timeframe หลักในการเทรด
input int                  Inp_EntryBars         = 20;                    // Donchian Breakout Period ไม้แรก (แท่ง)
input bool                 Inp_UseMAFilter       = true;                  // กรองด้วยเส้น Moving Average
input int                  Inp_MAPeriod          = 200;                   // คาบ Moving Average หลัก (200 EMA)
input ENUM_MA_METHOD       Inp_MAMethod          = MODE_EMA;              // ประเภท Moving Average
input bool                 Inp_CloseOnMATrendExit= true;                  // ปิดรวบยกชุดเมื่อราคาปิดหลุด 200 EMA (ตัดขาดทุนเพื่อป้องกันติดดอย)
input double               Inp_ExitATRBuffer     = 0.2;                   // กันชน ATR ใต้เส้น EMA ก่อนสั่งคัท (0.2 * ATR กรอง Noise)
input int                  Inp_ExitCooldownBars  = 4;                     // แท่งพักรบหลังคัทลอส (จำนวนแท่ง Timeframe ที่ห้ามเปิดไม้ใหม่ ป้องกัน Whipsaw)
input int                  Inp_MaxDailyTrendCuts = 2;                     // Circuit Breaker ประจำวัน (โดนคัทเกิน N ครั้งใน 1 วันจะหยุดเทรดรอวันถัดไป)

sinput group "=== 2. ตัวกรองโมเมนตัมขั้นสูง (TRIX Filter) ==="
input bool                 Inp_UseTRIXFilter     = true;                  // เปิดใช้งานตัวกรอง TRIX ตัด Noise
input int                  Inp_TRIXPeriod        = 14;                    // คาบ TRIX (Triple Smoothed EMA)
input bool                 Inp_TRIXSlopeFilter   = true;                  // ต้องมี Slope เชิดหัวขึ้น (Buy)

sinput group "=== 3. ระบบสโนว์บอลตามเทรนด์ (Asymmetric 10-40-60 Snowball) ==="
input ENUM_SNOWBALL_STEP_MODE Inp_StepMode       = SNOWBALL_STEP_POINTS;  // โหมดระยะห่างสโนว์บอล (Points หรือ USD)
input int                  Inp_StepPoints        = 500;                   // ระยะห่างราคาแบบ Points (เช่น 500 = $5.00 ทองคำ)
input double               Inp_StepUSD           = 1200.0;                // ระยะห่างราคาแบบ USD ($) (เช่น 1200.0 = $1,200 บน BTC)
input double               Inp_WeightLayer1      = 0.10;                  // สัดส่วนไม้ที่ 1 (10% - หยั่งเชิงยอด Breakout)
input double               Inp_WeightLayer2      = 0.40;                  // สัดส่วนไม้ที่ 2 (40% - โมเมนตัมเริ่มมา)
input double               Inp_WeightLayer3      = 0.60;                  // สัดส่วนไม้ที่ 3 (60% - อัดเต็มเหนี่ยวตามเทรนด์ใหญ่)
input bool                 Inp_GridOnBarClose    = true;                  // เปิดไม้เฉพาะเมื่อจบแท่งเทียน

sinput group "=== 4. สวิตช์ล็อกหน้าทุนไร้ความเสี่ยง (Free-Roll Protection) ==="
input bool                 Inp_UseFreeRoll       = true;                  // เปิดใช้งานล็อกหน้าทุน Free-Roll ทันทีเมื่อกำไร
input double               Inp_FreeRollTriggerUSD= 50.0;                  // กำไรขั้นต่ำของชุด ($) เพื่อเปิดสวิตช์ดึง SL บังหน้าทุน
input int                  Inp_BufferPoints      = 20;                    // กำไรกันชนหน้าทุน (Points) (เช่น 20 = $0.20 กันค่าคอมมิชชั่น)

sinput group "=== 5. ระบบเก็บผลกำไร (Cashflow Harvesting) ==="
input double               Inp_CashflowTargetUSD = 150.0;                 // เป้าหมายกำไรรวบปิดยกชุดต่อรอบ ($) (One-Shot Close)
input bool                 Inp_ScaleTargetWithLot= false;                 // สเกลเป้ากำไรตามขนาดทุนอัตโนมัติด้วยหรือไม่

sinput group "=== 6. การบริหารเงินทุน (Capital Management) ==="
input ENUM_LOT_MODE        Inp_LotMode           = LOT_MODE_CAPITAL_SCALED;// โหมดคำนวณ Lot Size (แนะนำ Capital-Scaled)
input double               Inp_FixedLot          = 1.00;                  // ขนาด Lot งบรวม เมื่อเลือก Fixed Lot
input double               Inp_BaseCapitalUSD    = 10000.0;               // ขนาดทุนอ้างอิงสำหรับสเกล Lot (เช่น ทุกๆ $10,000)
input double               Inp_BaseLotPerCapital = 1.00;                  // Lot ฐานต่องบรวม (เช่น $10,000 = รวม 1.00 Lot)

sinput group "=== 7. ระบบความปลอดภัยของพอร์ต (Drawdown Control) ==="
input int                  Inp_MaxSpread         = 500;                   // Spread สูงสุดที่ยอมให้เปิดออเดอร์ (Points)
input double               Inp_MinMarginLevel    = 200.0;                 // Margin Level ขั้นต่ำ (%)
input double               Inp_MaxDrawdownPct    = 50.0;                  // Hard SL ฉุกเฉินระดับพอร์ต (%) (การันตี DD ไม่เกิน 50% เด็ดขาด)
input ulong                Inp_MagicNumber       = 88827000;              // Magic Number ประจำตัว Snowball EA

//--- GLOBAL INSTANCES ---
CRiskManager   g_risk;
CTradeManager  g_trade;
CTrendEngine   g_trend;
int            g_trixHandle = INVALID_HANDLE;
datetime       g_lastBarTime = 0;
datetime       g_lastOrderTime = 0;
double         g_initialBalance = 0.0;
int            g_dailyCutsCount = 0;
int            g_currentTradingDay = -1;
datetime       g_lastExitTime = 0;
bool           g_isFreeRollActive = false;

//+------------------------------------------------------------------+
//| ตรวจสอบแท่งเทียนใหม่ (Bar Close Detection)                         |
//+------------------------------------------------------------------+
bool IsNewBar()
{
   datetime currentBarTime = (datetime)SeriesInfoInteger(_Symbol, Inp_Timeframe, SERIES_LASTBAR_DATE);
   if(currentBarTime != g_lastBarTime)
   {
      g_lastBarTime = currentBarTime;
      return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| ดึงค่า TRIX และตรวจสอบสัญญาณโมเมนตัมขาขึ้น                         |
//+------------------------------------------------------------------+
bool CheckTRIXBuySignal()
{
   if(!Inp_UseTRIXFilter || g_trixHandle == INVALID_HANDLE)
      return true;

   double trixBuffer[];
   ArraySetAsSeries(trixBuffer, true);
   if(CopyBuffer(g_trixHandle, 0, 1, 2, trixBuffer) < 2)
      return false;

   double curTrix  = trixBuffer[0];
   double prevTrix = trixBuffer[1];

   if(curTrix <= 0.0) return false;
   if(Inp_TRIXSlopeFilter && curTrix <= prevTrix) return false;
   return true;
}

//+------------------------------------------------------------------+
//| คำนวณขนาด Lot งบรวม (Base Lot Budget)                              |
//+------------------------------------------------------------------+
double GetTotalLotBudget()
{
   if(Inp_LotMode == LOT_MODE_CAPITAL_SCALED)
   {
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      if(Inp_BaseCapitalUSD <= 0.0) return g_trade.NormalizeLot(Inp_FixedLot);
      double rawLot = (balance / Inp_BaseCapitalUSD) * Inp_BaseLotPerCapital;
      return g_trade.NormalizeLot(rawLot);
   }
   return g_trade.NormalizeLot(Inp_FixedLot);
}

//+------------------------------------------------------------------+
//| คำนวณขนาด Lot ของแต่ละชั้นตามน้ำหนัก 10% - 40% - 60%               |
//+------------------------------------------------------------------+
double GetLayerLot(int layerIndex)
{
   double totalBudget = GetTotalLotBudget();
   double weight = Inp_WeightLayer1;
   if(layerIndex == 1) weight = Inp_WeightLayer1;
   else if(layerIndex == 2) weight = Inp_WeightLayer2;
   else if(layerIndex == 3) weight = Inp_WeightLayer3;

   double rawLot = totalBudget * weight;
   return g_trade.NormalizeLot(rawLot);
}

//+------------------------------------------------------------------+
//| คำนวณเป้าหมาย Cashflow สเกลตามขนาดพอร์ต                           |
//+------------------------------------------------------------------+
double GetCurrentCashflowTarget()
{
   if(Inp_LotMode == LOT_MODE_CAPITAL_SCALED && Inp_ScaleTargetWithLot)
   {
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      if(Inp_BaseCapitalUSD > 0.0)
      {
         double factor = balance / Inp_BaseCapitalUSD;
         return MathMax(10.0, Inp_CashflowTargetUSD * factor);
      }
   }
   return Inp_CashflowTargetUSD;
}

//+------------------------------------------------------------------+
//| คำนวณราคาต้นทุนเฉลี่ย (Weighted Average Price) ของชุด Buy ทั้งหมด |
//+------------------------------------------------------------------+
double GetAverageBuyPrice()
{
   double totalCost = 0.0;
   double totalLots = 0.0;
   int totalPos = PositionsTotal();

   for(int i = totalPos - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
            PositionGetInteger(POSITION_MAGIC) == (long)Inp_MagicNumber &&
            PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
         {
            double volume = PositionGetDouble(POSITION_VOLUME);
            double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
            totalCost += (openPrice * volume);
            totalLots += volume;
         }
      }
   }
   return (totalLots > 0.0) ? (totalCost / totalLots) : 0.0;
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   g_initialBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   g_lastBarTime = 0;
   g_lastOrderTime = 0;
   g_dailyCutsCount = 0;
   g_lastExitTime = 0;
   g_isFreeRollActive = false;

   MqlDateTime dt;
   TimeCurrent(dt);
   g_currentTradingDay = dt.day;

   g_risk.Init(Inp_MaxSpread, Inp_MaxDrawdownPct, Inp_MinMarginLevel);
   g_trade.Init(_Symbol, Inp_MagicNumber, 0, Inp_BufferPoints, 0);

   if(!g_trend.Init(_Symbol, Inp_Timeframe, Inp_EntryBars, 0, Inp_MAPeriod, Inp_MAMethod, 14))
   {
      Print("[DCASnowball] Error initializing TrendEngine indicators!");
      return INIT_FAILED;
   }

   if(Inp_UseTRIXFilter)
   {
      g_trixHandle = iTriX(_Symbol, Inp_Timeframe, Inp_TRIXPeriod, PRICE_CLOSE);
      if(g_trixHandle == INVALID_HANDLE)
      {
         PrintFormat("[DCASnowball] Error creating TRIX handle on %s!", _Symbol);
         return INIT_FAILED;
      }
   }

   PrintFormat("[DCASnowball] ❄️ Alpha Snowball Initialized on %s (%s). Balance: %.2f, Target: $%.2f",
               _Symbol, EnumToString(Inp_Timeframe), g_initialBalance, Inp_CashflowTargetUSD);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   g_trend.Release();
   if(g_trixHandle != INVALID_HANDLE)
   {
      IndicatorRelease(g_trixHandle);
      g_trixHandle = INVALID_HANDLE;
   }
   PrintFormat("[DCASnowball] Deinitialized. Reason: %d", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime now = TimeCurrent();

   // 0. ตรวจสอบขึ้นวันใหม่เพื่อรีเซ็ต Daily Cuts Counter
   MqlDateTime dtNow;
   TimeToStruct(now, dtNow);
   if(dtNow.day != g_currentTradingDay)
   {
      g_currentTradingDay = dtNow.day;
      g_dailyCutsCount = 0;
   }

   // 1. ตรวจสอบเงื่อนไขฉุกเฉินระดับพอร์ต (Drawdown Cut ป้องกัน DD เกิน 50% เด็ดขาด)
   if(g_risk.IsDrawdownExceeded(g_initialBalance))
   {
      Print("[DCASnowball] Max Drawdown reached! Closing all positions to protect capital.");
      g_trade.CloseAllPositions();
      return;
   }

   int openBuyCount = g_trade.CountOpenPositions(POSITION_TYPE_BUY);
   double totalFloating = g_trade.GetTotalFloatingProfit();
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double pipPoint = g_trade.GetPipPoint();

   // 2. ระบบ Cashflow Harvesting (รวบปิดยกชุดเมื่อชนเป้าหมาย)
   double cashflowTarget = GetCurrentCashflowTarget();
   if(openBuyCount > 0 && totalFloating >= cashflowTarget)
   {
      PrintFormat("[DCASnowball] 💰 Snowball Harvested! Floating $%.2f >= Target $%.2f. Closing all %d positions.",
                  totalFloating, cashflowTarget, openBuyCount);
      g_trade.CloseAllPositions();
      g_isFreeRollActive = false;
      g_lastOrderTime = now;
      return;
   }

   // 3. สวิตช์ Free-Roll: ดึง SL มาบังหน้าทุนรวมทันทีเมื่อกำไรแตะเกณฑ์
   if(Inp_UseFreeRoll && openBuyCount > 0 && !g_isFreeRollActive && totalFloating >= Inp_FreeRollTriggerUSD)
   {
      double avgPrice = GetAverageBuyPrice();
      if(avgPrice > 0.0)
      {
         double lockSL = NormalizeDouble(avgPrice + (Inp_BufferPoints * pipPoint), digits);
         int totalPos = PositionsTotal();
         for(int i = totalPos - 1; i >= 0; i--)
         {
            ulong ticket = PositionGetTicket(i);
            if(ticket > 0)
            {
               if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
                  PositionGetInteger(POSITION_MAGIC) == (long)Inp_MagicNumber &&
                  PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
               {
                  double curSL = PositionGetDouble(POSITION_SL);
                  if(curSL < lockSL)
                  {
                     MqlTradeRequest req;
                     MqlTradeResult res;
                     ZeroMemory(req);
                     ZeroMemory(res);
                     req.action   = TRADE_ACTION_SLTP;
                     req.position = ticket;
                     req.symbol   = _Symbol;
                     req.sl       = lockSL;
                     if(!OrderSend(req, res))
                        PrintFormat("[DCASnowball] OrderSend modify SL failed for ticket #%I64u, error %d", ticket, GetLastError());
                  }
               }
            }
         }
         g_isFreeRollActive = true;
         PrintFormat("[DCASnowball] 🛡️ Free-Roll Activated! All %d positions locked at BE %.5f (Risk = 0)", openBuyCount, lockSL);
      }
   }

   // 4. ตรวจสอบการปิดชุดเมื่อราคาหลุด 200 EMA (Trend Exit Safeguard on Bar Close)
   bool isNewBar = IsNewBar();
   double atrCurrent = g_trend.GetATR(1);

   if(isNewBar && openBuyCount > 0)
   {
      double closeArr[];
      ArraySetAsSeries(closeArr, true);
      double closePrice = 0.0;
      if(CopyClose(_Symbol, Inp_Timeframe, 1, 1, closeArr) > 0)
         closePrice = closeArr[0];

      double maVal = g_trend.GetMA(1);
      if(Inp_CloseOnMATrendExit && maVal > 0.0)
      {
         double exitBufferDist = (Inp_ExitATRBuffer > 0.0 && atrCurrent > 0.0) ? (atrCurrent * Inp_ExitATRBuffer) : 0.0;
         if(closePrice < (maVal - exitBufferDist))
         {
            PrintFormat("[DCASnowball] 200 EMA Exit triggered (Close %.5f < MA %.5f - Buf %.5f). Closing all %d positions.",
                        closePrice, maVal, exitBufferDist, openBuyCount);
            g_trade.ClosePositionsByType(POSITION_TYPE_BUY);
            openBuyCount = 0;
            g_dailyCutsCount++;
            g_lastExitTime = now;
            g_isFreeRollActive = false;
         }
      }
   }

   // 5. ตรวจสอบความปลอดภัยก่อนพิจารณาเปิดไม้ใหม่
   if(!g_risk.IsSpreadOk(_Symbol)) return;
   if(!g_risk.IsMarginLevelOk()) return;
   if(now - g_lastOrderTime < 5) return; // Cooldown ป้องกันยิงรัวซ้ำ

   // Circuit Breaker ประจำวัน
   if(Inp_MaxDailyTrendCuts > 0 && g_dailyCutsCount >= Inp_MaxDailyTrendCuts)
      return;

   // แท่งพักรบหลังคัทลอส (Post-Exit Cooldown)
   if(Inp_ExitCooldownBars > 0 && g_lastExitTime > 0)
   {
      if((now - g_lastExitTime) < (Inp_ExitCooldownBars * PeriodSeconds(Inp_Timeframe)))
         return;
   }

   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double stepDistance = (Inp_StepMode == SNOWBALL_STEP_USD) ? Inp_StepUSD : (Inp_StepPoints * pipPoint);

   // --- 6. จัดการสโนว์บอลขาขึ้น (Asymmetric Upward Snowball) ---
   // ชั้นที่ 1: ไม้หยั่งเชิง (10% Lot) เปิดเมื่อ Donchian Breakout + TRIX ยืนยัน
   if(openBuyCount == 0 && isNewBar)
   {
      if(g_trend.CheckBuySignal(Inp_UseMAFilter) && CheckTRIXBuySignal())
      {
         double lot1 = GetLayerLot(1);
         if(g_trade.OpenBuy(lot1, 0.0, 0.0, "Snowball_L1_10%"))
         {
            g_lastOrderTime = now;
            g_isFreeRollActive = false;
            PrintFormat("[DCASnowball] ❄️ Layer 1 (10%%) Probe Buy opened: Lot=%.2f, Price=%.5f", lot1, currentAsk);
         }
      }
   }
   // ชั้นที่ 2 & 3: สโนว์บอลตามทางขึ้นเมื่อโมเมนตัมไปต่อ (+500 pts ต่อชั้น)
   else if(openBuyCount > 0 && openBuyCount < 3 && (!Inp_GridOnBarClose || isNewBar))
   {
      double highestBuy = g_trade.GetHighestBuyPrice();
      if(currentAsk >= highestBuy + stepDistance)
      {
         int nextLayer = openBuyCount + 1;
         double lotNext = GetLayerLot(nextLayer);
         string comment = StringFormat("Snowball_L%d_%d%%", nextLayer, (nextLayer == 2 ? 40 : 60));

         if(g_trade.OpenBuy(lotNext, 0.0, 0.0, comment))
         {
            g_lastOrderTime = now;
            PrintFormat("[DCASnowball] ❄️ Layer %d added: Lot=%.2f, Price=%.5f", nextLayer, lotNext, currentAsk);
         }
      }
   }
}
//+------------------------------------------------------------------+
