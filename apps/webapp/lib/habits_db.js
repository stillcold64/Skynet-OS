import db from './db.js';
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

// Background Auto-Sync to Google Sheets (Zero Telegram Bot, silent redundancy)
export async function syncHabitToGoogleSheets(habitLogData) {
  const url = getWebhookUrl();
  if (!url) return { synced: false, reason: 'No webhook URL' };

  try {
    const payload = {
      action: 'sync_micro_habits',
      type: 'MICRO_HABITS',
      habitLog: habitLogData,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });

    return { synced: res.ok, status: res.status };
  } catch (err) {
    console.error('Auto-sync micro habit to GGS error:', err.message);
    return { synced: false, error: err.message };
  }
}

// Calculate streak for a single habit ending at referenceDate
export function calculateHabitStreak(habitId, referenceDate) {
  const logs = db
    .prepare(`
      SELECT date FROM micro_habit_logs 
      WHERE habit_id = ? AND status = 'COMPLETED' AND date <= ?
      ORDER BY date DESC
    `)
    .all(habitId, referenceDate);

  if (logs.length === 0) return 0;

  const datesSet = new Set(logs.map((l) => l.date));
  let streak = 0;
  const cur = new Date(referenceDate);

  // Check if today is completed; if not, check from yesterday
  const refStr = cur.toISOString().slice(0, 10);
  if (!datesSet.has(refStr)) {
    cur.setDate(cur.getDate() - 1);
  }

  while (true) {
    const dStr = cur.toISOString().slice(0, 10);
    if (datesSet.has(dStr)) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

// Get recent 7 days history array for a habit
export function getHabitRecentDays(habitId, referenceDate, numDays = 7) {
  const days = [];
  const cur = new Date(referenceDate);
  cur.setDate(cur.getDate() - (numDays - 1));

  const startStr = cur.toISOString().slice(0, 10);
  const logs = db
    .prepare(`
      SELECT date FROM micro_habit_logs 
      WHERE habit_id = ? AND status = 'COMPLETED' AND date >= ? AND date <= ?
    `)
    .all(habitId, startStr, referenceDate);

  const completedSet = new Set(logs.map((l) => l.date));

  for (let i = 0; i < numDays; i++) {
    const dStr = cur.toISOString().slice(0, 10);
    days.push({
      date: dStr,
      dayName: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][cur.getDay()],
      isDone: completedSet.has(dStr),
      isToday: dStr === referenceDate,
    });
    cur.setDate(cur.getDate() + 1);
  }

  return days;
}

// Get all active micro habits with today's status & streaks
export function getHabitsWithStatus(dateStr) {
  const habits = db
    .prepare(`
      SELECT * FROM micro_habits 
      WHERE is_active = 1 
      ORDER BY sort_order ASC, id ASC
    `)
    .all();

  const todayLogs = db
    .prepare(`
      SELECT habit_id, status, note, created_at 
      FROM micro_habit_logs 
      WHERE date = ? AND status = 'COMPLETED'
    `)
    .all(dateStr);

  const doneMap = new Map();
  todayLogs.forEach((l) => doneMap.set(l.habit_id, l));

  return habits.map((h) => {
    const isDone = doneMap.has(h.id);
    const streak = calculateHabitStreak(h.id, dateStr);
    const recentDays = getHabitRecentDays(h.id, dateStr, 7);

    // Total lifetime completions
    const totalCount = db
      .prepare(`SELECT COUNT(*) as count FROM micro_habit_logs WHERE habit_id = ? AND status = 'COMPLETED'`)
      .get(h.id).count;

    return {
      ...h,
      is_done_today: isDone,
      today_log: doneMap.get(h.id) || null,
      current_streak: streak,
      recent_days: recentDays,
      total_completions: totalCount,
    };
  });
}

// Toggle habit completion for a specific date
export function toggleHabitLog(habitId, dateStr, note = '') {
  const existing = db
    .prepare(`SELECT * FROM micro_habit_logs WHERE habit_id = ? AND date = ?`)
    .get(habitId, dateStr);

  let newStatus = 'COMPLETED';

  if (existing) {
    if (existing.status === 'COMPLETED') {
      // Toggle off -> remove log
      db.prepare(`DELETE FROM micro_habit_logs WHERE habit_id = ? AND date = ?`).run(habitId, dateStr);
      newStatus = 'UNCHECKED';
    } else {
      db.prepare(`UPDATE micro_habit_logs SET status = 'COMPLETED', note = ? WHERE habit_id = ? AND date = ?`).run(
        note,
        habitId,
        dateStr
      );
      newStatus = 'COMPLETED';
    }
  } else {
    db.prepare(`
      INSERT INTO micro_habit_logs (habit_id, date, status, note)
      VALUES (?, ?, 'COMPLETED', ?)
    `).run(habitId, dateStr, note);
    newStatus = 'COMPLETED';
  }

  const habit = db.prepare(`SELECT * FROM micro_habits WHERE id = ?`).get(habitId);
  const streak = calculateHabitStreak(habitId, dateStr);

  return {
    success: true,
    habitId,
    status: newStatus,
    streak,
    habit,
    date: dateStr,
  };
}

// Check in all habits at once
export function checkInAllHabits(dateStr) {
  const activeHabits = db.prepare(`SELECT id, title FROM micro_habits WHERE is_active = 1`).all();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO micro_habit_logs (habit_id, date, status, note)
    VALUES (?, ?, 'COMPLETED', 'ติ๊กครบทั้งหมด')
  `);

  const runAll = db.transaction(() => {
    for (const h of activeHabits) {
      insert.run(h.id, dateStr);
    }
  });

  runAll();
  return { success: true, count: activeHabits.length };
}

// Create new habit
export function createMicroHabit({ title, description = '', category = 'ROUTINE', icon = '⚡', time_of_day = 'ANYTIME', target_days_per_week = 7 }) {
  const maxOrder = db.prepare(`SELECT MAX(sort_order) as m FROM micro_habits`).get().m || 0;
  const res = db
    .prepare(`
      INSERT INTO micro_habits (title, description, category, icon, time_of_day, target_days_per_week, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(title, description, category, icon, time_of_day, target_days_per_week, maxOrder + 1);

  return db.prepare(`SELECT * FROM micro_habits WHERE id = ?`).get(res.lastInsertRowid);
}

// Update habit
export function updateMicroHabit(id, fields) {
  const habit = db.prepare(`SELECT * FROM micro_habits WHERE id = ?`).get(id);
  if (!habit) return null;

  const allowed = ['title', 'description', 'category', 'icon', 'time_of_day', 'target_days_per_week', 'is_active', 'sort_order'];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }

  if (updates.length > 0) {
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    db.prepare(`UPDATE micro_habits SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  return db.prepare(`SELECT * FROM micro_habits WHERE id = ?`).get(id);
}

// Delete habit
export function deleteMicroHabit(id) {
  db.prepare(`DELETE FROM micro_habit_logs WHERE habit_id = ?`).run(id);
  db.prepare(`DELETE FROM micro_habits WHERE id = ?`).run(id);
  return { success: true };
}

// Overall momentum stats
export function getHabitMomentumStats(dateStr) {
  const activeHabits = db.prepare(`SELECT id FROM micro_habits WHERE is_active = 1`).all();
  const total = activeHabits.length;

  const completedToday = db
    .prepare(`
      SELECT COUNT(*) as count 
      FROM micro_habit_logs l
      JOIN micro_habits h ON l.habit_id = h.id
      WHERE l.date = ? AND l.status = 'COMPLETED' AND h.is_active = 1
    `)
    .get(dateStr).count;

  const totalLogs = db.prepare(`SELECT COUNT(*) as count FROM micro_habit_logs WHERE status = 'COMPLETED'`).get().count;

  const distinctDays = db
    .prepare(`SELECT COUNT(DISTINCT date) as count FROM micro_habit_logs WHERE status = 'COMPLETED'`)
    .get().count;

  return {
    totalHabits: total,
    completedToday,
    percentage: total > 0 ? Math.round((completedToday / total) * 100) : 0,
    totalCompletions: totalLogs,
    activeDays: distinctDays,
  };
}
