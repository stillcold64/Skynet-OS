//+------------------------------------------------------------------+
//|                                                 TradeManager.mqh |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                             https://github.com/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/"
#property version   "1.00"

class CTradeManager
{
private:
   ulong          m_magicNumber;
   string         m_symbol;
   int            m_bePoints;
   int            m_bufferPoints;
   int            m_trailingPoints;

public:
   CTradeManager() : m_magicNumber(88827000), m_bePoints(200), m_bufferPoints(20), m_trailingPoints(0) {}
   ~CTradeManager() {}

   void Init(string symbol, ulong magic, int bePoints, int bufferPoints, int trailingPoints)
   {
      m_symbol         = symbol;
      m_magicNumber    = magic;
      m_bePoints       = bePoints;
      m_bufferPoints   = bufferPoints;
      m_trailingPoints = trailingPoints;
   }

   // นับจำนวนไม้ที่ EA นี้เปิดอยู่
   int CountOpenPositions(ENUM_POSITION_TYPE posType = POSITION_TYPE_BUY)
   {
      int count = 0;
      int total = PositionsTotal();
      for(int i = total - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber)
            {
               if(PositionGetInteger(POSITION_TYPE) == (long)posType)
                  count++;
            }
         }
      }
      return count;
   }

   // หาราคาเปิดสูงสุดของไม้ Buy ปัจจุบัน
   double GetHighestBuyPrice()
   {
      double highest = 0.0;
      int total = PositionsTotal();
      for(int i = total - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber &&
               PositionGetInteger(POSITION_TYPE) == (long)POSITION_TYPE_BUY)
            {
               double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
               if(openPrice > highest)
                  highest = openPrice;
            }
         }
      }
      return highest;
   }

   // ตรวจสอบว่าไม้เปิดทุกไม้ได้รับการตั้ง Breakeven (Free-Roll) แล้วหรือไม่
   bool ArePositionsSecured()
   {
      int total = 0;
      int secured = 0;
      int totalPos = PositionsTotal();

      for(int i = totalPos - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber &&
               PositionGetInteger(POSITION_TYPE) == (long)POSITION_TYPE_BUY)
            {
               total++;
               double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
               double sl = PositionGetDouble(POSITION_SL);
               // ถือว่าปลอดภัยถ้า SL ตั้งไว้เท่ากับหรือสูงกว่าราคาเปิด
               if(sl >= (openPrice - 0.0001))
                  secured++;
            }
         }
      }

      if(total == 0) return true;
      return (total == secured);
   }

   // ปรับ Stop Loss สำหรับ Position
   bool ModifySL(ulong ticket, double newSL, double curTP)
   {
      MqlTradeRequest request;
      MqlTradeResult  result;
      ZeroMemory(request);
      ZeroMemory(result);

      request.action   = TRADE_ACTION_SLTP;
      request.position = ticket;
      request.symbol   = m_symbol;
      request.sl       = newSL;
      request.tp       = curTP;

      bool res = OrderSend(request, result);
      if(!res)
      {
         PrintFormat("[TradeManager] Failed to modify SL for Ticket #%I64u: retcode=%d", ticket, result.retcode);
      }
      return res;
   }

   // เลื่อน Stop Loss บังหน้าทุน (Breakeven) และทำ Trailing Stop
   void ManageBreakevenAndTrailing()
   {
      double point = SymbolInfoDouble(m_symbol, SYMBOL_POINT);
      double currentBid = SymbolInfoDouble(m_symbol, SYMBOL_BID);
      int digits = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);
      int totalPos = PositionsTotal();

      for(int i = totalPos - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber &&
               PositionGetInteger(POSITION_TYPE) == (long)POSITION_TYPE_BUY)
            {
               double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
               double curSL     = PositionGetDouble(POSITION_SL);
               double curTP     = PositionGetDouble(POSITION_TP);

               // 1. Breakeven
               if(m_bePoints > 0)
               {
                  double profitDistance = currentBid - openPrice;
                  if(profitDistance >= m_bePoints * point)
                  {
                     double newSL = NormalizeDouble(openPrice + (m_bufferPoints * point), digits);
                     if(curSL < openPrice)
                     {
                        if(ModifySL(ticket, newSL, curTP))
                        {
                           PrintFormat("[TradeManager] Breakeven locked for Ticket #%I64u at %.5f", ticket, newSL);
                        }
                     }
                  }
               }

               // 2. Trailing Stop
               if(m_trailingPoints > 0 && curSL >= openPrice)
               {
                  double proposedSL = NormalizeDouble(currentBid - (m_trailingPoints * point), digits);
                  if(proposedSL > curSL + (10 * point))
                  {
                     ModifySL(ticket, proposedSL, curTP);
                  }
               }
            }
         }
      }
   }

   // เปิดไม้ Buy ใหม่
   bool OpenBuy(double lotSize, double initialSLPoints = 0, string comment = "DCA_Snowball")
   {
      double ask = SymbolInfoDouble(m_symbol, SYMBOL_ASK);
      double point = SymbolInfoDouble(m_symbol, SYMBOL_POINT);
      int digits = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);

      double sl = 0.0;
      if(initialSLPoints > 0)
         sl = NormalizeDouble(ask - (initialSLPoints * point), digits);

      MqlTradeRequest request;
      MqlTradeResult  result;
      ZeroMemory(request);
      ZeroMemory(result);

      request.action       = TRADE_ACTION_DEAL;
      request.symbol       = m_symbol;
      request.volume       = lotSize;
      request.type         = ORDER_TYPE_BUY;
      request.price        = ask;
      request.sl           = sl;
      request.tp           = 0.0;
      request.deviation    = 50;
      request.magic        = m_magicNumber;
      request.comment      = comment;
      request.type_filling = ORDER_FILLING_FOK;

      // ตรวจสอบ Filling mode ที่ symbol รองรับ
      uint filling = (uint)SymbolInfoInteger(m_symbol, SYMBOL_FILLING_MODE);
      if((filling & SYMBOL_FILLING_IOC) != 0)
         request.type_filling = ORDER_FILLING_IOC;
      else if((filling & SYMBOL_FILLING_FOK) != 0)
         request.type_filling = ORDER_FILLING_FOK;
      else
         request.type_filling = ORDER_FILLING_RETURN;

      bool res = OrderSend(request, result);
      if(res && (result.retcode == TRADE_RETCODE_DONE || result.retcode == TRADE_RETCODE_PLACED))
      {
         PrintFormat("[TradeManager] Buy opened successfully: Lot=%.2f, Price=%.5f, SL=%.5f", lotSize, ask, sl);
         return true;
      }
      else
      {
         PrintFormat("[TradeManager] Failed to open Buy: %d", result.retcode);
         return false;
      }
   }

   // คำนวณกำไรสุทธิลอยตัวของทุกไม้ใน EA นี้
   double GetTotalFloatingProfit()
   {
      double totalProfit = 0.0;
      int totalPos = PositionsTotal();
      for(int i = totalPos - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber)
            {
               totalProfit += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
            }
         }
      }
      return totalProfit;
   }

   // ปิด Position ด้วย Ticket
   bool ClosePositionByTicket(ulong ticket)
   {
      if(!PositionSelectByTicket(ticket)) return false;

      MqlTradeRequest request;
      MqlTradeResult  result;
      ZeroMemory(request);
      ZeroMemory(result);

      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      double volume = PositionGetDouble(POSITION_VOLUME);
      string sym = PositionGetString(POSITION_SYMBOL);

      request.action    = TRADE_ACTION_DEAL;
      request.position  = ticket;
      request.symbol    = sym;
      request.volume    = volume;
      request.deviation = 50;
      request.magic     = m_magicNumber;

      if(posType == POSITION_TYPE_BUY)
      {
         request.type  = ORDER_TYPE_SELL;
         request.price = SymbolInfoDouble(sym, SYMBOL_BID);
      }
      else
      {
         request.type  = ORDER_TYPE_BUY;
         request.price = SymbolInfoDouble(sym, SYMBOL_ASK);
      }

      uint filling = (uint)SymbolInfoInteger(sym, SYMBOL_FILLING_MODE);
      if((filling & SYMBOL_FILLING_IOC) != 0)
         request.type_filling = ORDER_FILLING_IOC;
      else if((filling & SYMBOL_FILLING_FOK) != 0)
         request.type_filling = ORDER_FILLING_FOK;
      else
         request.type_filling = ORDER_FILLING_RETURN;

      return OrderSend(request, result);
   }

   // ปิดออเดอร์ทั้งหมดของ EA นี้ (สำหรับกรณี Trend Reversal หรือ Emergency Stop)
   void CloseAllPositions()
   {
      int totalPos = PositionsTotal();
      for(int i = totalPos - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber)
            {
               ClosePositionByTicket(ticket);
            }
         }
      }
      Print("[TradeManager] All positions closed.");
   }

   // ปิดทำกำไรบางส่วน (Trim) เช่น ปิดไม้ที่กำไรสูงสุดเพื่อดึงทุนออก
   bool TrimBestPosition()
   {
      ulong bestTicket = 0;
      double maxProfit = 0.0;
      int totalPos = PositionsTotal();

      for(int i = totalPos - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber)
            {
               double p = PositionGetDouble(POSITION_PROFIT);
               if(p > maxProfit)
               {
                  maxProfit = p;
                  bestTicket = ticket;
               }
            }
         }
      }

      if(bestTicket > 0)
      {
         PrintFormat("[TradeManager] Trimming best position Ticket #%I64u with profit $%.2f", bestTicket, maxProfit);
         return ClosePositionByTicket(bestTicket);
      }
      return false;
   }
};
