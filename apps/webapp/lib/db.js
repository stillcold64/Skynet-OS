import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always locate the canonical database directory under apps/webapp/data
const dataDir = path.resolve(__dirname, '..', 'data');
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

// Migration: Ensure transaction_ids and telegram_msg_id columns exist in bot_logs
try {
  const botLogInfo = db.prepare('PRAGMA table_info(bot_logs)').all();
  if (!botLogInfo.some((col) => col.name === 'transaction_ids')) {
    db.exec('ALTER TABLE bot_logs ADD COLUMN transaction_ids TEXT');
  }
  if (!botLogInfo.some((col) => col.name === 'telegram_msg_id')) {
    db.exec('ALTER TABLE bot_logs ADD COLUMN telegram_msg_id INTEGER');
  }
} catch (e) {
  console.error('Migration error on bot_logs table:', e);
}

// 3.1 Project Vault (Idea Parking Lot for high-creative mind)
db.exec(`
  CREATE TABLE IF NOT EXISTS project_vault (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'HOBBY',
    status TEXT DEFAULT 'PARKED',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 3.2 Roadmap Steps & Strategic Milestones (Editable progression ladder)
db.exec(`
  CREATE TABLE IF NOT EXISTS roadmap_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_num INTEGER NOT NULL DEFAULT 1,
    step_order INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    condition_text TEXT,
    target_amount REAL DEFAULT 0,
    current_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'IN_PROGRESS', -- 'DONE' | 'IN_PROGRESS' | 'PENDING'
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default roadmap steps if empty
try {
  const stepCount = db.prepare('SELECT COUNT(*) as count FROM roadmap_steps').get().count;
  if (stepCount === 0) {
    const insertStep = db.prepare(`
      INSERT INTO roadmap_steps (phase_num, step_order, title, condition_text, target_amount, current_amount, status, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Phase 1: ความอยู่รอด & ฆ่าหนี้ก้อนแรก
    insertStep.run(1, 1, 'ฆ่าหนี้ Shopee Paylater ให้เหลือ 0 ฿ (เหลือ 2,117 ฿)', 'ปลดล็อกเงินสดค่างวดคืนกระเป๋า 1,261 ฿/ด. ทันที', 4568.17, 2451.17, 'IN_PROGRESS', 'ก้อนที่ใกล้หมดที่สุด');
    insertStep.run(1, 2, 'คุมงบหย่อนใจ (ขนม + Zaza) รวมกันไม่เกิน 1,500 ฿/ด.', 'ไม่หักดิบ แต่หยุดการดึงเงินเก็บเก่ามาใช้', 1500, 2179, 'IN_PROGRESS', 'เพดานคุมความเสี่ยง');
    insertStep.run(1, 3, 'โฟกัสประสิทธิภาพงานประจำ (เงินเดือน 15,000 ฿)', 'รักษาฐานเงินสดความอยู่รอดให้มั่นคง ไม่ให้หลุด', 15000, 15000, 'DONE', 'กระแสเงินสดหลัก');
    insertStep.run(1, 4, 'ปล่อยบอท EA รัน MT5 Demo ต่อเนื่อง ไร้อารมณ์', 'เก็บสถิติ Win Rate โดยไม่ต้องเฝ้าจอ ไม่รบกวนเวลางาน', 0, 0, 'IN_PROGRESS', 'GoldTuesday / BTCSnowball');

    // Phase 2: สโนว์บอลปิด Finnix & ขยายเงินสด
    insertStep.run(2, 1, 'สโนว์บอลปิดหนี้ Finnix 9,388 ฿ ให้หมด 100%', 'ตัดดอกเบี้ย 33% และปลดค่างวด 612 ฿/ด. คืนกระเป๋า', 10000, 612, 'PENDING', 'เป้าหมายหลักเฟส 2');
    insertStep.run(2, 2, 'กระแสเงินสดสุทธิเริ่มเป็นบวกเกิน +4,000 ฿/ด.', 'เงินเดือนประจำเริ่มเหลือกินเหลือเก็บจริง', 4000, 0, 'PENDING', 'สภาพคล่องพร้อม');
    insertStep.run(2, 3, 'เริ่มเปิดพอร์ต Cent ($20 ~ 700 ฿) รัน EA ตัวแรก', 'ใช้เงินเย็นที่ประหยัดได้จากค่างวดหนี้มาทดสอบจริง', 700, 0, 'PENDING', 'ความเสี่ยงจำกัด');

    // Phase 3: ปลอดหนี้ถาวร & สร้างความมั่งคั่ง
    insertStep.run(3, 1, 'ปิดหนี้ EasyCash & Money Thunder ให้หนี้รวมเป็น 0.00 ฿', 'ปลอดหนี้ 100% ดอกเบี้ยหยุดไหลออกถาวร', 47329, 0, 'PENDING', 'อิสรภาพจากหนี้');
    insertStep.run(3, 2, 'เริ่มพอร์ต Beta: DCA Bitcoin / คริปโต Spot เดือนละ 1,000-1,500 ฿', 'ออมสินทรัพย์เติบโตระยะยาวโดยไร้ความกังวล', 1500, 0, 'PENDING', 'สะสมความมั่งคั่ง');
    insertStep.run(3, 3, 'สะสมเงินสำรองฉุกเฉิน 3-6 เดือน & ลุยโปรเจกต์ใน Vault', 'ปลูกต้นไม้/ทำช่องยูทูป ด้วยความสบายใจ', 50000, 0, 'PENDING', 'เป้าหมายระยะยาว');
  }
} catch (e) {
  console.error('Error seeding roadmap_steps:', e);
}

// Seed default vault ideas if empty
try {
  const vaultCount = db.prepare('SELECT COUNT(*) as count FROM project_vault').get().count;
  if (vaultCount === 0) {
    const insertVault = db.prepare(`
      INSERT INTO project_vault (title, category, status, note)
      VALUES (?, ?, ?, ?)
    `);
    insertVault.run('ปลูกผักไฮโดรโปนิกส์ & กัญชา', 'HOBBY', 'PARKED', 'กิจกรรมฮีลใจ รีเซ็ตสติหน้าดิน ไม่ต้องวัดผลกำไร');
    insertVault.run('ทำช่อง YouTube คอนเทนต์การเงิน / จิตวิทยา', 'MEDIA', 'PARKED', 'ปั้นแบรนด์ระยะยาว ถ่ายทอดประสบการณ์จริง');
    insertVault.run('ที่ปรึกษาจิตวิทยาการเทรด (Trading Psychology Coach)', 'CAREER', 'PARKED', 'ฟรีแลนซ์/อาชีพเสริม นำบทเรียนความผิดพลาดไปช่วยเทรดเดอร์คนอื่น');
  }
} catch (e) {
  console.error('Error seeding project_vault:', e);
}

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
    ['yt', 'BILL', 'ค่าใช้จ่าย'],
    ['youtube', 'BILL', 'ค่าใช้จ่าย'],
    ['netflix', 'BILL', 'ค่าใช้จ่าย'],
    ['ค่าไฟ', 'BILL', 'ค่าใช้จ่าย'],
    ['ค่าน้ำ', 'BILL', 'ค่าใช้จ่าย'],
    ['ค่าห้อง', 'BILL', 'ค่าใช้จ่าย'],
    ['ผ่อน', 'BILL', 'ค่าใช้จ่าย'],
    ['บัตร', 'BILL', 'ค่าใช้จ่าย'],

    // LIFE (ปัจจัย 4, อาหาร, ซ่อมแซม, ใช้ชีวิตประจำวัน, ยา, ของใช้)
    ['ซ่อมเครื่องทำน้ำอุ่น', 'LIFE', 'ค่าใช้จ่าย'],
    ['ซ่อม', 'LIFE', 'ค่าใช้จ่าย'],
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
    ['gpu', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],
    ['gpu+yt', 'EXTRAVAGANT', 'ค่าใช้จ่าย'],

    // INVESTING (การลงทุน, หุ้น, คริปโต, ออมเงิน)
    ['ลงทุน', 'INVESTING', 'การลงทุน'],
    ['การลงทุน', 'INVESTING', 'การลงทุน'],
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
  insertDebt.run('EasyCash', 'easaycash,easycash,easy money,easymoney', 17188.26, 33, 'Shopee EasyCash ดอกเบี้ย 33% ต่อปี');
}

// Seed default investment drawdown if empty
const drawdownCount = db.prepare('SELECT COUNT(*) as count FROM investment_drawdown').get().count;
if (drawdownCount === 0) {
  db.prepare(`
    INSERT INTO investment_drawdown (amount_usd, exchange_rate, note)
    VALUES (5000, 36.0, 'ยอดติดลบจากพอร์ตการลงทุน ($5,000 USD)')
  `).run();
}

// 6.1 Recurring Bills & Fixed Costs Table
db.exec(`
  CREATE TABLE IF NOT EXISTS recurring_bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    keywords TEXT NOT NULL,
    estimated_amount REAL NOT NULL,
    due_day INTEGER DEFAULT 1,
    category_type TEXT DEFAULT 'BILL',
    is_active INTEGER DEFAULT 1,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const billCount = db.prepare('SELECT COUNT(*) as count FROM recurring_bills').get().count;
if (billCount === 0) {
  const insertBill = db.prepare(`
    INSERT INTO recurring_bills (name, keywords, estimated_amount, due_day, note)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertBill.run('Money Thunder', 'ธันเดอ,thunder,money thunder', 2000, 1, 'ค่างวดสินเชื่อ Money Thunder');
  insertBill.run('EasyCash', 'easaycash,easycash,easy money', 1867, 1, 'ค่างวด Shopee EasyCash');
  insertBill.run('Shopee Paylater', 'paylater,shoppee paylater,shopee paylater', 1261, 1, 'ค่างวด Shopee SPayLater');
  insertBill.run('Finnix', 'finnix,ฟินนิกซ์', 612, 2, 'ค่างวดสินเชื่อ Finnix');
  insertBill.run('WiFi / เน็ตบ้าน', 'wifi,เน็ต,เน็ตบ้าน', 524, 5, 'ค่าอินเทอร์เน็ตบ้านรายเดือน');
  insertBill.run('ค่าน้ำประปา', 'น้ำประปา,ค่าน้ำ,ประปา', 142, 5, 'ค่าน้ำประปาที่พัก');
  insertBill.run('ค่าน้ำบ้านยาย', 'ค่าน้ำบ้านยาย,ประปาบ้านยาย,ประปายาย,น้ำยาย,ค่าน้ำยาย,ประผายาย', 44, 5, 'ค่าน้ำประปาบ้านยาย');
  insertBill.run('ค่าไฟ', 'ค่าไฟ,การไฟฟ้า', 1560, 21, 'ค่าไฟฟ้าประจำเดือน');
  insertBill.run('ค่าไฟบ้านยาย', 'ค่าไฟยาย,ไฟยาย', 400, 21, 'ค่าไฟฟ้าบ้านยาย');
}

// 6.2 Item Aliases & Canonical Names Normalization Table
db.exec(`
  CREATE TABLE IF NOT EXISTS item_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT UNIQUE NOT NULL COLLATE NOCASE,
    canonical_name TEXT NOT NULL,
    category_group TEXT NOT NULL,
    suggested_type TEXT DEFAULT 'ค่าใช้จ่าย',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const aliasCount = db.prepare('SELECT COUNT(*) as count FROM item_aliases').get().count;
if (aliasCount === 0) {
  const insertAlias = db.prepare(`
    INSERT OR REPLACE INTO item_aliases (alias, canonical_name, category_group, suggested_type, note)
    VALUES (?, ?, ?, ?, ?)
  `);

  const defaultAliases = [
    // Water bills (Home)
    ['ค่าน้ำ', 'ค่าน้ำประปา', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาที่พัก'],
    ['ค่าน้ำประปา', 'ค่าน้ำประปา', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาที่พัก'],
    ['น้ำประปา', 'ค่าน้ำประปา', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาที่พัก'],
    ['ประปา', 'ค่าน้ำประปา', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาที่พัก'],
    ['บิลค่าน้ำ', 'ค่าน้ำประปา', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาที่พัก'],
    ['บิลน้ำ', 'ค่าน้ำประปา', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาที่พัก'],

    // Water bills (Grandma)
    ['ค่าน้ำยาย', 'ค่าน้ำบ้านยาย', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาบ้านยาย'],
    ['ค่าน้ำบ้านยาย', 'ค่าน้ำบ้านยาย', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาบ้านยาย'],
    ['น้ำยาย', 'ค่าน้ำบ้านยาย', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาบ้านยาย'],
    ['ประปายาย', 'ค่าน้ำบ้านยาย', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาบ้านยาย'],
    ['ประปาบ้านยาย', 'ค่าน้ำบ้านยาย', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาบ้านยาย'],
    ['ประผายาย', 'ค่าน้ำบ้านยาย', 'BILL', 'ค่าใช้จ่าย', 'ค่าน้ำประปาบ้านยาย (Typo safe)'],

    // Electricity bills (Home)
    ['ค่าไฟ', 'ค่าไฟ', 'BILL', 'ค่าใช้จ่าย', 'ค่าไฟฟ้าที่พัก'],
    ['ค่าไฟฟ้า', 'ค่าไฟ', 'BILL', 'ค่าใช้จ่าย', 'ค่าไฟฟ้าที่พัก'],
    ['การไฟฟ้า', 'ค่าไฟ', 'BILL', 'ค่าใช้จ่าย', 'ค่าไฟฟ้าที่พัก'],
    ['บิลค่าไฟ', 'ค่าไฟ', 'BILL', 'ค่าใช้จ่าย', 'ค่าไฟฟ้าที่พัก'],
    ['บิลไฟ', 'ค่าไฟ', 'BILL', 'ค่าใช้จ่าย', 'ค่าไฟฟ้าที่พัก'],

    // Electricity bills (Grandma)
    ['ค่าไฟยาย', 'ค่าไฟบ้านยาย', 'BILL', 'ค่าใช้จ่าย', 'ค่าไฟฟ้าบ้านยาย'],
    ['ไฟยาย', 'ค่าไฟบ้านยาย', 'BILL', 'ค่าใช้จ่าย', 'ค่าไฟฟ้าบ้านยาย'],
    ['ค่าไฟบ้านยาย', 'ค่าไฟบ้านยาย', 'BILL', 'ค่าใช้จ่าย', 'ค่าไฟฟ้าบ้านยาย'],
    ['ค่าไฟฟ้าบ้านยาย', 'ค่าไฟบ้านยาย', 'BILL', 'ค่าใช้จ่าย', 'ค่าไฟฟ้าบ้านยาย'],

    // Internet / WiFi
    ['wifi', 'WiFi / เน็ตบ้าน', 'BILL', 'ค่าใช้จ่าย', 'ค่าอินเทอร์เน็ตรายเดือน'],
    ['ค่าwifi', 'WiFi / เน็ตบ้าน', 'BILL', 'ค่าใช้จ่าย', 'ค่าอินเทอร์เน็ตรายเดือน'],
    ['เน็ต', 'WiFi / เน็ตบ้าน', 'BILL', 'ค่าใช้จ่าย', 'ค่าอินเทอร์เน็ตรายเดือน'],
    ['เน็ตบ้าน', 'WiFi / เน็ตบ้าน', 'BILL', 'ค่าใช้จ่าย', 'ค่าอินเทอร์เน็ตรายเดือน'],
    ['ค่าเน็ต', 'WiFi / เน็ตบ้าน', 'BILL', 'ค่าใช้จ่าย', 'ค่าอินเทอร์เน็ตรายเดือน'],
    ['ค่าเน็ตบ้าน', 'WiFi / เน็ตบ้าน', 'BILL', 'ค่าใช้จ่าย', 'ค่าอินเทอร์เน็ตรายเดือน'],
    ['ไวไฟ', 'WiFi / เน็ตบ้าน', 'BILL', 'ค่าใช้จ่าย', 'ค่าอินเทอร์เน็ตรายเดือน'],

    // Debts & Installments
    ['shopee paylater', 'Shopee Paylater', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee SPayLater'],
    ['paylater', 'Shopee Paylater', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee SPayLater'],
    ['spaylater', 'Shopee Paylater', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee SPayLater'],
    ['shoppee paylater', 'Shopee Paylater', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee SPayLater'],
    ['จ่ายหนี้ paylater', 'Shopee Paylater', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee SPayLater'],
    ['easycash', 'EasyCash', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee EasyCash'],
    ['easaycash', 'EasyCash', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee EasyCash'],
    ['easymoney', 'EasyCash', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee EasyCash'],
    ['easy money', 'EasyCash', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee EasyCash'],
    ['จ่ายหนี้ easaycash', 'EasyCash', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee EasyCash'],
    ['จ่ายหนี้ easycash', 'EasyCash', 'BILL', 'ค่าใช้จ่าย', 'ค่างวด Shopee EasyCash'],
    ['finnix', 'Finnix', 'BILL', 'ค่าใช้จ่าย', 'ค่างวดสินเชื่อ Finnix'],
    ['ฟินนิกซ์', 'Finnix', 'BILL', 'ค่าใช้จ่าย', 'ค่างวดสินเชื่อ Finnix'],
    ['money thunder', 'Money Thunder', 'BILL', 'ค่าใช้จ่าย', 'ค่างวดสินเชื่อ Money Thunder'],
    ['thunder', 'Money Thunder', 'BILL', 'ค่าใช้จ่าย', 'ค่างวดสินเชื่อ Money Thunder'],
    ['ธันเดอร์', 'Money Thunder', 'BILL', 'ค่าใช้จ่าย', 'ค่างวดสินเชื่อ Money Thunder'],
    ['ธันเดอ', 'Money Thunder', 'BILL', 'ค่าใช้จ่าย', 'ค่างวดสินเชื่อ Money Thunder'],
    ['มันนี่ธันเดอร์', 'Money Thunder', 'BILL', 'ค่าใช้จ่าย', 'ค่างวดสินเชื่อ Money Thunder'],
    ['จ่ายหนี้ ธันเดอ', 'Money Thunder', 'BILL', 'ค่าใช้จ่าย', 'ค่างวดสินเชื่อ Money Thunder'],
    ['จ่ายหนี้ ธันเดอร์', 'Money Thunder', 'BILL', 'ค่าใช้จ่าย', 'ค่างวดสินเชื่อ Money Thunder'],

    // Subscriptions
    ['youtube', 'YouTube Premium', 'BILL', 'ค่าใช้จ่าย', 'Subscription YouTube Premium'],
    ['yt', 'YouTube Premium', 'BILL', 'ค่าใช้จ่าย', 'Subscription YouTube Premium'],
    ['youtube premium', 'YouTube Premium', 'BILL', 'ค่าใช้จ่าย', 'Subscription YouTube Premium'],
    ['yt premium', 'YouTube Premium', 'BILL', 'ค่าใช้จ่าย', 'Subscription YouTube Premium'],
    ['netflix', 'Netflix', 'BILL', 'ค่าใช้จ่าย', 'Subscription Netflix'],

    // Food & Living
    ['กาแแฟ', 'กาแฟ', 'LIFE', 'ค่าใช้จ่าย', 'กาแฟ (Typo fix)'],
    ['กาแฟ', 'กาแฟ', 'LIFE', 'ค่าใช้จ่าย', 'กาแฟ'],
    ['ข้าว', 'ข้าว', 'LIFE', 'ค่าใช้จ่าย', 'มื้ออาหาร'],
    ['กินข้าว', 'ข้าว', 'LIFE', 'ค่าใช้จ่าย', 'มื้ออาหาร'],
    ['ถอนตังกินข้าว', 'ถอนตังกินข้าว', 'LIFE', 'ค่าใช้จ่าย', 'ถอนตังกินข้าว'],
    ['ข้าวมันไก่', 'ข้าวมันไก่', 'LIFE', 'ค่าใช้จ่าย', 'ข้าวมันไก่'],
    ['ข้างมันไก่', 'ข้าวมันไก่', 'LIFE', 'ค่าใช้จ่าย', 'ข้าวมันไก่ (Typo fix)'],
    ['กะเพรา', 'ข้าวกะเพรา', 'LIFE', 'ค่าใช้จ่าย', 'ข้าวกะเพรา'],
    ['กระเพรา', 'ข้าวกะเพรา', 'LIFE', 'ค่าใช้จ่าย', 'ข้าวกะเพรา'],
    ['ข้าวกะเพรา', 'ข้าวกะเพรา', 'LIFE', 'ค่าใช้จ่าย', 'ข้าวกะเพรา'],
    ['ข้าวกระเพรา', 'ข้าวกะเพรา', 'LIFE', 'ค่าใช้จ่าย', 'ข้าวกะเพรา'],
    ['ข้างกะเพรา', 'ข้าวกะเพรา', 'LIFE', 'ค่าใช้จ่าย', 'ข้าวกะเพรา (Typo fix)'],
    ['ข้างกระเพรา', 'ข้าวกะเพรา', 'LIFE', 'ค่าใช้จ่าย', 'ข้าวกะเพรา (Typo fix)'],
    ['ข้าวหมูกรอบ', 'ข้าวหมูกรอบ', 'LIFE', 'ค่าใช้จ่าย', 'ข้าวหมูกรอบ'],
    ['ข้างหมูกรอบ', 'ข้าวหมูกรอบ', 'LIFE', 'ค่าใช้จ่าย', 'ข้าวหมูกรอบ (Typo fix)'],
    ['เซเว่น', '7-Eleven', 'LIFE', 'ค่าใช้จ่าย', 'ร้านสะดวกซื้อ 7-Eleven'],
    ['7-11', '7-Eleven', 'LIFE', 'ค่าใช้จ่าย', 'ร้านสะดวกซื้อ 7-Eleven'],
    ['7 eleven', '7-Eleven', 'LIFE', 'ค่าใช้จ่าย', 'ร้านสะดวกซื้อ 7-Eleven'],
    ['macro', 'Makro', 'LIFE', 'ค่าใช้จ่าย', 'ซื้อของ Makro'],
    ['ซื้อของเข้าบ้าน macro', 'Makro', 'LIFE', 'ค่าใช้จ่าย', 'ซื้อของ Makro'],
    ['โลตัส', 'Lotus\'s', 'LIFE', 'ค่าใช้จ่าย', 'ซื้อของ Lotus'],
    ['ซื้อของเข้าบ้านโลตัส', 'Lotus\'s', 'LIFE', 'ค่าใช้จ่าย', 'ซื้อของ Lotus'],
    ['mr diy', 'MR.DIY', 'LIFE', 'ค่าใช้จ่าย', 'MR.DIY ของใช้'],
    ['mrdiy', 'MR.DIY', 'LIFE', 'ค่าใช้จ่าย', 'MR.DIY ของใช้'],
    ['mr diy  life', 'MR.DIY', 'LIFE', 'ค่าใช้จ่าย', 'MR.DIY ของใช้'],

    // Entertainment & Leisure
    ['dota', 'Dota 2', 'EXTRAVAGANT', 'ค่าใช้จ่าย', 'เกม Dota 2'],
    ['dota2', 'Dota 2', 'EXTRAVAGANT', 'ค่าใช้จ่าย', 'เกม Dota 2'],
    ['เติมเกม dota2', 'Dota 2', 'EXTRAVAGANT', 'ค่าใช้จ่าย', 'เกม Dota 2'],
    ['เติมเกม dota', 'Dota 2', 'EXTRAVAGANT', 'ค่าใช้จ่าย', 'เกม Dota 2'],
    ['เติม dota', 'Dota 2', 'EXTRAVAGANT', 'ค่าใช้จ่าย', 'เกม Dota 2'],
    ['เบีย', 'เบียร์', 'EXTRAVAGANT', 'ค่าใช้จ่าย', 'เครื่องดื่มแอลกอฮอล์'],
    ['เบียร์', 'เบียร์', 'EXTRAVAGANT', 'ค่าใช้จ่าย', 'เครื่องดื่มแอลกอฮอล์'],
    ['ขนม', 'ขนม', 'EXTRAVAGANT', 'ค่าใช้จ่าย', 'ขนมคบเคี้ยว'],
  ];

  const insertBatch = db.transaction((aliases) => {
    for (const [alias, canonical, grp, type, note] of aliases) {
      insertAlias.run(alias.toLowerCase(), canonical, grp, type, note);
    }
  });
  insertBatch(defaultAliases);
}

// 7. Playbook Unified Strategy (Master Plan & Core Thesis)
db.exec(`
  CREATE TABLE IF NOT EXISTS playbook_strategy (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    core_thesis TEXT NOT NULL,
    entry_rules TEXT,
    invalidation_rules TEXT,
    risk_rules TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default unified strategy if empty
const strategyCount = db.prepare('SELECT COUNT(*) as count FROM playbook_strategy').get().count;
if (strategyCount === 0) {
  db.prepare(`
    INSERT INTO playbook_strategy (id, title, core_thesis, entry_rules, invalidation_rules, risk_rules)
    VALUES (1, ?, ?, ?, ?, ?)
  `).run(
    'Skynet Unified Trading Plan & Thesis',
    'เข้าเทรดเฉพาะเมื่อโครงสร้างตลาด High Timeframe ชัดเจน เกิดการดึงสภาพคล่อง (Liquidity Sweep) หรือย่อทดสอบจุดรับสำคัญ ไม่ไล่ราคา รอให้ตลาดวิ่งเข้าหาโซน และรักษา R:R ขั้นต่ำ 1:2 เสมอ',
    '1. HTF Trend & Market Structure ตรงทิศทาง\n2. เกิด Liquidity Grab หรือ Rejection ในโซนที่ได้เปรียบ\n3. มีสัญญาณแท่งเทียนกลับตัวหรือคอนเฟิร์มใน Lower Timeframe\n4. อัตราส่วน Risk:Reward ขั้นต่ำ 1:2 R ขึ้นไป',
    '1. ราคาปิดทะลุ Invalid Level (ระดับโครงสร้างเสีย)\n2. เกิดข่าวด่วนหรือ Event กระทบพื้นฐานอย่างมีนัยสำคัญที่ขัดแย้งกับ Thesis\n3. โครงสร้างเปลี่ยนเป็นฝั่งตรงข้ามก่อนถึงจุดเข้า',
    '• เสี่ยงไม่เกิน 1-2% ของพอร์ตต่อไม้เด็ดขาด\n• ห้าม Overtrade หรือ Revenge trade\n• เมื่อกำไรถึง 1.5R พิจารณาขยับ SL บังทุน (BE)'
  );
}

// 8. Playbook Trades Table (Individual Trade Setups & Execution Logs)
db.exec(`
  CREATE TABLE IF NOT EXISTS playbook_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    symbol TEXT,
    direction TEXT NOT NULL DEFAULT 'LONG',
    status TEXT NOT NULL DEFAULT 'WATCHLIST',
    entry_price REAL,
    sl_price REAL,
    tp_price REAL,
    rr_ratio REAL,
    risk_usd REAL,
    thesis TEXT,
    checklist TEXT,
    chart_url TEXT,
    realized_r REAL,
    realized_pnl REAL,
    review_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed 2 sample trades if empty
const tradeCount = db.prepare('SELECT COUNT(*) as count FROM playbook_trades').get().count;
if (tradeCount === 0) {
  const insertTrade = db.prepare(`
    INSERT INTO playbook_trades (date, title, symbol, direction, status, entry_price, sl_price, tp_price, rr_ratio, risk_usd, thesis, checklist, chart_url, realized_r, review_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const todayStr = new Date().toISOString().split('T')[0];

  insertTrade.run(
    todayStr,
    'HTF Key Level Sweep & Rejection Setup',
    'BTC',
    'LONG',
    'WIN',
    64200,
    63400,
    66600,
    3.0,
    100,
    'ราคาลงมากวาดสภาพคล่องจุดต่ำสุดของสัปดาห์ก่อนหน้า แล้วเกิด Rejection แท่งเขียวกลืนกินใน TF 1H ตรงตามเงื่อนไขแผนหลัก',
    JSON.stringify(['HTF Trend In Favor', 'Liquidity Swept', 'R:R >= 2.0', 'Risk <= 1%']),
    '',
    3.0,
    'เข้าตามแผนเป๊ะ ไม่กลัวตอนย่อ ปล่อยรันจนถึงเป้า TP แรก 3R สำเร็จ'
  );

  insertTrade.run(
    todayStr,
    'Trend Continuation Pullback',
    'XAUUSD',
    'LONG',
    'ACTIVE',
    2580,
    2565,
    2625,
    3.0,
    100,
    'ทองคำอยู่ในแนวโน้มขาขึ้นแข็งแกร่ง ย่อลงมาทดสอบแนวรับเส้น EMA และ Demand zone รอแรงซื้อหนุนต่อ',
    JSON.stringify(['HTF Trend In Favor', 'R:R >= 2.0', 'Risk <= 1%']),
    '',
    null,
    null
  );
}

// 9. Playbook Setups Table (Master Setup Library & Trading Blueprints)
db.exec(`
  CREATE TABLE IF NOT EXISTS playbook_setups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    grade TEXT DEFAULT 'A+',
    direction TEXT DEFAULT 'BOTH',
    timeframe TEXT DEFAULT '15M - 1H',
    session TEXT DEFAULT 'London / NY',
    target_rr REAL DEFAULT 3.0,
    thesis TEXT NOT NULL,
    entry_rules TEXT NOT NULL,
    invalidation_rules TEXT,
    exit_rules TEXT,
    risk_rules TEXT,
    mistakes_to_avoid TEXT,
    chart_blueprint_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed 3 default master setups if empty
const setupCount = db.prepare('SELECT COUNT(*) as count FROM playbook_setups').get().count;
if (setupCount === 0) {
  const insertSetup = db.prepare(`
    INSERT OR IGNORE INTO playbook_setups (
      code, title, grade, direction, timeframe, session, target_rr,
      thesis, entry_rules, invalidation_rules, exit_rules, risk_rules, mistakes_to_avoid, chart_blueprint_url
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertSetup.run(
    'SETUP-01',
    'Liquidity Sweep & Market Structure Shift (MSS)',
    'A+',
    'BOTH',
    '15M - 1H',
    'London / New York',
    3.0,
    'ราคาวิ่งกวาดสภาพคล่อง (Liquidity Grab) เหนือ/ใต้ระดับ Swing High/Low สำคัญเพื่อดูดซับสภาพคล่องของรายย่อย (Stop Hunt) จากนั้นเกิด Market Structure Shift หักตัวกลับอย่างรุนแรง เป็นจังหวะที่รายใหญ่ (Smart Money) ได้ของครบและพร้อมดันราคาไปอีกฝั่ง',
    '1. เกิด Liquidity Sweep ชัดเจนที่ Key Level (Asian H/L, Previous Day H/L, Equal H/L)\n2. มีสัญญาณ Market Structure Shift (แท่งเทียนปิดทะลุ Swing สำคัญใน 15M/5M)\n3. ราคาย่อกลับมาทดสอบโซน Imbalance / FVG หรือ Order Block (OB)\n4. Risk:Reward คำนวณแล้วต้องได้อย่างน้อย 1:2.5R ขึ้นไป',
    '• ราคาปิดแท่งเทียนทะลุจุดสูงสุด/ต่ำสุดของแท่งที่กวาดสภาพคล่อง (Invalidation Point)\n• เกิดข่าวด่วนหรือ High Impact News (CPI, FOMC, NFP) ระหว่างรอเข้า',
    '• TP1: อัตราส่วน 2.0R แบ่งปิด 50% และเลื่อน Stop Loss บังทุน (Breakeven)\n• TP2 / Final TP: จุดสภาพคล่องฝั่งตรงข้าม (Opposite Liquidity Pool หรือ Swing High/Low เดิม)',
    '• เสี่ยง 1.0% - 1.5% ของพอร์ต (Grade A+ อนุญาตให้ใส่ขนาดเต็ม Max Risk ของระบบ)',
    '• ห้ามเข้าทันทีก่อนเห็นแท่งปิดคอนเฟิร์ม MSS (อย่าวัดใจรับมีดตอนกำลัง Sweep)\n• ห้ามไล่ราคาถ้าพลาดจังหวะ Retest เข้า FVG/OB ให้รอรอบใหม่',
    ''
  );

  insertSetup.run(
    'SETUP-02',
    'Trend Continuation Pullback to Key Level / EMA',
    'A',
    'BOTH',
    '1H - 4H',
    'Any Active Session',
    2.5,
    'ในตลาดที่มีแนวโน้มชัดเจน (Strong Trend) การย่อตัวกลับมาทดสอบแนวรับ/แนวต้านเดิมที่สอดคล้องกับแนวเส้น Moving Average (EMA 20/50) หรือ Golden Fibonacci Retracement (50-61.8%) เป็นจุดที่มีแรงซื้อ/แรงขายตามน้ำหนุนต่อด้วยความเสี่ยงต่ำ',
    '1. โครงสร้าง High Timeframe (4H/D1) ทำ Higher Highs หรือ Lower Lows ต่อเนื่อง\n2. ราคาย่อตัวแบบ Volume หดตัว (Healthy Pullback) เข้าหา Key Level / EMA Zone\n3. เกิดแท่งเทียนกลับตัว (Pin Bar, Bullish/Bearish Engulfing) ใน Timeframe รอง\n4. R:R ขั้นต่ำ 1:2R ไปยัง High/Low ล่าสุด',
    '• ราคาหลุดทะลุแนวรับ/ต้านสำคัญ และปิดแท่งหลุดเส้นโครงสร้างเทรนด์\n• โมเมนตัม RSI ทำ Divergence ขัดแย้งกับทิศทางเทรนด์อย่างรุนแรง',
    '• TP1: จุดทดสอบ High/Low เดิมของรอบเทรนด์\n• TP2: รัน Trailing Stop ใต้ Swing Low/High ล่าสุดตามเส้น EMA',
    '• เสี่ยง 1.0% ของพอร์ต',
    '• ห้ามเข้าหากตลาดเริ่มเข้าสู่สภาวะ Sideway ไร้ทิศทาง\n• ระวังการซื้อสวนในตอนที่ยังไม่เห็นสัญญาณชะลอตัวของการย่อ',
    ''
  );

  insertSetup.run(
    'SETUP-03',
    'Range High/Low Reversal & Deviation',
    'B',
    'BOTH',
    '15M - 1H',
    'Asian / London Pre-market',
    2.0,
    'เมื่อตลาดอยู่ในกรอบ Sideway Range ราคาที่เบรกหลอกออกนอกกรอบ (Deviation / Fakeout) แล้วกลับเข้ามาปิดข้างในกรอบได้ทันที มักจะวิ่งกลับไปทดสอบขอบกรอบฝั่งตรงข้าม (Mean Reversion to Range Opposite Side)',
    '1. กรอบ Range Bound ชัดเจน มีการทดสอบ High และ Low อย่างน้อยด้านละ 2 ครั้ง\n2. ราคาแทงทะลุกรอบออกไปแต่ไม่มีแรงส่งต่อ (Low Volume Fakeout)\n3. แท่งเทียนกลับเข้ามาปิดข้างในกรอบ Range ชัดเจน\n4. เป้าหมายกำไรอย่างน้อยกึ่งกลางกรอบ (Mid-Range) หรือขอบฝั่งตรงข้าม',
    '• ราคาปิดแท่งนอกกรอบและมีการเปิดแท่งถัดไปรันต่อ (กลายเป็นการ Breakout จริง)',
    '• TP1: Mid-Range (เส้นกึ่งกลาง 50% ของกรอบ)\n• TP2: ขอบกรอบฝั่งตรงข้าม (Range High หรือ Range Low)',
    '• เสี่ยง 0.5% ของพอร์ต (Grade B ควรลดความเสี่ยงครึ่งหนึ่ง)',
    '• ห้ามเล่นเซ็ตอัพนี้ในช่วงที่ตลาดมีข่าวใหญ่กำลังจะประกาศ\n• อย่าถือออเดอร์หวังรันเทรนด์ เพราะสภาวะตลาดเป็น Sideway',
    ''
  );
}

// 10. Trade Journal Table (Multiple Emotional & Psychological Entries per Day)
db.exec(`
  CREATE TABLE IF NOT EXISTS trade_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT,
    session TEXT,
    mood TEXT NOT NULL,
    discipline_score INTEGER DEFAULT 5,
    notes TEXT,
    reflection TEXT,
    synced_to_ggd INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_trade_journal_date ON trade_journal(date);
`);

// Migration: Ensure trade_journal supports multiple entries per day (drop UNIQUE(date) and add time/session)
try {
  const journalTableInfo = db.prepare('PRAGMA table_info(trade_journal)').all();
  const hasTimeCol = journalTableInfo.some((c) => c.name === 'time');
  const indexList = db.prepare('PRAGMA index_list(trade_journal)').all();
  const hasUniqueDate = indexList.some((idx) => idx.unique === 1 && idx.name.includes('autoindex_trade_journal'));

  if (!hasTimeCol || hasUniqueDate) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS trade_journal_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          time TEXT,
          session TEXT,
          mood TEXT NOT NULL,
          discipline_score INTEGER DEFAULT 5,
          notes TEXT,
          reflection TEXT,
          synced_to_ggd INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      db.exec(`
        INSERT INTO trade_journal_v2 (id, date, time, session, mood, discipline_score, notes, reflection, synced_to_ggd, created_at, updated_at)
        SELECT 
          id, 
          date, 
          '07:35' as time,
          'ทั่วไป' as session,
          mood, 
          discipline_score, 
          notes, 
          reflection, 
          synced_to_ggd, 
          created_at, 
          updated_at 
        FROM trade_journal;
      `);

      db.exec(`
        DROP TABLE trade_journal;
        ALTER TABLE trade_journal_v2 RENAME TO trade_journal;
        CREATE INDEX IF NOT EXISTS idx_trade_journal_date ON trade_journal(date);
      `);
    })();
  }
} catch (e) {
  console.error('Migration error on trade_journal table:', e);
}

// Seed default journal entries if empty
const journalCount = db.prepare('SELECT COUNT(*) as count FROM trade_journal').get().count;
if (journalCount === 0) {
  const insertJournal = db.prepare(`
    INSERT OR IGNORE INTO trade_journal (date, time, session, mood, discipline_score, notes, reflection, synced_to_ggd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');

  insertJournal.run(
    `${y}-${m}-18`,
    '14:30',
    'London Session',
    'DISCIPLINED',
    5,
    'วันนี้ตลาดเหวี่ยงแรงช่วงข่าว แต่คุมสติได้ดีมาก ไม่ไล่ราคา รอราคาย่อเข้าโซนตามแผน SETUP-01 เท่านั้น รู้สึกสงบและมั่นใจ',
    'การไม่เทรดตอนไม่มีเซ็ตอัพ คือการเทรดที่ดีที่สุด',
    1
  );

  insertJournal.run(
    `${y}-${m}-19`,
    '10:00',
    'Asian Session',
    'CALM',
    4,
    'รู้สึกนิ่งและมีสมาธิดี ตลาดไซด์เวย์เลยปิดจอไปพักผ่อน ไม่ฝืนเล่นในตลาดที่ไม่มี Edge สภาพจิตใจพร้อมสำหรับสัปดาห์หน้า',
    'รักษาระดับพลังงานและอย่ายึดติดกับการต้องมีออเดอร์ทุกวัน',
    1
  );
}

// 11. Trade Tracker Table (Fast Execution Log: Symbol, Playbook Setup, Outcome - Zero Bloat)
db.exec(`
  CREATE TABLE IF NOT EXISTS trade_tracker (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'LONG',
    playbook_code TEXT NOT NULL,
    playbook_title TEXT,
    outcome TEXT NOT NULL DEFAULT 'RUNNING',
    notes TEXT,
    chart_url TEXT,
    synced_to_ggd INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default trade tracker items if empty
const trackerCount = db.prepare('SELECT COUNT(*) as count FROM trade_tracker').get().count;
if (trackerCount === 0) {
  const insertTracker = db.prepare(`
    INSERT OR IGNORE INTO trade_tracker (date, time, symbol, direction, playbook_code, playbook_title, outcome, notes, synced_to_ggd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');

  insertTracker.run(
    `${y}-${m}-18`,
    '14:30',
    'BTC',
    'LONG',
    'SETUP-01',
    'Liquidity Sweep & Market Structure Shift (MSS)',
    'WIN',
    'เข้าจังหวะกวาด Asian Low สวยงาม รันจนจบตามแผนเป๊ะ',
    1
  );

  insertTracker.run(
    `${y}-${m}-19`,
    '19:45',
    'XAUUSD',
    'LONG',
    'SETUP-02',
    'Trend Continuation Pullback to Key Level / EMA',
    'WIN',
    'ทองคำย่อเข้าแนวรับเส้น EMA 50 เด้งแรงตามเทรนด์',
    1
  );

  insertTracker.run(
    `${y}-${m}-20`,
    '10:15',
    'ETH',
    'SHORT',
    'SETUP-03',
    'Range High/Low Reversal & Deviation',
    'RUNNING',
    'แทงหลอกนอกกรอบแล้วกลับเข้ามา ปัจจุบันถือรันไปเป้ากึ่งกลางกรอบ',
    1
  );
}

// 8. Focus Tasks & Goals (Top 3 Focus Engine + Routine + Challenges)
db.exec(`
  CREATE TABLE IF NOT EXISTS focus_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'TRADING_DISCIPLINE', -- 'TRADING_DISCIPLINE' | 'SELF_DEV' | 'EA_CODE' | 'HEALTH' | 'OTHER'
    target_days INTEGER DEFAULT 7, -- 0 = ongoing daily routine, >0 = challenge (e.g. 7 days, 30 days)
    reminder_time TEXT DEFAULT '09:00', -- 'HH:mm' format (Bangkok time) or '' if disabled
    is_active INTEGER DEFAULT 0, -- 1 if selected in Top 3, 0 otherwise
    rank INTEGER DEFAULT 0, -- 1, 2, 3
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS focus_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    task_title TEXT NOT NULL,
    date TEXT NOT NULL, -- 'YYYY-MM-DD'
    status TEXT NOT NULL DEFAULT 'COMPLETED', -- 'COMPLETED' | 'SKIPPED'
    channel TEXT DEFAULT 'TELEGRAM', -- 'TELEGRAM' | 'WEB'
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, date)
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default focus tasks if empty
const focusCount = db.prepare('SELECT COUNT(*) as count FROM focus_tasks').get().count;
if (focusCount === 0) {
  const insertTask = db.prepare(`
    INSERT INTO focus_tasks (title, description, category, target_days, reminder_time, is_active, rank, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `);

  // Active Top 3
  insertTask.run(
    '🛑 เลิกเทรด 7 วัน',
    'คุมวินัย งดเทรดเด็ดขาด 7 วัน',
    'TRADING_DISCIPLINE',
    7,
    '09:00',
    1,
    1
  );

  insertTask.run(
    '💪 ออกกำลังกายทุกวัน',
    'ออกกำลังกายทุกวันต่อเนื่อง',
    'HEALTH',
    0,
    '17:30',
    1,
    2
  );

  insertTask.run(
    '💻 ทำ EA + Playbook ให้จบก่อนเข้าสนามเทรด',
    'สร้างและทดสอบระบบให้เสร็จสมบูรณ์ก่อนเทรดจริง',
    'EA_CODE',
    0,
    '13:30',
    1,
    3
  );

  // Pool Tasks (Inactive, ready to be activated or swapped)
  insertTask.run(
    '💧 ดื่มน้ำให้ครบ 2 ลิตร',
    'จิบน้ำตลอดวัน ร่างกายสดชื่น สมองโฟกัสได้ดี',
    'HEALTH',
    0,
    '10:00',
    0,
    0
  );

  insertTask.run(
    '📖 อ่านหนังสือ / ศึกษาความรู้ใหม่ 15 นาที',
    'อ่านหนังสือจิตวิทยาการลงทุน หรือแนวคิดสร้างระบบชีวิต',
    'SELF_DEV',
    0,
    '20:00',
    0,
    0
  );

  insertTask.run(
    '🏃‍♂️ ออกกำลังกาย / ยืดเหยียด 20 นาที',
    'ยืดกล้ามเนื้อ วิดพื้น หรือเดินออกกำลังกายคลายเครียด',
    'HEALTH',
    0,
    '17:30',
    0,
    0
  );
}

// 9. Micro Habits & Daily Atomic Routines
db.exec(`
  CREATE TABLE IF NOT EXISTS micro_habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'ROUTINE', -- 'CREATIVE' | 'HEALTH' | 'MINDSET' | 'ROUTINE' | 'WORK'
    icon TEXT DEFAULT '⚡',
    time_of_day TEXT DEFAULT 'ANYTIME', -- 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANYTIME'
    target_days_per_week INTEGER DEFAULT 7,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS micro_habit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- 'YYYY-MM-DD'
    status TEXT NOT NULL DEFAULT 'COMPLETED', -- 'COMPLETED' | 'SKIPPED'
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(habit_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_micro_habit_logs_date ON micro_habit_logs(date);
`);

// Seed default micro habits if empty
const habitCount = db.prepare('SELECT COUNT(*) as count FROM micro_habits').get().count;
if (habitCount === 0) {
  const insertHabit = db.prepare(`
    INSERT INTO micro_habits (title, description, category, icon, time_of_day, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertHabit.run('🎬 ตัดคลิปเช้า 30 นาที', 'ตัดต่อวิดีโอ/คลิปคอนเทนต์ช่วงเช้า สร้างโมเมนตัม', 'CREATIVE', '🎬', 'MORNING', 1);
  insertHabit.run('💧 ดื่มน้ำแก้วใหญ่ตอนตื่นนอน', 'ดื่มน้ำ 1 แก้วใหญ่ทันทีหลังตื่นนอน ปลุกความสดชื่น', 'HEALTH', '💧', 'MORNING', 2);
  insertHabit.run('🎨 สเก็ตช์ไอเดีย / งานอาร์ต 1 ชิ้น', 'วาดรูป ร่างคอนเซ็ปต์ หรือทดลองงานภาพสั้น ๆ', 'CREATIVE', '🎨', 'AFTERNOON', 3);
  insertHabit.run('🚶‍♂️ ยืดเส้น / ขยับตัว 15 นาที', 'ลุกจากเก้าอี้ ยืดกล้ามเนื้อ เดินเปลี่ยนอิริยาบถ', 'HEALTH', '🚶‍♂️', 'AFTERNOON', 4);
  insertHabit.run('🧹 เคลียร์โต๊ะทำงาน & ปิดหน้าจอ', 'จัดระเบียบอุปกรณ์ เซฟงาน และเคลียร์สายตาก่อนพัก', 'ROUTINE', '🧹', 'EVENING', 5);
  insertHabit.run('🌙 จดบันทึกสั้น ๆ & ปิดไฟนอนตรงเวลา', 'ทบทวนสั้น ๆ 1 บรรทัด แล้วพักผ่อนให้เต็มที่', 'MINDSET', '🌙', 'EVENING', 6);
}

// 10. Daily Reflections: Dump Luck Daily (dl), Finish List (f), Next Day Plan (ndl)
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL, -- 'YYYY-MM-DD'
    luck_text TEXT,            -- dl: Dump Luck Daily (เรื่องโชคดี 1 เรื่อง)
    finish_text TEXT,          -- f: Finish List (สิ่งที่ทำเสร็จแล้ววันนี้)
    next_day_text TEXT,        -- ndl: Next Day Plan (จะทำอะไรต่อพรุ่งนี้)
    is_completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_daily_reflections_date ON daily_reflections(date);
`);

// 11. Daily Tracker (Continuous Activity State & Time Tracking with Category Heatmaps)
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_tracker_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '⚡',
    color TEXT DEFAULT '#64d2ff',
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_time_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    activity_name TEXT NOT NULL,
    date TEXT NOT NULL, -- 'YYYY-MM-DD'
    start_time TEXT NOT NULL, -- ISO timestamp (e.g. '2026-10-28T09:00:00.000Z')
    end_time TEXT, -- ISO timestamp, NULL if ongoing
    duration_minutes INTEGER DEFAULT 0,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_daily_time_logs_date ON daily_time_logs(date);
  CREATE INDEX IF NOT EXISTS idx_daily_time_logs_activity ON daily_time_logs(activity_id);
  CREATE INDEX IF NOT EXISTS idx_daily_time_logs_active ON daily_time_logs(end_time);
`);

// Seed default activities if empty
const dailyActivityCount = db.prepare('SELECT COUNT(*) as count FROM daily_tracker_activities').get().count;
if (dailyActivityCount === 0) {
  const insertAct = db.prepare(`
    INSERT INTO daily_tracker_activities (name, emoji, color, description, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertAct.run('ทำงาน / สตรีม / วิจัย', '💻', '#64d2ff', 'เขียนโค้ด ตัดต่อ สตรีมมิ่ง วิจัย EA หรืองานประจำ', 1);
  insertAct.run('เล่นเกม', '🎮', '#bf5af2', 'เล่นเกมเพื่อความบันเทิงและคลายเครียด', 2);
  insertAct.run('พัฒนาตัวเอง / เทรดดิ้ง', '🧠', '#ffd60a', 'ศึกษาข้อมูล วางกลยุทธ์ ทำ Playbook ทบทวนระบบ', 3);
  insertAct.run('ออกกำลังกาย / สุขภาพ', '💪', '#30d158', 'วิดพื้น ยืดเหยียด เดิน หรือออกกำลังกาย', 4);
  insertAct.run('พักผ่อน / นอนหลับ', '😴', '#0a84ff', 'งีบหลับ พักสายตา หรือนอนพักผ่อนช่วงกลางคืน', 5);
  insertAct.run('หย่อนใจ / สังสรรค์ / ผ่อนคลาย', '🌿', '#ff9f0a', 'กินข้าว ดูคลิป ผ่อนคลาย หรือกิจกรรมนอกบ้าน', 6);
}

export default db;




