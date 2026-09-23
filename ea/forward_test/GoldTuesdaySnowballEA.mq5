//+------------------------------------------------------------------+
//|                                     GoldTuesdaySnowballEA.mq5    |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                  https://github.com/stillcold64/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/stillcold64/Skynet-OS"
#property version   "2.10"
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
input bool                 InpShowDashboard        = true;                 // แสดงแผงควบคุม On-Chart GUI Dashboard (อัตโนมัติปิดใน Backtest เพื่อความเร็ว)

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
int      g_cachedWeekId       = -1;
bool     g_cachedSetupValid   = false;
string   g_currentStatusText  = "INITIALIZING...";
color    g_currentStatusColor = clrGold;
string   g_actionDetailText   = "Preparing system...";
double   g_priorWeekGain      = 0.0;
double   g_priorMonOpen       = 0.0;
double   g_priorFriClose      = 0.0;
datetime g_lastUIUpdate       = 0;
bool     g_isTester           = false;

//+------------------------------------------------------------------+
//| GUI Helper: Create Label                                         |
//+------------------------------------------------------------------+
void CreateLabel(string name, int x, int y, string text, int fontSize=9, color clr=clrWhite, string font="Segoe UI", int corner=CORNER_LEFT_UPPER)
{
   if(g_isTester || !InpShowDashboard) return;
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
   if(g_isTester || !InpShowDashboard) return;
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
   if(g_isTester) return;
   ObjectsDeleteAll(0, UI_PREFIX);
   ChartRedraw(0);
}

//+------------------------------------------------------------------+
//| Render / Update Dashboard                                        |
//+------------------------------------------------------------------+
void UpdateDashboard()
{
   if(g_isTester || !InpShowDashboard) return;
   
   int baseX = 20;
   int baseY = 30;
   int panelW = 380;
   int panelH = 345;
   
   // Background Card
   CreatePanel("BG_Main", baseX, baseY, panelW, panelH, C'15,20,30', C'45,55,75');
   CreatePanel("BG_Header", baseX, baseY, panelW, 38, C'20,30,48', C'50,70,105');
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
//| Check prior calendar week setup (Cached per week for speed)      |
//+------------------------------------------------------------------+
bool CheckPriorWeekSetupFast(int weekId, double &priorGainPct, double &monOpen, double &friClose)
{
   if(g_cachedWeekId == weekId)
   {
      priorGainPct = g_priorWeekGain;
      monOpen      = g_priorMonOpen;
      friClose     = g_priorFriClose;
      return g_cachedSetupValid;
   }
   
   MqlRates weeklyRates[];
   ArraySetAsSeries(weeklyRates, true);
   
   int copied = CopyRates(_Symbol, PERIOD_W1, 0, 3, weeklyRates);
   if(copied < 2) return false;
   
   monOpen  = weeklyRates[1].open;
   friClose = weeklyRates[1].close;
   
   if(monOpen <= 0) return false;
   priorGainPct = (friClose - monOpen) / monOpen * 100.0;
   
   g_priorWeekGain = priorGainPct;
   g_priorMonOpen  = monOpen;
   g_priorFriClose = friClose;
   g_cachedWeekId  = weekId;
   
   if(InpRequireFridayGreen && friClose <= monOpen)
   {
      g_cachedSetupValid = false;
      return false;
   }
   
   g_cachedSetupValid = (priorGainPct >= InpMinPriorWeekGainPct);
   return g_cachedSetupValid;
}

//+------------------------------------------------------------------+
//| Count active positions for this EA                               |
//+------------------------------------------------------------------+
int GetActivePositionsCount(double &lowestEntry, double &highestEntry)
{
   int count = 0;
   lowestEntry = 999999.0;
   highestEntry = 0.0;
   
   int total = PositionsTotal();
   if(total == 0) return 0;
   
   for(int i = total - 1; i >= 0; i--)
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
   if(closed > 0 && !g_isTester)
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
   g_isTester = (bool)MQLInfoInteger(MQL_TESTER);
   
   if(!symInfo.Name(_Symbol))
   {
      Print("[-] ไม่สามารถระบุ Symbol: ", _Symbol);
      return INIT_FAILED;
   }
   
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(50);
   trade.SetTypeFilling(ORDER_FILLING_IOC);
   
   CheckPriorWeekSetupFast(0, g_priorWeekGain, g_priorMonOpen, g_priorFriClose);
   
   if(!g_isTester)
   {
      Print("[+] GoldTuesdaySnowballEA v2.10 Initialized for Symbol: ", _Symbol);
      UpdateDashboard();
   }
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   DestroyDashboard();
}

//+------------------------------------------------------------------+
//| Expert tick function (Ultra-Fast Optimized)                      |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime currentTime = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(currentTime, dt);
   
   // --- ULTRA FAST BYPASS: If NOT Tuesday (Wednesday - Monday) ---
   if(dt.day_of_week != 2)
   {
      // If lingering positions exist from Tuesday, clean up
      if(PositionsTotal() > 0)
      {
         double dummyL, dummyH;
         if(GetActivePositionsCount(dummyL, dummyH) > 0)
         {
            CloseAllPositions("Cleanup Non-Tuesday Positions");
         }
      }
      
      // Update UI only in live mode throttled to 1 sec
      if(!g_isTester && currentTime - g_lastUIUpdate >= 1)
      {
         if(dt.day_of_week == 1)
         {
            g_currentStatusText  = "MONDAY LIQUIDITY OBSERVATION";
            g_currentStatusColor = clrDeepSkyBlue;
            g_actionDetailText   = StringFormat("สัปดาห์ก่อนหน้า %+.2f%% | เฝ้าดูการกวาด High วันจันทร์", g_priorWeekGain);
         }
         else
         {
            g_currentStatusText  = "WAITING FOR NEXT TUESDAY";
            g_currentStatusColor = clrGold;
            g_actionDetailText   = StringFormat("สัปดาห์ก่อนหน้าบวก %+.2f%% | สแตนด์บายรอวันอังคารถัดไป", g_priorWeekGain);
         }
         UpdateDashboard();
         g_lastUIUpdate = currentTime;
      }
      return; // Fast exit in 1 nanosecond on all other 6 days!
   }
   
   // ================================================================
   // TUESDAY TRADING ENGINE
   // ================================================================
   int currentYear = dt.year;
   int currentWeek = dt.day_of_year / 7;
   int weekId = currentYear * 100 + currentWeek;
   
   // 1. Tuesday EOD Harvest Check
   if(dt.hour >= InpExitHour && dt.min >= InpExitMinute)
   {
      double dummyL, dummyH;
      if(GetActivePositionsCount(dummyL, dummyH) > 0)
      {
         CloseAllPositions("Tuesday EOD Close Harvest");
      }
      if(!g_isTester && currentTime - g_lastUIUpdate >= 1)
      {
         g_currentStatusText  = "EOD HARVEST COMPLETE / DONE FOR WEEK";
         g_currentStatusColor = clrMagenta;
         g_actionDetailText   = "รวบกำไรวันอังคารเรียบร้อยแล้ว รอวันอังคารสัปดาห์ถัดไป";
         UpdateDashboard();
         g_lastUIUpdate = currentTime;
      }
      return;
   }
   
   // Check active positions
   double lowestEntry, highestEntry;
   int activeCount = GetActivePositionsCount(lowestEntry, highestEntry);
   
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   
   // 2. Open Layer 1
   if(activeCount == 0 && (g_lastTradedWeek != currentWeek || g_lastTradedYear != currentYear))
   {
      if(dt.hour == 0 && dt.min < 15) return; // Wait 15 mins for spread normalization
      
      double priorGain = 0.0, monO = 0.0, friC = 0.0;
      if(CheckPriorWeekSetupFast(weekId, priorGain, monO, friC))
      {
         double initialSL = ask + InpInitialSLUSD;
         if(trade.Sell(InpLayer1Lot, _Symbol, bid, initialSL, 0, InpTradeComment + "_L1"))
         {
            g_lastTradedWeek = currentWeek;
            g_lastTradedYear = currentYear;
            if(!g_isTester) Print("[+] เปิดไม้ 1 สำเร็จ! ตั๋ว #", trade.ResultOrder(), " ที่ราคา: ", bid);
         }
      }
      else
      {
         g_lastTradedWeek = currentWeek;
         g_lastTradedYear = currentYear;
         if(!g_isTester)
         {
            g_currentStatusText  = "SETUP SKIPPED (GAIN NOT MET)";
            g_currentStatusColor = clrSilver;
            g_actionDetailText   = StringFormat("สัปดาห์ก่อนหน้าบวกเพียง +%.2f%% ข้ามสัปดาห์นี้", priorGain);
            UpdateDashboard();
         }
         return;
      }
   }
   
   // 3. Pyramiding Snowball on the Dump
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
         
         // 1. Move SL of earlier layers down to lock profit (Freeroll)
         double trailSL = nextTarget + InpStepPriceUSD - InpBreakevenBufferUSD;
         UpdateTrailingAndFreeroll(trailSL);
         
         // 2. Open next layer
         double newSL = ask + InpStepPriceUSD;
         trade.Sell(nextLot, _Symbol, bid, newSL, 0, layerComment);
      }
   }
   
   // Update UI in live mode
   if(!g_isTester && currentTime - g_lastUIUpdate >= 1)
   {
      if(activeCount >= 1 && activeCount < 4)
      {
         g_currentStatusText  = StringFormat("ACTIVE: SNOWBALL RUNNING (L%d)", activeCount);
         g_currentStatusColor = clrLimeGreen;
         g_actionDetailText   = StringFormat("ถือ %d ไม้ | รอราคาดิ่งชน $%.2f เพื่อสโนว์บอลไม้ถัดไป", activeCount, lowestEntry - InpStepPriceUSD);
      }
      else if(activeCount == 4)
      {
         g_currentStatusText  = "SUPER DUMP: ALL 4 LAYERS ACTIVE! 🚀";
         g_currentStatusColor = clrAqua;
         g_actionDetailText   = "สโนว์บอลครบ 4 เลเยอร์ รันเทรนด์เต็มกำลัง รอ Harvest 22:00";
      }
      UpdateDashboard();
      g_lastUIUpdate = currentTime;
   }
}
//+------------------------------------------------------------------+
