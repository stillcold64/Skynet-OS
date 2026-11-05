import db from './db.js';
import { getBangkokDate } from './reflections_db.js';

export function parseBetaCashflowMessage(rawText) {
  if (typeof rawText !== 'string' || !/(?:beta|เบต้า)/i.test(rawText)) return null;

  const isWithdrawal = /ถอน|เบิก|โอนออก/.test(rawText);
  const isDeposit = /เติม|ฝาก|โอนเข้า|เพิ่มทุน/.test(rawText);
  if (!isWithdrawal && !isDeposit) return null;

  const amountMatch = rawText.trim().match(/(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท|฿)?\s*$/);
  if (!amountMatch) return { error: 'ใส่จำนวนเงินท้ายข้อความ เช่น เติมเงินพอร์ตเบต้า 2 1500' };
  const amountIndex = rawText.lastIndexOf(amountMatch[1]);
  const amount = Number(amountMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'จำนวนเงินต้องมากกว่า 0' };

  const accountMatch = rawText.match(/(?:พอร์ต|พอท|port)?\s*(?:beta|เบต้า)\s*#?\s*(\d+)\b/i);
  if (!accountMatch || accountMatch.index + accountMatch[0].lastIndexOf(accountMatch[1]) >= amountIndex) {
    return { error: 'ระบุหมายเลขพอร์ต Beta ด้วย เช่น เติมเงินพอร์ตเบต้า 2 1500' };
  }
  const accountNumber = Number(accountMatch[1]);
  if (!Number.isSafeInteger(accountNumber) || accountNumber < 1 || accountNumber > 9999) {
    return { error: 'หมายเลขพอร์ต Beta ต้องอยู่ระหว่าง 1 ถึง 9999' };
  }

  return {
    accountNumber,
    direction: isWithdrawal ? 'WITHDRAWAL' : 'DEPOSIT',
    amount: Math.round(amount * 100) / 100,
    eventDate: getBangkokDate(),
  };
}

export function recordBetaCashflow({ eventKey, accountNumber, direction, amount, eventDate, rawText, telegramChatId, telegramMsgId }) {
  const record = db.transaction(() => {
    const existing = db.prepare('SELECT id, portfolio_id, bot_log_id FROM beta_cashflows WHERE event_key = ?').get(eventKey);
    if (existing) return { ...existing, duplicate: true };

    const portfolioCode = `BETA-${accountNumber}`;
    db.prepare(`
      INSERT INTO beta_portfolios (portfolio_code, account_number, display_name)
      VALUES (?, ?, ?)
      ON CONFLICT(portfolio_code) DO NOTHING
    `).run(portfolioCode, accountNumber, `Beta ${accountNumber}`);
    const portfolio = db.prepare('SELECT id FROM beta_portfolios WHERE portfolio_code = ?').get(portfolioCode);

    const log = db.prepare(`
      INSERT INTO bot_logs (raw_message, parsed_count, parsed_data, status, transaction_ids, telegram_msg_id)
      VALUES (?, 1, ?, 'SUCCESS', '[]', ?)
    `).run(rawText, JSON.stringify([{
      kind: 'BETA_CASHFLOW', portfolio_code: portfolioCode, direction,
      amount, currency: 'THB', event_date: eventDate,
    }]), telegramMsgId);

    const result = db.prepare(`
      INSERT INTO beta_cashflows (
        event_key, portfolio_id, direction, amount, currency, event_date,
        source, raw_text, telegram_chat_id, telegram_msg_id, bot_log_id
      ) VALUES (?, ?, ?, ?, 'THB', ?, 'TELEGRAM', ?, ?, ?, ?)
    `).run(eventKey, portfolio.id, direction, amount, eventDate || getBangkokDate(), rawText,
      String(telegramChatId), telegramMsgId, log.lastInsertRowid);

    return { id: result.lastInsertRowid, portfolioId: portfolio.id, botLogId: log.lastInsertRowid, duplicate: false };
  });
  return record();
}

export function getBetaPortfolioDashboard() {
  const accounts = db.prepare(`
    SELECT
      p.id,
      p.portfolio_code,
      p.account_number,
      p.display_name,
      COALESCE(SUM(CASE WHEN e.status = 'ACTIVE' AND e.direction = 'DEPOSIT' THEN e.amount ELSE 0 END), 0) AS totalDeposited,
      COALESCE(SUM(CASE WHEN e.status = 'ACTIVE' AND e.direction = 'WITHDRAWAL' THEN e.amount ELSE 0 END), 0) AS totalWithdrawn,
      COUNT(CASE WHEN e.status = 'ACTIVE' THEN 1 END) AS activeEventCount,
      MAX(CASE WHEN e.status = 'ACTIVE' THEN e.event_date END) AS lastActivityDate
    FROM beta_portfolios p
    LEFT JOIN beta_cashflows e ON e.portfolio_id = p.id
    GROUP BY p.id
    ORDER BY p.account_number ASC
  `).all().map((row) => ({
    ...row,
    totalDeposited: Math.round(row.totalDeposited * 100) / 100,
    totalWithdrawn: Math.round(row.totalWithdrawn * 100) / 100,
    netContributed: Math.round((row.totalDeposited - row.totalWithdrawn) * 100) / 100,
    currentValue: null,
    currentValueSource: null,
    currency: 'THB',
  }));

  const totalDeposited = accounts.reduce((sum, account) => sum + account.totalDeposited, 0);
  const totalWithdrawn = accounts.reduce((sum, account) => sum + account.totalWithdrawn, 0);
  return {
    summary: {
      accountCount: accounts.length,
      totalDeposited: Math.round(totalDeposited * 100) / 100,
      totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
      netContributed: Math.round((totalDeposited - totalWithdrawn) * 100) / 100,
      currentValue: null,
      currentValueSource: null,
      currency: 'THB',
    },
    accounts,
  };
}

export function getBetaPortfolioEvents(portfolioId) {
  return db.prepare(`
    SELECT id, event_key, portfolio_id, direction, amount, currency, event_date,
      source, raw_text, telegram_chat_id, telegram_msg_id, bot_log_id,
      status, sheet_sync_status, sheet_sync_error, created_at, updated_at
    FROM beta_cashflows
    WHERE portfolio_id = ?
    ORDER BY event_date DESC, id DESC
  `).all(portfolioId);
}

export function getBetaCashflowsForSheet() {
  return db.prepare(`
    SELECT e.id, e.event_key, p.portfolio_code, p.display_name, p.account_number,
      e.direction, e.amount, e.currency, e.event_date, e.status, e.source,
      e.raw_text, e.telegram_chat_id, e.telegram_msg_id, e.bot_log_id,
      e.sheet_sync_status, e.sheet_sync_error, e.created_at, e.updated_at
    FROM beta_cashflows e
    JOIN beta_portfolios p ON p.id = e.portfolio_id
    ORDER BY e.id ASC
  `).all();
}

export function updateBetaCashflowSync(success, error = '') {
  if (success) {
    return db.prepare(`
      UPDATE beta_cashflows
      SET sheet_sync_status = 'SYNCED', sheet_sync_error = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE sheet_sync_status != 'SYNCED'
    `).run().changes;
  }
  return db.prepare(`
    UPDATE beta_cashflows
    SET sheet_sync_status = 'PENDING', sheet_sync_error = ?, updated_at = CURRENT_TIMESTAMP
    WHERE sheet_sync_status = 'PENDING'
  `).run(String(error || 'Google Sheets did not confirm sync').slice(0, 500)).changes;
}

export function cancelBetaCashflowsByBotLog(botLogId) {
  return db.prepare(`
    UPDATE beta_cashflows
    SET status = 'CANCELLED', sheet_sync_status = 'PENDING', sheet_sync_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE bot_log_id = ? AND status = 'ACTIVE'
  `).run(botLogId).changes;
}

export function getPendingBetaCashflowCount() {
  return db.prepare(`SELECT COUNT(*) AS count FROM beta_cashflows WHERE sheet_sync_status = 'PENDING'`).get().count;
}
