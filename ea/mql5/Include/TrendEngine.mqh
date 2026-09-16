//+------------------------------------------------------------------+
//|                                                 TrendEngine.mqh  |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                             https://github.com/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/"
#property version   "1.00"

class CTrendEngine
{
private:
   string            m_symbol;
   ENUM_TIMEFRAMES   m_timeframe;
   int               m_maHandle;
   int               m_atrHandle;
   int               m_entryBars;
   int               m_exitBars;
   int               m_maPeriod;
   ENUM_MA_METHOD    m_maMethod;
   int               m_atrPeriod;

public:
   CTrendEngine() :
      m_symbol(""),
      m_timeframe(PERIOD_CURRENT),
      m_maHandle(INVALID_HANDLE),
      m_atrHandle(INVALID_HANDLE),
      m_entryBars(20),
      m_exitBars(10),
      m_maPeriod(200),
      m_maMethod(MODE_EMA),
      m_atrPeriod(14)
   {}

   ~CTrendEngine()
   {
      Release();
   }

   bool Init(string symbol,
             ENUM_TIMEFRAMES tf,
             int entryBars,
             int exitBars,
             int maPeriod,
             ENUM_MA_METHOD maMethod,
             int atrPeriod)
   {
      m_symbol    = symbol;
      m_timeframe = tf;
      m_entryBars = entryBars;
      m_exitBars  = exitBars;
      m_maPeriod  = maPeriod;
      m_maMethod  = maMethod;
      m_atrPeriod = atrPeriod;

      Release();

      // สร้าง Handle ตัวชี้วัด Moving Average
      m_maHandle = iMA(m_symbol, m_timeframe, m_maPeriod, 0, m_maMethod, PRICE_CLOSE);
      if(m_maHandle == INVALID_HANDLE)
      {
         PrintFormat("[TrendEngine] Failed to create MA indicator handle for %s!", m_symbol);
         return false;
      }

      // สร้าง Handle ตัวชี้วัด ATR
      m_atrHandle = iATR(m_symbol, m_timeframe, m_atrPeriod);
      if(m_atrHandle == INVALID_HANDLE)
      {
         PrintFormat("[TrendEngine] Failed to create ATR indicator handle for %s!", m_symbol);
         return false;
      }

      return true;
   }

   void Release()
   {
      if(m_maHandle != INVALID_HANDLE)
      {
         IndicatorRelease(m_maHandle);
         m_maHandle = INVALID_HANDLE;
      }
      if(m_atrHandle != INVALID_HANDLE)
      {
         IndicatorRelease(m_atrHandle);
         m_atrHandle = INVALID_HANDLE;
      }
   }

   // ดึงค่าราคาสูงสุดในช่วง N แท่ง (Donchian High) ย้อนหลังเริ่มจาก shift
   double GetDonchianHigh(int count, int shift = 1)
   {
      if(count <= 0) return 0.0;
      double highArr[];
      ArraySetAsSeries(highArr, true);
      if(CopyHigh(m_symbol, m_timeframe, shift, count, highArr) <= 0)
         return 0.0;

      int idx = ArrayMaximum(highArr, 0, count);
      if(idx < 0) return 0.0;
      return highArr[idx];
   }

   // ดึงค่าราคาต่ำสุดในช่วง N แท่ง (Donchian Low) ย้อนหลังเริ่มจาก shift
   double GetDonchianLow(int count, int shift = 1)
   {
      if(count <= 0) return 0.0;
      double lowArr[];
      ArraySetAsSeries(lowArr, true);
      if(CopyLow(m_symbol, m_timeframe, shift, count, lowArr) <= 0)
         return 0.0;

      int idx = ArrayMinimum(lowArr, 0, count);
      if(idx < 0) return 0.0;
      return lowArr[idx];
   }

   // ดึงค่า Moving Average ล่าสุดตาม shift
   double GetMA(int shift = 1)
   {
      if(m_maHandle == INVALID_HANDLE) return 0.0;
      double maArr[];
      ArraySetAsSeries(maArr, true);
      if(CopyBuffer(m_maHandle, 0, shift, 1, maArr) <= 0)
         return 0.0;
      return maArr[0];
   }

   // ดึงค่า ATR ล่าสุดตาม shift
   double GetATR(int shift = 1)
   {
      if(m_atrHandle == INVALID_HANDLE) return 0.0;
      double atrArr[];
      ArraySetAsSeries(atrArr, true);
      if(CopyBuffer(m_atrHandle, 0, shift, 1, atrArr) <= 0)
         return 0.0;
      return atrArr[0];
   }

   // ตรวจจับสัญญาณ BUY (Buy Strength)
   // 1. ราคาปิดแท่งก่อนหน้า (Close[1]) ทะลุ Donchian High ของ N แท่งก่อนหน้า (shift 2)
   // 2. ราคาอยู่เหนือ Moving Average (Trend Filter)
   bool CheckBuySignal(bool useMAFilter = true)
   {
      double closeArr[];
      ArraySetAsSeries(closeArr, true);
      if(CopyClose(m_symbol, m_timeframe, 1, 1, closeArr) <= 0)
         return false;

      double lastClose = closeArr[0];
      double entryHigh = GetDonchianHigh(m_entryBars, 2);
      if(entryHigh <= 0.0) return false;

      if(lastClose <= entryHigh)
         return false;

      if(useMAFilter)
      {
         double maVal = GetMA(1);
         if(maVal > 0.0 && lastClose < maVal)
            return false;
      }

      return true;
   }

   // ตรวจจับสัญญาณ SELL (Sell Weakness)
   // 1. ราคาปิดแท่งก่อนหน้า (Close[1]) หลุด Donchian Low ของ N แท่งก่อนหน้า (shift 2)
   // 2. ราคาอยู่ต่ำกว่า Moving Average (Trend Filter)
   bool CheckSellSignal(bool useMAFilter = true)
   {
      double closeArr[];
      ArraySetAsSeries(closeArr, true);
      if(CopyClose(m_symbol, m_timeframe, 1, 1, closeArr) <= 0)
         return false;

      double lastClose = closeArr[0];
      double entryLow = GetDonchianLow(m_entryBars, 2);
      if(entryLow <= 0.0) return false;

      if(lastClose >= entryLow)
         return false;

      if(useMAFilter)
      {
         double maVal = GetMA(1);
         if(maVal > 0.0 && lastClose > maVal)
            return false;
      }

      return true;
   }

   // ตรวจจับสัญญาณ Exit สำหรับ Buy (ราคาปิดหลุด Donchian Low ของ Exit Period)
   bool CheckBuyExitSignal()
   {
      if(m_exitBars <= 0) return false;
      double closeArr[];
      ArraySetAsSeries(closeArr, true);
      if(CopyClose(m_symbol, m_timeframe, 1, 1, closeArr) <= 0)
         return false;

      double exitLow = GetDonchianLow(m_exitBars, 2);
      if(exitLow <= 0.0) return false;

      return (closeArr[0] < exitLow);
   }

   // ตรวจจับสัญญาณ Exit สำหรับ Sell (ราคาปิดทะลุ Donchian High ของ Exit Period)
   bool CheckSellExitSignal()
   {
      if(m_exitBars <= 0) return false;
      double closeArr[];
      ArraySetAsSeries(closeArr, true);
      if(CopyClose(m_symbol, m_timeframe, 1, 1, closeArr) <= 0)
         return false;

      double exitHigh = GetDonchianHigh(m_exitBars, 2);
      if(exitHigh <= 0.0) return false;

      return (closeArr[0] > exitHigh);
   }
};
