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
  const dateRegex = /(?:^|\s)(?:(?:วันที่|วันที)\s*)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?|(?:^|\s)(?:วันที่|วันที)\s*(\d{1,2})(?=\s+|$)/gi;

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
    } else if (match[4]) {
      const d = parseInt(match[4], 10);
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
  let nameLower = itemName.toLowerCase().trim();

  // Normalize common Thai keyboard typo: 'ข้าง' instead of 'ข้าว'
  if (/^ข้าง(มัน|ผัด|หมู|ไก่|ไข่|กะเพรา|กระเพรา|แกง|เหนียว|ต้ม|จาน)/.test(nameLower)) {
    nameLower = nameLower.replace(/^ข้าง/, 'ข้าว');
  }

  // Load rules sorted by length descending so longer phrases match first
  const rules = db
    .prepare('SELECT * FROM category_rules ORDER BY LENGTH(keyword) DESC')
    .all();

  for (const rule of rules) {
    const kw = rule.keyword.toLowerCase();
    if (nameLower.includes(kw)) {
      return {
        categoryGroup: rule.category_group,
        suggestedType: rule.suggested_type || 'ค่าใช้จ่าย',
        matchedKeyword: kw,
      };
    }
  }

  // Smart food & living heuristics
  if (
    nameLower.includes('มันไก่') ||
    nameLower.includes('หมูกรอบ') ||
    nameLower.includes('กะเพรา') ||
    nameLower.includes('กระเพรา') ||
    nameLower.includes('ก๋วยเตี๋ยว') ||
    nameLower.includes('บะหมี่') ||
    nameLower.includes('สุกี้') ||
    nameLower.includes('สุ้กี้') ||
    nameLower.includes('กินข้าว') ||
    nameLower.includes('ถอนตังกินข้าว') ||
    nameLower.includes('ข้าว')
  ) {
    return { categoryGroup: 'LIFE', suggestedType: 'ค่าใช้จ่าย', matchedKeyword: 'food_heuristic' };
  }

  // Fallback defaults if not matched
  if (nameLower.includes('invest') || nameLower.includes('trade')) {
    return { categoryGroup: 'INVESTING', suggestedType: 'การลงทุน', matchedKeyword: 'fallback' };
  }

  return { categoryGroup: 'ETC', suggestedType: 'ค่าใช้จ่าย', matchedKeyword: null };
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

    // Remove the date marker from the chunk (both dd/mm and วันที่ dd)
    let cleanedChunk = section.text
      .replace(/(?:^|\s)(?:(?:วันที่|วันที)\s*)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/gi, ' ')
      .replace(/(?:^|\s)(?:วันที่|วันที)\s*\d{1,2}/gi, ' ');

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

      // Normalize common typo in display name if starts with ข้าง...
      if (/^ข้าง(มัน|ผัด|หมู|ไก่|ไข่|กะเพรา|กระเพรา|แกง|เหนียว|ต้ม|จาน)/.test(itemName)) {
        itemName = itemName.replace(/^ข้าง/, 'ข้าว');
      }

      if (itemName && !isNaN(amount) && amount > 0) {
        const { categoryGroup, suggestedType } = classifyItem(itemName);

        results.push({
          date: dateStr,
          category: itemName,
          category_group: categoryGroup,
          type: suggestedType,
          amount,
          note: `Auto-parsed from Telegram: "${itemName}"`,
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
export function ingestMessage(rawMessage) {
  try {
    const items = parseTelegramMessage(rawMessage);

    if (items.length === 0) {
      const logStmt = db.prepare(`
        INSERT INTO bot_logs (raw_message, parsed_count, parsed_data, status, error_message)
        VALUES (?, 0, '[]', 'ERROR', 'Could not parse any transactions from message')
      `);
      const logRes = logStmt.run(rawMessage);
      return { success: false, count: 0, items: [], logId: logRes.lastInsertRowid, message: 'No items parsed' };
    }

    const insertTx = db.prepare(`
      INSERT INTO transactions (date, type, category, category_group, amount, note, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedIds = [];
    const saveTransactionBatch = db.transaction((parsedItems) => {
      for (const item of parsedItems) {
        const res = insertTx.run(
          item.date,
          item.type,
          item.category,
          item.category_group,
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
      INSERT INTO bot_logs (raw_message, parsed_count, parsed_data, status)
      VALUES (?, ?, ?, 'SUCCESS')
    `);
    const logRes = logStmt.run(rawMessage, items.length, JSON.stringify(items));

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
      INSERT INTO bot_logs (raw_message, parsed_count, parsed_data, status, error_message)
      VALUES (?, 0, '[]', 'ERROR', ?)
    `);
    const logRes = logStmt.run(rawMessage, error.message);
    return { success: false, count: 0, error: error.message, logId: logRes.lastInsertRowid };
  }
}
