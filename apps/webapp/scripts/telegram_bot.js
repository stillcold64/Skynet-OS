/**
 * Telegram Long-Polling Bot Worker + Focus Engine + Google Sheets Sync
 */

import db from '../lib/db.js';
import { ingestMessage, classifyItem, undoBotLog, undoLastBotLog } from '../lib/parser.js';
import { backupAllToGoogleSheets } from './backup_to_sheets.js';
import {
  getActiveTop3Tasks,
  getLogicalFocusDate,
  getAllFocusTasks,
  toggleFocusCheckIn,
  getTodayCheckIns,
  getFocusStats,
  syncFocusToGoogleSheets,
  getSetting,
  setSetting,
} from '../lib/focus_db.js';
import {
  getMonthlyFixedCostsStatus,
  formatFixedCostsAlert,
  formatFullFixedCostsReport,
} from '../lib/bills_db.js';
import {
  getReflection,
  upsertReflection,
  getReflectionStats,
  getBangkokDate,
  getLogicalReflectionDate,
} from '../lib/reflections_db.js';
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

// Helper: Render interactive Focus checklist message & keyboard (Ultra-Compact Single Row)
function renderFocusChecklist(todayStr) {
  const todayTop3 = getTodayCheckIns(todayStr);
  const stats = getFocusStats(todayStr);
  const doneCount = todayTop3.filter((t) => t.is_done_today).length;

  let text = `🎯 <b>Focus วันนี้</b> (${doneCount}/${todayTop3.length}) | 🔥 Streak ${stats.currentStreak} วัน\n\n`;

  const taskButtons = [];

  todayTop3.forEach((t, idx) => {
    const num = idx + 1;
    const targetInfo = t.target_days > 0 ? ` [${t.total_completed_days}/${t.target_days} วัน]` : '';
    if (t.is_done_today) {
      text += `${num}. ✅ <s>${t.title}</s>${targetInfo}\n`;
      taskButtons.push({ text: `${num}. ✅ ทำแล้ว`, callback_data: `toggle_task_${t.id}` });
    } else {
      text += `${num}. ⏳ ${t.title}${targetInfo}\n`;
      taskButtons.push({ text: `${num}. ⏳ รอทำ`, callback_data: `toggle_task_${t.id}` });
    }
  });

  const keyboard = [];

  // Group all 3 task buttons into ONE single horizontal row!
  if (taskButtons.length > 0) {
    keyboard.push(taskButtons);
  }

  // Quick action: Complete all if not done yet
  if (doneCount < todayTop3.length) {
    keyboard.push([{ text: '⚡ ติ๊กครบทั้งหมด', callback_data: 'ok_all' }]);
  } else {
    text += `\n🎉 <i>ครบทุกข้อแล้ว ยอดเยี่ยมมาก!</i> 🔥`;
  }

  return { text, keyboard };
}

// Guard against duplicate instances & provide healthcheck + webhook trigger
const healthServer = http.createServer(async (req, res) => {
  if (req.url === '/ping_focus' && req.method === 'POST') {
    const chatId = getSetting('telegram_chat_id') || process.env.TELEGRAM_CHAT_ID;
    if (chatId) {
      const todayStr = getLogicalFocusDate();
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
  INCOME: '💵',
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

      let message = `⏰ <b>${task.reminder_time} น. — ${task.title}</b>\n`;
      if (task.target_days > 0) {
        message += `🎯 ชาเลนจ์วันที่ ${task.total_completed_days}/${task.target_days}\n`;
      }

      await sendMessage(chatId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: `🔴 [ยังไม่ทำ] คลิกติ๊ก: ทำแล้ว ✅`, callback_data: `toggle_task_${task.id}` }],
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

// Scheduler: 23:00 Nightly Closeout Reminder (Daily Luck & Finish List)
async function checkNightlyReflectionReminder() {
  try {
    const chatId = getSetting('telegram_chat_id') || process.env.TELEGRAM_CHAT_ID;
    if (!chatId) return;

    const now = new Date();
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
    });

    const currentTimeStr = timeFormatter.format(now); // e.g. "23:00"
    const todayStr = dateFormatter.format(now);

    // Trigger window: between 23:00 and 23:59
    if (currentTimeStr >= '23:00' && currentTimeStr <= '23:59') {
      const sentKey = `reflection_nightly_sent_${todayStr}`;
      if (getSetting(sentKey)) return; // Already sent today!

      const reflection = getReflection(todayStr);
      const isFilled =
        reflection &&
        ((reflection.luck_text && reflection.luck_text.trim()) ||
          (reflection.finish_text && reflection.finish_text.trim()) ||
          (reflection.next_day_text && reflection.next_day_text.trim()));

      if (!isFilled) {
        setSetting(sentKey, currentTimeStr);

        let msg = `🌙 <b>23:00 น. — สรุปปิดวันกันครับ! (Daily Reflection)</b>\n\n`;
        msg += `วันนี้ยังไม่ได้บันทึกเรื่องราวของวัน พิมพ์ตัวย่อสั้นๆ ตอบบอทได้เลยครับ:\n\n`;
        msg += `• <code>dl [เรื่องโชคดีวันนี้ 1 เรื่อง]</code>\n`;
        msg += `• <code>f [วันนี้ทำอะไรเสร็จบ้าง]</code>\n`;
        msg += `• <code>ndl [พรุ่งนี้จะทำอะไรต่อ]</code>\n\n`;
        msg += `<i>💡 ตัวอย่าง (พิมพ์ทีละบรรทัด หรือส่งรวดเดียว):</i>\n`;
        msg += `<code>dl ลูกค้าคอนเฟิร์มงานไว\nf ตัดต่อคลิปจบ, วิดพื้นครบ\nndl ขึ้นโครงคลิปใหม่, จ่ายค่าไฟ</code>`;

        await sendMessage(chatId, msg);
        console.log(`🌙 [Nightly Reminder] ส่งแจ้งเตือนสรุปวัน 23:00 ไปยัง [${chatId}] สำเร็จ`);
      }
    }
  } catch (err) {
    console.error('Nightly Reflection Reminder Error:', err.message);
  }
}

// Nightly Reflection Reminder is disabled per user request (User does reflection on computer only)
// setInterval(checkNightlyReflectionReminder, 25000);
// setTimeout(checkNightlyReflectionReminder, 5000);

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

          const todayStr = getLogicalFocusDate();

          if (cqData.startsWith('toggle_task_') || cqData.startsWith('ok_task_')) {
            const taskId = parseInt(cqData.replace('toggle_task_', '').replace('ok_task_', ''), 10);
            const task = getAllFocusTasks().find((t) => t.id === taskId);

            // Check current status
            const top3Before = getTodayCheckIns(todayStr);
            const taskIdx = top3Before.findIndex((t) => t.id === taskId);
            const taskNum = taskIdx !== -1 ? taskIdx + 1 : '';
            const currentItem = top3Before.find((t) => t.id === taskId);
            const willToggleOff = currentItem && currentItem.is_done_today;

            if (willToggleOff) {
              toggleFocusCheckIn(taskId, todayStr, 'TOGGLE', 'TELEGRAM', 'ยกเลิกผ่านปุ่ม Telegram');
              await answerCallbackQuery(cq.id, `↩️ ข้อ ${taskNum} เปลี่ยนเป็น [รอทำ]`);
            } else {
              toggleFocusCheckIn(taskId, todayStr, 'COMPLETED', 'TELEGRAM', 'กดยืนยันปุ่ม Telegram');
              await answerCallbackQuery(cq.id, `✅ ข้อ ${taskNum} บันทึกสำเร็จ [ทำแล้ว] ✨`);
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
            await answerCallbackQuery(cq.id, '✅ บันทึกครบทุกข้อแล้ว!');

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
          } else if (cqData.startsWith('undo_log_')) {
            const logId = parseInt(cqData.replace('undo_log_', ''), 10);
            const undoRes = undoBotLog(logId);
            if (undoRes.success) {
              await answerCallbackQuery(cq.id, `🗑️ ลบ ${undoRes.deletedCount} รายการเรียบร้อย`);
              await editMessageText(
                chatId,
                messageId,
                `🗑️ <b>ยกเลิกและลบรายการชุดนี้เรียบร้อยแล้ว ✅</b>\n<i>(ลบออก ${undoRes.deletedCount} รายการ: "${undoRes.rawMessage}")</i>\n☁️ ซิงค์คืนค่า Google Sheets แล้ว`,
                {
                  reply_markup: { inline_keyboard: [] },
                }
              );
              backupAllToGoogleSheets().catch((err) => console.error('Undo sync error:', err.message));
            } else {
              await answerCallbackQuery(cq.id, `⚠️ ${undoRes.message || 'ไม่สามารถยกเลิกได้'}`);
            }
          }
          continue;
        }

        // 2. Handle Text Messages & Edited Messages
        const msg = update.message || update.edited_message;
        const isEdited = !!update.edited_message;
        if (!msg || !msg.text) continue;

        const chatId = msg.chat.id;
        setSetting('telegram_chat_id', chatId);

        const rawText = msg.text.trim();
        const lower = rawText.toLowerCase();

        console.log(`📩 ได้รับข้อความ${isEdited ? ' (แก้ไข)' : ''}จาก [${chatId}]: "${rawText}"`);

        // If this is an edited message, rollback previous transactions ingested for this telegram message_id
        if (isEdited) {
          try {
            const prevLog = db
              .prepare('SELECT id FROM bot_logs WHERE telegram_msg_id = ? AND status != "CANCELLED" ORDER BY id DESC LIMIT 1')
              .get(msg.message_id);
            if (prevLog) {
              const rollbackRes = undoBotLog(prevLog.id);
              console.log(`✏️ [EDITED_MESSAGE] Rollback previous log #${prevLog.id} (deleted ${rollbackRes.deletedCount} items)`);
            }
          } catch (e) {
            console.error('Error handling edited message rollback:', e.message);
          }
        }

        // Check if user wants to undo/delete the last transaction
        if (/^(ลบ|ยกเลิก|undo|ลบล่าสุด|ยกเลิกล่าสุด)$/i.test(rawText)) {
          const undoRes = undoLastBotLog();
          if (undoRes.success) {
            await sendMessage(
              chatId,
              `🗑️ <b>ยกเลิกรายการล่าสุดเรียบร้อยแล้ว ✅</b>\n• ลบออก: <b>${undoRes.deletedCount}</b> รายการ\n• ข้อความเดิม: <i>"${undoRes.rawMessage}"</i>\n☁️ ซิงค์คืนสถานะ Google Sheets แล้ว`,
              { parse_mode: 'HTML' }
            );
            backupAllToGoogleSheets().catch((err) => console.error('Undo sync error:', err.message));
          } else {
            await sendMessage(chatId, `⚠️ ${undoRes.message || 'ไม่มีรายการล่าสุดให้ยกเลิก'}`);
          }
          continue;
        }

        // Check if user says "โอเค" / "ok" / "ทำแล้ว"
        const isOk = /^(โอเค|โอเคร|เค|ok|okay|okey|done|เสร็จ|เรียบร้อย)(\s*\d+)?$/i.test(lower);
        if (isOk) {
          const todayStr = getLogicalFocusDate();
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
          const todayStr = getLogicalFocusDate();
          const { text, keyboard } = renderFocusChecklist(todayStr);

          await sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
          });
          continue;
        }

        // Check command /bills, /fixedcost, ฟิกคอส, บิล
        if (
          lower === '/bills' ||
          lower === '/fixedcost' ||
          lower === 'ฟิกคอส' ||
          lower === 'ฟิกคอสท์' ||
          lower === 'บิล' ||
          lower === 'บิลคงเหลือ' ||
          lower === 'fixedcost' ||
          lower === 'fixed cost'
        ) {
          const status = getMonthlyFixedCostsStatus();
          const report = formatFullFixedCostsReport(status);
          await sendMessage(chatId, report, { parse_mode: 'HTML' });
          continue;
        }

        // Check command /start or /help
        if (lower === '/start' || lower === '/help') {
          let reply = `🤖 <b>Skynet OS</b>\n\n`;
          reply += `• Focus: พิมพ์ <code>/focus</code> หรือ <b>"โอเค"</b>\n`;
          reply += `• บิลคงเหลือ: พิมพ์ <code>/bills</code> หรือ <b>"ฟิกคอส"</b>\n`;
          reply += `• บันทึกเงิน: พิมพ์ <i>"ข้าว 50 กาแฟ 40"</i>\n`;
          reply += `• สอนคำศัพท์: พิมพ์ <i>"จำว่า ค่าน้ำ คือ ค่าน้ำประปา"</i>\n`;
          await sendMessage(chatId, reply, { parse_mode: 'HTML' });

          // Send the interactive checklist alongside start
          const todayStr = getLogicalFocusDate();
          const { text, keyboard } = renderFocusChecklist(todayStr);
          await sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
          });
          continue;
        }

        // Check dynamic alias teaching command (e.g. "จำว่า ค่าน้ำ คือ ค่าน้ำประปา", "alias wifi = WiFi / เน็ตบ้าน")
        const aliasMatch = rawText.match(/^(?:จำว่า|alias|แมป)\s+(.+?)\s+(?:คือ|=|เป็น)\s+(.+)$/i);
        if (aliasMatch) {
          const aliasName = aliasMatch[1].trim();
          const canonicalName = aliasMatch[2].trim();
          const { categoryGroup, suggestedType } = classifyItem(canonicalName);

          try {
            db.prepare(`
              INSERT OR REPLACE INTO item_aliases (alias, canonical_name, category_group, suggested_type, note)
              VALUES (?, ?, ?, ?, ?)
            `).run(aliasName.toLowerCase(), canonicalName, categoryGroup, suggestedType, 'Learned via Telegram');

            await sendMessage(
              chatId,
              `🧠 <b>เรียนรู้คำศัพท์สำเร็จ!</b>\n\nต่อไปเมื่อพิมพ์ว่า "<b>${aliasName}</b>" บอทจะเข้าใจว่าเป็น "<b>${canonicalName}</b>" (${categoryGroup}) ทันทีครับ ✨`
            );
          } catch (err) {
            console.error('Alias save error:', err);
            await sendMessage(chatId, `⚠️ บันทึกคำศัพท์ไม่สำเร็จ: ${err.message}`);
          }
          continue;
        }

        // Check Daily Reflection shortcodes: dl (Dump Luck), f (Finish), ndl (Next Day List)
        const reflectionLines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
        const hasReflectionPrefix = reflectionLines.some((l) =>
          /^(?:dl|ndl|f|โชคดี|เสร็จ|พรุ่งนี้|luck|done|next)(?:[:\s]+.*|$)/i.test(l)
        );

        if (hasReflectionPrefix) {
          const parsedReflection = {
            luck: [],
            finish: [],
            nextDay: [],
          };

          for (const line of reflectionLines) {
            const mLuck = line.match(/^(?:dl|โชคดี|luck)[:\s]*(.*)$/i);
            if (mLuck) {
              if (mLuck[1] && mLuck[1].trim()) parsedReflection.luck.push(mLuck[1].trim());
              continue;
            }

            const mNext = line.match(/^(?:ndl|พรุ่งนี้|next)[:\s]*(.*)$/i);
            if (mNext) {
              if (mNext[1] && mNext[1].trim()) parsedReflection.nextDay.push(mNext[1].trim());
              continue;
            }

            const mFinish = line.match(/^(?:f|เสร็จ|done)[:\s]*(.*)$/i);
            if (mFinish) {
              if (mFinish[1] && mFinish[1].trim()) parsedReflection.finish.push(mFinish[1].trim());
              continue;
            }
          }

          if (
            parsedReflection.luck.length > 0 ||
            parsedReflection.finish.length > 0 ||
            parsedReflection.nextDay.length > 0
          ) {
            const targetDate = getLogicalReflectionDate();
            const existing = getReflection(targetDate);

            let updatedLuck = existing.luck_text || '';
            if (parsedReflection.luck.length > 0) {
              updatedLuck = parsedReflection.luck.join('\n');
            }

            let updatedFinish = existing.finish_text || '';
            if (parsedReflection.finish.length > 0) {
              for (const it of parsedReflection.finish) {
                const clean = it.replace(/^[•*-]\s*/, '');
                updatedFinish = updatedFinish ? `${updatedFinish}\n• ${clean}` : `• ${clean}`;
              }
            }

            let updatedNextDay = existing.next_day_text || '';
            if (parsedReflection.nextDay.length > 0) {
              for (const it of parsedReflection.nextDay) {
                const clean = it.replace(/^[•*-]\s*/, '');
                updatedNextDay = updatedNextDay ? `${updatedNextDay}\n• ${clean}` : `• ${clean}`;
              }
            }

            const updatedRec = upsertReflection(targetDate, {
              luck_text: updatedLuck,
              finish_text: updatedFinish,
              next_day_text: updatedNextDay,
            });

            const stats = getReflectionStats();
            const isNightOwl = targetDate !== getBangkokDate();
            const nightOwlBadge = isNightOwl ? ' <i>(รอบดึก สรุปของเมื่อวาน 🌙)</i>' : '';

            let reply = `✨ <b>บันทึก Daily Reflection เรียบร้อย!</b> [${targetDate}]${nightOwlBadge}\n\n`;
            if (updatedRec.luck_text) {
              reply += `🍀 <b>Dump Luck (dl):</b>\n${updatedRec.luck_text}\n\n`;
            }
            if (updatedRec.finish_text) {
              reply += `🏁 <b>Finish List (f):</b>\n${updatedRec.finish_text}\n\n`;
            }
            if (updatedRec.next_day_text) {
              reply += `🚀 <b>Next Day Plan (ndl):</b>\n${updatedRec.next_day_text}\n\n`;
            }
            reply += `🔥 <b>Reflection Streak:</b> ${stats.currentStreak} วันติดต่อกัน`;

            await sendMessage(chatId, reply);
            continue;
          }
        }

        // Finance Transactions ingestion
        const result = ingestMessage(rawText, msg.message_id);

        if (result.success && result.items.length > 0) {
          const ggsSynced = await syncToGoogleSheets(result.items, rawText);
          const expenses = result.items.filter((it) => it.type !== 'รายรับ');
          const incomes = result.items.filter((it) => it.type === 'รายรับ');
          const expTotal = expenses.reduce((sum, it) => sum + it.amount, 0);
          const incTotal = incomes.reduce((sum, it) => sum + it.amount, 0);
          const hasBill = result.items.some((it) => it.category_group === 'BILL');

          let summaryTag = '';
          if (expTotal > 0 && incTotal > 0) {
            summaryTag = `จ่าย <b>${expTotal.toLocaleString()} ฿</b> | เข้า <b>+${incTotal.toLocaleString()} ฿</b>`;
          } else if (incTotal > 0) {
            summaryTag = `เงินเข้า/กู้ <b>+${incTotal.toLocaleString()} ฿</b>`;
          } else {
            summaryTag = `รวม <b>${expTotal.toLocaleString()} ฿</b>`;
          }

          let reply = `${isEdited ? '✏️ <b>อัปเดตใหม่เรียบร้อย</b>' : '⚡ <b>บันทึกแล้ว</b>'} (${result.count} รายการ | ${summaryTag})\n`;
          for (const item of result.items) {
            const emoji = CATEGORY_EMOJI[item.category_group] || (item.type === 'รายรับ' ? '💵' : '•');
            const aliasDisplay =
              item.original_alias && item.original_alias.toLowerCase() !== item.category.toLowerCase()
                ? ` (<i>${item.original_alias}</i>)`
                : '';
            const sign = item.type === 'รายรับ' ? '+' : '';
            const noteSuffix = item.type === 'รายรับ' ? ' <i>(รายรับ/เงินเข้า)</i>' : '';
            reply += `• [${item.date}] ${emoji} <b>${item.category}</b>${aliasDisplay}: ${sign}${item.amount.toLocaleString()} ฿${noteSuffix}\n`;
          }
          if (ggsSynced) {
            reply += `☁️ ซิงค์ Google Sheets แล้ว\n`;
          }

          // If a bill payment was recorded, alert remaining Fixed Costs for the month!
          if (hasBill) {
            try {
              const fixedStatus = getMonthlyFixedCostsStatus();
              reply += formatFixedCostsAlert(fixedStatus);
            } catch (err) {
              console.error('Fixed cost alert error:', err.message);
            }
          }

          // If it was an edited message, also trigger full backup sync so Google Sheets stays in sync
          if (isEdited) {
            backupAllToGoogleSheets().catch((err) => console.error('Edit backup sync error:', err.message));
          }

          // Inline delete / undo button for 1-tap rollback
          const keyboard = [
            [{ text: '🗑️ ยกเลิก / ลบรายการชุดนี้', callback_data: `undo_log_${result.logId}` }],
          ];

          await sendMessage(chatId, reply, {
            reply_markup: { inline_keyboard: keyboard },
          });
        } else {
          await sendMessage(
            chatId,
            `💡 <b>Skynet Assistant</b>\n• บันทึกค่าใช้จ่าย: พิมพ์ เช่น <i>"ข้าว 50 กาแฟ 40"</i>\n• ติ๊กภารกิจรูทีน: พิมพ์ <code>/focus</code> หรือพิมพ์ <b>"โอเค"</b>\n• เช็คบิลคงเหลือ: พิมพ์ <code>/bills</code> หรือ <b>"ฟิกคอส"</b>`
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
