import db from './db.js';

/**
 * Returns Bangkok date string YYYY-MM-DD
 */
export function getBangkokDate() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Fetch reflection record for a specific date (or defaults to today)
 */
export function getReflection(dateStr = null) {
  const targetDate = dateStr || getBangkokDate();
  const row = db.prepare('SELECT * FROM daily_reflections WHERE date = ?').get(targetDate);
  if (!row) {
    return {
      id: null,
      date: targetDate,
      luck_text: '',
      finish_text: '',
      next_day_text: '',
      is_completed: 0,
    };
  }
  return row;
}

/**
 * Upsert reflection record
 */
export function upsertReflection(dateStr, { luck_text, finish_text, next_day_text }) {
  const targetDate = dateStr || getBangkokDate();
  const existing = db.prepare('SELECT * FROM daily_reflections WHERE date = ?').get(targetDate);

  const finalLuck = luck_text !== undefined ? luck_text : (existing ? existing.luck_text : '');
  const finalFinish = finish_text !== undefined ? finish_text : (existing ? existing.finish_text : '');
  const finalNextDay = next_day_text !== undefined ? next_day_text : (existing ? existing.next_day_text : '');

  const hasContent = Boolean(
    (finalLuck && finalLuck.trim()) ||
    (finalFinish && finalFinish.trim()) ||
    (finalNextDay && finalNextDay.trim())
  );
  const isCompleted = hasContent ? 1 : 0;

  db.prepare(`
    INSERT INTO daily_reflections (date, luck_text, finish_text, next_day_text, is_completed, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(date) DO UPDATE SET
      luck_text = excluded.luck_text,
      finish_text = excluded.finish_text,
      next_day_text = excluded.next_day_text,
      is_completed = excluded.is_completed,
      updated_at = CURRENT_TIMESTAMP
  `).run(targetDate, finalLuck, finalFinish, finalNextDay, isCompleted);

  return getReflection(targetDate);
}

/**
 * Smart append or update for individual fields from Telegram
 */
export function appendReflectionField(dateStr, fieldKey, newText) {
  const targetDate = dateStr || getBangkokDate();
  const existing = getReflection(targetDate);
  const cleanText = (newText || '').trim();

  let updatedLuck = existing.luck_text || '';
  let updatedFinish = existing.finish_text || '';
  let updatedNextDay = existing.next_day_text || '';

  if (fieldKey === 'luck_text') {
    // For 1 daily luck item: replace or set directly
    updatedLuck = cleanText;
  } else if (fieldKey === 'finish_text') {
    if (updatedFinish) {
      updatedFinish = `${updatedFinish}\n• ${cleanText.replace(/^[•*-]\s*/, '')}`;
    } else {
      updatedFinish = cleanText.startsWith('•') ? cleanText : `• ${cleanText}`;
    }
  } else if (fieldKey === 'next_day_text') {
    if (updatedNextDay) {
      updatedNextDay = `${updatedNextDay}\n• ${cleanText.replace(/^[•*-]\s*/, '')}`;
    } else {
      updatedNextDay = cleanText.startsWith('•') ? cleanText : `• ${cleanText}`;
    }
  }

  return upsertReflection(targetDate, {
    luck_text: updatedLuck,
    finish_text: updatedFinish,
    next_day_text: updatedNextDay,
  });
}

/**
 * Get history records sorted by date DESC
 */
export function getAllReflections(limit = 60) {
  return db
    .prepare('SELECT * FROM daily_reflections ORDER BY date DESC LIMIT ?')
    .all(limit);
}

/**
 * Calculate reflection statistics & streaks
 */
export function getReflectionStats() {
  const all = db.prepare('SELECT date, luck_text, finish_text, next_day_text, is_completed FROM daily_reflections ORDER BY date DESC').all();
  const todayStr = getBangkokDate();

  let totalLuckCount = 0;
  let totalFinishCount = 0;

  all.forEach((r) => {
    if (r.luck_text && r.luck_text.trim()) totalLuckCount++;
    if (r.finish_text && r.finish_text.trim()) totalFinishCount++;
  });

  // Calculate Streak
  let currentStreak = 0;
  let checkDate = new Date();

  // If today is not completed yet, check if yesterday was completed
  const todayRow = all.find((r) => r.date === todayStr);
  let streakAnchor = todayStr;

  if (!todayRow || !todayRow.is_completed) {
    // Check yesterday
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yestStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(yest);
    const yestRow = all.find((r) => r.date === yestStr);
    if (yestRow && yestRow.is_completed) {
      streakAnchor = yestStr;
      checkDate = yest;
    } else {
      streakAnchor = null;
    }
  }

  if (streakAnchor) {
    for (let i = 0; i < 365; i++) {
      const d = new Date(checkDate);
      d.setDate(d.getDate() - i);
      const ds = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
      const row = all.find((r) => r.date === ds);
      if (row && row.is_completed) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return {
    todayStr,
    totalEntries: all.length,
    totalLuckCount,
    totalFinishCount,
    currentStreak,
    isTodayCompleted: todayRow ? Boolean(todayRow.is_completed) : false,
  };
}
