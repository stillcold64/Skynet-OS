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

const API_BASE = `https://api.telegram.org/bot${token}`;

let offset = 0;

// Helper: Render interactive Focus checklist message & keyboard
function renderFocusChecklist(todayStr) {
  const todayTop3 = getTodayCheckIns(todayStr);
  const stats = getFocusStats(todayStr);
  const doneCount = todayTop3.filter((t) => t.is_done_today).length;

  let text = `🎯 <b>[ภารกิจหลักประจำวัน — Skynet Focus]</b>\n`;
  text += `📅 <b>วันที่:</b> <code>${todayStr}</code> | 🔥 <b>Streak:</b> ${stats.currentStreak} วันติด\n`;
  text += `📊 <b>ความคืบหน้า:</b> <b>${doneCount}/${todayTop3.length} ข้อสำเร็จ</b>\n\n`;

  const keyboard = [];

  todayTop3.forEach((t) => {
    const rankEmoji = t.rank === 1 ? '🥇' : t.rank === 2 ? '🥈' : '🥉';
    const statusText = t.is_done_today ? '✅ <b>[ทำสำเร็จแล้ว]</b>' : '⏳ <i>[รอทำ]</i>';
    text += `${rankEmoji} <b>อันดับ ${t.rank}: ${t.title}</b>\n`;
    text += `   สถานะ: ${statusText}\n`;
    text += `   ⏰ เวลาเตือน: ${t.reminder_time ? t.reminder_time + ' น.' : 'ไม่เตือน'}`;
    if (t.target_days > 0) {
      text += ` | 🎯 เป้าหมาย: ${t.target_days} วัน (ทำแล้ว ${t.total_completed_days} วัน)`;
    }
    text += `\n\n`;

    const btnText = t.is_done_today
      ? `✅ ข้อ ${t.rank}: สำเร็จแล้ว (กดเพื่อยกเลิก)`
      : `⏳ ข้อ ${t.rank}: กดติ๊กถูก (ทำแล้ว)`;
    keyboard.push([{ text: btnText, callback_data: `toggle_task_${t.id}` }]);
  });

  if (doneCount < todayTop3.length) {
    keyboard.push([{ text: '🌟 ติ๊กครบทั้งหมด 3 ข้อ', callback_data: 'ok_all' }]);
  } else {
    text += `🌟 <b>สุดยอดมากครับ! วันนี้คุณเก็บครบ 100% เต็มทุกข้อแล้ว!</b> 🟩🟩🟩\n`;
  }

  text += `👇 <i>กดติ๊กถูกหรือยกเลิกที่ปุ่มด้านล่างนี้ในบอทได้เลยครับ:</i>`;

  return { text, keyboard };
}

// Guard against duplicate instances & provide healthcheck + webhook trigger
const healthServer = http.createServer(async (req, res) => {
  if (req.url === '/ping_focus' && req.method === 'POST') {
    const chatId = getSetting('telegram_chat_id') || process.env.TELEGRAM_CHAT_ID;
    if (chatId) {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
      const { text, keyboard } = renderFocusChecklist(todayStr);
      await sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'sent', chatId }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No telegram_chat_id found' }));
    }
  }

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

console.log('🤖 Telegram Polling Bot เริ่มทำงานแล้ว กำลังรอรับข้อความ...');
if (googleSheetsUrl) {
  console.log('☁️ Google Sheets Sync เปิดใช้งานแล้ว:', googleSheetsUrl);
} else {
  console.log('💡 Google Sheets Sync ยังไม่ได้ตั้งค่า URL');
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
      console.log(`☁️ [Google Sheets] สำรองข้อมูล ${items.length} รายการสำเร็จ`);
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
      if (res.ok) return await res.json();
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

async function editMessageText(chatId, messageId, text, options = {}) {
  try {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parse_mode || 'HTML',
      ...options,
    };
    const res = await fetch(`${API_BASE}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
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

// Scheduler: Individual Reminder Check per Task (including smart catch-up)
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

    const currentTimeStr = timeFormatter.format(now); // e.g. "15:20"
    const todayStr = dateFormatter.format(now); // e.g. "2026-09-25"

    const top3 = getTodayCheckIns(todayStr);
    for (const task of top3) {
      if (!task.reminder_time) continue;

      // Check if current time has reached or passed the task reminder time
      const isDue = task.reminder_time <= currentTimeStr;
      if (!isDue) continue;

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
      message += `\n👉 <b>ทำสำเร็จตามแผนแล้วใช่ไหมครับ?</b>\nกดปุ่มด้านล่างเพื่อติ๊กถูกในบอทได้เลย:`;

      await sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: `✅ ข้อ ${task.rank}: ทำตามแผนแล้ว (กดติ๊กถูก)`, callback_data: `toggle_task_${task.id}` }],
            [{ text: `🌟 ติ๊กครบทั้งหมด 3 ข้อ`, callback_data: `ok_all` }],
          ],
        },
      });

      console.log(`⏰ [Focus Reminder] ส่งแจ้งเตือน Task #${task.id} (${task.title}) ไปยัง chat [${chatId}] สำเร็จ`);
    }
  } catch (err) {
    console.error('Focus Reminder Scheduler Error:', err.message);
  }
}

// Start checking reminders every 20 seconds
setInterval(checkFocusReminders, 20000);

// Run catch-up check after 4 seconds of startup
setTimeout(checkFocusReminders, 4000);

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

        // 1. Handle Inline Buttons (Callback Queries) — Tick directly in Telegram!
        if (update.callback_query) {
          const cq = update.callback_query;
          const chatId = cq.message.chat.id;
          const cqData = cq.data;
          const messageId = cq.message.message_id;
          setSetting('telegram_chat_id', chatId);

          const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

          if (cqData.startsWith('toggle_task_') || cqData.startsWith('ok_task_')) {
            const taskId = parseInt(cqData.replace('toggle_task_', '').replace('ok_task_', ''), 10);
            const task = getAllFocusTasks().find((t) => t.id === taskId);

            // Check current status
            const top3Before = getTodayCheckIns(todayStr);
            const currentItem = top3Before.find((t) => t.id === taskId);
            const willToggleOff = currentItem && currentItem.is_done_today;

            if (willToggleOff) {
              toggleFocusCheckIn(taskId, todayStr, 'TOGGLE', 'TELEGRAM', 'ยกเลิกผ่านปุ่ม Telegram');
              await answerCallbackQuery(cq.id, `ยกเลิกการติ๊กข้อ ${task ? task.rank : ''} แล้ว`);
            } else {
              toggleFocusCheckIn(taskId, todayStr, 'COMPLETED', 'TELEGRAM', 'กดยืนยันปุ่ม Telegram');
              await answerCallbackQuery(cq.id, `🔥 ติ๊กข้อ ${task ? task.rank : ''} สำเร็จเรียบร้อย!`);
            }

            // Edit the message in place with updated checklist & buttons!
            const { text, keyboard } = renderFocusChecklist(todayStr);
            await editMessageText(chatId, messageId, text, {
              reply_markup: { inline_keyboard: keyboard },
            });

            const stats = getFocusStats(todayStr);

            // Sync to Google Sheets
            if (!willToggleOff) {
              syncFocusToGoogleSheets({
                date: todayStr,
                taskId,
                taskTitle: task ? task.title : 'Task #' + taskId,
                rank: task ? task.rank : 0,
                status: 'COMPLETED',
                channel: 'TELEGRAM',
                streak: stats.currentStreak,
                reminderTime: task ? task.reminder_time : '',
                note: 'ยืนยันปุ่ม Telegram ในบอท',
              }).catch(() => {});
            }
          } else if (cqData === 'ok_all') {
            const top3 = getTodayCheckIns(todayStr);
            for (const t of top3) {
              toggleFocusCheckIn(t.id, todayStr, 'COMPLETED', 'TELEGRAM', 'กดยืนยันทำครบทั้งหมด');
            }
            await answerCallbackQuery(cq.id, '🌟 สุดยอดมาก! บันทึกครบทั้ง 3 ข้อเรียบร้อย!');

            // Edit message in place
            const { text, keyboard } = renderFocusChecklist(todayStr);
            await editMessageText(chatId, messageId, text, {
              reply_markup: { inline_keyboard: keyboard },
            });

            const stats = getFocusStats(todayStr);

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

        // Check if user says "โอเค" / "ok" / "ทำแล้ว"
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
          }

          // Send the updated interactive checklist with buttons!
          const { text, keyboard } = renderFocusChecklist(todayStr);
          await sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
          });
          continue;
        }

        // Check command /focus, /status, /top3, /today, เป้าหมาย, รูทีน
        if (
          lower === '/focus' ||
          lower === '/status' ||
          lower === '/top3' ||
          lower === '/today' ||
          lower === 'เป้าหมาย' ||
          lower === 'รูทีน'
        ) {
          const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
          const { text, keyboard } = renderFocusChecklist(todayStr);

          await sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
          });
          continue;
        }

        // Check command /start or /help
        if (lower === '/start' || lower === '/help') {
          let reply = `🤖 <b>ยินดีต้อนรับสู่ Skynet OS Assistant!</b>\n\n`;
          reply += `📌 <b>คำสั่งใช้งาน:</b>\n`;
          reply += `• <b>ติ๊กภารกิจ Top 3:</b> พิมพ์ <code>/focus</code> หรือ <code>เป้าหมาย</code> (จะมีปุ่มให้กดติ๊กถูกในนี้ได้ทันที)\n`;
          reply += `• <b>บันทึกความคืบหน้าเร็ว:</b> พิมพ์ <b>"โอเค"</b> เพื่อติ๊กข้อถัดไป\n`;
          reply += `• <b>บันทึกค่าใช้จ่าย:</b> พิมพ์ยอดเงินได้ทันที เช่น <i>"ข้าว 50 กาแฟ 40"</i>\n`;
          reply += `• <b>แดชบอร์ด & Heatmap:</b> http://localhost:3000\n`;
          await sendMessage(chatId, reply, { parse_mode: 'HTML' });

          // Send the interactive checklist alongside start
          const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
          const { text, keyboard } = renderFocusChecklist(todayStr);
          await sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
          });
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
            `💡 <b>Skynet Assistant</b>\n• บันทึกค่าใช้จ่าย: พิมพ์ เช่น <i>"ข้าว 50 กาแฟ 40"</i>\n• ติ๊กภารกิจรูทีน: พิมพ์ <code>/focus</code> หรือพิมพ์ <b>"โอเค"</b> ได้เลยครับ`
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
