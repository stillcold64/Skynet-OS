/**
 * Telegram Long-Polling Bot Worker + Google Sheets Sync
 */

import { ingestMessage } from '../lib/parser.js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        val = val.trim().replace(/^["'](.*)["']$/, '$1');
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
const googleSheetsUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

if (!token) {
  console.log('⚠️ ไม่พบ TELEGRAM_BOT_TOKEN ใน Environment หรือ .env');
  process.exit(0);
}

const API_BASE = `https://api.telegram.org/bot${token}`;
let offset = 0;

console.log('🤖 Telegram Polling Bot เริ่มทำงานแล้ว กำลังรอรับข้อความ...');
if (googleSheetsUrl) {
  console.log('☁️ Google Sheets Sync เปิดใช้งานแล้ว:', googleSheetsUrl);
} else {
  console.log('💡 Google Sheets Sync ยังไม่ได้ตั้งค่า URL (สามารถใส่ GOOGLE_SHEETS_WEBHOOK_URL ใน .env ได้)');
}

async function syncToGoogleSheets(items, rawMessage) {
  if (!googleSheetsUrl) return false;
  try {
    const res = await fetch(googleSheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items,
        rawMessage,
        timestamp: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('Error syncing to Google Sheets:', err.message);
    return false;
  }
}

async function sendMessage(chatId, text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (res.ok) return true;
      const errData = await res.json();
      console.error(`Attempt ${attempt} failed:`, errData);
    } catch (err) {
      console.error(`Attempt ${attempt} error:`, err.message);
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

const CATEGORY_EMOJI = {
  LIFE: '🌿',
  EXTRAVAGANT: '✨',
  BILL: '📄',
  INVESTING: '📈',
  ETC: '📦',
};

async function poll() {
  try {
    const res = await fetch(`${API_BASE}/getUpdates?offset=${offset}&timeout=30`);
    if (!res.ok) {
      setTimeout(poll, 5000);
      return;
    }

    const data = await res.json();
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg || !msg.text) continue;

        console.log(`📩 ได้รับข้อความจาก [${msg.chat.id}]: "${msg.text}"`);

        const result = ingestMessage(msg.text);

        if (result.success && result.items.length > 0) {
          // Sync to Google Sheets if configured
          const ggsSynced = await syncToGoogleSheets(result.items, msg.text);

          let reply = `รับทราบครับ! บันทึกข้อมูลเรียบร้อยแล้ว ⚡\n\n`;
          reply += `📊 บันทึกทั้งหมด: ${result.count} รายการ\n`;

          let total = 0;
          for (const item of result.items) {
            total += item.amount;
            const emoji = CATEGORY_EMOJI[item.category_group] || '•';
            reply += `• [${item.date}] ${emoji} ${item.category_group} | ${item.category}: ${item.amount.toLocaleString()} ฿\n`;
          }

          reply += `\n💰 ยอดรวมก้อนนี้: ${total.toLocaleString()} บาท\n`;
          if (ggsSynced) {
            reply += `☁️ ซิงค์สำรองข้อมูลลง Google Sheets เรียบร้อยแล้ว!\n`;
          }
          reply += `👉 ตรวจสอบบนปฏิทิน: http://localhost:3000`;

          await sendMessage(msg.chat.id, reply);
        } else {
          await sendMessage(
            msg.chat.id,
            `⚠️ บอทไม่พบตัวเลขยอดเงินในข้อความ กรุณาพิมพ์ในรูปแบบ:\nวันที่ 1 จ่ายหนี้ ธันเดอ 2000 wifi 500`
          );
        }
      }
    }
  } catch (err) {
    console.error('Polling loop error:', err);
  }
  setTimeout(poll, 1500);
}

poll();
