//+------------------------------------------------------------------+
//|                                             DavidDruzGridEA.mq5  |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                             https://github.com/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/"
#property version   "1.10"
#property description "David Druz Trend-Following Grid EA - Cashflow Harvester ($50-$100 Target with TRIX Filter)"

#include "Include/RiskManager.mqh"
#include "Include/TradeManager.mqh"
#include "Include/TrendEngine.mqh"

enum ENUM_LOT_MODE
{
   LOT_MODE_RISK_PCT,       // คำนวณ Lot อัตโนมัติจาก % ความเสี่ยงต่อไม้
   LOT_MODE_FIXED,          // ใช้ Fixed Lot ต่อไม้
   LOT_MODE_CAPITAL_SCALED  // คำนวณ Lot และสเกลตามสัดส่วนเงินทุน (เช่น 1.00 Lot ต่อ $10,000 หรือ 0.10 Lot ต่อ $1,000)
};

enum ENUM_TRADE_DIRECTION
{
   TRADE_DIR_BOTH,    // เทรดทั้งขาขึ้น (BUY Grid) และขาลง (SELL Grid)
   TRADE_DIR_BUY_ONLY,// เทรดเฉพาะขาขึ้น (BUY Grid เท่านั้น)
   TRADE_DIR_SELL_ONLY// เทรดเฉพาะขาลง (SELL Grid เท่านั้น)
};

enum ENUM_GRID_STEP_MODE
{
   GRID_STEP_POINTS,  // วางระยะกริดคงที่เป็น Points (เช่น ทุกๆ 300 - 400 Points)
   GRID_STEP_ATR      // วางระยะกริดแบบ Dynamic ตามค่าความผันผวน ATR
};

enum ENUM_HARVEST_MODE
{
   HARVEST_DISABLED,  // ปิดระบบ Cashflow Harvest (รันเทรนด์ปกติ)
   HARVEST_BASKET,    // [แนะนำ] ปิดรวบทั้งแผงเมื่อกำไรรวมแตะเป้า $50 - $100 (รีเซ็ตพอร์ตเร็ว DD ต่ำ)
   HARVEST_PER_ORDER  // ปิดทำกำไรทีละไม้เมื่อไม้นั้นๆ กำไรแตะเป้า $50 - $100
};

//--- INPUT PARAMETERS ---
sinput group "=== 1. กลยุทธ์เทรนด์หลัก (Trend Foundation) ==="
input ENUM_TRADE_DIRECTION Inp_TradeDirection    = TRADE_DIR_BUY_ONLY;    // ทิศทางการเทรด (แนะนำ TRADE_DIR_BUY_ONLY สำหรับเน้น Buy Side Grid)
input ENUM_TIMEFRAMES      Inp_Timeframe         = PERIOD_H1;             // Timeframe วิเคราะห์แนวโน้ม (แนะนำ H1 หรือ H4)
input int                  Inp_EntryBars         = 20;                    // Donchian Breakout Period ไม้แรก (แท่ง)
input int                  Inp_ExitBars          = 0;                     // Donchian Exit Period ปิดยกชุด (0 = ปิด ปล่อยรวบปิดด้วย Cashflow)
input bool                 Inp_UseMAFilter       = true;                  // กรองด้วยเส้น Moving Average
input int                  Inp_MAPeriod          = 200;                   // คาบ Moving Average หลัก (200 EMA)
input ENUM_MA_METHOD       Inp_MAMethod          = MODE_EMA;              // ประเภท Moving Average
input bool                 Inp_CloseOnMATrendExit= true;                  // ปิดกริดยกชุดเมื่อราคาปิดหลุด 200 EMA (ตัดขาดทุนเล็กน้อยเพื่อป้องกันติดดอยตลาดหมี)
input double               Inp_ExitATRBuffer     = 0.2;                   // กันชน ATR ใต้เส้น EMA ก่อนสั่งคัท (0.2 * ATR ป้องกันหลุด Noise)
input int                  Inp_ExitCooldownBars  = 4;                     // แท่งพักรบหลังคัทลอส (จำนวนแท่ง Timeframe ที่ห้ามเปิดไม้ใหม่ ป้องกัน Whipsaw)
input int                  Inp_MaxDailyTrendCuts = 2;                     // Circuit Breaker ประจำวัน (โดนคัท Trend เกิน N ครั้งใน 1 วันจะหยุดเทรดรอวันถัดไป, 0 = ไม่จำกัด)

sinput group "=== 2. ตัวกรองโมเมนตัมขั้นสูง (TRIX Filter) ==="
input bool                 Inp_UseTRIXFilter     = true;                  // เปิดใช้งานตัวกรอง TRIX ตัด Noise
input int                  Inp_TRIXPeriod        = 14;                    // คาบ TRIX (Triple Smoothed EMA)
input bool                 Inp_TRIXSlopeFilter   = true;                  // ต้องมี Slope เชิดหัวขึ้น (Buy) หรือดิ่งลง (Sell)

sinput group "=== 3. ระบบเก็บกระแสเงินสด (Cashflow Harvesting) ==="
input ENUM_HARVEST_MODE    Inp_HarvestMode       = HARVEST_BASKET;        // รูปแบบการเก็บแคชโฟลว์ ($50 - $100)
input double               Inp_CashflowTargetUSD = 50.0;                  // เป้าหมายแคชโฟลว์ต่อรอบ ($) (เช่น 50 หรือ 100 ดอลลาร์)

sinput group "=== 4. ระบบกริดตามเทรนด์ (In-Trend Grid Scaling) ==="
input int                  Inp_MaxGridOrders     = 3;                     // จำนวนไม้กริดสะสมสูงสุด (แนะนำ 2 - 4 ไม้ คุม DD < 50%)
input ENUM_GRID_STEP_MODE  Inp_GridStepMode      = GRID_STEP_POINTS;      // รูปแบบระยะห่างแต่ละชั้นกริด
input int                  Inp_GridStepPoints    = 500;                   // ระยะกริดคงที่ (Points) (เช่น 500 = $5.00 ทองคำ)
input double               Inp_GridStepATRMult   = 1.0;                   // ตัวคูณ ATR เมื่อเลือกแบบ Dynamic ATR Step
input bool                 Inp_RequirePriorBE    = false;                 // บังคับล็อก Breakeven ไม้ก่อนหน้าก่อนเปิดกริดถัดไป (เมื่อไม่มี SL ให้ตั้ง false)
input bool                 Inp_GridOnBarClose    = true;                  // เปิดไม้กริดเฉพาะเมื่อจบแท่ง (กันหลอก/ลดโหลด UI MT5)

sinput group "=== 5. การบริหารเงินทุน (Money Management) ==="
input bool                 Inp_UseOrderSL        = false;                 // เปิดใช้งาน Stop Loss แต่ละไม้ (false = ไม่มี SL รายไม้ มีแค่ Hard SL -50%)
input ENUM_LOT_MODE        Inp_LotMode           = LOT_MODE_CAPITAL_SCALED;// โหมดคำนวณ Lot Size (แนะนำ Capital-Scaled)
input double               Inp_FixedLot          = 1.00;                  // ขนาด Lot ต่อไม้ เมื่อเลือก Fixed Lot
input double               Inp_BaseCapitalUSD    = 10000.0;               // ขนาดทุนอ้างอิงสำหรับสเกล Lot (เช่น ทุกๆ $10,000)
input double               Inp_BaseLotPerCapital = 1.00;                  // Lot ฐานต่อขนาดทุนอ้างอิง (เช่น $10,000 = 1.00 Lot, $1,000 = 0.10 Lot)
input bool                 Inp_ScaleTargetWithLot= false;                 // สเกลเป้า Cashflow ตามขนาดทุนด้วยหรือไม่ (false = ฟิกตาม Inp_CashflowTargetUSD)
input double               Inp_RiskPctPerOrder   = 0.4;                   // เปอร์เซ็นต์ความเสี่ยงต่อไม้ (กรณีเลือกโหมด Risk %)
input int                  Inp_ATRPeriod         = 14;                    // คาบ ATR
input double               Inp_ATRMultiplierSL   = 3.0;                   // ตัวคูณ ATR สำหรับ Initial Stop Loss (หากเปิดใช้ SL รายไม้)
input int                  Inp_MinSLPoints       = 150;                   // ระยะ Stop Loss ขั้นต่ำ (Points)

sinput group "=== 6. การล็อกกำไร & Trailing Stop (Safety Protection) ==="
input double               Inp_ATRTrailMult      = 0.0;                   // ตัวคูณ ATR สำหรับ Chandelier Trailing Stop ยกชุด (0 = ปิด)
input int                  Inp_BEPoints          = 0;                     // ระยะกำไรเพื่อดึง SL บังหน้าทุน (Points) (0 = ปิด)
input int                  Inp_BufferPoints      = 30;                    // กำไรกันชนหน้าทุน (Points)

sinput group "=== 7. ระบบความปลอดภัยของพอร์ต (Drawdown Control) ==="
input int                  Inp_MaxSpread         = 500;                   // Spread สูงสุดที่ยอมให้เปิดออเดอร์ (Points)
input double               Inp_MinMarginLevel    = 200.0;                 // Margin Level ขั้นต่ำ (%)
input double               Inp_MaxDrawdownPct    = 50.0;                  // Hard SL ฉุกเฉินระดับพอร์ต (%) (การันตี DD ไม่เกิน 50% เด็ดขาด)
input ulong                Inp_MagicNumber       = 88829100;              // Magic Number ประจำตัว Grid EA

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
bool           g_isHalted = false;

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
//| ดึงค่า TRIX และตรวจสอบสัญญาณโมเมนตัม                                |
//+------------------------------------------------------------------+
bool CheckTRIXSignal(bool isBuyCheck)
{
   if(!Inp_UseTRIXFilter || g_trixHandle == INVALID_HANDLE)
      return true;

   double trixBuffer[];
   ArraySetAsSeries(trixBuffer, true);
   if(CopyBuffer(g_trixHandle, 0, 1, 2, trixBuffer) < 2)
      return false;

   double curTrix  = trixBuffer[0];
   double prevTrix = trixBuffer[1];

   if(isBuyCheck)
   {
      if(curTrix <= 0.0) return false;
      if(Inp_TRIXSlopeFilter && curTrix <= prevTrix) return false;
      return true;
   }
   else
   {
      if(curTrix >= 0.0) return false;
      if(Inp_TRIXSlopeFilter && curTrix >= prevTrix) return false;
      return true;
   }
}

//+------------------------------------------------------------------+
//| คำนวณขนาด Lot ตามโหมดที่เลือก (รองรับ Capital-Scaled)              |
//+------------------------------------------------------------------+
double GetGridLot(double slPoints = 0.0)
{
   if(Inp_LotMode == LOT_MODE_CAPITAL_SCALED)
   {
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      if(Inp_BaseCapitalUSD <= 0.0) return g_trade.NormalizeLot(Inp_FixedLot);
      double rawLot = (balance / Inp_BaseCapitalUSD) * Inp_BaseLotPerCapital;
      return g_trade.NormalizeLot(rawLot);
   }
   else if(Inp_LotMode == LOT_MODE_RISK_PCT && Inp_UseOrderSL)
   {
      return g_trade.CalculateLotSizeFromRisk(Inp_RiskPctPerOrder, slPoints, Inp_FixedLot);
   }
   return g_trade.NormalizeLot(Inp_FixedLot);
}

//+------------------------------------------------------------------+
//| คำนวณเป้า Cashflow ที่อาจสเกลตามขนาดทุน                           |
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
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   g_initialBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   g_isHalted = false;

   g_risk.Init(Inp_MaxSpread, Inp_MaxDrawdownPct, Inp_MinMarginLevel);
   g_trade.Init(_Symbol, Inp_MagicNumber, Inp_BEPoints, Inp_BufferPoints, 0);

   if(!g_trend.Init(_Symbol, Inp_Timeframe, Inp_EntryBars, Inp_ExitBars, Inp_MAPeriod, Inp_MAMethod, Inp_ATRPeriod))
   {
      Print("[DavidDruzGrid] Error initializing TrendEngine indicators!");
      return INIT_FAILED;
   }

   // สร้าง Handle สำหรับ TRIX Indicator
   if(Inp_UseTRIXFilter)
   {
      g_trixHandle = iTriX(_Symbol, Inp_Timeframe, Inp_TRIXPeriod, PRICE_CLOSE);
      if(g_trixHandle == INVALID_HANDLE)
      {
         PrintFormat("[DavidDruzGrid] Error creating TRIX indicator handle on %s!", _Symbol);
         return INIT_FAILED;
      }
   }

   PrintFormat("[DavidDruzGrid] Initialized successfully on %s (%s). Balance: %.2f, Cashflow Target: $%.2f",
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
   PrintFormat("[DavidDruzGrid] Deinitialized. Reason: %d", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   if(g_isHalted) return;

   datetime now = TimeCurrent();

   // 0. ตรวจสอบขึ้นวันใหม่เพื่อรีเซ็ต Daily Trend Cuts Circuit Breaker
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
      Print("[DavidDruzGrid] 🚨 Max Portfolio Drawdown reached! Closing all grid positions and halting EA.");
      g_trade.CloseAllPositions();
      g_isHalted = true;
      ExpertRemove();
      return;
   }

   // 2. ระบบ Cashflow Harvesting ($50 - $100 เป้าหมายกระแสเงินสด)
   double cashflowTarget = GetCurrentCashflowTarget();
   if(Inp_HarvestMode == HARVEST_BASKET && cashflowTarget > 0.0)
   {
      double totalFloating = g_trade.GetTotalFloatingProfit();
      if(totalFloating >= cashflowTarget)
      {
         PrintFormat("[DavidDruzGrid] 💰 Cashflow Harvested (Basket)! Total Profit $%.2f >= Target $%.2f. Closing all positions.",
                     totalFloating, cashflowTarget);
         g_trade.CloseAllPositions();
         g_lastOrderTime = now;
         return;
      }
   }
   else if(Inp_HarvestMode == HARVEST_PER_ORDER && cashflowTarget > 0.0)
   {
      int totalPos = PositionsTotal();
      for(int i = totalPos - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)Inp_MagicNumber)
            {
               double pnl = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
               if(pnl >= cashflowTarget)
               {
                  PrintFormat("[DavidDruzGrid] 💰 Cashflow Harvested (Per-Order)! Ticket #%I64u reached $%.2f >= Target $%.2f",
                              ticket, pnl, cashflowTarget);
                  g_trade.ClosePositionByTicket(ticket);
                  g_lastOrderTime = now;
               }
            }
         }
      }
   }

   // 3. จัดการ Breakeven และ Trailing Stop ยกชุด (เฉพาะเมื่อเปิดใช้งาน SL รายไม้)
   double atrCurrent = g_trend.GetATR(1);
   if(Inp_UseOrderSL)
   {
      if(atrCurrent > 0.0 && Inp_ATRTrailMult > 0.0)
      {
         g_trade.ManageATRTrailing(atrCurrent, Inp_ATRTrailMult);
      }
      g_trade.ManageBreakevenAndTrailing();
   }

   // 4. ตรวจสอบการปิดกริดยกชุดเมื่อเทรนด์หมดแรง (Exit Check on Bar Close)
   bool isNewBar = IsNewBar();
   int openBuyCount  = g_trade.CountOpenPositions(POSITION_TYPE_BUY);
   int openSellCount = g_trade.CountOpenPositions(POSITION_TYPE_SELL);
   double point      = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   int digits        = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   if(isNewBar)
   {
      double closeArr[];
      ArraySetAsSeries(closeArr, true);
      double closePrice = 0.0;
      if(CopyClose(_Symbol, Inp_Timeframe, 1, 1, closeArr) > 0)
         closePrice = closeArr[0];

      double maVal = g_trend.GetMA(1);

      // A. ตรวจสอบปิดชุด BUY ทั้งหมดเมื่อเทรนด์กลับตัว (พร้อม ATR Buffer กรอง False Breakout)
      if(openBuyCount > 0)
      {
         bool exitBuy = false;
         if(Inp_ExitBars > 0 && g_trend.CheckBuyExitSignal())
         {
            PrintFormat("[DavidDruzGrid] Donchian Exit triggered for BUY Grid. Closing all %d positions.", openBuyCount);
            exitBuy = true;
         }
         else if(Inp_CloseOnMATrendExit && maVal > 0.0)
         {
            double exitBufferDist = (Inp_ExitATRBuffer > 0.0 && atrCurrent > 0.0) ? (atrCurrent * Inp_ExitATRBuffer) : 0.0;
            if(closePrice < (maVal - exitBufferDist))
            {
               PrintFormat("[DavidDruzGrid] 200 EMA Exit triggered for BUY Grid (Close %.5f < MA %.5f - Buf %.5f). Closing all %d positions.",
                           closePrice, maVal, exitBufferDist, openBuyCount);
               exitBuy = true;
            }
         }

         if(exitBuy)
         {
            g_trade.ClosePositionsByType(POSITION_TYPE_BUY);
            openBuyCount = 0;
            g_dailyCutsCount++;
            g_lastExitTime = now;
         }
      }

      // B. ตรวจสอบปิดชุด SELL ทั้งหมดเมื่อเทรนด์กลับตัว
      if(openSellCount > 0)
      {
         bool exitSell = false;
         if(Inp_ExitBars > 0 && g_trend.CheckSellExitSignal())
         {
            PrintFormat("[DavidDruzGrid] Donchian Exit triggered for SELL Grid. Closing all %d positions.", openSellCount);
            exitSell = true;
         }
         else if(Inp_CloseOnMATrendExit && maVal > 0.0)
         {
            double exitBufferDist = (Inp_ExitATRBuffer > 0.0 && atrCurrent > 0.0) ? (atrCurrent * Inp_ExitATRBuffer) : 0.0;
            if(closePrice > (maVal + exitBufferDist))
            {
               PrintFormat("[DavidDruzGrid] 200 EMA Exit triggered for SELL Grid (Close %.5f > MA %.5f + Buf %.5f). Closing all %d positions.",
                           closePrice, maVal, exitBufferDist, openSellCount);
               exitSell = true;
            }
         }

         if(exitSell)
         {
            g_trade.ClosePositionsByType(POSITION_TYPE_SELL);
            openSellCount = 0;
            g_dailyCutsCount++;
            g_lastExitTime = now;
         }
      }
   }

   // 5. ตรวจสอบความปลอดภัยก่อนพิจารณาเปิดไม้กริด
   if(!g_risk.IsSpreadOk(_Symbol)) return;
   if(!g_risk.IsMarginLevelOk()) return;
   if(now - g_lastOrderTime < 5) return; // Cooldown ป้องกันยิงรัวซ้ำ

   // Circuit Breaker ประจำวัน: พักรบทันทีถ้าโดนคัท Trend Exit เกินกำหนดในวันเดียว
   if(Inp_MaxDailyTrendCuts > 0 && g_dailyCutsCount >= Inp_MaxDailyTrendCuts)
      return;

   // แท่งพักรบหลังคัทลอส (Post-Exit Cooldown ป้องกันการรีบเข้าซ้ำในตลาด Choppy)
   if(Inp_ExitCooldownBars > 0 && g_lastExitTime > 0)
   {
      if((now - g_lastExitTime) < (Inp_ExitCooldownBars * PeriodSeconds(Inp_Timeframe)))
         return;
   }

   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double pipPoint   = g_trade.GetPipPoint();

   // คำนวณระยะ Grid Step ที่ต้องการ
   double gridDistance = (Inp_GridStepMode == GRID_STEP_POINTS) ? 
                         (Inp_GridStepPoints * pipPoint) : 
                         (atrCurrent * Inp_GridStepATRMult);

   // --- 6. จัดการกริดฝั่ง BUY (In-Trend BUY Grid) ---
   if(Inp_TradeDirection == TRADE_DIR_BOTH || Inp_TradeDirection == TRADE_DIR_BUY_ONLY)
   {
      if(openSellCount == 0)
      {
         // กรณีที่ 1: ไม้แรกของชุด BUY (ต้องมี Breakout แท้จริง + TRIX กรอง)
         if(openBuyCount == 0 && isNewBar)
         {
            if(g_trend.CheckBuySignal(Inp_UseMAFilter) && CheckTRIXSignal(true))
            {
               double initialSL = 0.0;
               double slPoints  = 0.0;
               if(Inp_UseOrderSL)
               {
                  double slDist = (atrCurrent > 0.0) ? (atrCurrent * Inp_ATRMultiplierSL) : (Inp_MinSLPoints * pipPoint);
                  if(slDist < Inp_MinSLPoints * pipPoint) slDist = Inp_MinSLPoints * pipPoint;
                  initialSL = NormalizeDouble(currentAsk - slDist, digits);
                  slPoints  = slDist / point;
               }

               double lot = GetGridLot(slPoints);

               if(g_trade.OpenBuy(lot, initialSL, 0.0, "DruzGrid_B1"))
               {
                  g_lastOrderTime = now;
                  PrintFormat("[DavidDruzGrid] Base BUY opened: Lot=%.2f, Price=%.5f, SL=%.5f", lot, currentAsk, initialSL);
               }
            }
         }
         // กรณีที่ 2: วางกริดไม้ถัดไปตามเทรนด์ (In-Trend Grid Addition)
         else if(openBuyCount > 0 && openBuyCount < Inp_MaxGridOrders && (!Inp_GridOnBarClose || isNewBar))
         {
            // ตรวจสอบเงื่อนไข Free-Roll (ถ้าไม่ใช้ SL รายไม้ ให้เปิดเพิ่มตามระยะกริดได้ทันที)
            if(!Inp_RequirePriorBE || !Inp_UseOrderSL || g_trade.ArePositionsSecured(POSITION_TYPE_BUY))
            {
               double highestBuy = g_trade.GetHighestBuyPrice();
               if(currentAsk >= highestBuy + gridDistance)
               {
                  double initialSL = 0.0;
                  double slPoints  = 0.0;
                  if(Inp_UseOrderSL)
                  {
                     double slDist = (atrCurrent > 0.0) ? (atrCurrent * Inp_ATRMultiplierSL) : (Inp_MinSLPoints * pipPoint);
                     if(slDist < Inp_MinSLPoints * pipPoint) slDist = Inp_MinSLPoints * pipPoint;
                     initialSL = NormalizeDouble(currentAsk - slDist, digits);
                     slPoints  = slDist / point;
                  }

                  double lot = GetGridLot(slPoints);

                  string comment = StringFormat("DruzGrid_B%d", openBuyCount + 1);
                  if(g_trade.OpenBuy(lot, initialSL, 0.0, comment))
                  {
                     g_lastOrderTime = now;
                     PrintFormat("[DavidDruzGrid] Grid BUY Level %d added: Lot=%.2f, Price=%.5f", openBuyCount + 1, lot, currentAsk);
                  }
               }
            }
         }
      }
   }

   // --- 7. จัดการกริดฝั่ง SELL (In-Trend SELL Grid) ---
   if(Inp_TradeDirection == TRADE_DIR_BOTH || Inp_TradeDirection == TRADE_DIR_SELL_ONLY)
   {
      if(openBuyCount == 0)
      {
         // กรณีที่ 1: ไม้แรกของชุด SELL (ต้องมี Breakout แท้จริง + TRIX กรอง)
         if(openSellCount == 0 && isNewBar)
         {
            if(g_trend.CheckSellSignal(Inp_UseMAFilter) && CheckTRIXSignal(false))
            {
               double initialSL = 0.0;
               double slPoints  = 0.0;
               if(Inp_UseOrderSL)
               {
                  double slDist = (atrCurrent > 0.0) ? (atrCurrent * Inp_ATRMultiplierSL) : (Inp_MinSLPoints * pipPoint);
                  if(slDist < Inp_MinSLPoints * pipPoint) slDist = Inp_MinSLPoints * pipPoint;
                  initialSL = NormalizeDouble(currentBid + slDist, digits);
                  slPoints  = slDist / point;
               }

               double lot = GetGridLot(slPoints);

               if(g_trade.OpenSell(lot, initialSL, 0.0, "DruzGrid_S1"))
               {
                  g_lastOrderTime = now;
                  PrintFormat("[DavidDruzGrid] Base SELL opened: Lot=%.2f, Price=%.5f, SL=%.5f", lot, currentBid, initialSL);
               }
            }
         }
         // กรณีที่ 2: วางกริดไม้ถัดไปตามเทรนด์ (In-Trend Grid Addition)
         else if(openSellCount > 0 && openSellCount < Inp_MaxGridOrders && (!Inp_GridOnBarClose || isNewBar))
         {
            // ตรวจสอบเงื่อนไข Free-Roll (ถ้าไม่ใช้ SL รายไม้ ให้เปิดเพิ่มตามระยะกริดได้ทันที)
            if(!Inp_RequirePriorBE || !Inp_UseOrderSL || g_trade.ArePositionsSecured(POSITION_TYPE_SELL))
            {
               double lowestSell = g_trade.GetLowestSellPrice();
               if(currentBid <= lowestSell - gridDistance)
               {
                  double initialSL = 0.0;
                  double slPoints  = 0.0;
                  if(Inp_UseOrderSL)
                  {
                     double slDist = (atrCurrent > 0.0) ? (atrCurrent * Inp_ATRMultiplierSL) : (Inp_MinSLPoints * pipPoint);
                     if(slDist < Inp_MinSLPoints * pipPoint) slDist = Inp_MinSLPoints * pipPoint;
                     initialSL = NormalizeDouble(currentBid + slDist, digits);
                     slPoints  = slDist / point;
                  }

                  double lot = GetGridLot(slPoints);

                  string comment = StringFormat("DruzGrid_S%d", openSellCount + 1);
                  if(g_trade.OpenSell(lot, initialSL, 0.0, comment))
                  {
                     g_lastOrderTime = now;
                     PrintFormat("[DavidDruzGrid] Grid SELL Level %d added: Lot=%.2f, Price=%.5f", openSellCount + 1, lot, currentBid);
                  }
               }
            }
         }
      }
   }
}
//+------------------------------------------------------------------+
