//+------------------------------------------------------------------+
//|                                                  RiskManager.mqh |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                             https://github.com/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/"
#property version   "1.00"

class CRiskManager
{
private:
   int      m_maxSpreadPoints;
   double   m_maxDrawdownPct;
   double   m_minMarginLevel;

public:
   CRiskManager() : m_maxSpreadPoints(500), m_maxDrawdownPct(50.0), m_minMarginLevel(200.0) {}
   ~CRiskManager() {}

   void Init(int maxSpreadPoints, double maxDrawdownPct, double minMarginLevel)
   {
      m_maxSpreadPoints = maxSpreadPoints;
      m_maxDrawdownPct  = maxDrawdownPct;
      m_minMarginLevel  = minMarginLevel;
   }

   // ตรวจสอบว่าค่า Spread อยู่ในเกณฑ์ที่ปลอดภัยหรือไม่
   bool IsSpreadOk(string symbol)
   {
      long spread = SymbolInfoInteger(symbol, SYMBOL_SPREAD);
      if(m_maxSpreadPoints > 0 && spread > m_maxSpreadPoints)
      {
         PrintFormat("[RiskManager] Spread too high: %d > %d", spread, m_maxSpreadPoints);
         return false;
      }
      return true;
   }

   // ตรวจสอบระดับ Margin Level ว่าเพียงพอสำหรับเปิดไม้เพิ่ม (Snowball) หรือไม่
   bool IsMarginLevelOk()
   {
      double margin = AccountInfoDouble(ACCOUNT_MARGIN);
      if(margin <= 0.0) return true; // ยังไม่มีการใช้ margin

      double marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
      if(m_minMarginLevel > 0 && marginLevel < m_minMarginLevel)
      {
         PrintFormat("[RiskManager] Margin Level too low: %.2f%% < %.2f%%", marginLevel, m_minMarginLevel);
         return false;
      }
      return true;
   }

   // ตรวจสอบ Drawdown รวมของพอร์ต
   bool IsDrawdownExceeded(double initialBalance)
   {
      if(m_maxDrawdownPct <= 0.0 || initialBalance <= 0.0) return false;

      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      double currentDdPct = ((initialBalance - equity) / initialBalance) * 100.0;

      if(currentDdPct >= m_maxDrawdownPct)
      {
         PrintFormat("[RiskManager] Max Drawdown reached: %.2f%% >= %.2f%%", currentDdPct, m_maxDrawdownPct);
         return true;
      }
      return false;
   }
};
