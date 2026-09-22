//+------------------------------------------------------------------+
//|                                     GoldTuesdaySnowballEA.mq5    |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                  https://github.com/stillcold64/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/stillcold64/Skynet-OS"
#property version   "1.00"
#property description "Alpha Portfolio: Gold Tuesday Asymmetric Downward Pyramiding Snowball EA"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\SymbolInfo.mqh>

CTrade         trade;
CPositionInfo  posInfo;
CSymbolInfo    symInfo;

//--- INPUT PARAMETERS ---
sinput group "=== 1. การตั้งค่าระบบหลัก (Core System Settings) ==="
input ulong                InpMagicNumber          = 992201;            // Magic Number ประจำระบบ (แยกอิสระจาก EA ตัวอื่น)
input string               InpTradeComment         = "GoldSnowball_Alpha"; // คำอธิบายออเดอร์
input ENUM_TIMEFRAMES      InpWorkingTF            = PERIOD_H1;         // Timeframe อ้างอิงหลัก

sinput group "=== 2. ตัวกรองสัปดาห์ก่อนหน้า (Prior Week Macro Setup) ==="
input double               InpMinPriorWeekGainPct  = 0.8;               // อัตราการขึ้นขั้นต่ำของสัปดาห์ก่อนหน้า (% Gain) (เช่น 0.8%)
input bool                 InpRequireFridayGreen   = true;              // สัปดาห์ก่อนหน้าวันศุกร์ต้องปิดสูงกว่าราคาเปิดวันจันทร์

sinput group "=== 3. การสเกลสโนว์บอลขาลง (Downward Pyramiding Schedule) ==="
input double               InpStepPriceUSD         = 7.5;               // ระยะห่างราคาเพื่อเปิดไม้สโนว์บอลถัดไป ($ USD) (เช่น $7.5)
input double               InpInitialSLUSD         = 15.0;              // Stop Loss เริ่มต้นของไม้แรก ($ USD เหนือราคาเปิด)
input double               InpBreakevenBufferUSD   = 1.0;               // กำไรกันชนล็อกหน้าทุน (Freeroll Buffer $ USD)
input double               InpLayer1Lot            = 0.20;              // ขนาดไม้ที่ 1 (ไม้หยั่งเชิง Open อังคาร)
input double               InpLayer2Lot            = 0.40;              // ขนาดไม้ที่ 2 (ดิ่ง -$7.5)
input double               InpLayer3Lot            = 0.60;              // ขนาดไม้ที่ 3 (ดิ่ง -$15.0)
input double               InpLayer4Lot            = 1.00;              // ขนาดไม้ที่ 4 (ดิ่ง -$22.5 เต็มกำลัง)

sinput group "=== 4. การปิดรอบวันอังคาร (Tuesday EOD Harvest) ==="
input int                  InpExitHour             = 22;                // ชั่วโมงปิดรวบกำไรวันอังคาร (Server Time Hour เช่น 22:00)
input int                  InpExitMinute           = 0;                 // นาทีปิดรวบกำไรวันอังคาร

//--- GLOBAL VARIABLES ---
int      g_lastTradedWeek = -1;
int      g_lastTradedYear = -1;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(!symInfo.Name(_Symbol))
   {
      Print("[-] ไม่สามารถระบุ Symbol: ", _Symbol);
      return INIT_FAILED;
   }
   
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(50);
   trade.SetTypeFilling(ORDER_FILLING_IOC);
   
   Print("[+] GoldTuesdaySnowballEA Initialized successfully for Symbol: ", _Symbol);
   Print("[+] Magic Number: ", InpMagicNumber, " | Setup: Prior Week Gain >= ", InpMinPriorWeekGainPct, "%");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("[-] GoldTuesdaySnowballEA Deinitialized. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Check if previous calendar week was Bullish above threshold      |
//+------------------------------------------------------------------+
bool CheckPriorWeekSetup(double &priorGainPct, double &monOpen, double &friClose)
{
   MqlRates weeklyRates[];
   ArraySetAsSeries(weeklyRates, true);
   
   // Copy last 3 weekly bars (0: current week, 1: last completed week)
   int copied = CopyRates(_Symbol, PERIOD_W1, 0, 3, weeklyRates);
   if(copied < 2)
   {
      Print("[-] ไม่สามารถอ่านข้อมูลแท่ง W1 ได้เพียงพอ");
      return false;
   }
   
   monOpen  = weeklyRates[1].open;
   friClose = weeklyRates[1].close;
   
   if(monOpen <= 0) return false;
   
   priorGainPct = (friClose - monOpen) / monOpen * 100.0;
   
   if(InpRequireFridayGreen && friClose <= monOpen)
      return false;
      
   return (priorGainPct >= InpMinPriorWeekGainPct);
}

//+------------------------------------------------------------------+
//| Count active positions for this EA                               |
//+------------------------------------------------------------------+
int GetActivePositionsCount(double &lowestEntry, double &highestEntry)
{
   int count = 0;
   lowestEntry = 999999.0;
   highestEntry = 0.0;
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(posInfo.SelectByIndex(i))
      {
         if(posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber)
         {
            count++;
            double price = posInfo.PriceOpen();
            if(price < lowestEntry) lowestEntry = price;
            if(price > highestEntry) highestEntry = price;
         }
      }
   }
   return count;
}

//+------------------------------------------------------------------+
//| Lock Breakeven / Trail Stop on all earlier positions             |
//+------------------------------------------------------------------+
void UpdateTrailingAndFreeroll(double trailTargetSL)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(posInfo.SelectByIndex(i))
      {
         if(posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber && posInfo.PositionType() == POSITION_TYPE_SELL)
         {
            double curSL = posInfo.StopLoss();
            double openPrice = posInfo.PriceOpen();
            
            // For Sell: we want SL to move DOWN
            double newSL = MathMin(openPrice - InpBreakevenBufferUSD, trailTargetSL);
            
            // Only modify if newSL is strictly lower than current SL (or if curSL was above open)
            if(curSL == 0.0 || newSL < curSL - 0.10)
            {
               trade.PositionModify(posInfo.Ticket(), newSL, posInfo.TakeProfit());
               Print("[+] เลื่อน SL ล็อกกำไร / Freeroll ตั๋ว #", posInfo.Ticket(), " ลงมาที่: ", newSL);
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Close all positions belonging to this EA                         |
//+------------------------------------------------------------------+
void CloseAllPositions(string reason)
{
   int closed = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(posInfo.SelectByIndex(i))
      {
         if(posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber)
         {
            trade.PositionClose(posInfo.Ticket());
            closed++;
         }
      }
   }
   if(closed > 0)
   {
      Print("[★] ปิดรวบกำไรยกชุด ", closed, " ออเดอร์ (", reason, ")");
   }
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime currentTime = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(currentTime, dt);
   
   symInfo.RefreshRates();
   double bid = symInfo.Bid();
   double ask = symInfo.Ask();
   
   int currentYear = dt.year;
   int currentWeek = dt.day_of_year / 7;
   
   double lowestEntry, highestEntry;
   int activeCount = GetActivePositionsCount(lowestEntry, highestEntry);
   
   // --- 1. Tuesday Close / Harvest Check ---
   if(dt.day_of_week == 2) // Tuesday
   {
      if(dt.hour >= InpExitHour && dt.min >= InpExitMinute)
      {
         if(activeCount > 0)
         {
            CloseAllPositions("Tuesday EOD Close Harvest");
         }
         return;
      }
   }
   else if(dt.day_of_week >= 3 || dt.day_of_week == 0) // Wednesday to Sunday cleanup
   {
      if(activeCount > 0)
      {
         CloseAllPositions("End of Tuesday Window Cleanup");
      }
      return;
   }
   
   // --- 2. Tuesday Trading Logic ---
   if(dt.day_of_week == 2) // Tuesday
   {
      // A. Check if we need to open Layer 1
      if(activeCount == 0 && (g_lastTradedWeek != currentWeek || g_lastTradedYear != currentYear))
      {
         // Wait for Asian session opening (e.g. after 00:15)
         if(dt.hour == 0 && dt.min < 15) return;
         
         double priorGain = 0.0, monO = 0.0, friC = 0.0;
         if(CheckPriorWeekSetup(priorGain, monO, friC))
         {
            Print("[+] สัปดาห์ก่อนหน้าบวกแรง: +", DoubleToString(priorGain, 2), "% (Open: ", monO, " -> Close: ", friC, ")");
            Print("[+] สัญญาณ Alpha Gold Snowball เข้าเงื่อนไข! เปิดไม้ 1 (Sell ", InpLayer1Lot, " Lot)");
            
            double initialSL = ask + InpInitialSLUSD;
            if(trade.Sell(InpLayer1Lot, _Symbol, bid, initialSL, 0, InpTradeComment + "_L1"))
            {
               g_lastTradedWeek = currentWeek;
               g_lastTradedYear = currentYear;
               Print("[+] เปิดไม้ 1 สำเร็จ! ตั๋ว #", trade.ResultOrder(), " ที่ราคา: ", bid, " | SL: ", initialSL);
            }
            else
            {
               Print("[-] เปิดไม้ 1 ล้มเหลว! Error: ", trade.ResultRetcodeDescription());
            }
         }
         else
         {
            // Setup not satisfied for this week -> mark as evaluated
            g_lastTradedWeek = currentWeek;
            g_lastTradedYear = currentYear;
            Print("[-] สัปดาห์ก่อนหน้าบวกเพียง +", DoubleToString(priorGain, 2), "% ไม่ถึงเกณฑ์ ", InpMinPriorWeekGainPct, "% -> ข้ามสัปดาห์นี้");
         }
      }
      
      // B. Pyramiding Snowball on the Dump
      if(activeCount >= 1 && activeCount < 4)
      {
         double nextTarget = lowestEntry - InpStepPriceUSD;
         
         if(bid <= nextTarget)
         {
            double nextLot = InpLayer2Lot;
            string layerComment = InpTradeComment + "_L2";
            
            if(activeCount == 2)
            {
               nextLot = InpLayer3Lot;
               layerComment = InpTradeComment + "_L3";
            }
            else if(activeCount == 3)
            {
               nextLot = InpLayer4Lot;
               layerComment = InpTradeComment + "_L4";
            }
            
            Print("[⚡] ราคาทองคำทุบลงมาถึงเป้าสโนว์บอล: ", bid, " <= ", nextTarget, " (เปิดไม้ ", activeCount + 1, " ขนาด ", nextLot, " Lot!)");
            
            // 1. Move SL of all existing positions down to lock profit (Freeroll)
            double trailSL = nextTarget + InpStepPriceUSD - InpBreakevenBufferUSD;
            UpdateTrailingAndFreeroll(trailSL);
            
            // 2. Open next layer
            double newSL = ask + InpStepPriceUSD;
            if(trade.Sell(nextLot, _Symbol, bid, newSL, 0, layerComment))
            {
               Print("[+] สโนว์บอลไม้ ", activeCount + 1, " สำเร็จ! ตั๋ว #", trade.ResultOrder());
            }
            else
            {
               Print("[-] สโนว์บอลไม้ใหม่ล้มเหลว! Error: ", trade.ResultRetcodeDescription());
            }
         }
      }
   }
}
//+------------------------------------------------------------------+
