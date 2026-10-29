import { execFile, exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../lib/db.js';
import {
  getActiveSession,
  punchActivity,
  stopActiveSession,
  getBangkokDateStr,
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

const IDLE_THRESHOLD_MS = 40 * 60 * 1000; // 40 minutes idle = away/asleep
const CHECK_INTERVAL_MS = 15000; // Check every 15s

function log(msg) {
  const time = new Date().toLocaleTimeString('th-TH', { hour12: false });
  console.log(`[${time}] [AutoTracker] ${msg}`);
}

// 1. Get Running Game using fast tasklist and path check
function checkRunningGame() {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);

      const lines = stdout.split('\n');
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length > 0) {
          const exe = parts[0].replace(/"/g, '').trim().toLowerCase();
          if (KNOWN_GAMES.has(exe)) {
            return resolve(exe);
          }
        }
      }

      // Check if any process has 'steamapps\\common' in path via quick powershell if needed
      resolve(null);
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

    const [gameExe, idleMs] = await Promise.all([checkRunningGame(), checkIdleMs()]);
    const active = getActiveSession();

    // CASE 1: Game is running
    if (gameExe) {
      // If no active session or not playing games
      if (!active || active.activity_id !== 2) {
        log(`🎮 ตรวจพบเกมเปิดอยู่: ${gameExe} -> เริ่มบันทึก "เล่นเกม" อัตโนมัติ`);
        punchActivity(2, `Auto-detected: ${gameExe}`);
      }
      isRunning = false;
      return;
    }

    // CASE 2: Game is NOT running, but was auto-started
    if (!gameExe && active && active.activity_id === 2 && (active.note || '').includes('Auto-detected')) {
      log(`⏹️ เกมปิดแล้ว -> สิ้นสุดการบันทึก "เล่นเกม" อัตโนมัติ`);
      stopActiveSession('Auto-stopped: Game closed');
      isRunning = false;
      return;
    }

    // CASE 3: User is Idle / Fell Asleep (> 40 minutes of zero mouse/keyboard input)
    if (idleMs >= IDLE_THRESHOLD_MS) {
      if (active && active.activity_id !== 5) {
        // Cut off at the exact time the user stopped using the computer
        const cutoffTime = new Date(Date.now() - idleMs).toISOString();
        const mins = Math.floor(idleMs / 60000);
        log(`😴 ตรวจพบไม่ได้ใช้งานหน้าจอนาน ${mins} นาที (เผลอหลับ/ลุกไปข้างนอก) -> ตัดจบกิจกรรม ${active.activity_name} ณ เวลาที่หยุดใช้งาน`);
        stopActiveSession('Auto-stopped: User inactive (fell asleep/away)', cutoffTime);

        // Auto-start Sleep activity from cutoff time
        log(`🌙 เริ่มบันทึก "พักผ่อน / นอนหลับ" ย้อนหลังตั้งแต่เวลาที่หยุดใช้งาน`);
        punchActivity(5, 'Auto-detected sleep: Inactivity', cutoffTime);
      }
      isRunning = false;
      return;
    }

    // CASE 4: User was sleeping via Auto-detect, and just returned / touched mouse
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
log('   ⚡ Skynet OS - Auto-Activity & Sleep Watcher');
log('   • ตรวจจับเกมอัตโนมัติ (Dota 2, CS2, Steam, etc.)');
log('   • ป้องกันเผลอหลับ (ตัดจบอัตโนมัติเมื่อหยุดใช้ > 40 นาที)');
log('===================================================');

// Run first check immediately, then on interval
tick();
setInterval(tick, CHECK_INTERVAL_MS);
