//+------------------------------------------------------------------+
//|                                             DavidDruzGridEA.mq5  |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                             https://github.com/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/"
#property version   "1.00"
#property description "David Druz Trend-Following Grid EA (Beta Plan: Mid Risk / Aggressive In-Trend Scaling)"

#include "Include/RiskManager.mqh"
#include "Include/TradeManager.mqh"
#include "Include/TrendEngine.mqh"

enum ENUM_LOT_MODE
{
   LOT_MODE_RISK_PCT, // คำนวณ Lot อัตโนมัติจาก % ความเสี่ยงต่อไม้
   LOT_MODE_FIXED     // ใช้ Fixed Lot ต่อไม้
};

enum ENUM_TRADE_DIRECTION
{
   TRADE_DIR_BOTH,    // เทรดทั้งขาขึ้น (BUY Grid) และขาลง (SELL Grid)
   TRADE_DIR_BUY_ONLY,// เทรดเฉพาะขาขึ้น (BUY Grid เท่านั้น)
   TRADE_DIR_SELL_ONLY// เทรดเฉพาะขาลง (SELL Grid เท่านั้น)
};

enum ENUM_GRID_STEP_MODE
{
   GRID_STEP_POINTS,  // วางระยะกริดคงที่เป็น Points (เช่น ทุกๆ 400 Points)
   GRID_STEP_ATR      // วางระยะกริดแบบ Dynamic ตามค่าความผันผวน ATR
};

//--- INPUT PARAMETERS ---
sinput group "=== 1. กลยุทธ์เทรนด์หลัก (Trend Following Foundation) ==="
input ENUM_TRADE_DIRECTION Inp_TradeDirection    = TRADE_DIR_BOTH;        // ทิศทางการเทรด
input ENUM_TIMEFRAMES      Inp_Timeframe         = PERIOD_H4;             // Timeframe วิเคราะห์แนวโน้ม
input int                  Inp_EntryBars         = 20;                    // Donchian Breakout Period ไม้แรก (แท่ง)
input int                  Inp_ExitBars          = 10;                    // Donchian Exit Period ปิดยกชุด (แท่ง)
input bool                 Inp_UseMAFilter       = true;                  // กรองด้วยเส้น Moving Average
input int                  Inp_MAPeriod          = 200;                   // คาบ Moving Average หลัก (200 EMA)
input ENUM_MA_METHOD       Inp_MAMethod          = MODE_EMA;              // ประเภท Moving Average
input bool                 Inp_CloseOnMATrendExit= true;                  // ปิดกริดยกชุดเมื่อราคาปิดข้ามกลับเส้น 200 EMA

sinput group "=== 2. ระบบกริดตามเทรนด์ (In-Trend Grid / Pyramiding) ==="
input int                  Inp_MaxGridOrders     = 4;                     // จำนวนไม้กริดสะสมสูงสุด (เช่น 3 - 5 ไม้)
input ENUM_GRID_STEP_MODE  Inp_GridStepMode      = GRID_STEP_POINTS;      // รูปแบบระยะห่างแต่ละชั้นกริด
input int                  Inp_GridStepPoints    = 400;                   // ระยะกริดคงที่ (Points) เมื่อเลือกแบบ Points
input double               Inp_GridStepATRMult   = 1.0;                   // ตัวคูณ ATR เมื่อเลือกแบบ Dynamic ATR Step
input bool                 Inp_RequirePriorBE    = true;                  // บังคับล็อก Breakeven ไม้ก่อนหน้าก่อนเปิดกริดถัดไป (Free-Roll)

sinput group "=== 3. การบริหารเงินทุน (Money Management) ==="
input ENUM_LOT_MODE        Inp_LotMode           = LOT_MODE_RISK_PCT;     // โหมดคำนวณ Lot Size
input double               Inp_RiskPctPerOrder   = 0.4;                   // เปอร์เซ็นต์ความเสี่ยงต่อไม้ (แนะนำ 0.3% - 0.5%)
input double               Inp_FixedLot          = 0.01;                  // ขนาด Lot กรณีเลือก Fixed Lot
input int                  Inp_ATRPeriod         = 14;                    // คาบ ATR
input double               Inp_ATRMultiplierSL   = 3.0;                   // ตัวคูณ ATR สำหรับ Initial Stop Loss ของแต่ละไม้
input int                  Inp_MinSLPoints       = 150;                   // ระยะ Stop Loss ขั้นต่ำ (Points)

sinput group "=== 4. การปิดกำไรและ Trailing Stop ยกชุด (Basket Exit) ==="
input double               Inp_ATRTrailMult      = 2.8;                   // ตัวคูณ ATR สำหรับ Chandelier Trailing Stop ยกชุด
input int                  Inp_BEPoints          = 250;                   // ระยะกำไรเพื่อดึง SL บังหน้าทุน (Points)
input int                  Inp_BufferPoints      = 30;                    // กำไรกันชนหน้าทุน (Points)

sinput group "=== 5. ระบบความปลอดภัยของพอร์ต (Safety & Protection) ==="
input int                  Inp_MaxSpread         = 500;                   // Spread สูงสุดที่ยอมให้เปิดออเดอร์ (Points)
input double               Inp_MinMarginLevel    = 300.0;                 // Margin Level ขั้นต่ำ (%)
input double               Inp_MaxDrawdownPct    = 35.0;                  // Max Drawdown Cut ฉุกเฉิน (%)
input ulong                Inp_MagicNumber       = 88829100;              // Magic Number ประจำตัว Grid EA

//--- GLOBAL INSTANCES ---
CRiskManager   g_risk;
CTradeManager  g_trade;
CTrendEngine   g_trend;
datetime       g_lastBarTime = 0;
datetime       g_lastOrderTime = 0;
double         g_initialBalance = 0.0;

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
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   g_initialBalance = AccountInfoDouble(ACCOUNT_BALANCE);

   g_risk.Init(Inp_MaxSpread, Inp_MaxDrawdownPct, Inp_MinMarginLevel);
   g_trade.Init(_Symbol, Inp_MagicNumber, Inp_BEPoints, Inp_BufferPoints, 0);

   if(!g_trend.Init(_Symbol, Inp_Timeframe, Inp_EntryBars, Inp_ExitBars, Inp_MAPeriod, Inp_MAMethod, Inp_ATRPeriod))
   {
      Print("[DavidDruzGrid] Error initializing TrendEngine indicators!");
      return INIT_FAILED;
   }

   PrintFormat("[DavidDruzGrid] Initialized successfully on %s (%s). Balance: %.2f, MaxGrid: %d",
               _Symbol, EnumToString(Inp_Timeframe), g_initialBalance, Inp_MaxGridOrders);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   g_trend.Release();
   PrintFormat("[DavidDruzGrid] Deinitialized. Reason: %d", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // 1. ตรวจสอบเงื่อนไขฉุกเฉินระดับพอร์ต (Drawdown Cut)
   if(g_risk.IsDrawdownExceeded(g_initialBalance))
   {
      Print("[DavidDruzGrid] Max Drawdown reached! Closing all grid positions to protect capital.");
      g_trade.CloseAllPositions();
      return;
   }

   // 2. จัดการ Breakeven และ Trailing Stop ยกชุด (Chandelier Trailing) ทุกๆ Tick
   double atrCurrent = g_trend.GetATR(1);
   if(atrCurrent > 0.0 && Inp_ATRTrailMult > 0.0)
   {
      g_trade.ManageATRTrailing(atrCurrent, Inp_ATRTrailMult);
   }
   g_trade.ManageBreakevenAndTrailing();

   // 3. ตรวจสอบการปิดกริดยกชุดเมื่อเทรนด์หมดแรง (Exit Check on Bar Close)
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

      // A. ตรวจสอบปิดชุด BUY ทั้งหมด
      if(openBuyCount > 0)
      {
         bool exitBuy = false;
         if(g_trend.CheckBuyExitSignal())
         {
            PrintFormat("[DavidDruzGrid] Donchian Exit triggered for BUY Grid. Closing all %d positions.", openBuyCount);
            exitBuy = true;
         }
         else if(Inp_CloseOnMATrendExit && maVal > 0.0 && closePrice < maVal)
         {
            PrintFormat("[DavidDruzGrid] 200 EMA Exit triggered for BUY Grid (Close %.5f < MA %.5f). Closing all %d positions.",
                        closePrice, maVal, openBuyCount);
            exitBuy = true;
         }

         if(exitBuy)
         {
            g_trade.ClosePositionsByType(POSITION_TYPE_BUY);
            openBuyCount = 0;
         }
      }

      // B. ตรวจสอบปิดชุด SELL ทั้งหมด
      if(openSellCount > 0)
      {
         bool exitSell = false;
         if(g_trend.CheckSellExitSignal())
         {
            PrintFormat("[DavidDruzGrid] Donchian Exit triggered for SELL Grid. Closing all %d positions.", openSellCount);
            exitSell = true;
         }
         else if(Inp_CloseOnMATrendExit && maVal > 0.0 && closePrice > maVal)
         {
            PrintFormat("[DavidDruzGrid] 200 EMA Exit triggered for SELL Grid (Close %.5f > MA %.5f). Closing all %d positions.",
                        closePrice, maVal, openSellCount);
            exitSell = true;
         }

         if(exitSell)
         {
            g_trade.ClosePositionsByType(POSITION_TYPE_SELL);
            openSellCount = 0;
         }
      }
   }

   // 4. ตรวจสอบความปลอดภัยก่อนพิจารณาเปิดไม้กริด
   if(!g_risk.IsSpreadOk(_Symbol)) return;
   if(!g_risk.IsMarginLevelOk()) return;

   datetime now = TimeCurrent();
   if(now - g_lastOrderTime < 5) return; // Cooldown ป้องกันยิงรัวซ้ำ

   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   // คำนวณระยะ Grid Step ที่ต้องการ
   double gridDistance = (Inp_GridStepMode == GRID_STEP_POINTS) ? 
                         (Inp_GridStepPoints * point) : 
                         (atrCurrent * Inp_GridStepATRMult);

   // --- 5. จัดการกริดฝั่ง BUY (In-Trend BUY Grid) ---
   if(Inp_TradeDirection == TRADE_DIR_BOTH || Inp_TradeDirection == TRADE_DIR_BUY_ONLY)
   {
      if(openSellCount == 0)
      {
         // กรณีที่ 1: ไม้แรกของชุด BUY (ต้องมี Breakout แท้จริงเมื่อจบแท่ง)
         if(openBuyCount == 0 && isNewBar)
         {
            if(g_trend.CheckBuySignal(Inp_UseMAFilter))
            {
               double slDist = (atrCurrent > 0.0) ? (atrCurrent * Inp_ATRMultiplierSL) : (Inp_MinSLPoints * point);
               if(slDist < Inp_MinSLPoints * point) slDist = Inp_MinSLPoints * point;

               double initialSL = NormalizeDouble(currentAsk - slDist, digits);
               double slPoints  = slDist / point;

               double lot = Inp_FixedLot;
               if(Inp_LotMode == LOT_MODE_RISK_PCT)
                  lot = g_trade.CalculateLotSizeFromRisk(Inp_RiskPctPerOrder, slPoints, Inp_FixedLot);

               if(g_trade.OpenBuy(lot, initialSL, 0.0, "DruzGrid_B1"))
               {
                  g_lastOrderTime = now;
                  PrintFormat("[DavidDruzGrid] Base BUY opened: Lot=%.2f, Price=%.5f, SL=%.5f", lot, currentAsk, initialSL);
               }
            }
         }
         // กรณีที่ 2: วางกริดไม้ถัดไปตามเทรนด์ (In-Trend Grid Addition)
         else if(openBuyCount > 0 && openBuyCount < Inp_MaxGridOrders)
         {
            // ตรวจสอบเงื่อนไข Free-Roll (ไม้ก่อนหน้าต้องล็อก BE แล้ว)
            if(!Inp_RequirePriorBE || g_trade.ArePositionsSecured(POSITION_TYPE_BUY))
            {
               double highestBuy = g_trade.GetHighestBuyPrice();
               if(currentAsk >= highestBuy + gridDistance)
               {
                  double slDist = (atrCurrent > 0.0) ? (atrCurrent * Inp_ATRMultiplierSL) : (Inp_MinSLPoints * point);
                  if(slDist < Inp_MinSLPoints * point) slDist = Inp_MinSLPoints * point;

                  double initialSL = NormalizeDouble(currentAsk - slDist, digits);
                  double slPoints  = slDist / point;

                  double lot = Inp_FixedLot;
                  if(Inp_LotMode == LOT_MODE_RISK_PCT)
                     lot = g_trade.CalculateLotSizeFromRisk(Inp_RiskPctPerOrder, slPoints, Inp_FixedLot);

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

   // --- 6. จัดการกริดฝั่ง SELL (In-Trend SELL Grid) ---
   if(Inp_TradeDirection == TRADE_DIR_BOTH || Inp_TradeDirection == TRADE_DIR_SELL_ONLY)
   {
      if(openBuyCount == 0)
      {
         // กรณีที่ 1: ไม้แรกของชุด SELL (ต้องมี Breakout แท้จริงเมื่อจบแท่ง)
         if(openSellCount == 0 && isNewBar)
         {
            if(g_trend.CheckSellSignal(Inp_UseMAFilter))
            {
               double slDist = (atrCurrent > 0.0) ? (atrCurrent * Inp_ATRMultiplierSL) : (Inp_MinSLPoints * point);
               if(slDist < Inp_MinSLPoints * point) slDist = Inp_MinSLPoints * point;

               double initialSL = NormalizeDouble(currentBid + slDist, digits);
               double slPoints  = slDist / point;

               double lot = Inp_FixedLot;
               if(Inp_LotMode == LOT_MODE_RISK_PCT)
                  lot = g_trade.CalculateLotSizeFromRisk(Inp_RiskPctPerOrder, slPoints, Inp_FixedLot);

               if(g_trade.OpenSell(lot, initialSL, 0.0, "DruzGrid_S1"))
               {
                  g_lastOrderTime = now;
                  PrintFormat("[DavidDruzGrid] Base SELL opened: Lot=%.2f, Price=%.5f, SL=%.5f", lot, currentBid, initialSL);
               }
            }
         }
         // กรณีที่ 2: วางกริดไม้ถัดไปตามเทรนด์ (In-Trend Grid Addition)
         else if(openSellCount > 0 && openSellCount < Inp_MaxGridOrders)
         {
            // ตรวจสอบเงื่อนไข Free-Roll (ไม้ก่อนหน้าต้องล็อก BE แล้ว)
            if(!Inp_RequirePriorBE || g_trade.ArePositionsSecured(POSITION_TYPE_SELL))
            {
               double lowestSell = g_trade.GetLowestSellPrice();
               if(currentBid <= lowestSell - gridDistance)
               {
                  double slDist = (atrCurrent > 0.0) ? (atrCurrent * Inp_ATRMultiplierSL) : (Inp_MinSLPoints * point);
                  if(slDist < Inp_MinSLPoints * point) slDist = Inp_MinSLPoints * point;

                  double initialSL = NormalizeDouble(currentBid + slDist, digits);
                  double slPoints  = slDist / point;

                  double lot = Inp_FixedLot;
                  if(Inp_LotMode == LOT_MODE_RISK_PCT)
                     lot = g_trade.CalculateLotSizeFromRisk(Inp_RiskPctPerOrder, slPoints, Inp_FixedLot);

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
