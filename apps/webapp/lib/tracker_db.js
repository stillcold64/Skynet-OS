import db from './db.js';
import fs from 'fs';
import path from 'path';

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

export function getBangkokDateStr(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);
  } catch (e) {
    return date.toISOString().slice(0, 10);
  }
}

// Background Auto-Sync to Google Sheets (Zero bot interruption, silent redundancy)
export async function syncTrackerToGoogleSheets(logData) {
  const url = getWebhookUrl();
  if (!url) return { synced: false, reason: 'No webhook URL' };

  try {
    const payload = {
      action: 'sync_daily_tracker',
      type: 'DAILY_TRACKER',
      trackerLog: logData,
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
    console.error('Auto-sync tracker log to GGS error:', err.message);
    return { synced: false, error: err.message };
  }
}

// Helper: timezone-safe date shift
export function shiftDays(dateStr, offsetDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

// 1. Get all activities
export function getActivities() {
  return db
    .prepare('SELECT * FROM daily_tracker_activities WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')
    .all();
}

// 2. Get currently active (ongoing) session
export function getActiveSession() {
  const session = db
    .prepare(`
      SELECT l.*, a.name as act_name, a.emoji, a.color 
      FROM daily_time_logs l
      LEFT JOIN daily_tracker_activities a ON l.activity_id = a.id
      WHERE l.end_time IS NULL
      ORDER BY l.id DESC
      LIMIT 1
    `)
    .get();

  if (!session) return null;

  const now = new Date();
  const start = new Date(session.start_time);
  const elapsedMs = Math.max(0, now.getTime() - start.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);

  return {
    ...session,
    elapsedMinutes,
    elapsedSeconds,
    elapsedFormatted: formatDuration(elapsedMinutes),
  };
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} นาที`;
  if (m === 0) return `${h} ชม.`;
  return `${h} ชม. ${m} นาที`;
}

// 3. Punch Activity (Auto punch-out previous active session and punch-in new)
export function punchActivity(activityId, note = '', customStartTime = null) {
  const now = new Date();
  const nowIso = customStartTime || now.toISOString();
  const dateStr = getBangkokDateStr(now);

  const targetActivity = db
    .prepare('SELECT * FROM daily_tracker_activities WHERE id = ?')
    .get(activityId);

  if (!targetActivity) {
    throw new Error('ไม่พบกิจกรรมที่ระบุ');
  }

  const activeSession = db
    .prepare('SELECT * FROM daily_time_logs WHERE end_time IS NULL ORDER BY id DESC LIMIT 1')
    .get();

  let closedSession = null;
  let newSession = null;
  let action = 'started';

  // Case 1: An active session already exists
  if (activeSession) {
    // If user clicked the SAME activity that is already active -> Stop it (Punch-out)
    if (activeSession.activity_id === Number(activityId)) {
      const endIso = nowIso;
      const startDt = new Date(activeSession.start_time);
      const endDt = new Date(endIso);
      const duration = Math.max(1, Math.round((endDt.getTime() - startDt.getTime()) / 60000));

      db.prepare(`
        UPDATE daily_time_logs 
        SET end_time = ?, duration_minutes = ?, note = COALESCE(NULLIF(?, ''), note), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(endIso, duration, note, activeSession.id);

      closedSession = db.prepare('SELECT * FROM daily_time_logs WHERE id = ?').get(activeSession.id);
      action = 'stopped';

      // Silent sync
      syncTrackerToGoogleSheets({
        action: 'STOP',
        id: closedSession.id,
        activityName: closedSession.activity_name,
        date: closedSession.date,
        startTime: closedSession.start_time,
        endTime: closedSession.end_time,
        durationMinutes: closedSession.duration_minutes,
        durationFormatted: formatDuration(closedSession.duration_minutes),
        note: closedSession.note,
      }).catch((e) => console.error('Silent GGS sync error:', e));

      return { action, closedSession, activeSession: null };
    }

    // If user clicked a DIFFERENT activity -> Auto-close previous session and start new!
    const endIso = nowIso;
    const startDt = new Date(activeSession.start_time);
    const endDt = new Date(endIso);
    const duration = Math.max(1, Math.round((endDt.getTime() - startDt.getTime()) / 60000));

    db.prepare(`
      UPDATE daily_time_logs 
      SET end_time = ?, duration_minutes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(endIso, duration, activeSession.id);

    closedSession = db.prepare('SELECT * FROM daily_time_logs WHERE id = ?').get(activeSession.id);
    action = 'switched';

    // Silent sync of closed session
    syncTrackerToGoogleSheets({
      action: 'SWITCH_CLOSED',
      id: closedSession.id,
      activityName: closedSession.activity_name,
      date: closedSession.date,
      startTime: closedSession.start_time,
      endTime: closedSession.end_time,
      durationMinutes: closedSession.duration_minutes,
      durationFormatted: formatDuration(closedSession.duration_minutes),
      note: closedSession.note,
    }).catch((e) => console.error('Silent GGS sync error:', e));
  }

  // Start new activity session
  const res = db.prepare(`
    INSERT INTO daily_time_logs (activity_id, activity_name, date, start_time, end_time, duration_minutes, note)
    VALUES (?, ?, ?, ?, NULL, 0, ?)
  `).run(targetActivity.id, targetActivity.name, dateStr, nowIso, note || null);

  newSession = db.prepare(`
    SELECT l.*, a.emoji, a.color 
    FROM daily_time_logs l
    LEFT JOIN daily_tracker_activities a ON l.activity_id = a.id
    WHERE l.id = ?
  `).get(res.lastInsertRowid);

  return {
    action,
    closedSession,
    newSession,
    activeSession: newSession,
  };
}

// 4. Explicitly stop current ongoing session
export function stopActiveSession(note = '', customEndTime = null) {
  const activeSession = db
    .prepare('SELECT * FROM daily_time_logs WHERE end_time IS NULL ORDER BY id DESC LIMIT 1')
    .get();

  if (!activeSession) {
    return { action: 'none', message: 'ไม่มีกิจกรรมที่กำลังบันทึกเวลาอยู่' };
  }

  const endIso = customEndTime || new Date().toISOString();
  const startDt = new Date(activeSession.start_time);
  const endDt = new Date(endIso);
  const duration = Math.max(1, Math.round((endDt.getTime() - startDt.getTime()) / 60000));

  db.prepare(`
    UPDATE daily_time_logs 
    SET end_time = ?, duration_minutes = ?, note = COALESCE(NULLIF(?, ''), note), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(endIso, duration, note, activeSession.id);

  const closedSession = db.prepare('SELECT * FROM daily_time_logs WHERE id = ?').get(activeSession.id);

  syncTrackerToGoogleSheets({
    action: 'MANUAL_STOP',
    id: closedSession.id,
    activityName: closedSession.activity_name,
    date: closedSession.date,
    startTime: closedSession.start_time,
    endTime: closedSession.end_time,
    durationMinutes: closedSession.duration_minutes,
    durationFormatted: formatDuration(closedSession.duration_minutes),
    note: closedSession.note,
  }).catch((e) => console.error('Silent GGS sync error:', e));

  return { action: 'stopped', closedSession };
}

// 5. Add manual log entry (for past hours or offline activities)
export function addManualLog({ activityId, date, startTime, endTime, durationMinutes, note }) {
  const activity = db.prepare('SELECT * FROM daily_tracker_activities WHERE id = ?').get(activityId);
  if (!activity) throw new Error('ไม่พบกิจกรรม');

  const dateStr = date || getBangkokDateStr();
  let duration = Number(durationMinutes) || 0;

  let startIso = startTime;
  let endIso = endTime;

  // If time string like '14:00' is passed, construct valid ISO string for that date
  if (startTime && startTime.length <= 5 && !startTime.includes('T')) {
    startIso = `${dateStr}T${startTime}:00+07:00`;
  }
  if (endTime && endTime.length <= 5 && !endTime.includes('T')) {
    endIso = `${dateStr}T${endTime}:00+07:00`;
  }

  if (startIso && endIso && (!duration || duration <= 0)) {
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();
    if (!isNaN(s) && !isNaN(e) && e > s) {
      duration = Math.round((e - s) / 60000);
    }
  }

  if (duration <= 0) duration = 15; // default fallback

  const res = db.prepare(`
    INSERT INTO daily_time_logs (activity_id, activity_name, date, start_time, end_time, duration_minutes, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(activity.id, activity.name, dateStr, startIso || new Date().toISOString(), endIso || new Date().toISOString(), duration, note || null);

  const newLog = db.prepare('SELECT * FROM daily_time_logs WHERE id = ?').get(res.lastInsertRowid);

  syncTrackerToGoogleSheets({
    action: 'MANUAL_ADD',
    id: newLog.id,
    activityName: newLog.activity_name,
    date: newLog.date,
    startTime: newLog.start_time,
    endTime: newLog.end_time,
    durationMinutes: newLog.duration_minutes,
    durationFormatted: formatDuration(newLog.duration_minutes),
    note: newLog.note,
  }).catch((e) => console.error('Silent GGS sync error:', e));

  return newLog;
}

// 6. Update log
export function updateLog(id, fields = {}) {
  const current = db.prepare('SELECT * FROM daily_time_logs WHERE id = ?').get(id);
  if (!current) throw new Error('ไม่พบข้อมูลบันทึก');

  const updates = [];
  const values = [];

  if (fields.activity_id !== undefined) {
    const act = db.prepare('SELECT * FROM daily_tracker_activities WHERE id = ?').get(fields.activity_id);
    if (act) {
      updates.push('activity_id = ?', 'activity_name = ?');
      values.push(act.id, act.name);
    }
  }

  if (fields.date !== undefined) {
    updates.push('date = ?');
    values.push(fields.date);
  }

  if (fields.start_time !== undefined) {
    updates.push('start_time = ?');
    values.push(fields.start_time);
  }

  if (fields.end_time !== undefined) {
    updates.push('end_time = ?');
    values.push(fields.end_time);
  }

  if (fields.duration_minutes !== undefined) {
    updates.push('duration_minutes = ?');
    values.push(Number(fields.duration_minutes));
  }

  if (fields.note !== undefined) {
    updates.push('note = ?');
    values.push(fields.note);
  }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE daily_time_logs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  return db.prepare('SELECT * FROM daily_time_logs WHERE id = ?').get(id);
}

// 7. Delete log
export function deleteLog(id) {
  return db.prepare('DELETE FROM daily_time_logs WHERE id = ?').run(id);
}

// 8. Get Today's logs and timeline distribution
export function getTodayLogs(dateStr = getBangkokDateStr()) {
  const logs = db
    .prepare(`
      SELECT l.*, a.emoji, a.color 
      FROM daily_time_logs l
      LEFT JOIN daily_tracker_activities a ON l.activity_id = a.id
      WHERE l.date = ?
      ORDER BY l.start_time ASC, l.id ASC
    `)
    .all(dateStr);

  const active = getActiveSession();

  let totalCompletedMinutes = 0;
  const activityMap = {};

  for (const log of logs) {
    let dur = log.duration_minutes || 0;
    // If this is currently active session, calculate its live elapsed
    if (!log.end_time && active && active.id === log.id) {
      dur = active.elapsedMinutes;
    }

    totalCompletedMinutes += dur;

    if (!activityMap[log.activity_id]) {
      activityMap[log.activity_id] = {
        activity_id: log.activity_id,
        name: log.activity_name,
        emoji: log.emoji || '⚡',
        color: log.color || '#64d2ff',
        totalMinutes: 0,
        sessionCount: 0,
      };
    }
    activityMap[log.activity_id].totalMinutes += dur;
    activityMap[log.activity_id].sessionCount += 1;
  }

  const breakdown = Object.values(activityMap).map((act) => ({
    ...act,
    hours: (act.totalMinutes / 60).toFixed(1),
    formatted: formatDuration(act.totalMinutes),
    percentage: totalCompletedMinutes > 0 ? Math.round((act.totalMinutes / totalCompletedMinutes) * 100) : 0,
  }));

  // Sort breakdown by highest minutes
  breakdown.sort((a, b) => b.totalMinutes - a.totalMinutes);

  return {
    dateStr,
    totalMinutesToday: totalCompletedMinutes,
    totalFormatted: formatDuration(totalCompletedMinutes),
    logs,
    breakdown,
  };
}

// 9. Get Category Heatmaps (The main feature requested)
// Returns 60 days of activity data per category
export function getActivityHeatmaps(numDays = 60, referenceDate = null) {
  const todayStr = referenceDate || getBangkokDateStr();
  const startDateStr = shiftDays(todayStr, -(numDays - 1));

  const activities = getActivities();

  // Query aggregated duration per activity per date
  const rows = db
    .prepare(`
      SELECT activity_id, date, SUM(duration_minutes) as total_minutes, COUNT(*) as session_count
      FROM daily_time_logs
      WHERE date >= ? AND date <= ? AND end_time IS NOT NULL
      GROUP BY activity_id, date
    `)
    .all(startDateStr, todayStr);

  // Group by activity_id -> date -> { minutes, count }
  const dataLookup = {};
  for (const r of rows) {
    if (!dataLookup[r.activity_id]) dataLookup[r.activity_id] = {};
    dataLookup[r.activity_id][r.date] = {
      minutes: Number(r.total_minutes) || 0,
      count: Number(r.session_count) || 0,
    };
  }

  // Include active session live minutes if running today
  const activeSession = getActiveSession();
  if (activeSession && activeSession.date === todayStr) {
    if (!dataLookup[activeSession.activity_id]) dataLookup[activeSession.activity_id] = {};
    const existing = dataLookup[activeSession.activity_id][todayStr] || { minutes: 0, count: 0 };
    existing.minutes += activeSession.elapsedMinutes;
    existing.count += 1;
    dataLookup[activeSession.activity_id][todayStr] = existing;
  }

  // Prepare standard date list for past numDays
  const dateList = [];
  const thaiDays = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const engDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = numDays - 1; i >= 0; i--) {
    const dStr = shiftDays(todayStr, -i);
    const [y, m, d] = dStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dt.getUTCDay();
    dateList.push({
      date: dStr,
      dayOfWeek,
      thaiDay: thaiDays[dayOfWeek],
      engDay: engDays[dayOfWeek],
      isToday: dStr === todayStr,
    });
  }

  const heatmaps = activities.map((act) => {
    const actLookup = dataLookup[act.id] || {};
    let totalMinutesAllTime = 0;
    let sevenDayMinutes = 0;
    let thirtyDayMinutes = 0;
    let todayMinutes = 0;
    let maxDailyMinutes = 0;

    const days = dateList.map((dItem, index) => {
      const entry = actLookup[dItem.date] || { minutes: 0, count: 0 };
      const minutes = entry.minutes;
      const hours = (minutes / 60).toFixed(1);

      totalMinutesAllTime += minutes;
      if (minutes > maxDailyMinutes) maxDailyMinutes = minutes;
      if (dItem.isToday) todayMinutes = minutes;
      if (index >= numDays - 7) sevenDayMinutes += minutes;
      if (index >= numDays - 30) thirtyDayMinutes += minutes;

      // Intensity level 0 - 4
      // 0: 0m
      // 1: 1 - 59m (<1h)
      // 2: 60 - 179m (1-3h)
      // 3: 180 - 299m (3-5h)
      // 4: 300m+ (5h+)
      let intensity = 0;
      if (minutes > 0 && minutes < 60) intensity = 1;
      else if (minutes >= 60 && minutes < 180) intensity = 2;
      else if (minutes >= 180 && minutes < 300) intensity = 3;
      else if (minutes >= 300) intensity = 4;

      return {
        ...dItem,
        minutes,
        hours: Number(hours),
        count: entry.count,
        intensity,
        formatted: formatDuration(minutes),
      };
    });

    // Calculate streak (consecutive days with > 0 minutes)
    let streak = 0;
    let checkDate = todayStr;
    const hasToday = (actLookup[checkDate]?.minutes || 0) > 0;

    if (!hasToday) {
      checkDate = shiftDays(checkDate, -1);
    }

    while ((actLookup[checkDate]?.minutes || 0) > 0) {
      streak++;
      checkDate = shiftDays(checkDate, -1);
    }

    return {
      activity: act,
      days,
      stats: {
        todayMinutes,
        todayFormatted: formatDuration(todayMinutes),
        sevenDayMinutes,
        sevenDayFormatted: formatDuration(sevenDayMinutes),
        sevenDayAvgHours: (sevenDayMinutes / 7 / 60).toFixed(1),
        thirtyDayMinutes,
        thirtyDayFormatted: formatDuration(thirtyDayMinutes),
        thirtyDayAvgHours: (thirtyDayMinutes / 30 / 60).toFixed(1),
        totalMinutesAllTime,
        maxDailyMinutes,
        streak,
      },
    };
  });

  return {
    numDays,
    todayStr,
    startDateStr,
    heatmaps,
  };
}

// 10. Activity CRUD
export function createActivity({ name, emoji = '⚡', color = '#64d2ff', description = '' }) {
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM daily_tracker_activities').get().m || 0;
  const res = db.prepare(`
    INSERT INTO daily_tracker_activities (name, emoji, color, description, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), emoji || '⚡', color || '#64d2ff', description?.trim() || null, maxOrder + 1);

  return db.prepare('SELECT * FROM daily_tracker_activities WHERE id = ?').get(res.lastInsertRowid);
}

export function updateActivity(id, fields = {}) {
  const updates = [];
  const values = [];

  if (fields.name !== undefined) {
    updates.push('name = ?');
    values.push(fields.name.trim());
  }
  if (fields.emoji !== undefined) {
    updates.push('emoji = ?');
    values.push(fields.emoji);
  }
  if (fields.color !== undefined) {
    updates.push('color = ?');
    values.push(fields.color);
  }
  if (fields.description !== undefined) {
    updates.push('description = ?');
    values.push(fields.description.trim());
  }
  if (fields.sort_order !== undefined) {
    updates.push('sort_order = ?');
    values.push(Number(fields.sort_order));
  }
  if (fields.is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(fields.is_active ? 1 : 0);
  }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE daily_tracker_activities SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  return db.prepare('SELECT * FROM daily_tracker_activities WHERE id = ?').get(id);
}

export function deleteActivity(id) {
  // Soft delete so past logs maintain reference
  return db.prepare('UPDATE daily_tracker_activities SET is_active = 0 WHERE id = ?').run(id);
}
