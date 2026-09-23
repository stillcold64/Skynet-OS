//+------------------------------------------------------------------+
//|                                     GoldTuesdaySnowballEA.mq5    |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                  https://github.com/stillcold64/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/stillcold64/Skynet-OS"
#property version   "2.20"
#property description "Alpha Portfolio: Gold Tuesday Asymmetric Snowball EA with Upward Pullback & True Freeroll"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\SymbolInfo.mqh>

#define UI_PREFIX "GTSB_"

enum ENUM_ENTRY_MODE
{
   ENTRY_BREAKDOWN = 0, // รอดันขึ้นถึงเป้า แล้วย่อกลับยืนยันการหมดแรง (Breakdown Reversal)
   ENTRY_LIMIT     = 1, // ตั้ง Sell Limit ดักไว้ที่ระดับเป้าหมายบนยอด (Limit on Peak)
   ENTRY_IMMEDIATE = 2  // เข้าทันทีที่เปิดวันอังคาร (Immediate Entry)
};

CTrade         trade;
CPositionInfo  posInfo;
CSymbolInfo    symInfo;

//--- INPUT PARAMETERS ---
sinput group "=== 1. การตั้งค่าระบบหลัก (Core System Settings) ==="
input ulong                InpMagicNumber          = 992201;               // Magic Number ประจำระบบ (แยกอิสระ)
input string               InpTradeComment         = "GoldSnowball_Alpha"; // คำอธิบายออเดอร์
input ENUM_TIMEFRAMES      InpWorkingTF            = PERIOD_H1;            // Timeframe อ้างอิงหลัก (H1)
input bool                 InpShowDashboard        = true;                 // แสดงแผงควบคุม On-Chart GUI Dashboard

sinput group "=== 2. ตัวกรองสัปดาห์ก่อนหน้า (Prior Week Macro Setup) ==="
input double               InpMinPriorWeekGainPct  = 0.8;                  // อัตราการขึ้นขั้นต่ำของสัปดาห์ก่อนหน้า (% Gain)
input bool                 InpRequireFridayGreen   = true;                 // สัปดาห์ก่อนหน้าวันศุกร์ต้องปิดสูงกว่าราคาเปิดวันจันทร์

sinput group "=== 3. การเข้าออเดอร์หลังขยับขึ้น (Upward Pullback Entry) ==="
input ENUM_ENTRY_MODE      InpEntryMode            = ENTRY_BREAKDOWN;      // รูปแบบการเข้าไม้แรก
input double               InpUpwardBufferUSD      = 15.0;                 // ระยะดันขึ้นเหนือราคาเปิดวันอังคาร ($ USD)
input double               InpReversalDropUSD      = 3.0;                  // ระยะย่อคอนเฟิร์มหลังทำจุดสูงสุด ($ USD)

sinput group "=== 4. การสเกลสโนว์บอลขาลง (Downward Pyramiding Schedule) ==="
input double               InpStepPriceUSD         = 10.0;                 // ระยะห่างราคาเพื่อเปิดไม้สโนว์บอลถัดไป ($ USD) (เช่น $10.0)
input double               InpInitialSLUSD         = 25.0;                 // Stop Loss เริ่มต้นของไม้แรก ($ USD)
input bool                 InpUseH1StructureTrail  = true;                 // ล็อกกำไรและเลื่อน SL ตาม High ของแท่ง H1 ก่อนหน้า (Market Structure Trailing)
input double               InpBreakevenBufferUSD   = 0.5;                  // กำไรกันชนล็อกหน้าทุน ($ USD)
input double               InpLayer1Lot            = 0.20;                 // ขนาดไม้ที่ 1 (ไม้หยั่งเชิงบนยอด)
input double               InpLayer2Lot            = 0.40;                 // ขนาดไม้ที่ 2 (ดิ่ง -$10.0)
input double               InpLayer3Lot            = 0.60;                 // ขนาดไม้ที่ 3 (ดิ่ง -$20.0)
input double               InpLayer4Lot            = 1.00;                 // ขนาดไม้ที่ 4 (ดิ่ง -$30.0 เต็มกำลัง)

sinput group "=== 5. การล็อกกำไรและการปิดรอบ (Profit Lock & Harvest) ==="
input double               InpTrailProfitLockThresh= 3000.0;               // เริ่ม Trailing ล็อกกำไรเมื่อกำไรรวมเกิน ($ USD)
input double               InpTrailGivebackPct     = 0.30;                 // ยอมให้กำไรย่อตัวจากจุดสูงสุดได้ไม่เกิน 30%
input int                  InpExitHour             = 21;                   // ชั่วโมงปิดรวบกำไรวันอังคาร (Server Time Hour)
input int                  InpExitMinute           = 0;                    // นาทีปิดรวบกำไรวันอังคาร

//--- GLOBAL STATE VARIABLES ---
int      g_lastTradedWeek        = -1;
int      g_lastTradedYear        = -1;
int      g_cachedWeekId          = -1;
bool     g_cachedSetupValid      = false;
string   g_currentStatusText     = "INITIALIZING...";
color    g_currentStatusColor    = clrGold;
string   g_actionDetailText      = "Preparing system...";
double   g_priorWeekGain         = 0.0;
double   g_priorMonOpen          = 0.0;
double   g_priorFriClose         = 0.0;
datetime g_lastUIUpdate          = 0;
bool     g_isTester              = false;

// Pullback State Tracking
double   g_tueOpenPrice          = 0.0;
double   g_tueHighestPrice       = 0.0;
bool     g_pullbackReached       = false;
double   g_peakFloatingProfit    = 0.0;

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
   int panelW = 390;
   int panelH = 375;
   
   // Background Card
   CreatePanel("BG_Main", baseX, baseY, panelW, panelH, C'15,20,30', C'45,55,75');
   CreatePanel("BG_Header", baseX, baseY, panelW, 38, C'20,30,48', C'50,70,105');
   CreatePanel("BG_Status", baseX + 14, baseY + 48, panelW - 28, 30, C'24,32,46', C'40,55,80');
   
   // Header Title
   CreateLabel("Title", baseX + 15, baseY + 10, "⚡ SKYNET OS | GOLD TUESDAY SNOWBALL", 10, clrAqua, "Segoe UI Semibold");
   CreateLabel("Badge", baseX + panelW - 85, baseY + 12, "[ SUPREME ]", 9, clrOrangeRed, "Consolas");
   
   // Dynamic Status Display
   CreateLabel("StatusIcon", baseX + 25, baseY + 54, "●", 11, g_currentStatusColor, "Arial");
   CreateLabel("StatusText", baseX + 45, baseY + 55, g_currentStatusText, 9, g_currentStatusColor, "Segoe UI Semibold");
   
   // Information Rows
   int y = baseY + 90;
   int col1X = baseX + 18;
   int col2X = baseX + 180;
   int rowGap = 21;
   
   // Row 1: Prior Week Setup
   CreateLabel("Lbl_Prior", col1X, y, "สัปดาห์ก่อนหน้า (W1):", 9, clrDarkGray);
   string priorStr = StringFormat("%+.2f%% (%s)", g_priorWeekGain, (g_priorWeekGain >= InpMinPriorWeekGainPct ? "PASS" : "WAIT"));
   color priorClr = (g_priorWeekGain >= InpMinPriorWeekGainPct ? clrSpringGreen : clrSilver);
   CreateLabel("Val_Prior", col2X, y, priorStr, 9, priorClr, "Segoe UI Semibold");
   y += rowGap;
   
   // Row 2: Upward Target
   CreateLabel("Lbl_Target", col1X, y, "เป้าดีดตัวก่อนเข้า:", 9, clrDarkGray);
   string targetStr = "-";
   if(g_tueOpenPrice > 0)
   {
      double targetP = g_tueOpenPrice + InpUpwardBufferUSD;
      targetStr = StringFormat("$%.2f (ทำ High $%.2f)", targetP, g_tueHighestPrice);
   }
   CreateLabel("Val_Target", col2X, y, targetStr, 9, (g_pullbackReached ? clrSpringGreen : clrLightSteelBlue), "Segoe UI");
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
      double nextTarget = lowestE - InpStepPriceUSD;
      nextStepStr = StringFormat("$%.2f (-$%.1f)", nextTarget, InpStepPriceUSD);
   }
   else if(activeCount == 4)
   {
      nextStepStr = "★ เต็มกำลัง 4 ไม้ (MAX)";
   }
   CreateLabel("Val_NextStep", col2X, y, nextStepStr, 9, clrAqua, "Segoe UI Semibold");
   y += rowGap;
   
   // Row 5: Floating PnL & Peak
   CreateLabel("Lbl_Float", col1X, y, "กำไรปัจจุบัน (จุดสูงสุด):", 9, clrDarkGray);
   string pnlStr = StringFormat("%+$%.2f ($%.0f)", floatingProfit, g_peakFloatingProfit);
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
//| Market Structure Trailing: Trail SL to Previous H1 Bar High      |
//+------------------------------------------------------------------+
void UpdateTrailingH1Structure()
{
   if(!InpUseH1StructureTrail) return;
   
   MqlRates h1Rates[];
   ArraySetAsSeries(h1Rates, true);
   if(CopyRates(_Symbol, PERIOD_H1, 0, 3, h1Rates) < 2) return;
   
   double prevBarHigh = h1Rates[1].high;
   double targetSL = prevBarHigh + 0.50; // Just above previous H1 high
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(posInfo.SelectByIndex(i))
      {
         if(posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber && posInfo.PositionType() == POSITION_TYPE_SELL)
         {
            double curSL = posInfo.StopLoss();
            if(curSL == 0.0 || targetSL < curSL - 0.20)
            {
               trade.PositionModify(posInfo.Ticket(), targetSL, posInfo.TakeProfit());
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| True Freeroll: Update Basket SL to Volume-Weighted Breakeven     |
//+------------------------------------------------------------------+
void UpdateFreerollBasketSL()
{
   double totalVolume = 0.0;
   double totalValue = 0.0;
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(posInfo.SelectByIndex(i))
      {
         if(posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber && posInfo.PositionType() == POSITION_TYPE_SELL)
         {
            totalVolume += posInfo.Volume();
            totalValue += posInfo.PriceOpen() * posInfo.Volume();
         }
      }
   }
   
   if(totalVolume > 0)
   {
      double basketBE = totalValue / totalVolume; // Volume-Weighted Average Price
      double targetSL = basketBE - InpBreakevenBufferUSD; // Lock small buffer
      
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         if(posInfo.SelectByIndex(i))
         {
            if(posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber && posInfo.PositionType() == POSITION_TYPE_SELL)
            {
               double curSL = posInfo.StopLoss();
               if(curSL == 0.0 || targetSL < curSL - 0.10)
               {
                  trade.PositionModify(posInfo.Ticket(), targetSL, posInfo.TakeProfit());
               }
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
      g_currentStatusText  = "HARVEST COMPLETE / DONE FOR WEEK";
      g_currentStatusColor = clrMagenta;
      g_actionDetailText   = "ปิดรอบแล้ว รอประเมินรอบวันอังคารถัดไป";
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
      Print("[+] GoldTuesdaySnowballEA v2.20 Initialized for Symbol: ", _Symbol);
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
      // Reset Tuesday state variables
      g_tueOpenPrice       = 0.0;
      g_tueHighestPrice    = 0.0;
      g_pullbackReached    = false;
      g_peakFloatingProfit = 0.0;
      
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
            g_currentStatusText  = "MONDAY OBSERVATION";
            g_currentStatusColor = clrDeepSkyBlue;
            g_actionDetailText   = StringFormat("สัปดาห์ก่อนหน้า %+.2f%% | เฝ้าดูการกวาดสภาพคล่องวันจันทร์", g_priorWeekGain);
         }
         else
         {
            g_currentStatusText  = "WAITING FOR NEXT TUESDAY";
            g_currentStatusColor = clrGold;
            g_actionDetailText   = StringFormat("สัปดาห์ก่อนหน้าบวก %+.2f%% | สแตนด์บายรอวันอังคาร", g_priorWeekGain);
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
   
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   
   // Record Tuesday Open and Track High
   if(g_tueOpenPrice == 0.0)
   {
      g_tueOpenPrice = bid;
      g_tueHighestPrice = ask;
   }
   if(ask > g_tueHighestPrice)
   {
      g_tueHighestPrice = ask;
   }
   if(g_tueHighestPrice >= g_tueOpenPrice + InpUpwardBufferUSD)
   {
      g_pullbackReached = true;
   }
   
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
   
   // 2. Trailing Stop & Profit Lock on the Basket
   if(activeCount > 0)
   {
      UpdateTrailingH1Structure();
      
      double floatingProfit = 0.0;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         if(posInfo.SelectByIndex(i))
         {
            if(posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber)
            {
               floatingProfit += posInfo.Profit() + posInfo.Swap();
            }
         }
      }
      
      if(floatingProfit > g_peakFloatingProfit)
      {
         g_peakFloatingProfit = floatingProfit;
      }
      
      if(InpTrailProfitLockThresh > 0 && g_peakFloatingProfit >= InpTrailProfitLockThresh)
      {
         double minAllowedProfit = g_peakFloatingProfit * (1.0 - InpTrailGivebackPct);
         if(floatingProfit <= minAllowedProfit)
         {
            CloseAllPositions(StringFormat("Basket Profit Lock (Peak $%.0f -> Locked $%.0f)", g_peakFloatingProfit, floatingProfit));
            return;
         }
      }
   }
   
   // 3. Open Layer 1 (Pullback / Sweep Trigger)
   if(activeCount == 0 && (g_lastTradedWeek != currentWeek || g_lastTradedYear != currentYear))
   {
      if(dt.hour == 0 && dt.min < 15) return; // Wait 15 mins for spread normalization
      
      double priorGain = 0.0, monO = 0.0, friC = 0.0;
      if(CheckPriorWeekSetupFast(weekId, priorGain, monO, friC))
      {
         bool triggerEntry = false;
         
         if(InpEntryMode == ENTRY_IMMEDIATE)
         {
            triggerEntry = true;
         }
         else if(InpEntryMode == ENTRY_BREAKDOWN)
         {
            // Must have pushed above Tuesday Open + Buffer, and now dropped by ReversalDrop
            if(g_pullbackReached && bid <= (g_tueHighestPrice - InpReversalDropUSD))
            {
               triggerEntry = true;
            }
         }
         else if(InpEntryMode == ENTRY_LIMIT)
         {
            if(bid >= (g_tueOpenPrice + InpUpwardBufferUSD))
            {
               triggerEntry = true;
            }
         }
         
         if(triggerEntry)
         {
            double initialSL = ask + InpInitialSLUSD;
            if(trade.Sell(InpLayer1Lot, _Symbol, bid, initialSL, 0, InpTradeComment + "_L1"))
            {
               g_lastTradedWeek = currentWeek;
               g_lastTradedYear = currentYear;
               if(!g_isTester) Print("[+] เปิดไม้ 1 บนยอดสำเร็จ! ตั๋ว #", trade.ResultOrder(), " ที่ราคา: ", bid);
            }
         }
         else
         {
            if(!g_isTester && currentTime - g_lastUIUpdate >= 1)
            {
               g_currentStatusText  = "WAITING FOR PULLBACK TO HIGH";
               g_currentStatusColor = clrGold;
               g_actionDetailText   = StringFormat("รอราคาดันขึ้นเป้า $%.2f (ปัจจุบัน High $%.2f)", g_tueOpenPrice + InpUpwardBufferUSD, g_tueHighestPrice);
               UpdateDashboard();
               g_lastUIUpdate = currentTime;
            }
            return;
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
   
   // 4. Pyramiding Snowball on the Dump
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
         
         // 1. Open next layer first
         double newSL = ask + InpInitialSLUSD;
         if(trade.Sell(nextLot, _Symbol, bid, newSL, 0, layerComment))
         {
            if(InpUseH1StructureTrail)
            {
               UpdateTrailingH1Structure();
            }
            else
            {
               UpdateFreerollBasketSL();
            }
         }
      }
   }
   
   // Update UI in live mode
   if(!g_isTester && currentTime - g_lastUIUpdate >= 1)
   {
      if(activeCount >= 1 && activeCount < 4)
      {
         g_currentStatusText  = StringFormat("ACTIVE: SNOWBALL RUNNING (L%d)", activeCount);
         g_currentStatusColor = clrLimeGreen;
         g_actionDetailText   = StringFormat("ถือ %d ไม้ (Freeroll ล็อกทุนแล้ว) | รอสโนว์บอลไม้ถัดไปที่ $%.2f", activeCount, lowestEntry - InpStepPriceUSD);
      }
      else if(activeCount == 4)
      {
         g_currentStatusText  = "SUPER DUMP: ALL 4 LAYERS ACTIVE! 🚀";
         g_currentStatusColor = clrAqua;
         g_actionDetailText   = StringFormat("สโนว์บอลครบ 4 ไม้ รันเทรนด์เต็มกำลัง (Peak: $%.0f)", g_peakFloatingProfit);
      }
      UpdateDashboard();
      g_lastUIUpdate = currentTime;
   }
}
//+------------------------------------------------------------------+
