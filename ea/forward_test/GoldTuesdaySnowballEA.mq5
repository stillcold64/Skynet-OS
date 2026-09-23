//+------------------------------------------------------------------+
//|                                     GoldTuesdaySnowballEA.mq5    |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                  https://github.com/stillcold64/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/stillcold64/Skynet-OS"
#property version   "2.00"
#property description "Alpha Portfolio: Gold Tuesday Asymmetric Downward Pyramiding Snowball EA"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\SymbolInfo.mqh>

#define UI_PREFIX "GTSB_"

CTrade         trade;
CPositionInfo  posInfo;
CSymbolInfo    symInfo;

//--- INPUT PARAMETERS ---
sinput group "=== 1. การตั้งค่าระบบหลัก (Core System Settings) ==="
input ulong                InpMagicNumber          = 992201;               // Magic Number ประจำระบบ (แยกอิสระจาก EA ตัวอื่น)
input string               InpTradeComment         = "GoldSnowball_Alpha"; // คำอธิบายออเดอร์
input ENUM_TIMEFRAMES      InpWorkingTF            = PERIOD_H1;            // Timeframe อ้างอิงหลัก (H1)
input bool                 InpShowDashboard        = true;                 // แสดงแผงควบคุม On-Chart GUI Dashboard

sinput group "=== 2. ตัวกรองสัปดาห์ก่อนหน้า (Prior Week Macro Setup) ==="
input double               InpMinPriorWeekGainPct  = 0.8;                  // อัตราการขึ้นขั้นต่ำของสัปดาห์ก่อนหน้า (% Gain) (0.8%)
input bool                 InpRequireFridayGreen   = true;                 // สัปดาห์ก่อนหน้าวันศุกร์ต้องปิดสูงกว่าราคาเปิดวันจันทร์

sinput group "=== 3. การสเกลสโนว์บอลขาลง (Downward Pyramiding Schedule) ==="
input double               InpStepPriceUSD         = 7.5;                  // ระยะห่างราคาเพื่อเปิดไม้สโนว์บอลถัดไป ($ USD) (เช่น $7.5)
input double               InpInitialSLUSD         = 15.0;                 // Stop Loss เริ่มต้นของไม้แรก ($ USD เหนือราคาเปิด)
input double               InpBreakevenBufferUSD   = 1.0;                  // กำไรกันชนล็อกหน้าทุน (Freeroll Buffer $ USD)
input double               InpLayer1Lot            = 1.00;                 // ขนาดไม้ที่ 1 (ไม้หยั่งเชิง Open อังคาร)
input double               InpLayer2Lot            = 2.00;                 // ขนาดไม้ที่ 2 (ดิ่ง -$7.5)
input double               InpLayer3Lot            = 3.00;                 // ขนาดไม้ที่ 3 (ดิ่ง -$15.0)
input double               InpLayer4Lot            = 5.00;                 // ขนาดไม้ที่ 4 (ดิ่ง -$22.5 เต็มกำลัง)

sinput group "=== 4. การปิดรอบวันอังคาร (Tuesday EOD Harvest) ==="
input int                  InpExitHour             = 22;                   // ชั่วโมงปิดรวบกำไรวันอังคาร (Server Time Hour เช่น 22:00)
input int                  InpExitMinute           = 0;                    // นาทีปิดรวบกำไรวันอังคาร

//--- GLOBAL STATE VARIABLES ---
int      g_lastTradedWeek     = -1;
int      g_lastTradedYear     = -1;
string   g_currentStatusText  = "INITIALIZING...";
color    g_currentStatusColor = clrGold;
string   g_actionDetailText   = "Preparing system...";
double   g_priorWeekGain      = 0.0;
double   g_priorMonOpen       = 0.0;
double   g_priorFriClose      = 0.0;
double   g_tuesdayOpenPrice   = 0.0;
datetime g_lastUIUpdate       = 0;

//+------------------------------------------------------------------+
//| GUI Helper: Create Label                                         |
//+------------------------------------------------------------------+
void CreateLabel(string name, int x, int y, string text, int fontSize=9, color clr=clrWhite, string font="Segoe UI", int corner=CORNER_LEFT_UPPER)
{
   string objName = UI_PREFIX + name;
   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, objName, OBJPROP_CORNER, corner);
      ObjectSetInteger(0, objName, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, objName, OBJPROP_HIDDEN, true);
   }
   ObjectSetInteger(0, objName, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, objName, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, objName, OBJPROP_TEXT, text);
   ObjectSetString(0, objName, OBJPROP_FONT, font);
   ObjectSetInteger(0, objName, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, objName, OBJPROP_COLOR, clr);
}

//+------------------------------------------------------------------+
//| GUI Helper: Create Box / Card Panel                              |
//+------------------------------------------------------------------+
void CreatePanel(string name, int x, int y, int width, int height, color bgColor, color borderColor, int corner=CORNER_LEFT_UPPER)
{
   string objName = UI_PREFIX + name;
   if(ObjectFind(0, objName) < 0)
   {
      ObjectCreate(0, objName, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, objName, OBJPROP_CORNER, corner);
      ObjectSetInteger(0, objName, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, objName, OBJPROP_HIDDEN, true);
   }
   ObjectSetInteger(0, objName, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, objName, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, objName, OBJPROP_XSIZE, width);
   ObjectSetInteger(0, objName, OBJPROP_YSIZE, height);
   ObjectSetInteger(0, objName, OBJPROP_BGCOLOR, bgColor);
   ObjectSetInteger(0, objName, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, objName, OBJPROP_COLOR, borderColor);
   ObjectSetInteger(0, objName, OBJPROP_WIDTH, 1);
}

//+------------------------------------------------------------------+
//| Delete all Dashboard GUI Elements                                |
//+------------------------------------------------------------------+
void DestroyDashboard()
{
   ObjectsDeleteAll(0, UI_PREFIX);
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| Render / Update Dashboard                                        |
//+------------------------------------------------------------------+
void UpdateDashboard()
{
   if(!InpShowDashboard) return;
   
   int baseX = 20;
   int baseY = 30;
   int panelW = 380;
   int panelH = 345;
   
   // Background Card
   CreatePanel("BG_Main", baseX, baseY, panelW, panelH, C'15,20,30', C'45,55,75');
   // Header Bar
   CreatePanel("BG_Header", baseX, baseY, panelW, 38, C'20,30,48', C'50,70,105');
   // Status Bar Pill
   CreatePanel("BG_Status", baseX + 14, baseY + 48, panelW - 28, 30, C'24,32,46', C'40,55,80');
   
   // Header Title
   CreateLabel("Title", baseX + 15, baseY + 10, "⚡ SKYNET OS | GOLD TUESDAY SNOWBALL", 10, clrAqua, "Segoe UI Semibold");
   CreateLabel("Badge", baseX + panelW - 75, baseY + 12, "[ ALPHA ]", 9, clrOrangeRed, "Consolas");
   
   // Dynamic Status Display
   CreateLabel("StatusIcon", baseX + 25, baseY + 54, "●", 11, g_currentStatusColor, "Arial");
   CreateLabel("StatusText", baseX + 45, baseY + 55, g_currentStatusText, 9, g_currentStatusColor, "Segoe UI Semibold");
   
   // Information Rows
   int y = baseY + 90;
   int col1X = baseX + 18;
   int col2X = baseX + 175;
   int rowGap = 21;
   
   // Row 1: Prior Week Setup
   CreateLabel("Lbl_Prior", col1X, y, "สัปดาห์ก่อนหน้า (W1):", 9, clrDarkGray);
   string priorStr = StringFormat("%+.2f%% (%s)", g_priorWeekGain, (g_priorWeekGain >= InpMinPriorWeekGainPct ? "PASS" : "WAIT"));
   color priorClr = (g_priorWeekGain >= InpMinPriorWeekGainPct ? clrSpringGreen : clrSilver);
   CreateLabel("Val_Prior", col2X, y, priorStr, 9, priorClr, "Segoe UI Semibold");
   y += rowGap;
   
   // Row 2: Target Criteria
   CreateLabel("Lbl_Target", col1X, y, "เกณฑ์ทริกเกอร์:", 9, clrDarkGray);
   CreateLabel("Val_Target", col2X, y, StringFormat("สัปดาห์ก่อนหน้า >= +%.1f%%", InpMinPriorWeekGainPct), 9, clrLightSteelBlue);
   y += rowGap;
   
   // Divider 1
   CreatePanel("Div_1", col1X, y + 2, panelW - 36, 1, C'35,45,65', C'35,45,65');
   y += 10;
   
   // Position Metrics
   double lowestE = 0, highestE = 0, totalLots = 0, floatingProfit = 0;
   int activeCount = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(posInfo.SelectByIndex(i))
      {
         if(posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber)
         {
            activeCount++;
            totalLots += posInfo.Volume();
            floatingProfit += posInfo.Profit() + posInfo.Swap();
            double p = posInfo.PriceOpen();
            if(lowestE == 0 || p < lowestE) lowestE = p;
            if(highestE == 0 || p > highestE) highestE = p;
         }
      }
   }
   
   // Row 3: Active Snowball Layers
   CreateLabel("Lbl_Layers", col1X, y, "สถานะไม้สโนว์บอล:", 9, clrDarkGray);
   string layersStr = StringFormat("%d / 4 ไม้  (รวม %.2f Lots)", activeCount, totalLots);
   color layersClr = (activeCount > 0 ? clrLimeGreen : clrSilver);
   CreateLabel("Val_Layers", col2X, y, layersStr, 9, layersClr, "Segoe UI Semibold");
   y += rowGap;
   
   // Row 4: Next Layer Target
   CreateLabel("Lbl_NextStep", col1X, y, "เป้าเปิดไม้ถัดไป:", 9, clrDarkGray);
   string nextStepStr = "-";
   if(activeCount >= 1 && activeCount < 4 && lowestE > 0)
   {
      double targetP = lowestE - InpStepPriceUSD;
      nextStepStr = StringFormat("$%.2f (-$%.1f)", targetP, InpStepPriceUSD);
   }
   else if(activeCount == 4)
   {
      nextStepStr = "★ เต็มกำลัง 4 ไม้ (MAX)";
   }
   CreateLabel("Val_NextStep", col2X, y, nextStepStr, 9, clrAqua, "Segoe UI Semibold");
   y += rowGap;
   
   // Row 5: Floating PnL
   CreateLabel("Lbl_Float", col1X, y, "กำไร/ขาดทุนปัจจุบัน:", 9, clrDarkGray);
   string pnlStr = StringFormat("%+$%.2f USD", floatingProfit);
   color pnlClr = (floatingProfit > 0 ? clrLimeGreen : (floatingProfit < 0 ? clrCrimson : clrWhite));
   CreateLabel("Val_Float", col2X, y, pnlStr, 10, pnlClr, "Segoe UI Bold");
   y += rowGap;
   
   // Divider 2
   CreatePanel("Div_2", col1X, y + 2, panelW - 36, 1, C'35,45,65', C'35,45,65');
   y += 10;
   
   // Account Stats
   CreateLabel("Lbl_Bal", col1X, y, "บาลานซ์ / ฟรีมาร์จิ้น:", 9, clrDarkGray);
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double freeM = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   CreateLabel("Val_Bal", col2X, y, StringFormat("$%,.0f / $%,.0f", bal, freeM), 9, clrGainsboro);
   y += rowGap;
   
   // Row 7: Schedule Detail
   CreateLabel("Lbl_Schedule", col1X, y, "สเต็ปล็อต [L1->L4]:", 9, clrDarkGray);
   CreateLabel("Val_Schedule", col2X, y, StringFormat("%.2f -> %.2f -> %.2f -> %.2f", InpLayer1Lot, InpLayer2Lot, InpLayer3Lot, InpLayer4Lot), 9, clrGold);
   y += rowGap;
   
   // Footer Action Status
   CreatePanel("BG_Footer", baseX + 14, y, panelW - 28, 28, C'18,24,36', C'35,45,65');
   CreateLabel("ActionDetail", baseX + 25, y + 6, g_actionDetailText, 8, clrPaleTurquoise, "Segoe UI");
   
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| Check prior calendar week setup                                  |
//+------------------------------------------------------------------+
bool CheckPriorWeekSetup(double &priorGainPct, double &monOpen, double &friClose)
{
   MqlRates weeklyRates[];
   ArraySetAsSeries(weeklyRates, true);
   
   int copied = CopyRates(_Symbol, PERIOD_W1, 0, 3, weeklyRates);
   if(copied < 2) return false;
   
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
            double newSL = MathMin(openPrice - InpBreakevenBufferUSD, trailTargetSL);
            
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
      g_currentStatusText  = "EOD HARVEST COMPLETE / DONE FOR WEEK";
      g_currentStatusColor = clrMagenta;
      g_actionDetailText   = "ปิดรอบวันอังคารแล้ว รอประเมินรอบวันอังคารถัดไป";
   }
}

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
   
   CheckPriorWeekSetup(g_priorWeekGain, g_priorMonOpen, g_priorFriClose);
   
   Print("[+] GoldTuesdaySnowballEA v2.0 Initialized successfully for Symbol: ", _Symbol);
   Print("[+] Magic Number: ", InpMagicNumber, " | Setup: Prior Week Gain >= ", InpMinPriorWeekGainPct, "%");
   
   UpdateDashboard();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   DestroyDashboard();
   Print("[-] GoldTuesdaySnowballEA Deinitialized. Dashboard cleared.");
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
   
   // --- Refresh Prior Week Data ---
   CheckPriorWeekSetup(g_priorWeekGain, g_priorMonOpen, g_priorFriClose);
   
   // --- 1. Tuesday Close / Harvest Check ---
   if(dt.day_of_week == 2) // Tuesday
   {
      if(dt.hour >= InpExitHour && dt.min >= InpExitMinute)
      {
         if(activeCount > 0)
         {
            CloseAllPositions("Tuesday EOD Close Harvest");
         }
         g_currentStatusText  = "EOD HARVEST COMPLETE / DONE FOR WEEK";
         g_currentStatusColor = clrMagenta;
         g_actionDetailText   = "รวบกำไรวันอังคารเรียบร้อยแล้ว รอวันอังคารสัปดาห์ถัดไป";
         UpdateDashboard();
         return;
      }
   }
   else if(dt.day_of_week >= 3 || dt.day_of_week == 0) // Wednesday to Sunday cleanup
   {
      if(activeCount > 0)
      {
         CloseAllPositions("End of Tuesday Window Cleanup");
      }
      g_currentStatusText  = "WAITING FOR NEXT TUESDAY";
      g_currentStatusColor = clrGold;
      g_actionDetailText   = StringFormat("สัปดาห์ก่อนหน้าบวก %+.2f%% | สแตนด์บายรอวันอังคารถัดไป", g_priorWeekGain);
      UpdateDashboard();
      return;
   }
   else if(dt.day_of_week == 1) // Monday
   {
      g_currentStatusText  = "MONDAY LIQUIDITY OBSERVATION";
      g_currentStatusColor = clrDeepSkyBlue;
      g_actionDetailText   = StringFormat("สัปดาห์ก่อนหน้า %+.2f%% | กำลังเฝ้าการกวาด High ของวันจันทร์", g_priorWeekGain);
      UpdateDashboard();
      return;
   }
   
   // --- 2. Tuesday Trading Logic ---
   if(dt.day_of_week == 2) // Tuesday
   {
      // A. Check if we need to open Layer 1
      if(activeCount == 0 && (g_lastTradedWeek != currentWeek || g_lastTradedYear != currentYear))
      {
         // Wait for Asian session opening (after 00:15)
         if(dt.hour == 0 && dt.min < 15)
         {
            g_currentStatusText  = "WAITING FOR ASIAN SESSION OPEN";
            g_currentStatusColor = clrGold;
            g_actionDetailText   = "รอผ่านช่วงตลาดเปิด 00:15 เพื่อยืนยันสเปรด";
            UpdateDashboard();
            return;
         }
         
         double priorGain = 0.0, monO = 0.0, friC = 0.0;
         if(CheckPriorWeekSetup(priorGain, monO, friC))
         {
            g_currentStatusText  = "EXECUTING LAYER 1...";
            g_currentStatusColor = clrLimeGreen;
            g_actionDetailText   = StringFormat("เข้าเงื่อนไข! สัปดาห์ก่อนหน้า +%.2f%% ยิงไม้แรก %.2f Lot", priorGain, InpLayer1Lot);
            UpdateDashboard();
            
            double initialSL = ask + InpInitialSLUSD;
            if(trade.Sell(InpLayer1Lot, _Symbol, bid, initialSL, 0, InpTradeComment + "_L1"))
            {
               g_lastTradedWeek = currentWeek;
               g_lastTradedYear = currentYear;
               g_tuesdayOpenPrice = bid;
               Print("[+] เปิดไม้ 1 สำเร็จ! ตั๋ว #", trade.ResultOrder(), " ที่ราคา: ", bid, " | SL: ", initialSL);
            }
         }
         else
         {
            g_lastTradedWeek = currentWeek;
            g_lastTradedYear = currentYear;
            g_currentStatusText  = "SETUP SKIPPED (GAIN NOT MET)";
            g_currentStatusColor = clrSilver;
            g_actionDetailText   = StringFormat("สัปดาห์ก่อนหน้าบวกเพียง +%.2f%% (ไม่ถึงเกณฑ์ +%.1f%%) ข้ามสัปดาห์นี้", priorGain, InpMinPriorWeekGainPct);
            UpdateDashboard();
            return;
         }
      }
      
      // B. Pyramiding Snowball on the Dump
      if(activeCount >= 1 && activeCount < 4)
      {
         double nextTarget = lowestEntry - InpStepPriceUSD;
         
         g_currentStatusText  = StringFormat("ACTIVE: SNOWBALL RUNNING (L%d)", activeCount);
         g_currentStatusColor = clrLimeGreen;
         g_actionDetailText   = StringFormat("ถือ %d ไม้ | รอราคาดิ่งชน $%.2f เพื่อสโนว์บอลไม้ถัดไป", activeCount, nextTarget);
         
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
            
            Print("[⚡] ราคาทองคำทุบถึงเป้าสโนว์บอล: ", bid, " <= ", nextTarget, " (เปิดไม้ ", activeCount + 1, " ขนาด ", nextLot, " Lot!)");
            
            // 1. Move SL of all existing positions down to lock profit (Freeroll)
            double trailSL = nextTarget + InpStepPriceUSD - InpBreakevenBufferUSD;
            UpdateTrailingAndFreeroll(trailSL);
            
            // 2. Open next layer
            double newSL = ask + InpStepPriceUSD;
            if(trade.Sell(nextLot, _Symbol, bid, newSL, 0, layerComment))
            {
               Print("[+] สโนว์บอลไม้ ", activeCount + 1, " สำเร็จ! ตั๋ว #", trade.ResultOrder());
            }
         }
      }
      else if(activeCount == 4)
      {
         g_currentStatusText  = "SUPER DUMP: ALL 4 LAYERS ACTIVE! 🚀";
         g_currentStatusColor = clrAqua;
         g_actionDetailText   = "สโนว์บอลครบ 4 เลเยอร์ รันเทรนด์เต็มกำลัง รอ Harvest 22:00";
      }
   }
   
   // Throttle Dashboard updates to once every second
   if(currentTime - g_lastUIUpdate >= 1)
   {
      UpdateDashboard();
      g_lastUIUpdate = currentTime;
   }
}
//+------------------------------------------------------------------+
