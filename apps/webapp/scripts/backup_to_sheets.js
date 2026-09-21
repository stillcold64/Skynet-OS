import db from '../lib/db.js';
import fs from 'fs';
import path from 'path';

function getWebhookUrl() {
  let url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/GOOGLE_SHEETS_WEBHOOK_URL\s*=\s*(.+)/);
      if (match) url = match[1].trim();
    }
  }
  return url;
}

export async function backupAllToGoogleSheets(customUrl) {
  const url = customUrl || getWebhookUrl();
  if (!url) {
    console.error('❌ ไม่พบ GOOGLE_SHEETS_WEBHOOK_URL');
    return { success: false, error: 'No webhook URL provided' };
  }

  const items = db
    .prepare('SELECT date, category_group, category, amount, raw_text, note FROM transactions ORDER BY date ASC, id ASC')
    .all();

  console.log(`📦 กำลังเตรียมส่งสำรองข้อมูลทั้งหมด ${items.length} รายการไปยัง Google Sheets...`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync_transactions',
        type: 'TRANSACTIONS',
        items,
        rawMessage: `Full Backup: ${items.length} records`,
        timestamp: new Date().toISOString(),
      }),
      redirect: 'follow',
    });

    const text = await res.text();
    console.log(`HTTP Status: ${res.status}`);

    if (res.status === 401 || res.status === 403 || text.includes('drive-logo') || text.includes('accounts.google.com')) {
      return {
        success: false,
        needPermission: true,
        error: 'Google Apps Script ต้องการสิทธิ์ "Anyone (ทุกคน)": โปรดตั้งค่า Who has access เป็น Anyone',
      };
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = { raw: text };
    }

    if (res.ok) {
      console.log(`✅ ส่งสำรองข้อมูล ${items.length} รายการลง Google Sheets สำเร็จ!`);
      return { success: true, count: items.length, response: json };
    } else {
      console.error('Google Sheets returned error:', text);
      return { success: false, error: text };
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
    return { success: false, error: err.message };
  }
}

// If run directly: node scripts/backup_to_sheets.js [url]
if (process.argv[1].endsWith('backup_to_sheets.js')) {
  const argUrl = process.argv[2];
  backupAllToGoogleSheets(argUrl).then((r) => {
    console.log('Result:', r);
    process.exit(r.success ? 0 : 1);
  });
}
