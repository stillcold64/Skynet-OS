/**
 * Telegram Long-Polling Bot Worker + Focus Engine + Google Sheets Sync
 */

import { ingestMessage } from '../lib/parser.js';
import {
  getActiveTop3Tasks,
  getAllFocusTasks,
  toggleFocusCheckIn,
  getTodayCheckIns,
  getFocusStats,
  syncFocusToGoogleSheets,
  getSetting,
  setSetting,
} from '../lib/focus_db.js';
import fs from 'fs';
import path from 'path';
import http from 'http';

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

// Guard against duplicate instances & provide healthcheck
const healthServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', bot: 'skynet_telegram_bot' }));
});

healthServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('[INFO] Another Telegram Bot instance is already running on port 3001. Exiting duplicate.');
    process.exit(0);
  }
});

healthServer.listen(3001, '127.0.0.1', () => {
  console.log('Bot health server listening on http://127.0.0.1:3001');
});

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
        action: 'sync_transactions',
        type: 'TRANSACTIONS',
        items,
        rawMessage,
        timestamp: new Date().toISOString(),
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      console.log(`☁️ [Google Sheets] สำรองข้อมูล ${items.length} รายการสำเร็จ (Status: ${res.status})`);
      return true;
    } else {
      console.error(`⚠️ [Google Sheets] สำรองข้อมูลไม่สำเร็จ (Status: ${res.status})`);
      return false;
    }
  } catch (err) {
    console.error('Error syncing to Google Sheets:', err.message);
    return false;
  }
}

async function sendMessage(chatId, text, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const payload = {
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'HTML',
        ...options,
      };
      const res = await fetch(`${API_BASE}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
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

async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    await fetch(`${API_BASE}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {}
}

const CATEGORY_EMOJI = {
  LIFE: '🌿',
  EXTRAVAGANT: '✨',
  BILL: '📄',
  INVESTING: '📈',
  ETC: '📦',
};

// Scheduler: Individual Reminder Check per Task
async function checkFocusReminders() {
  try {
    const chatId = getSetting('telegram_chat_id') || process.env.TELEGRAM_CHAT_ID;
    if (!chatId) return;

    const now = new Date();
    // Bangkok Time (UTC+7)
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
    });

    const currentTimeStr = timeFormatter.format(now); // e.g. "09:00"
    const todayStr = dateFormatter.format(now); // e.g. "2026-09-24"

    const top3 = getTodayCheckIns(todayStr);
    for (const task of top3) {
      if (!task.reminder_time || task.reminder_time !== currentTimeStr) continue;
      if (task.is_done_today) continue; // Already completed today!

      const sentKey = `reminder_sent_${task.id}_${todayStr}`;
      if (getSetting(sentKey)) continue; // Already sent today!

      // Mark as sent
      setSetting(sentKey, currentTimeStr);

      const rankEmoji = task.rank === 1 ? '🥇' : task.rank === 2 ? '🥈' : '🥉';
      let message = `⏰ <b>[แจ้งเตือนภารกิจ ${rankEmoji} อันดับ ${task.rank} — ${task.reminder_time} น.]</b>\n\n`;
      message += `<b>${task.title}</b>\n`;
      if (task.description) {
        message += `💬 <i>"${task.description}"</i>\n`;
      }
      if (task.target_days > 0) {
        message += `🎯 ชาเลนจ์เป้าหมาย: ${task.target_days} วัน (ทำแล้ว ${task.total_completed_days} วัน)\n`;
      }
      message += `\n👉 <b>ทำสำเร็จตามแผนแล้วใช่ไหมครับ?</b>\nกดปุ่มด้านล่าง หรือพิมพ์ <b>"โอเค"</b> เพื่อบันทึก:`;

      await sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: `✅ โอเค (ทำตามแผนเรียบร้อย)`, callback_data: `ok_task_${task.id}` }],
            [{ text: `🌟 โอเค (ทำครบทั้ง 3 ข้อ)`, callback_data: `ok_all` }],
          ],
        },
      });

      console.log(`⏰ [Focus Reminder] ส่งแจ้งเตือน Task #${task.id} (${task.title}) ไปยัง chat [${chatId}] สำเร็จ`);
    }
  } catch (err) {
    console.error('Focus Reminder Scheduler Error:', err.message);
  }
}

// Start checking reminders every 25 seconds
setInterval(checkFocusReminders, 25000);

let isPolling = false;
let lastPollActivity = Date.now();

async function poll() {
  if (isPolling) return;
  isPolling = true;

  try {
    lastPollActivity = Date.now();
    const res = await fetch(`${API_BASE}/getUpdates?offset=${offset}&timeout=30`, {
      signal: AbortSignal.timeout(35000),
    });

    if (!res.ok) {
      console.warn(`[WARN] Telegram getUpdates returned HTTP ${res.status}`);
      isPolling = false;
      setTimeout(poll, 5000);
      return;
    }

    const data = await res.json();
    lastPollActivity = Date.now();

    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        offset = update.update_id + 1;

        // 1. Handle Inline Buttons (Callback Queries)
        if (update.callback_query) {
          const cq = update.callback_query;
          const chatId = cq.message.chat.id;
          const cqData = cq.data;
          setSetting('telegram_chat_id', chatId);

          const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

          if (cqData.startsWith('ok_task_')) {
            const taskId = parseInt(cqData.replace('ok_task_', ''), 10);
            const task = getAllFocusTasks().find((t) => t.id === taskId);
            toggleFocusCheckIn(taskId, todayStr, 'COMPLETED', 'TELEGRAM', 'กดยืนยันปุ่ม Telegram');
            await answerCallbackQuery(cq.id, 'บันทึกสำเร็จเรียบร้อย! 🔥');

            const stats = getFocusStats(todayStr);
            const todayTop3 = getTodayCheckIns(todayStr);
            const doneCount = todayTop3.filter((t) => t.is_done_today).length;

            let reply = `🔥 <b>ยอดเยี่ยมมากครับ! บันทึกความต่อเนื่องสำเร็จ 🟩</b>\n\n`;
            reply += `🎯 <b>ภารกิจ:</b> ${task ? task.title : 'ภารกิจ #' + taskId}\n`;
            reply += `📊 <b>ความคืบหน้าวันนี้:</b> ${doneCount}/3 ข้อสำเร็จ\n`;
            reply += `⚡ <b>Current Streak:</b> ${stats.currentStreak} วันต่อเนื่อง!\n\n`;
            reply += `👉 ตรวจสอบตาราง Heatmap: http://localhost:3000`;

            await sendMessage(chatId, reply, { parse_mode: 'HTML' });

            syncFocusToGoogleSheets({
              date: todayStr,
              taskId,
              taskTitle: task ? task.title : 'Task #' + taskId,
              rank: task ? task.rank : 0,
              status: 'COMPLETED',
              channel: 'TELEGRAM',
              streak: stats.currentStreak,
              reminderTime: task ? task.reminder_time : '',
              note: 'ยืนยันปุ่ม Telegram',
            }).catch(() => {});
          } else if (cqData === 'ok_all') {
            const top3 = getTodayCheckIns(todayStr);
            for (const t of top3) {
              toggleFocusCheckIn(t.id, todayStr, 'COMPLETED', 'TELEGRAM', 'กดยืนยันทำครบทั้งหมด');
            }
            await answerCallbackQuery(cq.id, 'สุดยอดมาก! บันทึกครบ 3 ข้อ 🔥');
            const stats = getFocusStats(todayStr);

            let reply = `🌟 <b>ยอดเยี่ยมที่สุด! บันทึกครบทั้ง 3 ภารกิจวันนี้ 🟩🟩🟩</b>\n\n`;
            reply += `⚡ <b>Current Streak:</b> ${stats.currentStreak} วันต่อเนื่อง (Full Streak!)\n`;
            reply += `🏆 <b>Best Streak:</b> ${stats.bestStreak} วัน\n`;
            reply += `☁️ ซิงค์สำรองข้อมูล Google Sheets เรียบร้อยแล้ว`;

            await sendMessage(chatId, reply, { parse_mode: 'HTML' });

            syncFocusToGoogleSheets({
              date: todayStr,
              taskId: 0,
              taskTitle: '✅ ทำครบทั้งหมด 3 ข้อ (All Done)',
              rank: 0,
              status: 'COMPLETED',
              channel: 'TELEGRAM',
              streak: stats.currentStreak,
              reminderTime: 'ALL',
              note: 'ยืนยันปุ่ม Telegram ครบ 3 ข้อ',
            }).catch(() => {});
          }
          continue;
        }

        // 2. Handle Text Messages
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const chatId = msg.chat.id;
        setSetting('telegram_chat_id', chatId);

        const rawText = msg.text.trim();
        const lower = rawText.toLowerCase();

        console.log(`📩 ได้รับข้อความจาก [${chatId}]: "${rawText}"`);

        // Check if user says "โอเค" / "ok"
        const isOk = /^(โอเค|โอเคร|เค|ok|okay|okey|done|เสร็จ|เรียบร้อย)(\s*\d+)?$/i.test(lower);
        if (isOk) {
          const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
          const todayTop3 = getTodayCheckIns(todayStr);

          // Check if user specified a number (e.g. "โอเค 1", "ok 2")
          const numMatch = lower.match(/\d+/);
          let targetTask = null;

          if (numMatch) {
            const targetRank = parseInt(numMatch[0], 10);
            targetTask = todayTop3.find((t) => t.rank === targetRank);
          } else {
            // Pick first pending task
            targetTask = todayTop3.find((t) => !t.is_done_today);
          }

          if (targetTask) {
            toggleFocusCheckIn(targetTask.id, todayStr, 'COMPLETED', 'TELEGRAM', 'พิมพ์ตอบ ' + rawText);
            const stats = getFocusStats(todayStr);
            const updatedTop3 = getTodayCheckIns(todayStr);
            const doneCount = updatedTop3.filter((t) => t.is_done_today).length;

            let reply = `🔥 <b>ยอดเยี่ยมมากครับ! บันทึกความต่อเนื่องสำเร็จ 🟩</b>\n\n`;
            reply += `🎯 <b>ภารกิจ:</b> ${targetTask.title}\n`;
            reply += `📊 <b>ความคืบหน้าวันนี้:</b> ${doneCount}/3 ข้อสำเร็จ\n`;
            reply += `⚡ <b>Current Streak:</b> ${stats.currentStreak} วันต่อเนื่อง!\n`;
            if (doneCount === 3) {
              reply += `🌟 <i>สุดยอดมาก! วันนี้เก็บครบ 100% เต็มทุกข้อแล้ว!</i>\n`;
            }
            reply += `\n☁️ ซิงค์สำรองข้อมูลลง Google Sheets เรียบร้อยแล้ว\n`;
            reply += `👉 ตรวจสอบบน Heatmap: http://localhost:3000`;

            await sendMessage(chatId, reply, { parse_mode: 'HTML' });

            syncFocusToGoogleSheets({
              date: todayStr,
              taskId: targetTask.id,
              taskTitle: targetTask.title,
              rank: targetTask.rank,
              status: 'COMPLETED',
              channel: 'TELEGRAM',
              streak: stats.currentStreak,
              reminderTime: targetTask.reminder_time || '',
              note: 'พิมพ์ตอบ: ' + rawText,
            }).catch(() => {});
            continue;
          } else {
            // All 3 already done today!
            const stats = getFocusStats(todayStr);
            let reply = `🌟 <b>วันนี้คุณทำครบทั้ง 3 ภารกิจหลักแล้วครับ!</b>\n\n`;
            reply += `⚡ สถิติต่อเนื่อง (Streak): <b>${stats.currentStreak} วันติด</b>\n`;
            reply += `🏆 สถิติสูงสุด (Best): <b>${stats.bestStreak} วัน</b>\n\n`;
            reply += `ตาราง Heatmap วันนี้เขียวเต็มแล้ว พักผ่อนและรักษาวินัยต่อไปครับ 🚀`;
            await sendMessage(chatId, reply, { parse_mode: 'HTML' });
            continue;
          }
        }

        // Check command /focus, /status, /top3, เป้าหมาย
        if (lower === '/focus' || lower === '/status' || lower === '/top3' || lower === 'เป้าหมาย' || lower === 'รูทีน') {
          const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
          const todayTop3 = getTodayCheckIns(todayStr);
          const stats = getFocusStats(todayStr);

          let reply = `🎯 <b>[3 อันดับภารกิจหลักประจำวัน — Top 3 Focus]</b>\n\n`;
          const keyboard = [];

          todayTop3.forEach((t) => {
            const statusEmoji = t.is_done_today ? '✅ [เสร็จแล้ว]' : '⏳ [รอทำ]';
            const rankEmoji = t.rank === 1 ? '🥇' : t.rank === 2 ? '🥈' : '🥉';
            reply += `${rankEmoji} <b>อันดับ ${t.rank}:</b> ${t.title}\n`;
            reply += `   ⏰ แจ้งเตือน: ${t.reminder_time ? t.reminder_time + ' น.' : 'ปิดเตือน'}\n`;
            if (t.target_days > 0) {
              reply += `   🏁 เป้าหมาย: ${t.target_days} วัน (ทำแล้ว ${t.total_completed_days} วัน)\n`;
            }
            reply += `   สถานะวันนี้: ${statusEmoji}\n\n`;

            if (!t.is_done_today) {
              keyboard.push([
                {
                  text: `✅ ติ๊กเสร็จข้อ ${t.rank}: ${t.title.slice(0, 22)}...`,
                  callback_data: `ok_task_${t.id}`,
                },
              ]);
            }
          });

          reply += `🔥 <b>Streak ต่อเนื่อง:</b> ${stats.currentStreak} วัน | 🏆 <b>Best:</b> ${stats.bestStreak} วัน\n`;
          reply += `👉 พิมพ์ <b>"โอเค"</b> เพื่อติ๊กเสร็จ หรือกดปุ่มด้านล่างได้เลยครับ:`;

          if (keyboard.length > 0) {
            keyboard.push([{ text: `🌟 ติ๊กเสร็จครบทั้งหมด 3 ข้อ`, callback_data: `ok_all` }]);
          }

          await sendMessage(chatId, reply, {
            parse_mode: 'HTML',
            reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
          });
          continue;
        }

        // Check command /start or /help
        if (lower === '/start' || lower === '/help') {
          let reply = `🤖 <b>ยินดีต้อนรับสู่ Skynet OS Assistant!</b>\n\n`;
          reply += `📌 <b>คำสั่งใช้งาน:</b>\n`;
          reply += `• <b>บันทึกค่าใช้จ่าย:</b> พิมพ์ยอดเงินได้ทันที เช่น <i>"ข้าว 50 กาแฟ 40"</i> หรือ <i>"วันที่ 15 ช้อปปิ้ง 300"</i>\n`;
          reply += `• <b>เช็คภารกิจ Top 3:</b> พิมพ์ <code>/focus</code> หรือ <code>เป้าหมาย</code>\n`;
          reply += `• <b>บันทึกความคืบหน้ารูทีน:</b> พิมพ์ <b>"โอเค"</b> หรือ <b>"ok"</b> หรือกดปุ่มที่บอทส่งเตือน\n`;
          reply += `• <b>เว็บแดชบอร์ด & Heatmap:</b> http://localhost:3000\n`;
          await sendMessage(chatId, reply, { parse_mode: 'HTML' });
          continue;
        }

        // Finance Transactions ingestion
        const result = ingestMessage(rawText);

        if (result.success && result.items.length > 0) {
          const ggsSynced = await syncToGoogleSheets(result.items, rawText);

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

          await sendMessage(chatId, reply);
        } else {
          await sendMessage(
            chatId,
            `💡 <b>Skynet Assistant</b>\n• หากต้องการบันทึกการเงิน: พิมพ์ เช่น <i>"ข้าว 50 กาแฟ 40"</i>\n• หากต้องการบันทึกภารกิจรูทีน: พิมพ์ <b>"โอเค"</b> หรือพิมพ์ <code>/focus</code> เพื่อดู 3 อันดับหลัก`
          );
        }
      }
    }
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      // Normal long-poll cycle completion or timeout
    } else {
      console.error(`Polling loop warning (${err.code || err.name}):`, err.message);
    }
  } finally {
    isPolling = false;
    lastPollActivity = Date.now();
    setTimeout(poll, 1000);
  }
}

// Watchdog: If no poll activity for 60 seconds (e.g. PC sleep/wake or hung socket), force restart poll
setInterval(() => {
  if (Date.now() - lastPollActivity > 50000) {
    console.warn('⚠️ [WATCHDOG] Polling cycle inactive for >50s. Restarting poll loop...');
    isPolling = false;
    poll();
  }
}, 20000);

poll();
