import db from './db.js';

/**
 * Split text by date markers:
 * 1) Fast compact 'dd/mm' or 'dd/mm/yyyy' (e.g. "07/11", "06/10", "6/10", "30/09")
 * 2) Traditional Thai 'วันที่ dd' or 'วันที่ dd/mm'
 * Supports multiple dates in one message or single day.
 */
function splitByDate(rawText) {
  // Protect 7/11 store name from being parsed as November 7th
  let text = rawText.replace(/\b7\/11\b/gi, '7-11');

  // Regex matching:
  // 1) dd/mm or dd/mm/yyyy (optionally prefixed by วันที่/วันที)
  // 2) วันที่ dd
  // 3) Standalone dd (1-31) at start of message or line, followed by non-digit text (e.g. "18 คาเฟ่ 60")
  const dateRegex = /(?:^|\s)(?:(?:วันที่|วันที)\s*)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?|(?:^|\s)(?:วันที่|วันที)\s*(\d{1,2})(?=\s+|$)|(?:^|\n)\s*(\d{1,2})\s+(?=[^\d\s/])/gi;

  const matches = [];
  let match;

  while ((match = dateRegex.exec(text)) !== null) {
    if (match[1] && match[2]) {
      const d = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      let y = match[3] ? parseInt(match[3], 10) : null;
      if (y && y < 100) y += 2000;
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        matches.push({ day: d, month: m, year: y, index: match.index });
      }
    } else if (match[4] || match[5]) {
      const d = parseInt(match[4] || match[5], 10);
      if (d >= 1 && d <= 31) {
        matches.push({ day: d, month: null, year: null, index: match.index });
      }
    }
  }

  if (matches.length === 0) {
    return [{ text: text.trim(), day: null, month: null, year: null }];
  }

  const sections = [];
  if (matches[0].index > 0) {
    const prefix = text.substring(0, matches[0].index).trim();
    if (prefix) {
      sections.push({ text: prefix, day: null, month: null, year: null });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nextIndex = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const chunk = text.substring(cur.index, nextIndex).trim();
    sections.push({ text: chunk, day: cur.day, month: cur.month, year: cur.year });
  }

  return sections;
}

/**
 * Resolve YYYY-MM-DD for given day and optional month/year
 * If dd/mm provided (e.g. 07/11, 06/10), formats precisely with that month.
 * If only day provided, smartly rolls back to previous month if early in the month.
 */
function resolveDate(day, month = null, year = null) {
  const bkkDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const [curYear, curMonth, curDay] = bkkDateStr.split('-').map(Number);

  // If explicit day and month are provided (e.g. 07/11 or 06/10)
  if (day && month) {
    const targetYear = year || curYear;
    return `${targetYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // If only day is provided (e.g. วันที่ 6)
  if (day && day >= 1 && day <= 31) {
    let targetYear = curYear;
    let targetMonth = curMonth;

    // Smart month rollback:
    // If today is early in the month (<= 10) and user specifies a day at the end of the month (>= 20),
    // they are entering a retrospective entry for the previous month (e.g. 'วันที่ 30' on Oct 1st -> Sept 30)
    if (curDay <= 10 && day >= 20) {
      targetMonth -= 1;
      if (targetMonth === 0) {
        targetMonth = 12;
        targetYear -= 1;
      }
    }

    return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return bkkDateStr;
}

/**
 * Classify an item name into one of 5 groups:
 * LIFE | EXTRAVAGANT | BILL | INVESTING | ETC
 */
export function classifyItem(itemName) {
  let nameLower = (itemName || '').toLowerCase().trim();

  // Normalize common Thai keyboard typo: 'ข้าง' instead of 'ข้าว'
  if (/^ข้าง(มัน|ผัด|หมู|ไก่|ไข่|กะเพรา|กระเพรา|แกง|เหนียว|ต้ม|จาน)/.test(nameLower)) {
    nameLower = nameLower.replace(/^ข้าง/, 'ข้าว');
  }

  // 1. INCOME / LOAN / REVENUE (รายรับ & เงินกู้ฉุกเฉิน)
  if (
    nameLower.includes('กู้เงิน') ||
    nameLower.includes('เงินกู้') ||
    nameLower.includes('ยืมเงิน') ||
    nameLower.includes('ฟีกู้เงิน') ||
    nameLower.startsWith('กู้')
  ) {
    return {
      categoryGroup: 'INCOME',
      subCategory: 'เงินกู้ฉุกเฉิน',
      suggestedType: 'รายรับ',
      matchedKeyword: 'loan_income',
    };
  }

  if (
    nameLower.includes('เงินเดือน') ||
    nameLower.includes('เงินเข้า') ||
    nameLower.includes('รายรับ') ||
    nameLower.includes('รายได้') ||
    nameLower.includes('ขายของ') ||
    nameLower.includes('ได้เงิน') ||
    nameLower.includes('แม่ช่วย') ||
    nameLower.includes('แม่ให้') ||
    nameLower.includes('คืนเงิน') ||
    nameLower.includes('โอนเข้า')
  ) {
    return {
      categoryGroup: 'INCOME',
      subCategory: 'เงินเดือน/รายได้',
      suggestedType: 'รายรับ',
      matchedKeyword: 'salary_income',
    };
  }

  // 2. INVESTING (การลงทุน)
  if (
    nameLower.includes('ลงทุน') ||
    nameLower.includes('trade') ||
    nameLower.includes('หุ้น') ||
    nameLower.includes('กองทุน') ||
    nameLower.includes('crypto') ||
    nameLower.includes('btc') ||
    nameLower.includes('dca') ||
    nameLower.includes('ทอง')
  ) {
    return {
      categoryGroup: 'INVESTING',
      subCategory: 'คริปโต/สินทรัพย์',
      suggestedType: 'การลงทุน',
      matchedKeyword: 'investing',
    };
  }

  // 3. BILL / DEBT / UTILITIES (บิลประจำ & หนี้สิน)
  if (
    nameLower.includes('paylater') ||
    nameLower.includes('easycash') ||
    nameLower.includes('easaycash') ||
    nameLower.includes('thunder') ||
    nameLower.includes('ธันเดอ') ||
    nameLower.includes('finnix') ||
    nameLower.includes('ผ่อน') ||
    nameLower.includes('หนี้')
  ) {
    return {
      categoryGroup: 'BILL',
      subCategory: 'หนี้สิน 4 เจ้า',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'debt',
    };
  }

  if (
    nameLower.includes('ค่าไฟ') ||
    nameLower.includes('ไฟฟ้า') ||
    nameLower.includes('ค่าน้ำ') ||
    nameLower.includes('ประปา')
  ) {
    return {
      categoryGroup: 'BILL',
      subCategory: 'ค่าน้ำ/ค่าไฟ',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'utilities',
    };
  }

  if (
    nameLower.includes('wifi') ||
    nameLower.includes('เน็ต') ||
    nameLower.includes('เน็ตบ้าน') ||
    nameLower.includes('โทรศัพท์') ||
    nameLower.includes('ค่าห้อง') ||
    nameLower.includes('ค่าบัตร')
  ) {
    return {
      categoryGroup: 'BILL',
      subCategory: 'ค่าห้อง/เน็ต/บิล',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'fixed_bills',
    };
  }

  // 4. EXTRAVAGANT (หย่อนใจ / ฟุ่มเฟือย / รูรั่ว)
  if (
    nameLower.includes('zaza') ||
    nameLower.includes('กระดาษโรล') ||
    nameLower.includes('โรล')
  ) {
    return {
      categoryGroup: 'EXTRAVAGANT',
      subCategory: 'Zaza/หย่อนใจ',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'zaza',
    };
  }

  if (
    nameLower.includes('ขนม') ||
    nameLower.includes('เค้ก') ||
    nameLower.includes('ไอติม') ||
    nameLower.includes('ของหวาน') ||
    nameLower.includes('เบเกอรี่')
  ) {
    return {
      categoryGroup: 'EXTRAVAGANT',
      subCategory: 'ขนม 7-11/ของหวาน',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'snack',
    };
  }

  if (
    nameLower.includes('เกม') ||
    nameLower.includes('เติมเกม') ||
    nameLower.includes('dota') ||
    nameLower.includes('steam') ||
    nameLower.includes('gpu') ||
    nameLower.includes('yt')
  ) {
    return {
      categoryGroup: 'EXTRAVAGANT',
      subCategory: 'เกม/บันเทิง',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'entertainment',
    };
  }

  if (
    nameLower.includes('เบียร์') ||
    nameLower.includes('เหล้า') ||
    nameLower.includes('หวย') ||
    nameLower.includes('บอนชอน') ||
    nameLower.includes('ช้อปปิ้ง') ||
    nameLower.includes('shopping')
  ) {
    return {
      categoryGroup: 'EXTRAVAGANT',
      subCategory: 'สังสรรค์/ช้อปปิ้ง',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'extravagant_social',
    };
  }

  // 5. LIFE (ปัจจัย 4 / จำเป็นในชีวิต)
  if (
    nameLower.includes('กาแฟ') ||
    nameLower.includes('คาเฟ่') ||
    nameLower.includes('น้ำปั่น') ||
    nameLower.includes('ชา')
  ) {
    return {
      categoryGroup: 'LIFE',
      subCategory: 'กาแฟ/เครื่องดื่ม',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'coffee_drink',
    };
  }

  if (
    nameLower.includes('แมว') ||
    nameLower.includes('อาหารแมว') ||
    nameLower.includes('ทรายแมว')
  ) {
    return {
      categoryGroup: 'LIFE',
      subCategory: 'สัตว์เลี้ยง (แมว)',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'pet_cat',
    };
  }

  if (
    nameLower.includes('gas') ||
    nameLower.includes('น้ำมัน') ||
    nameLower.includes('เดินทาง') ||
    nameLower.includes('รถ')
  ) {
    return {
      categoryGroup: 'LIFE',
      subCategory: 'ค่าน้ำมัน/เดินทาง',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'transport_gas',
    };
  }

  if (
    nameLower.includes('makro') ||
    nameLower.includes('lotus') ||
    nameLower.includes('mr.diy') ||
    nameLower.includes('7-11') ||
    nameLower.includes('เซเว่น') ||
    nameLower.includes('ตลาด') ||
    nameLower.includes('ของใช้') ||
    nameLower.includes('ไข่')
  ) {
    return {
      categoryGroup: 'LIFE',
      subCategory: 'ของใช้/วัตถุดิบ',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'groceries',
    };
  }

  if (
    nameLower.includes('ยา') ||
    nameLower.includes('หมอ') ||
    nameLower.includes('ซ่อม') ||
    nameLower.includes('ปลูกผัก')
  ) {
    return {
      categoryGroup: 'LIFE',
      subCategory: 'สุขภาพ/ซ่อมแซม',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'health_maintenance',
    };
  }

  if (
    nameLower.includes('ข้าว') ||
    nameLower.includes('กะเพรา') ||
    nameLower.includes('ไก่ทอด') ||
    nameLower.includes('หมูกรอบ') ||
    nameLower.includes('ก๋วยเตี๋ยว') ||
    nameLower.includes('สุกี้') ||
    nameLower.includes('หม่าล่า') ||
    nameLower.includes('ส้มตำ') ||
    nameLower.includes('ยำ') ||
    nameLower.includes('eat') ||
    nameLower.includes('อาหาร') ||
    nameLower.includes('กินข้าว')
  ) {
    return {
      categoryGroup: 'LIFE',
      subCategory: 'อาหาร/มื้อหลัก',
      suggestedType: 'ค่าใช้จ่าย',
      matchedKeyword: 'food_meal',
    };
  }

  // Fallback defaults
  return {
    categoryGroup: 'ETC',
    subCategory: 'เบ็ดเตล็ด/อื่น ๆ',
    suggestedType: 'ค่าใช้จ่าย',
    matchedKeyword: null,
  };
}

/**
 * Normalizes an item name to its canonical name and resolves its category group & suggested type.
 * Handles synonyms (e.g. 'ค่าน้ำ' vs 'ค่าน้ำประปา'), typos, and domain heuristics.
 */
export function normalizeItemName(rawItemName) {
  if (!rawItemName || typeof rawItemName !== 'string') {
    return {
      canonicalName: rawItemName || 'ETC',
      originalAlias: rawItemName || '',
      categoryGroup: 'ETC',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'empty',
    };
  }

  let clean = rawItemName.trim();
  const originalAlias = clean;

  // 1. Normalize common Thai keyboard typo prefixes & characters
  if (/^ข้าง(มัน|ผัด|หมู|ไก่|ไข่|กะเพรา|กระเพรา|แกง|เหนียว|ต้ม|จาน)/.test(clean)) {
    clean = clean.replace(/^ข้าง/, 'ข้าว');
  }
  clean = clean.replace(/กาแแฟ/g, 'กาแฟ');
  clean = clean.replace(/ประผา/g, 'ประปา');

  const cleanLower = clean.toLowerCase();

  // Strip common noisy prefixes for checking (e.g. 'จ่ายหนี้ ', 'บิล ')
  const strippedPrefix = cleanLower
    .replace(/^(จ่ายหนี้|จ่ายบิล|บิล|ค่า)\s*/, '')
    .trim();

  // 2. Exact match in item_aliases table (fast indexed lookup)
  try {
    const aliasRecord = db
      .prepare('SELECT * FROM item_aliases WHERE LOWER(alias) = ? OR LOWER(alias) = ?')
      .get(cleanLower, strippedPrefix);

    if (aliasRecord) {
      return {
        canonicalName: aliasRecord.canonical_name,
        originalAlias,
        categoryGroup: aliasRecord.category_group,
        suggestedType: aliasRecord.suggested_type || 'ค่าใช้จ่าย',
        matchedBy: 'alias_table',
      };
    }
  } catch (e) {
    console.error('Error querying item_aliases:', e);
  }

  // 3. Smart bill & recurring cost heuristics (High Precision Substrings)

  // Water bills (Home vs Grandma)
  if (cleanLower.includes('น้ำ') || cleanLower.includes('ประปา')) {
    if (cleanLower.includes('ยาย')) {
      return {
        canonicalName: 'ค่าน้ำบ้านยาย',
        originalAlias,
        categoryGroup: 'BILL',
        suggestedType: 'ค่าใช้จ่าย',
        matchedBy: 'heuristic_water_grandma',
      };
    }
    const nonBillWater = [
      'น้ำมัน', 'น้ำปั่น', 'น้ำแข็ง', 'น้ำอัดลม', 'น้ำผลไม้',
      'น้ำอุ่น', 'น้ำพริก', 'น้ำดื่ม', 'ดื่มน้ำ', 'สิงห์', 'คริสตัล'
    ];
    if (!nonBillWater.some((kw) => cleanLower.includes(kw))) {
      return {
        canonicalName: 'ค่าน้ำประปา',
        originalAlias,
        categoryGroup: 'BILL',
        suggestedType: 'ค่าใช้จ่าย',
        matchedBy: 'heuristic_water_home',
      };
    }
  }

  // Electricity bills (Home vs Grandma)
  if (cleanLower.includes('ค่าไฟ') || cleanLower.includes('ไฟฟ้า') || cleanLower === 'ไฟยาย' || cleanLower.includes('ไฟบ้านยาย')) {
    if (cleanLower.includes('ยาย')) {
      return {
        canonicalName: 'ค่าไฟบ้านยาย',
        originalAlias,
        categoryGroup: 'BILL',
        suggestedType: 'ค่าใช้จ่าย',
        matchedBy: 'heuristic_electric_grandma',
      };
    }
    return {
      canonicalName: 'ค่าไฟ',
      originalAlias,
      categoryGroup: 'BILL',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'heuristic_electric_home',
    };
  }

  // Internet bills
  if (cleanLower.includes('wifi') || cleanLower.includes('ไวไฟ') || cleanLower.includes('เน็ต') || cleanLower.includes('เน็ตบ้าน')) {
    return {
      canonicalName: 'WiFi / เน็ตบ้าน',
      originalAlias,
      categoryGroup: 'BILL',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'heuristic_internet',
    };
  }

  // Loans & Installments
  if (cleanLower.includes('paylater') || cleanLower.includes('spaylater')) {
    return {
      canonicalName: 'Shopee Paylater',
      originalAlias,
      categoryGroup: 'BILL',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'heuristic_paylater',
    };
  }
  if (cleanLower.includes('easycash') || cleanLower.includes('easaycash') || cleanLower.includes('easymoney') || cleanLower.includes('easy money')) {
    return {
      canonicalName: 'EasyCash',
      originalAlias,
      categoryGroup: 'BILL',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'heuristic_easycash',
    };
  }
  if (cleanLower.includes('finnix') || cleanLower.includes('ฟินนิกซ์')) {
    return {
      canonicalName: 'Finnix',
      originalAlias,
      categoryGroup: 'BILL',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'heuristic_finnix',
    };
  }
  if (cleanLower.includes('thunder') || cleanLower.includes('ธันเดอ')) {
    return {
      canonicalName: 'Money Thunder',
      originalAlias,
      categoryGroup: 'BILL',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'heuristic_thunder',
    };
  }

  // Subscriptions
  if (cleanLower.includes('youtube') || cleanLower === 'yt' || cleanLower.includes('yt premium')) {
    return {
      canonicalName: 'YouTube Premium',
      originalAlias,
      categoryGroup: 'BILL',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'heuristic_youtube',
    };
  }
  if (cleanLower.includes('netflix')) {
    return {
      canonicalName: 'Netflix',
      originalAlias,
      categoryGroup: 'BILL',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'heuristic_netflix',
    };
  }

  // Games & Extravagant
  if (cleanLower.includes('dota')) {
    return {
      canonicalName: 'Dota 2',
      originalAlias,
      categoryGroup: 'EXTRAVAGANT',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'heuristic_dota',
    };
  }
  if (cleanLower === 'เบีย' || cleanLower === 'เบียร์') {
    return {
      canonicalName: 'เบียร์',
      originalAlias,
      categoryGroup: 'EXTRAVAGANT',
      suggestedType: 'ค่าใช้จ่าย',
      matchedBy: 'heuristic_beer',
    };
  }

  // 4. Fallback to classifyItem for rules dictionary and food heuristics
  const classification = classifyItem(clean);

  return {
    canonicalName: clean,
    originalAlias,
    categoryGroup: classification.categoryGroup,
    subCategory: classification.subCategory || 'ทั่วไป',
    suggestedType: classification.suggestedType,
    matchedBy: classification.matchedKeyword || 'classification_rule',
  };
}

/**
 * Main parser function: converts raw text into structured transaction items
 */
export function parseTelegramMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return [];
  }

  const sections = splitByDate(rawMessage);
  const results = [];

  for (const section of sections) {
    const dateStr = resolveDate(section.day, section.month, section.year);

    // Remove the date marker from the chunk (both dd/mm, วันที่ dd, and standalone dd at start of line/chunk)
    let cleanedChunk = section.text
      .replace(/(?:^|\s)(?:(?:วันที่|วันที)\s*)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/gi, ' ')
      .replace(/(?:^|\s)(?:วันที่|วันที)\s*\d{1,2}/gi, ' ')
      .replace(/(?:^|\n)\s*\d{1,2}\s+(?=[^\d\s/])/gi, ' ');

    // Preprocess: If Thai character is immediately followed by digit, insert space (e.g. ข้าว50 -> ข้าว 50)
    // while keeping Latin alphanumeric like 'dota2' or 'ps5' intact!
    cleanedChunk = cleanedChunk.replace(/([\u0E00-\u0E7F])(\d+)/g, '$1 $2');

    // Match item name followed by amount
    // Handles decimal and integer numbers, e.g. "เติมเกม dota2 130 WiFi 525" -> "เติมเกม dota2": 130, "WiFi": 525
    const itemRegex = /(?:^|\s+)(.+?)(?:\s+|[:=])(\d+(?:\.\d+)?)(?=\s+[^\d\s]|\s*$)/g;
    let match;

    while ((match = itemRegex.exec(cleanedChunk)) !== null) {
      let itemName = match[1].trim();
      const amount = parseFloat(match[2]);

      // Clean leading dashes, bullets, or commas
      itemName = itemName.replace(/^[-–,\s•*]+/, '').trim();

      if (itemName && !isNaN(amount) && amount > 0) {
        const norm = normalizeItemName(itemName);

        results.push({
          date: dateStr,
          category: norm.canonicalName,
          original_alias: norm.originalAlias,
          category_group: norm.categoryGroup,
          sub_category: norm.subCategory || 'ทั่วไป',
          type: norm.suggestedType,
          amount,
          note: norm.originalAlias.toLowerCase() !== norm.canonicalName.toLowerCase()
            ? `Auto-parsed from Telegram: "${norm.originalAlias}" -> ${norm.canonicalName}`
            : `Auto-parsed from Telegram: "${itemName}"`,
          raw_text: `${itemName} ${amount}`,
        });
      }
    }
  }

  return results;
}

/**
 * Ingests a raw message: parses items, saves to transactions, records bot log
 */
export function ingestMessage(rawMessage, telegramMsgId = null) {
  try {
    const items = parseTelegramMessage(rawMessage);

    if (items.length === 0) {
      const logStmt = db.prepare(`
        INSERT INTO bot_logs (raw_message, parsed_count, parsed_data, status, error_message, telegram_msg_id)
        VALUES (?, 0, '[]', 'ERROR', 'Could not parse any transactions from message', ?)
      `);
      const logRes = logStmt.run(rawMessage, telegramMsgId);
      return { success: false, count: 0, items: [], logId: logRes.lastInsertRowid, message: 'No items parsed' };
    }

    const insertTx = db.prepare(`
      INSERT INTO transactions (date, type, category, category_group, sub_category, amount, note, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedIds = [];
    const saveTransactionBatch = db.transaction((parsedItems) => {
      for (const item of parsedItems) {
        const res = insertTx.run(
          item.date,
          item.type,
          item.category,
          item.category_group,
          item.sub_category || 'ทั่วไป',
          item.amount,
          item.note,
          item.raw_text
        );
        insertedIds.push(res.lastInsertRowid);
      }
    });

    saveTransactionBatch(items);

    // Record audit log
    const logStmt = db.prepare(`
      INSERT INTO bot_logs (raw_message, parsed_count, parsed_data, status, transaction_ids, telegram_msg_id)
      VALUES (?, ?, ?, 'SUCCESS', ?, ?)
    `);
    const logRes = logStmt.run(
      rawMessage,
      items.length,
      JSON.stringify(items),
      JSON.stringify(insertedIds),
      telegramMsgId
    );

    return {
      success: true,
      count: items.length,
      items,
      insertedIds,
      logId: logRes.lastInsertRowid,
    };
  } catch (error) {
    console.error('Ingest message error:', error);
    const logStmt = db.prepare(`
      INSERT INTO bot_logs (raw_message, parsed_count, parsed_data, status, error_message, telegram_msg_id)
      VALUES (?, 0, '[]', 'ERROR', ?, ?)
    `);
    const logRes = logStmt.run(rawMessage, error.message, telegramMsgId);
    return { success: false, count: 0, error: error.message, logId: logRes.lastInsertRowid };
  }
}

/**
 * Undo and delete transactions created by a specific bot log ID
 */
export function undoBotLog(logId) {
  const log = db.prepare('SELECT * FROM bot_logs WHERE id = ?').get(logId);
  if (!log) return { success: false, message: 'ไม่พบ Log #' + logId };
  if (log.status === 'CANCELLED') return { success: false, message: 'รายการนี้ถูกยกเลิกไปแล้ว' };

  let ids = [];
  try {
    ids = JSON.parse(log.transaction_ids || '[]');
  } catch (e) {}

  let deletedCount = 0;
  if (ids.length > 0) {
    const deleteTx = db.prepare('DELETE FROM transactions WHERE id = ?');
    for (const id of ids) {
      const res = deleteTx.run(id);
      deletedCount += res.changes;
    }
  } else {
    // Fallback: match by raw_text or parsed items
    let parsedItems = [];
    try {
      parsedItems = JSON.parse(log.parsed_data || '[]');
    } catch (e) {}
    for (const item of parsedItems) {
      const res = db.prepare('DELETE FROM transactions WHERE raw_text = ? AND date = ?').run(item.raw_text, item.date);
      deletedCount += res.changes;
    }
  }

  db.prepare('UPDATE bot_logs SET status = "CANCELLED" WHERE id = ?').run(logId);

  return {
    success: true,
    logId,
    deletedCount,
    rawMessage: log.raw_message,
  };
}

/**
 * Undo the most recent successful bot log
 */
export function undoLastBotLog() {
  const lastLog = db
    .prepare('SELECT * FROM bot_logs WHERE status = "SUCCESS" AND parsed_count > 0 ORDER BY id DESC LIMIT 1')
    .get();

  if (!lastLog) {
    return { success: false, message: 'ไม่มีรายการล่าสุดให้ยกเลิก' };
  }

  return undoBotLog(lastLog.id);
}
