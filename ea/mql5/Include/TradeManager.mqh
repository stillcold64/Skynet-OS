//+------------------------------------------------------------------+
//|                                                 TradeManager.mqh |
//|                                  Copyright 2026, Skynet OS / UHNWI |
//|                                             https://github.com/  |
//+------------------------------------------------------------------+
#property copyright "Skynet OS / UHNWI"
#property link      "https://github.com/"
#property version   "1.10"

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

   // นับจำนวนไม้ที่ EA นี้เปิดอยู่ตามประเภท (Buy / Sell หรือ รวม)
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

   // นับจำนวนไม้ทั้งหมดของ EA นี้ (ทั้ง Buy และ Sell)
   int CountAllOpenPositions()
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

   // หาราคาเปิดต่ำสุดของไม้ Sell ปัจจุบัน
   double GetLowestSellPrice()
   {
      double lowest = DBL_MAX;
      int total = PositionsTotal();
      for(int i = total - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber &&
               PositionGetInteger(POSITION_TYPE) == (long)POSITION_TYPE_SELL)
            {
               double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
               if(openPrice < lowest)
                  lowest = openPrice;
            }
         }
      }
      return (lowest == DBL_MAX) ? 0.0 : lowest;
   }

   // ตรวจสอบว่าไม้เปิดทุกไม้ได้รับการตั้ง Breakeven (Free-Roll) แล้วหรือไม่
   bool ArePositionsSecured(ENUM_POSITION_TYPE posType = POSITION_TYPE_BUY)
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
               PositionGetInteger(POSITION_TYPE) == (long)posType)
            {
               total++;
               double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
               double sl = PositionGetDouble(POSITION_SL);
               if(posType == POSITION_TYPE_BUY)
               {
                  if(sl >= (openPrice - 0.0001))
                     secured++;
               }
               else
               {
                  if(sl > 0.0 && sl <= (openPrice + 0.0001))
                     secured++;
               }
            }
         }
      }

      if(total == 0) return true;
      return (total == secured);
   }

   // ปรับ Stop Loss และ Take Profit สำหรับ Position
   bool ModifySLTP(ulong ticket, double newSL, double newTP)
   {
      MqlTradeRequest request;
      MqlTradeResult  result;
      ZeroMemory(request);
      ZeroMemory(result);

      request.action   = TRADE_ACTION_SLTP;
      request.position = ticket;
      request.symbol   = m_symbol;
      request.sl       = newSL;
      request.tp       = newTP;

      bool res = OrderSend(request, result);
      if(!res)
      {
         PrintFormat("[TradeManager] Failed to modify SL/TP for Ticket #%I64u: retcode=%d", ticket, result.retcode);
      }
      return res;
   }

   // ฟังก์ชันดั้งเดิมสำหรับปรับ SL
   bool ModifySL(ulong ticket, double newSL, double curTP)
   {
      return ModifySLTP(ticket, newSL, curTP);
   }

   // เลื่อน Stop Loss บังหน้าทุน (Breakeven) และทำ Trailing Stop แบบ Point
   void ManageBreakevenAndTrailing()
   {
      double point      = SymbolInfoDouble(m_symbol, SYMBOL_POINT);
      double currentBid = SymbolInfoDouble(m_symbol, SYMBOL_BID);
      double currentAsk = SymbolInfoDouble(m_symbol, SYMBOL_ASK);
      int digits        = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);
      int totalPos      = PositionsTotal();

      for(int i = totalPos - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber)
            {
               long posType     = PositionGetInteger(POSITION_TYPE);
               double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
               double curSL     = PositionGetDouble(POSITION_SL);
               double curTP     = PositionGetDouble(POSITION_TP);

               // --- จัดการฝั่ง BUY ---
               if(posType == POSITION_TYPE_BUY)
               {
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
                              PrintFormat("[TradeManager] Breakeven locked for Buy #%I64u at %.5f", ticket, newSL);
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
               // --- จัดการฝั่ง SELL ---
               else if(posType == POSITION_TYPE_SELL)
               {
                  // 1. Breakeven
                  if(m_bePoints > 0)
                  {
                     double profitDistance = openPrice - currentAsk;
                     if(profitDistance >= m_bePoints * point)
                     {
                        double newSL = NormalizeDouble(openPrice - (m_bufferPoints * point), digits);
                        if(curSL <= 0.0 || curSL > openPrice)
                        {
                           if(ModifySL(ticket, newSL, curTP))
                              PrintFormat("[TradeManager] Breakeven locked for Sell #%I64u at %.5f", ticket, newSL);
                        }
                     }
                  }

                  // 2. Trailing Stop
                  if(m_trailingPoints > 0 && curSL > 0.0 && curSL <= openPrice)
                  {
                     double proposedSL = NormalizeDouble(currentAsk + (m_trailingPoints * point), digits);
                     if(proposedSL < curSL - (10 * point))
                     {
                        ModifySL(ticket, proposedSL, curTP);
                     }
                  }
               }
            }
         }
      }
   }

   // จัดการ Trailing Stop ตามความผันผวนของตลาด (Chandelier / ATR Trailing Stop)
   void ManageATRTrailing(double atrValue, double atrMultiplier, double minProfitPoints = 0)
   {
      if(atrValue <= 0.0 || atrMultiplier <= 0.0) return;

      double point      = SymbolInfoDouble(m_symbol, SYMBOL_POINT);
      double currentBid = SymbolInfoDouble(m_symbol, SYMBOL_BID);
      double currentAsk = SymbolInfoDouble(m_symbol, SYMBOL_ASK);
      int digits        = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);
      double trailDist  = atrValue * atrMultiplier;
      int totalPos      = PositionsTotal();

      for(int i = totalPos - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber)
            {
               long posType     = PositionGetInteger(POSITION_TYPE);
               double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
               double curSL     = PositionGetDouble(POSITION_SL);
               double curTP     = PositionGetDouble(POSITION_TP);

               if(posType == POSITION_TYPE_BUY)
               {
                  if(minProfitPoints > 0 && (currentBid - openPrice) < (minProfitPoints * point))
                     continue;

                  double proposedSL = NormalizeDouble(currentBid - trailDist, digits);
                  if(proposedSL > curSL + (10 * point))
                  {
                     ModifySL(ticket, proposedSL, curTP);
                  }
               }
               else if(posType == POSITION_TYPE_SELL)
               {
                  if(minProfitPoints > 0 && (openPrice - currentAsk) < (minProfitPoints * point))
                     continue;

                  double proposedSL = NormalizeDouble(currentAsk + trailDist, digits);
                  if(curSL <= 0.0 || proposedSL < curSL - (10 * point))
                  {
                     ModifySL(ticket, proposedSL, curTP);
                  }
               }
            }
         }
      }
   }

   // คำนวณ Lot Size อัตโนมัติตามเปอร์เซ็นต์ความเสี่ยงของ Equity (สไตล์ David Druz 0.5%)
   double CalculateLotSizeFromRisk(double riskPct, double slDistancePoints, double fallbackLot = 0.01)
   {
      if(riskPct <= 0.0 || slDistancePoints <= 0.0)
         return fallbackLot;

      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      if(equity <= 0.0) equity = AccountInfoDouble(ACCOUNT_BALANCE);

      double riskMoney = equity * (riskPct / 100.0);

      double tickValue = SymbolInfoDouble(m_symbol, SYMBOL_TRADE_TICK_VALUE);
      double tickSize  = SymbolInfoDouble(m_symbol, SYMBOL_TRADE_TICK_SIZE);
      double point     = SymbolInfoDouble(m_symbol, SYMBOL_POINT);

      if(tickSize <= 0.0 || point <= 0.0 || tickValue <= 0.0)
         return fallbackLot;

      double valuePerPoint = tickValue * (point / tickSize);
      double lossPerLot = slDistancePoints * valuePerPoint;

      if(lossPerLot <= 0.0) return fallbackLot;

      double calculatedLot = riskMoney / lossPerLot;

      double minLot  = SymbolInfoDouble(m_symbol, SYMBOL_VOLUME_MIN);
      double maxLot  = SymbolInfoDouble(m_symbol, SYMBOL_VOLUME_MAX);
      double stepLot = SymbolInfoDouble(m_symbol, SYMBOL_VOLUME_STEP);

      if(stepLot > 0.0)
         calculatedLot = MathFloor(calculatedLot / stepLot) * stepLot;

      if(calculatedLot < minLot) calculatedLot = minLot;
      if(calculatedLot > maxLot) calculatedLot = maxLot;

      return NormalizeDouble(calculatedLot, 2);
   }

   // เปิดไม้ Buy ใหม่ โดยระบุระยะ SL เป็น Points (สำหรับ DCASnowball)
   bool OpenBuy(double lotSize, int initialSLPoints, string comment = "DCA_Snowball")
   {
      double ask   = SymbolInfoDouble(m_symbol, SYMBOL_ASK);
      double point = SymbolInfoDouble(m_symbol, SYMBOL_POINT);
      double sl    = (initialSLPoints > 0) ? (ask - (initialSLPoints * point)) : 0.0;
      return OpenBuy(lotSize, sl, 0.0, comment);
   }

   // เปิดไม้ Buy ใหม่
   bool OpenBuy(double lotSize, double initialSL = 0.0, double initialTP = 0.0, string comment = "DavidDruz_Buy")
   {
      double ask = SymbolInfoDouble(m_symbol, SYMBOL_ASK);
      int digits = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);

      MqlTradeRequest request;
      MqlTradeResult  result;
      ZeroMemory(request);
      ZeroMemory(result);

      request.action       = TRADE_ACTION_DEAL;
      request.symbol       = m_symbol;
      request.volume       = lotSize;
      request.type         = ORDER_TYPE_BUY;
      request.price        = ask;
      request.sl           = (initialSL > 0.0) ? NormalizeDouble(initialSL, digits) : 0.0;
      request.tp           = (initialTP > 0.0) ? NormalizeDouble(initialTP, digits) : 0.0;
      request.deviation    = 50;
      request.magic        = m_magicNumber;
      request.comment      = comment;

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
         PrintFormat("[TradeManager] Buy opened: Lot=%.2f, Price=%.5f, SL=%.5f", lotSize, ask, request.sl);
         return true;
      }
      else
      {
         PrintFormat("[TradeManager] Failed to open Buy: %d", result.retcode);
         return false;
      }
   }

   // เปิดไม้ Sell ใหม่
   bool OpenSell(double lotSize, double initialSL = 0.0, double initialTP = 0.0, string comment = "DavidDruz_Sell")
   {
      double bid = SymbolInfoDouble(m_symbol, SYMBOL_BID);
      int digits = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);

      MqlTradeRequest request;
      MqlTradeResult  result;
      ZeroMemory(request);
      ZeroMemory(result);

      request.action       = TRADE_ACTION_DEAL;
      request.symbol       = m_symbol;
      request.volume       = lotSize;
      request.type         = ORDER_TYPE_SELL;
      request.price        = bid;
      request.sl           = (initialSL > 0.0) ? NormalizeDouble(initialSL, digits) : 0.0;
      request.tp           = (initialTP > 0.0) ? NormalizeDouble(initialTP, digits) : 0.0;
      request.deviation    = 50;
      request.magic        = m_magicNumber;
      request.comment      = comment;

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
         PrintFormat("[TradeManager] Sell opened: Lot=%.2f, Price=%.5f, SL=%.5f", lotSize, bid, request.sl);
         return true;
      }
      else
      {
         PrintFormat("[TradeManager] Failed to open Sell: %d", result.retcode);
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

   // ปิดออเดอร์เฉพาะประเภท (Buy หรือ Sell)
   void ClosePositionsByType(ENUM_POSITION_TYPE posType)
   {
      int totalPos = PositionsTotal();
      for(int i = totalPos - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionGetString(POSITION_SYMBOL) == m_symbol &&
               PositionGetInteger(POSITION_MAGIC) == (long)m_magicNumber &&
               PositionGetInteger(POSITION_TYPE) == (long)posType)
            {
               ClosePositionByTicket(ticket);
            }
         }
      }
   }

   // ปิดออเดอร์ทั้งหมดของ EA นี้
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

   // ปิดทำกำไรไม้ที่ดีที่สุด (Trim)
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
