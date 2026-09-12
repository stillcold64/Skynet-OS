/**
 * Telegram Long-Polling Bot Worker
 * 
 * วิธีใช้งาน:
 * 1. ใส่ TELEGRAM_BOT_TOKEN ใน apps/webapp/.env หรือรัน:
 *    $env:TELEGRAM_BOT_TOKEN="your_bot_token"; node scripts/telegram_bot.js
 * 2. บอทจะดึงข้อความจาก Telegram อัตโนมัติ (ไม่ต้องตั้ง Webhook หรือเปิด Port สาธารณะ)
 * 3. บอทจะวิเคราะห์วันที่, แยกรายการ, จัดลง 5 หมวดหมู่ และตอบกลับสรุปในแชททันที!
 */

import { ingestMessage } from '../lib/parser.js';
import fs from 'fs';
import path from 'path';

let token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/TELEGRAM_BOT_TOKEN\s*=\s*(.+)/);
    if (match) {
      token = match[1].trim();
    }
  }
}

if (!token) {
  console.log('⚠️ ไม่พบ TELEGRAM_BOT_TOKEN ใน Environment หรือ .env');
  process.exit(0);
}

const API_BASE = `https://api.telegram.org/bot${token}`;
let offset = 0;

console.log('🤖 Telegram Polling Bot เริ่มทำงานแล้ว กำลังรอรับข้อความ...');

async function sendMessage(chatId, text) {
  try {
    await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch (err) {
    console.error('Error sending reply to Telegram:', err);
  }
}

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
          let reply = `⚡ *Skynet OS: บันทึกสำเร็จ ${result.count} รายการ*\n\n`;
          let total = 0;
          for (const item of result.items) {
            total += item.amount;
            reply += `• [${item.date}] *${item.category_group}* | ${item.category}: \`${item.amount.toLocaleString()} ฿\`\n`;
          }
          reply += `\n📊 *ยอดรวมก้อนนี้:* \`${total.toLocaleString()} ฿\`\n`;
          reply += `👉 เปิดดูปฏิทิน: http://localhost:3000`;
          await sendMessage(msg.chat.id, reply);
        } else {
          await sendMessage(
            msg.chat.id,
            `⚠️ บอทไม่สามารถอ่านยอดเงินได้ กรุณาพิมพ์ในรูปแบบ:\n\`วันที่ 1 จ่ายหนี้ ธันเดอ 2000 wifi 500\``
          );
        }
      }
    }
  } catch (err) {
    console.error('Polling error:', err);
  }
  setTimeout(poll, 1500);
}

poll();
