//+------------------------------------------------------------------+
//|                                           DavidDruzTrendEA.mq5   |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                             https://github.com/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/"
#property version   "1.00"
#property description "David Druz Long-Term Systematic Trend Following EA (Tactical Investment Management Model)"

#include "Include/RiskManager.mqh"
#include "Include/TradeManager.mqh"
#include "Include/TrendEngine.mqh"

enum ENUM_LOT_MODE
{
   LOT_MODE_RISK_PCT, // คำนวณ Lot อัตโนมัติจาก % ความเสี่ยง (สไตล์ David Druz)
   LOT_MODE_FIXED     // ใช้ Fixed Lot ตามที่กำหนด
};

enum ENUM_TRADE_DIRECTION
{
   TRADE_DIR_BOTH,    // เทรดทั้งขาขึ้น (BUY) และขาลง (SELL)
   TRADE_DIR_BUY_ONLY,// เทรดเฉพาะขาขึ้น (BUY เท่านั้น)
   TRADE_DIR_SELL_ONLY// เทรดเฉพาะขาลง (SELL เท่านั้น)
};

enum ENUM_EXIT_MODE
{
   EXIT_DONCHIAN_CHANNEL, // ออกเมื่อราคาหลุด Donchian Exit Channel (N แท่งขั้วตรงข้าม)
   EXIT_ATR_TRAILING,     // ออกด้วย Chandelier / ATR Trailing Stop
   EXIT_HYBRID            // ออกด้วย Donchian หรือ ATR Trailing (ตัวใดถึงก่อน)
};

//--- INPUT PARAMETERS ---
sinput group "=== 1. กลยุทธ์การเทรดตามเทรนด์ (Trend Following Strategy) ==="
input ENUM_TRADE_DIRECTION Inp_TradeDirection    = TRADE_DIR_BOTH;        // ทิศทางการเทรด
input ENUM_TIMEFRAMES      Inp_Timeframe         = PERIOD_H4;             // Timeframe สำหรับวิเคราะห์แนวโน้ม
input int                  Inp_EntryBars         = 20;                    // Donchian Breakout Period เข้าออเดอร์ (แท่ง)
input int                  Inp_ExitBars          = 10;                    // Donchian Exit Period ปิดออเดอร์ (แท่ง)

sinput group "=== 2. ตัวกรองทิศทางแนวโน้มหลัก (Trend Filter) ==="
input bool                 Inp_UseMAFilter       = true;                  // เปิดใช้งานตัวกรอง Moving Average
input int                  Inp_MAPeriod          = 200;                   // คาบ Moving Average หลัก (เช่น 200 EMA)
input ENUM_MA_METHOD       Inp_MAMethod          = MODE_EMA;              // ประเภท Moving Average (EMA/SMA)
input bool                 Inp_CloseOnMATrendExit= true;                  // ปิดออเดอร์ทันทีหากราคาปิดข้ามกลับเส้น MA

sinput group "=== 3. การบริหารเงินทุนแบบ David Druz (0.5% Rule Money Management) ==="
input ENUM_LOT_MODE        Inp_LotMode           = LOT_MODE_RISK_PCT;     // โหมดการคำนวณ Lot Size
input double               Inp_RiskPct           = 0.5;                   // เปอร์เซ็นต์ความเสี่ยงต่อไม้ (แนะนำ 0.5% ของ Equity)
input double               Inp_FixedLot          = 0.01;                  // ขนาด Lot ในกรณีเลือก Fixed Lot
input int                  Inp_ATRPeriod         = 14;                    // คาบ Average True Range (ATR)
input double               Inp_ATRMultiplierSL   = 3.0;                   // ตัวคูณ ATR สำหรับกำหนดระยะ Initial Stop Loss
input int                  Inp_MinSLPoints       = 100;                   // ระยะ Stop Loss ขั้นต่ำ (Points) ป้องกันค่าต่ำเกินไป

sinput group "=== 4. การล็อกกำไร & การออกจากเทรนด์ (Exit & Trailing) ==="
input ENUM_EXIT_MODE       Inp_ExitMode          = EXIT_HYBRID;           // รูปแบบการออกจากเทรนด์
input double               Inp_ATRTrailMult      = 3.0;                   // ตัวคูณ ATR สำหรับ Chandelier Trailing Stop
input int                  Inp_BEPoints          = 0;                     // ระยะกำไรล็อก Breakeven (0 = ปิด)
input int                  Inp_BufferPoints      = 20;                    // กำไรกันชนหน้าทุน (Points)

sinput group "=== 5. การเพิ่มไม้ตามเทรนด์ (Pyramiding / Scale-In) ==="
input bool                 Inp_AllowPyramiding   = false;                 // อนุญาตให้เปิดไม้เพิ่มตามเทรนด์ (Pyramiding)
input int                  Inp_MaxPositions      = 3;                     // จำนวนไม้สูงสุดในทิศทางเดียวกัน
input bool                 Inp_RequireSecured    = true;                  // ต้องล็อก Breakeven ไม้ก่อนหน้าก่อนเปิดไม้ใหม่

sinput group "=== 6. การควบคุมความปลอดภัยของพอร์ต (Safety & Protection) ==="
input int                  Inp_MaxSpread         = 500;                   // Spread สูงสุดที่ยอมให้เปิดออเดอร์ (Points)
input double               Inp_MinMarginLevel    = 300.0;                 // Margin Level ขั้นต่ำ (%)
input double               Inp_MaxDrawdownPct    = 30.0;                  // Max Drawdown Cut ฉุกเฉิน (%)
input ulong                Inp_MagicNumber       = 88829000;              // Magic Number ประจำตัว EA

//--- GLOBAL INSTANCES ---
CRiskManager   g_risk;
CTradeManager  g_trade;
CTrendEngine   g_trend;
datetime       g_lastBarTime = 0;
double         g_initialBalance = 0.0;

//+------------------------------------------------------------------+
//| ตรวจสอบว่ามีแท่งเทียนแท่งใหม่เกิดขึ้นหรือไม่ (Bar Close Detection)     |
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
      Print("[DavidDruzEA] Error initializing TrendEngine indicators!");
      return INIT_FAILED;
   }

   PrintFormat("[DavidDruzEA] Initialized successfully on %s (%s). Balance: %.2f, Risk: %.2f%%",
               _Symbol, EnumToString(Inp_Timeframe), g_initialBalance, Inp_RiskPct);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   g_trend.Release();
   PrintFormat("[DavidDruzEA] Deinitialized. Reason: %d", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // 1. ตรวจสอบความปลอดภัยฉุกเฉิน (Drawdown Cut Protection)
   if(g_risk.IsDrawdownExceeded(g_initialBalance))
   {
      Print("[DavidDruzEA] Max Drawdown reached! Closing all orders to protect capital.");
      g_trade.CloseAllPositions();
      return;
   }

   // 2. จัดการ Breakeven และ ATR Trailing Stop (Chandelier Exit) ทุก Tick
   double atrCurrent = g_trend.GetATR(1);
   if(Inp_ExitMode == EXIT_ATR_TRAILING || Inp_ExitMode == EXIT_HYBRID)
   {
      if(atrCurrent > 0.0 && Inp_ATRTrailMult > 0.0)
      {
         g_trade.ManageATRTrailing(atrCurrent, Inp_ATRTrailMult);
      }
   }
   g_trade.ManageBreakevenAndTrailing();

   // 3. ตรวจสอบเงื่อนไขการเข้าและออกเฉพาะเมื่อจบแท่งเทียน (New Bar Only)
   // เพื่อป้องกันสัญญาณหลอก (False Breakout Whipsaw) ตามหลัก Robust Systematic Trading
   if(!IsNewBar())
      return;

   // ตรวจสอบค่า Spread และ Margin ก่อนวิเคราะห์สัญญาณใหม่
   if(!g_risk.IsSpreadOk(_Symbol))
      return;

   int openBuyCount  = g_trade.CountOpenPositions(POSITION_TYPE_BUY);
   int openSellCount = g_trade.CountOpenPositions(POSITION_TYPE_SELL);
   double point      = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   int digits        = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double closePrice = 0.0;

   double closeArr[];
   ArraySetAsSeries(closeArr, true);
   if(CopyClose(_Symbol, Inp_Timeframe, 1, 1, closeArr) > 0)
      closePrice = closeArr[0];

   double maVal = g_trend.GetMA(1);

   // --- A. จัดการปิดออเดอร์เมื่อเทรนด์หมดแรง (Exit Signals) ---
   if(openBuyCount > 0)
   {
      bool exitBuy = false;
      // กรองการออกด้วย Donchian Exit
      if(Inp_ExitMode == EXIT_DONCHIAN_CHANNEL || Inp_ExitMode == EXIT_HYBRID)
      {
         if(g_trend.CheckBuyExitSignal())
         {
            PrintFormat("[DavidDruzEA] Buy Exit signal triggered! Close price %.5f broke below Exit Donchian Low", closePrice);
            exitBuy = true;
         }
      }
      // กรองการออกด้วยเส้น Moving Average
      if(Inp_CloseOnMATrendExit && maVal > 0.0 && closePrice < maVal)
      {
         PrintFormat("[DavidDruzEA] Buy Exit signal triggered! Close price %.5f dropped below 200 EMA (%.5f)", closePrice, maVal);
         exitBuy = true;
      }

      if(exitBuy)
      {
         g_trade.ClosePositionsByType(POSITION_TYPE_BUY);
         openBuyCount = 0;
      }
   }

   if(openSellCount > 0)
   {
      bool exitSell = false;
      // กรองการออกด้วย Donchian Exit
      if(Inp_ExitMode == EXIT_DONCHIAN_CHANNEL || Inp_ExitMode == EXIT_HYBRID)
      {
         if(g_trend.CheckSellExitSignal())
         {
            PrintFormat("[DavidDruzEA] Sell Exit signal triggered! Close price %.5f broke above Exit Donchian High", closePrice);
            exitSell = true;
         }
      }
      // กรองการออกด้วยเส้น Moving Average
      if(Inp_CloseOnMATrendExit && maVal > 0.0 && closePrice > maVal)
      {
         PrintFormat("[DavidDruzEA] Sell Exit signal triggered! Close price %.5f crossed above 200 EMA (%.5f)", closePrice, maVal);
         exitSell = true;
      }

      if(exitSell)
      {
         g_trade.ClosePositionsByType(POSITION_TYPE_SELL);
         openSellCount = 0;
      }
   }

   // ตรวจสอบระดับ Margin ก่อนเข้า Order ใหม่
   if(!g_risk.IsMarginLevelOk())
      return;

   // --- B. ตรวจสอบสัญญาณเข้า BUY (Buy Strength) ---
   if(Inp_TradeDirection == TRADE_DIR_BOTH || Inp_TradeDirection == TRADE_DIR_BUY_ONLY)
   {
      if(g_trend.CheckBuySignal(Inp_UseMAFilter))
      {
         bool canOpenBuy = false;
         if(openBuyCount == 0 && openSellCount == 0)
         {
            canOpenBuy = true;
         }
         else if(Inp_AllowPyramiding && openBuyCount < Inp_MaxPositions && openSellCount == 0)
         {
            if(!Inp_RequireSecured || g_trade.ArePositionsSecured(POSITION_TYPE_BUY))
            {
               double highestBuy = g_trade.GetHighestBuyPrice();
               double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
               if(ask > highestBuy) // ต้องทำ New High เพื่อเพิ่มไม้ตามเทรนด์
                  canOpenBuy = true;
            }
         }

         if(canOpenBuy)
         {
            double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
            double atrVal = g_trend.GetATR(1);
            double slDistance = (atrVal > 0.0) ? (atrVal * Inp_ATRMultiplierSL) : (Inp_MinSLPoints * point);
            if(slDistance < Inp_MinSLPoints * point)
               slDistance = Inp_MinSLPoints * point;

            double initialSL = NormalizeDouble(ask - slDistance, digits);
            double slPoints = slDistance / point;

            double lot = Inp_FixedLot;
            if(Inp_LotMode == LOT_MODE_RISK_PCT)
               lot = g_trade.CalculateLotSizeFromRisk(Inp_RiskPct, slPoints, Inp_FixedLot);

            string comment = StringFormat("DavidDruz_B%d", openBuyCount + 1);
            if(g_trade.OpenBuy(lot, initialSL, 0.0, comment))
            {
               PrintFormat("[DavidDruzEA] Buy order executed: Lot=%.2f, Price=%.5f, SL=%.5f (Risk: %.2f%%)",
                           lot, ask, initialSL, Inp_RiskPct);
            }
         }
      }
   }

   // --- C. ตรวจสอบสัญญาณเข้า SELL (Sell Weakness) ---
   if(Inp_TradeDirection == TRADE_DIR_BOTH || Inp_TradeDirection == TRADE_DIR_SELL_ONLY)
   {
      if(g_trend.CheckSellSignal(Inp_UseMAFilter))
      {
         bool canOpenSell = false;
         if(openSellCount == 0 && openBuyCount == 0)
         {
            canOpenSell = true;
         }
         else if(Inp_AllowPyramiding && openSellCount < Inp_MaxPositions && openBuyCount == 0)
         {
            if(!Inp_RequireSecured || g_trade.ArePositionsSecured(POSITION_TYPE_SELL))
            {
               double lowestSell = g_trade.GetLowestSellPrice();
               double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
               if(bid < lowestSell) // ต้องทำ New Low เพื่อเพิ่มไม้ตามเทรนด์
                  canOpenSell = true;
            }
         }

         if(canOpenSell)
         {
            double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
            double atrVal = g_trend.GetATR(1);
            double slDistance = (atrVal > 0.0) ? (atrVal * Inp_ATRMultiplierSL) : (Inp_MinSLPoints * point);
            if(slDistance < Inp_MinSLPoints * point)
               slDistance = Inp_MinSLPoints * point;

            double initialSL = NormalizeDouble(bid + slDistance, digits);
            double slPoints = slDistance / point;

            double lot = Inp_FixedLot;
            if(Inp_LotMode == LOT_MODE_RISK_PCT)
               lot = g_trade.CalculateLotSizeFromRisk(Inp_RiskPct, slPoints, Inp_FixedLot);

            string comment = StringFormat("DavidDruz_S%d", openSellCount + 1);
            if(g_trade.OpenSell(lot, initialSL, 0.0, comment))
            {
               PrintFormat("[DavidDruzEA] Sell order executed: Lot=%.2f, Price=%.5f, SL=%.5f (Risk: %.2f%%)",
                           lot, bid, initialSL, Inp_RiskPct);
            }
         }
      }
   }
}
//+------------------------------------------------------------------+
