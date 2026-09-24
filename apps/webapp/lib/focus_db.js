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

// Background Auto-Sync to Google Sheets
export async function syncFocusToGoogleSheets(checkinData) {
  const url = getWebhookUrl();
  if (!url) return { synced: false, reason: 'No webhook URL' };

  try {
    const payload = {
      action: 'sync_focus_heatmap',
      type: 'FOCUS_HEATMAP',
      checkin: checkinData,
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
    console.error('Auto-sync focus to GGS error:', err.message);
    return { synced: false, error: err.message };
  }
}

export function getAllFocusTasks() {
  return db
    .prepare(`
      SELECT * FROM focus_tasks 
      WHERE status != 'ARCHIVED' 
      ORDER BY is_active DESC, rank ASC, id ASC
    `)
    .all();
}

export function getActiveTop3Tasks() {
  return db
    .prepare(`
      SELECT * FROM focus_tasks 
      WHERE is_active = 1 AND status = 'ACTIVE' 
      ORDER BY rank ASC 
      LIMIT 3
    `)
    .all();
}

export function createFocusTask({ title, description, category, target_days, reminder_time }) {
  const stmt = db.prepare(`
    INSERT INTO focus_tasks (title, description, category, target_days, reminder_time, is_active, rank, status)
    VALUES (?, ?, ?, ?, ?, 0, 0, 'ACTIVE')
  `);
  const info = stmt.run(
    title,
    description || '',
    category || 'TRADING_DISCIPLINE',
    parseInt(target_days || 0, 10),
    reminder_time || '09:00'
  );
  return db.prepare('SELECT * FROM focus_tasks WHERE id = ?').get(info.lastInsertRowid);
}

export function updateFocusTask(id, fields) {
  const allowed = ['title', 'description', 'category', 'target_days', 'reminder_time', 'is_active', 'rank', 'status'];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }

  if (updates.length === 0) return null;

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  db.prepare(`UPDATE focus_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM focus_tasks WHERE id = ?').get(id);
}

export function setTop3Order(taskIds) {
  // taskIds is an array of up to 3 task IDs
  const updateTx = db.transaction(() => {
    db.prepare('UPDATE focus_tasks SET is_active = 0, rank = 0 WHERE is_active = 1').run();
    const setRankStmt = db.prepare('UPDATE focus_tasks SET is_active = 1, rank = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    taskIds.slice(0, 3).forEach((id, idx) => {
      setRankStmt.run(idx + 1, id);
    });
  });
  updateTx();
  return getActiveTop3Tasks();
}

export function deleteFocusTask(id) {
  const delTx = db.transaction(() => {
    db.prepare('DELETE FROM focus_logs WHERE task_id = ?').run(id);
    db.prepare('DELETE FROM focus_tasks WHERE id = ?').run(id);
  });
  delTx();
  return { success: true };
}

export function toggleFocusCheckIn(taskId, dateStr, status = 'COMPLETED', channel = 'WEB', note = '') {
  const task = db.prepare('SELECT * FROM focus_tasks WHERE id = ?').get(taskId);
  if (!task) throw new Error('Task not found');

  const existing = db.prepare('SELECT * FROM focus_logs WHERE task_id = ? AND date = ?').get(taskId, dateStr);

  if (existing) {
    // If clicking again on web, toggle off if it was COMPLETED
    if (channel === 'WEB' && status === 'TOGGLE') {
      db.prepare('DELETE FROM focus_logs WHERE id = ?').run(existing.id);
      return { action: 'REMOVED', taskId, date: dateStr };
    }
    // Otherwise update
    db.prepare('UPDATE focus_logs SET status = ?, channel = ?, note = ? WHERE id = ?').run(status, channel, note, existing.id);
    return { action: 'UPDATED', taskId, date: dateStr, status };
  } else {
    // Insert new check-in
    db.prepare(`
      INSERT INTO focus_logs (task_id, task_title, date, status, channel, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(taskId, task.title, dateStr, status, channel, note);
    return { action: 'CREATED', taskId, date: dateStr, status };
  }
}

export function getTodayCheckIns(dateStr) {
  const top3 = getActiveTop3Tasks();
  const logs = db.prepare('SELECT * FROM focus_logs WHERE date = ?').all(dateStr);
  const logMap = {};
  logs.forEach((l) => {
    logMap[l.task_id] = l;
  });

  return top3.map((t) => {
    const log = logMap[t.id];
    // Calculate total completed days for this task
    const totalDone = db.prepare("SELECT COUNT(DISTINCT date) as c FROM focus_logs WHERE task_id = ? AND status = 'COMPLETED'").get(t.id).c;
    return {
      ...t,
      is_done_today: !!(log && log.status === 'COMPLETED'),
      completed_at: log ? log.created_at : null,
      channel: log ? log.channel : null,
      total_completed_days: totalDone,
      progress_pct: t.target_days > 0 ? Math.min(100, Math.round((totalDone / t.target_days) * 100)) : 100,
    };
  });
}

export function getHeatmapData(daysCount = 120) {
  // Get distinct dates in range
  const logs = db.prepare(`
    SELECT date, task_id, task_title, status 
    FROM focus_logs 
    WHERE date >= date('now', '-' || ? || ' days', '+7 hours')
    ORDER BY date ASC
  `).all(daysCount);

  const dateMap = {};
  logs.forEach((log) => {
    if (!dateMap[log.date]) {
      dateMap[log.date] = { date: log.date, count: 0, tasks: [] };
    }
    if (log.status === 'COMPLETED') {
      dateMap[log.date].count += 1;
      dateMap[log.date].tasks.push(log.task_title);
    }
  });

  return dateMap;
}

export function getFocusStats(todayStr) {
  // Calculate streaks across active focus
  // A day counts towards streak if count >= 1 (or all 3)
  const logs = db.prepare(`
    SELECT date, COUNT(DISTINCT task_id) as count 
    FROM focus_logs 
    WHERE status = 'COMPLETED'
    GROUP BY date 
    ORDER BY date DESC
  `).all();

  const completedDates = new Set(logs.map((l) => l.date));

  // Current Streak
  let currentStreak = 0;
  let checkDate = new Date(todayStr);

  // If today isn't done yet, check if yesterday was done to preserve streak
  const checkDateStr = checkDate.toISOString().slice(0, 10);
  if (!completedDates.has(checkDateStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const dStr = checkDate.toISOString().slice(0, 10);
    if (completedDates.has(dStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Best Streak
  let bestStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  const sortedDates = Array.from(completedDates).sort();
  for (const dStr of sortedDates) {
    const curD = new Date(dStr);
    if (prevDate) {
      const diffDays = Math.round((curD - prevDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    } else {
      tempStreak = 1;
    }
    if (tempStreak > bestStreak) bestStreak = tempStreak;
    prevDate = curD;
  }

  const totalCompletions = db.prepare("SELECT COUNT(*) as c FROM focus_logs WHERE status = 'COMPLETED'").get().c;
  const totalDaysActive = completedDates.size;

  return {
    currentStreak,
    bestStreak,
    totalCompletions,
    totalDaysActive,
  };
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO system_settings (key, value, updated_at) 
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, String(value));
}
