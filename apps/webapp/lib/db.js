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

// 10. Trade Journal Table (Daily Emotional & Psychological Calendar)
db.exec(`
  CREATE TABLE IF NOT EXISTS trade_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    mood TEXT NOT NULL,
    discipline_score INTEGER DEFAULT 5,
    notes TEXT,
    reflection TEXT,
    synced_to_ggd INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default journal entries if empty
const journalCount = db.prepare('SELECT COUNT(*) as count FROM trade_journal').get().count;
if (journalCount === 0) {
  const insertJournal = db.prepare(`
    INSERT OR IGNORE INTO trade_journal (date, mood, discipline_score, notes, reflection, synced_to_ggd)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');

  insertJournal.run(
    `${y}-${m}-18`,
    'DISCIPLINED',
    5,
    'วันนี้ตลาดเหวี่ยงแรงช่วงข่าว แต่คุมสติได้ดีมาก ไม่ไล่ราคา รอราคาย่อเข้าโซนตามแผน SETUP-01 เท่านั้น รู้สึกสงบและมั่นใจ',
    'การไม่เทรดตอนไม่มีเซ็ตอัพ คือการเทรดที่ดีที่สุด',
    1
  );

  insertJournal.run(
    `${y}-${m}-19`,
    'CALM',
    4,
    'รู้สึกนิ่งและมีสมาธิดี ตลาดไซด์เวย์เลยปิดจอไปพักผ่อน ไม่ฝืนเล่นในตลาดที่ไม่มี Edge สภาพจิตใจพร้อมสำหรับสัปดาห์หน้า',
    'รักษาระดับพลังงานและอย่ายึดติดกับการต้องมีออเดอร์ทุกวัน',
    1
  );
}

export default db;



