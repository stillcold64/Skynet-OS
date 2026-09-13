//+------------------------------------------------------------------+
//|                                              DCASnowballEA.mq5   |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                             https://github.com/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/"
#property version   "1.00"
#property description "DCA Snowball (Pyramiding + Free-Roll Margin) Expert Advisor"

#include "Include/RiskManager.mqh"
#include "Include/TradeManager.mqh"

enum ENUM_ENTRY_MODE
{
   ENTRY_PRICE_STEP, // เปิดเมื่อราคาวิ่งทำระดับใหม่ (Price Step)
   ENTRY_BAR_CLOSE   // เปิดตามรอบแท่งเทียน (เมื่อเริ่มแท่งเทียนใหม่เหนือ MA)
};

//--- INPUT PARAMETERS ---
sinput group "=== กลยุทธ์การเข้าออเดอร์ (Entry & Snowball) ==="
input ENUM_ENTRY_MODE   Inp_EntryMode        = ENTRY_PRICE_STEP; // รูปแบบการสโนว์บอล
input double            Inp_LotSize          = 0.01;             // ขนาด Lot (เช่น 0.01 สำหรับ Cent)
input int               Inp_StepPoints       = 300;              // ระยะห่างราคาเพื่อเปิดไม้ถัดไป (Points)
input int               Inp_MaxPositions     = 10;               // จำนวนไม้สูงสุดที่อนุญาตให้เปิดสะสม
input bool              Inp_RequireSecured   = true;             // ต้องล็อก Breakeven ไม้ก่อนหน้าจึงจะเปิดไม้ใหม่ได้

sinput group "=== การกรองเทรนด์ (Trend Filter) ==="
input ENUM_TIMEFRAMES   Inp_MATimeframe      = PERIOD_H4;        // Timeframe สำหรับ Moving Average
input int               Inp_MAPeriod         = 50;               // คาบ Moving Average
input ENUM_MA_METHOD    Inp_MAMethod         = MODE_EMA;         // ประเภท MA (EMA/SMA)
input bool              Inp_CloseOnTrendExit = true;             // ปิดทุกไม้ทันทีหากราคาหลุดต่ำกว่า MA

sinput group "=== การล็อกกำไร & ความปลอดภัย (Protection & BE) ==="
input int               Inp_InitialSLPoints  = 500;              // Stop Loss เริ่มต้นต่อไม้ (0 = ไม่ใช้)
input int               Inp_BEPoints         = 200;              // ระยะกำไรเพื่อดึง SL บังหน้าทุน (Points)
input int               Inp_BufferPoints     = 20;               // กำไรกันชนหน้าทุน (Points)
input int               Inp_TrailingPoints   = 0;                // Trailing Stop (0 = ปิด)
input double            Inp_TrimProfitTarget = 50.0;             // ปิดทำกำไรไม้บน/ล่างเมื่อกำไรพอร์ตแตะระดับ ($)

sinput group "=== การควบคุมความเสี่ยง (Risk Control) ==="
input int               Inp_MaxSpread        = 500;              // Spread สูงสุดที่ยอมให้เปิดออเดอร์ (Points)
input double            Inp_MinMarginLevel   = 300.0;            // Margin Level ขั้นต่ำ (%)
input double            Inp_MaxDrawdownPct   = 50.0;             // Max Drawdown Cut (%)
input ulong             Inp_MagicNumber      = 88827000;         // Magic Number ประจำตัว EA

//--- GLOBAL VARIABLES ---
CRiskManager   g_risk;
CTradeManager  g_trade;
int            g_maHandle = INVALID_HANDLE;
datetime       g_lastBarTime = 0;
double         g_initialBalance = 0.0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   g_initialBalance = AccountInfoDouble(ACCOUNT_BALANCE);

   g_risk.Init(Inp_MaxSpread, Inp_MaxDrawdownPct, Inp_MinMarginLevel);
   g_trade.Init(_Symbol, Inp_MagicNumber, Inp_BEPoints, Inp_BufferPoints, Inp_TrailingPoints);

   // สร้าง Handle สำหรับ Moving Average
   g_maHandle = iMA(_Symbol, Inp_MATimeframe, Inp_MAPeriod, 0, Inp_MAMethod, PRICE_CLOSE);
   if(g_maHandle == INVALID_HANDLE)
   {
      Print("[DCASnowball] Error creating MA indicator handle!");
      return INIT_FAILED;
   }

   PrintFormat("[DCASnowball] Initialized successfully on %s. Balance: %.2f", _Symbol, g_initialBalance);
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(g_maHandle != INVALID_HANDLE)
   {
      IndicatorRelease(g_maHandle);
      g_maHandle = INVALID_HANDLE;
   }
   PrintFormat("[DCASnowball] Deinitialized. Reason: %d", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // 1. ตรวจสอบเงื่อนไขฉุกเฉิน / Drawdown Cut
   if(g_risk.IsDrawdownExceeded(g_initialBalance))
   {
      Print("[DCASnowball] Max Drawdown reached! Closing all orders to protect remaining capital.");
      g_trade.CloseAllPositions();
      return;
   }

   // 2. จัดการ Breakeven และ Trailing Stop สำหรับทุกไม้ที่เปิดอยู่
   g_trade.ManageBreakevenAndTrailing();

   // 3. อ่านค่า Moving Average
   double maVal[2];
   if(CopyBuffer(g_maHandle, 0, 0, 2, maVal) < 2)
      return;

   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double point      = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   bool isTrendBullish = (currentBid > maVal[0]);

   // 4. ตรวจสอบการตัดจบเทรนด์ (Trend Reversal)
   int currentPositions = g_trade.CountOpenPositions(POSITION_TYPE_BUY);
   if(Inp_CloseOnTrendExit && currentPositions > 0 && !isTrendBullish)
   {
      PrintFormat("[DCASnowball] Trend reversal detected (Bid %.5f < MA %.5f). Closing all positions.", currentBid, maVal[0]);
      g_trade.CloseAllPositions();
      return;
   }

   // 5. ระบบ Trim Profit เพื่อดึงทุนออก (Rebalance)
   if(Inp_TrimProfitTarget > 0.0 && g_trade.GetTotalFloatingProfit() >= Inp_TrimProfitTarget)
   {
      g_trade.TrimBestPosition();
   }

   // 6. ตรวจสอบความปลอดภัยก่อนเปิดไม้ใหม่
   if(!isTrendBullish) return; // ไม่เปิดเพิ่มถ้าไม่อยู่ในเทรนด์ขาขึ้น
   if(!g_risk.IsSpreadOk(_Symbol)) return;
   if(!g_risk.IsMarginLevelOk()) return;
   if(currentPositions >= Inp_MaxPositions) return;

   // 7. ตรวจสอบเงื่อนไข Snowball (Free-Roll)
   if(Inp_RequireSecured && !g_trade.ArePositionsSecured())
   {
      // ไม้ก่อนหน้ายังไม่ได้ขยับ SL บังหน้าทุน ห้ามเปิดไม้ใหม่เพื่อป้องกันความเสี่ยงทับซ้อน
      return;
   }

   // 8. พิจารณาเปิดไม้ตามโหมดที่เลือก
   if(currentPositions == 0)
   {
      // ไม้แรกของรอบ
      g_trade.OpenBuy(Inp_LotSize, Inp_InitialSLPoints, "Snowball_Base_0");
   }
   else
   {
      // ไม้ Pyramiding / Snowball ถัดไป
      if(Inp_EntryMode == ENTRY_PRICE_STEP)
      {
         double highestBuy = g_trade.GetHighestBuyPrice();
         if(currentAsk >= highestBuy + (Inp_StepPoints * point))
         {
            string comment = StringFormat("Snowball_Add_%d", currentPositions);
            g_trade.OpenBuy(Inp_LotSize, Inp_InitialSLPoints, comment);
         }
      }
      else if(Inp_EntryMode == ENTRY_BAR_CLOSE)
      {
         datetime barTime[];
         if(CopyTime(_Symbol, Inp_MATimeframe, 0, 1, barTime) > 0)
         {
            if(barTime[0] != g_lastBarTime)
            {
               g_lastBarTime = barTime[0];
               string comment = StringFormat("Snowball_Add_%d", currentPositions);
               g_trade.OpenBuy(Inp_LotSize, Inp_InitialSLPoints, comment);
            }
         }
      }
   }
}
//+------------------------------------------------------------------+
