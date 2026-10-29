import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../lib/db.js';
import {
  getActiveSession,
  punchActivity,
  stopActiveSession,
} from '../lib/tracker_db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const getIdleScript = path.join(__dirname, 'get_idle_ms.ps1');

// Known game executables
const KNOWN_GAMES = new Set([
  'dota2.exe',
  'cs2.exe',
  'csgo.exe',
  'valorant.exe',
  'gta5.exe',
  'r5apex.exe',
  'eldenring.exe',
  'genshinimpact.exe',
  'starrail.exe',
  'wutheringwaves.exe',
  'pubg.exe',
  'overwatch.exe',
  'minecraft.exe',
  'leagueclientux.exe',
  'leagueclient.exe',
  'bg3.exe',
  'cyberpunk2077.exe',
  'monsterhunter.exe',
  'helldivers2.exe',
  'blackmythwukong.exe',
  'fifa.exe',
  'fc24.exe',
  'fc25.exe',
]);

// Known work / video editing / coding executables
const KNOWN_WORK_APPS = new Set([
  'capcut.exe',
  'adobe premiere pro.exe',
  'resolve.exe',
  'afterfx.exe',
  'photoshop.exe',
  'obs64.exe',
  'code.exe',
  'cursor.exe',
]);

const WORK_IDLE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes of zero input while working = idle/left open
const SLEEP_IDLE_THRESHOLD_MS = 35 * 60 * 1000; // 35 minutes idle = away/asleep
const CHECK_INTERVAL_MS = 15000; // Check every 15s

function log(msg) {
  const time = new Date().toLocaleTimeString('th-TH', { hour12: false });
  console.log(`[${time}] [AutoTracker] ${msg}`);
}

// 1. Check Running Apps (Games vs Work)
function checkRunningApps() {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) return resolve({ gameExe: null, workExe: null });

      let foundGame = null;
      let foundWork = null;

      const lines = stdout.split('\n');
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length > 0) {
          const exe = parts[0].replace(/"/g, '').trim().toLowerCase();
          if (KNOWN_GAMES.has(exe) && !foundGame) {
            foundGame = exe;
          }
          if (KNOWN_WORK_APPS.has(exe) && !foundWork) {
            foundWork = exe;
          }
        }
      }

      resolve({ gameExe: foundGame, workExe: foundWork });
    });
  });
}

// 2. Get User Idle Time in ms
function checkIdleMs() {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', getIdleScript],
      { timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(0);
        const ms = parseInt(stdout.trim(), 10);
        resolve(isNaN(ms) ? 0 : ms);
      }
    );
  });
}

// 3. Main Auto-Tracking Loop
let isRunning = false;
async function tick() {
  if (isRunning) return;
  isRunning = true;

  try {
    // Check if auto-tracker is enabled in settings
    const setting = db.prepare("SELECT value FROM system_settings WHERE key = 'auto_tracker_enabled'").get();
    if (setting && setting.value === 'false') {
      isRunning = false;
      return;
    }

    const [{ gameExe, workExe }, idleMs] = await Promise.all([checkRunningApps(), checkIdleMs()]);
    const active = getActiveSession();

    // CASE 1: Game is actively running
    if (gameExe) {
      if (!active || active.activity_id !== 2) {
        log(`🎮 ตรวจพบเกมเปิดอยู่: ${gameExe} -> เริ่มบันทึก "เล่นเกม" อัตโนมัติ`);
        punchActivity(2, `Auto-detected: ${gameExe}`);
      }
      isRunning = false;
      return;
    }

    // CASE 2: Game just closed (was auto-started)
    if (!gameExe && active && active.activity_id === 2 && (active.note || '').includes('Auto-detected:')) {
      log(`⏹️ เกมปิดแล้ว -> สิ้นสุดการบันทึก "เล่นเกม" อัตโนมัติ`);
      stopActiveSession('Auto-stopped: Game closed');
      isRunning = false;
      return;
    }

    // CASE 3: Inactivity while in "Work / Editing" mode (Idle >= 15 minutes)
    // Fixes the issue: "เปิดหน้าตัดต่อทิ้งไว้แต่ไม่ได้ทำ"
    if (active && active.activity_id === 1 && idleMs >= WORK_IDLE_THRESHOLD_MS) {
      const cutoffTime = new Date(Date.now() - idleMs).toISOString();
      const mins = Math.floor(idleMs / 60000);
      log(`⚠️ ตรวจพบไม่ได้ขยับเมาส์/คีย์บอร์ดในโหมดทำงานนาน ${mins} นาที (เปิดหน้าจอทิ้งไว้) -> ตัดจบเวลาทำงาน ณ นาทีที่หยุดใช้งาน`);
      stopActiveSession('Auto-paused: ไม่ได้ขยับเมาส์เกิน 15 นาที (เปิดทิ้งไว้)', cutoffTime);
      isRunning = false;
      return;
    }

    // CASE 4: Work App is running & User is actively using PC (Idle < 3 mins)
    // If user is active in CapCut / Premiere and not already in work session
    if (workExe && idleMs < 180000) {
      if (!active) {
        log(`💻 ตรวจพบโปรแกรมทำงาน/ตัดต่อเปิดอยู่: ${workExe} (ผู้ใช้กำลังใช้งาน) -> เริ่มบันทึก "ทำงาน" อัตโนมัติ`);
        punchActivity(1, `Auto-detected: ${workExe}`);
      }
    }

    // CASE 5: General Inactivity / Fell Asleep (Idle >= 35 minutes across all activities)
    if (idleMs >= SLEEP_IDLE_THRESHOLD_MS) {
      if (active && active.activity_id !== 5) {
        const cutoffTime = new Date(Date.now() - idleMs).toISOString();
        const mins = Math.floor(idleMs / 60000);
        log(`😴 ไม่ได้ใช้งานหน้าจอนาน ${mins} นาที (เผลอหลับ/ลุกไปข้างนอก) -> ตัดจบกิจกรรม ${active.activity_name} ณ เวลาที่หยุดใช้งาน`);
        stopActiveSession('Auto-stopped: User inactive (fell asleep/away)', cutoffTime);

        log(`🌙 เริ่มบันทึก "พักผ่อน / นอนหลับ" ย้อนหลังตั้งแต่เวลาที่หยุดใช้งาน`);
        punchActivity(5, 'Auto-detected sleep: Inactivity', cutoffTime);
      }
      isRunning = false;
      return;
    }

    // CASE 6: User woke up / returned from sleep session
    if (idleMs < 10000 && active && active.activity_id === 5 && (active.note || '').includes('Auto-detected sleep')) {
      log(`☀️ ตรวจพบการขยับเมาส์/คีย์บอร์ด (ตื่นนอนแล้ว) -> จบการบันทึก "พักผ่อน / นอนหลับ"`);
      stopActiveSession('Auto-stopped: User woke up / active');
      isRunning = false;
      return;
    }
  } catch (err) {
    console.error('[AutoTracker ERROR]:', err.message);
  } finally {
    isRunning = false;
  }
}

log('===================================================');
log('   ⚡ Skynet OS - Auto-Activity & Sleep Watcher v2');
log('   • ตรวจจับเกมอัตโนมัติ (Dota 2, CS2, Steam, etc.)');
log('   • ตรวจจับโปรแกรมตัดต่อ/ทำงาน (CapCut, Premiere, etc.)');
log('   • ระบบ Work Guard: ตัดจบหากเปิดทิ้งไว้ไม่ขยับเกิน 15 นาที');
log('   • ป้องกันเผลอหลับ: ตัดจบอัตโนมัติเมื่อหยุดใช้ > 35 นาที');
log('===================================================');

tick();
setInterval(tick, CHECK_INTERVAL_MS);
