import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'skynet.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');

// 1. Transactions table
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL, -- 'ค่าใช้จ่าย' | 'การลงทุน'
    category TEXT NOT NULL, -- Item name or specific category (e.g. 'อาหารแมว', 'Zaza')
    category_group TEXT NOT NULL DEFAULT 'ETC', -- 'LIFE' | 'EXTRAVAGANT' | 'BILL' | 'INVESTING' | 'ETC'
    amount REAL NOT NULL,
    note TEXT,
    raw_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 2. Migration: Ensure category_group column exists if table existed previously
try {
  const tableInfo = db.prepare('PRAGMA table_info(transactions)').all();
  const hasCategoryGroup = tableInfo.some((col) => col.name === 'category_group');
  if (!hasCategoryGroup) {
    db.exec("ALTER TABLE transactions ADD COLUMN category_group TEXT NOT NULL DEFAULT 'ETC'");
  }
  const hasRawText = tableInfo.some((col) => col.name === 'raw_text');
  if (!hasRawText) {
    db.exec("ALTER TABLE transactions ADD COLUMN raw_text TEXT");
  }
} catch (e) {
  console.error('Migration error on transactions table:', e);
}

// 3. Bot logs table (Ingestion & Audit Log)
db.exec(`
  CREATE TABLE IF NOT EXISTS bot_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_message TEXT NOT NULL,
    parsed_count INTEGER NOT NULL DEFAULT 0,
    parsed_data TEXT, -- JSON snapshot of parsed items
    status TEXT NOT NULL, -- 'SUCCESS' | 'PARTIAL' | 'ERROR'
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 4. Category Rules table (Rule Dictionary & Learning Memory)
db.exec(`
  CREATE TABLE IF NOT EXISTS category_rules (
    keyword TEXT PRIMARY KEY,
    category_group TEXT NOT NULL,
    suggested_type TEXT DEFAULT 'ค่าใช้จ่าย'
  );
`);

// Seed default rules if empty
const ruleCount = db.prepare('SELECT COUNT(*) as count FROM category_rules').get().count;
if (ruleCount === 0) {
  const insertRule = db.prepare(`
    INSERT OR REPLACE INTO category_rules (keyword, category_group, suggested_type)
    VALUES (?, ?, ?)
  `);

  const defaultRules = [
    // BILL (หนี้สิน, บิลคงที่, wifi, ค่าห้อง, subscription)
    ['จ่ายหนี้', 'BILL', 'ค่าใช้จ่าย'],
    ['ธันเดอ', 'BILL', 'ค่าใช้จ่าย'],
    ['paylater', 'BILL', 'ค่าใช้จ่าย'],
    ['easaycash', 'BILL', 'ค่าใช้จ่าย'],
    ['easycash', 'BILL', 'ค่าใช้จ่าย'],
    ['wifi', 'BILL', 'ค่าใช้จ่าย'],
    ['เน็ต', 'BILL', 'ค่าใช้จ่าย'],
    ['bill', 'BILL', 'ค่าใช้จ่าย'],
    ['บิล', 'BILL', 'ค่าใช้จ่าย'],
    ['ซ่อมเครื่องทำน้ำอุ่น', 'BILL', 'ค่าใช้จ่าย'],
    ['ซ่อม', 'BILL', 'ค่าใช้จ่าย'],
    ['gpu', 'BILL', 'ค่าใช้จ่าย'],
    ['yt', 'BILL', 'ค่าใช้จ่าย'],
    ['youtube', 'BILL', 'ค่าใช้จ่าย'],
    ['netflix', 'BILL', 'ค่าใช้จ่าย'],
    ['gpu+yt', 'BILL', 'ค่าใช้จ่าย'],
    ['ค่าไฟ', 'BILL', 'ค่าใช้จ่าย'],
    ['ค่าน้ำ', 'BILL', 'ค่าใช้จ่าย'],
    ['ค่าห้อง', 'BILL', 'ค่าใช้จ่าย'],
    ['ผ่อน', 'BILL', 'ค่าใช้จ่าย'],
    ['บัตร', 'BILL', 'ค่าใช้จ่าย'],

    // LIFE (ปัจจัย 4, อาหาร, ใช้ชีวิตประจำวัน, ยา, ของใช้)
    ['อาหารแมว', 'LIFE', 'ค่าใช้จ่าย'],
    ['อาหาร', 'LIFE', 'ค่าใช้จ่าย'],
    ['ข้าว', 'LIFE', 'ค่าใช้จ่าย'],
    ['กาแฟ', 'LIFE', 'ค่าใช้จ่าย'],
    ['eat', 'LIFE', 'ค่าใช้จ่าย'],
    ['food', 'LIFE', 'ค่าใช้จ่าย'],
    ['ยา', 'LIFE', 'ค่าใช้จ่าย'],
    ['หมอ', 'LIFE', 'ค่าใช้จ่าย'],
    ['ของใช้', 'LIFE', 'ค่าใช้จ่าย'],
    ['เซเว่น', 'LIFE', 'ค่าใช้จ่าย'],
    ['7-11', 'LIFE', 'ค่าใช้จ่าย'],
    ['ตลาด', 'LIFE', 'ค่าใช้จ่าย'],
    ['เดินทาง', 'LIFE', 'ค่าใช้จ่าย'],
    ['น้ำมัน', 'LIFE', 'ค่าใช้จ่าย'],

    // EXTRAVAGANT (ฟุ่มเฟือย, ช้อปปิ้ง, ขนม, สังสรรค์, Zaza)
    ['zaza', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['ช้อปปิ้ง', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['shopping', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['เสื้อผ้า', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['ของเล่น', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['เที่ยว', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['เหล้า', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['เบียร์', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['บุฟเฟต์', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['โอมากาเสะ', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['บาร์', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['เกม', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],

    // INVESTING (การลงทุน, หุ้น, คริปโต, ออมเงิน)
    ['หุ้น', 'INVESTING', 'การลงทุน'],
    ['หุ้นกู้', 'INVESTING', 'การลงทุน'],
    ['กองทุน', 'INVESTING', 'การลงทุน'],
    ['btc', 'INVESTING', 'การลงทุน'],
    ['crypto', 'INVESTING', 'การลงทุน'],
    ['คริปโต', 'INVESTING', 'การลงทุน'],
    ['ทอง', 'INVESTING', 'การลงทุน'],
    ['ทองคำ', 'INVESTING', 'การลงทุน'],
    ['ออมเงิน', 'INVESTING', 'การลงทุน'],
    ['dca', 'INVESTING', 'การลงทุน'],
    ['พอร์ต', 'INVESTING', 'การลงทุน'],
  ];

  const insertMany = db.transaction((rules) => {
    for (const [kw, grp, type] of rules) {
      insertRule.run(kw.toLowerCase(), grp, type);
    }
  });
  insertMany(defaultRules);
}

// 5. Debts table
db.exec(`
  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    keywords TEXT NOT NULL, -- comma-separated keywords for auto-linking
    initial_amount REAL NOT NULL,
    interest_rate REAL NOT NULL, -- % per year
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 6. Investment Drawdown table
db.exec(`
  CREATE TABLE IF NOT EXISTS investment_drawdown (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_usd REAL NOT NULL DEFAULT 5000,
    exchange_rate REAL NOT NULL DEFAULT 36.0,
    note TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default debts if empty
const debtCount = db.prepare('SELECT COUNT(*) as count FROM debts').get().count;
if (debtCount === 0) {
  const insertDebt = db.prepare(`
    INSERT INTO debts (name, keywords, initial_amount, interest_rate, note)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertDebt.run('Finnix', 'finnix,ฟินนิกซ์', 10000, 33, 'สินเชื่อ Finnix ดอกเบี้ย 33% ต่อปี');
  insertDebt.run('Money Thunder', 'ธันเดอ,thunder,money thunder', 30140.99, 33, 'สินเชื่อ Money Thunder ดอกเบี้ย 33% ต่อปี');
  insertDebt.run('Shopee Paylater', 'paylater,shopee', 4568.17, 25, 'Shopee SPayLater ดอกเบี้ย 25% ต่อปี');
  insertDebt.run('EasyCash', 'easaycash,easycash', 17188.26, 33, 'Shopee EasyCash ดอกเบี้ย 33% ต่อปี');
}

// Seed default investment drawdown if empty
const drawdownCount = db.prepare('SELECT COUNT(*) as count FROM investment_drawdown').get().count;
if (drawdownCount === 0) {
  db.prepare(`
    INSERT INTO investment_drawdown (amount_usd, exchange_rate, note)
    VALUES (5000, 36.0, 'ยอดติดลบจากพอร์ตการลงทุน ($5,000 USD)')
  `).run();
}

export default db;
