import db from '../lib/db.js';
import fs from 'fs';
import path from 'path';
import { getBetaCashflowsForSheet, updateBetaCashflowSync } from '../lib/beta_portfolios.js';

function getWebhookUrl() {
  let url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) {
    const candidatePaths = [
      path.join(process.cwd(), '.env'),
      path.join(process.cwd(), 'apps', 'webapp', '.env'),
      path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '.env'),
    ];
    for (const envPath of candidatePaths) {
      if (fs.existsSync(/*turbopackIgnore: true*/ envPath)) {
        const content = fs.readFileSync(/*turbopackIgnore: true*/ envPath, 'utf8');
        const match = content.match(/GOOGLE_SHEETS_WEBHOOK_URL\s*=\s*(.+)/);
        if (match) {
          url = match[1].trim().replace(/^["'](.*)["']$/, '$1');
          break;
        }
      }
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

export async function syncBetaCashflowsToGoogleSheets(customUrl) {
  const url = customUrl || getWebhookUrl();
  if (!url) {
    updateBetaCashflowSync(false, 'GOOGLE_SHEETS_WEBHOOK_URL is not configured');
    return { success: false, error: 'No webhook URL provided' };
  }

  const events = getBetaCashflowsForSheet();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_beta_cashflows', type: 'BETA_CASHFLOWS', events }),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!res.ok || data?.success !== true || Number(data.count) !== events.length) {
      const error = data?.error || data?.message || `Webhook did not confirm the full Beta ledger (HTTP ${res.status}; expected ${events.length}, received ${data?.count ?? 'unknown'})`;
      updateBetaCashflowSync(false, error);
      return { success: false, error, count: events.length };
    }

    updateBetaCashflowSync(true);
    return { success: true, count: events.length, response: data };
  } catch (err) {
    console.error('Beta portfolio sync error:', err.message);
    updateBetaCashflowSync(false, err.message);
    return { success: false, error: err.message, count: events.length };
  }
}

// If run directly: node scripts/backup_to_sheets.js [url]
if (process.argv[1] && process.argv[1].endsWith('backup_to_sheets.js')) {
  const argUrl = process.argv[2];
  backupAllToGoogleSheets(argUrl).then((r) => {
    console.log('Result:', r);
    process.exit(r.success ? 0 : 1);
  });
}
