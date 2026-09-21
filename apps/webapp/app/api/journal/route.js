import { NextResponse } from 'next/server';
import db from '@/lib/db';
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

// Auto-Sync helper: pushes single journal entry to Google Sheets / GGD immediately
async function autoSyncToGgd(entry) {
  const url = getWebhookUrl();
  if (!url) return { synced: false, reason: 'No webhook URL' };

  try {
    const payload = {
      action: 'sync_journal',
      type: 'TRADE_JOURNAL',
      entry: {
        id: entry.id,
        date: entry.date,
        time: entry.time || '',
        session: entry.session || '',
        mood: entry.mood,
        discipline_score: entry.discipline_score,
        notes: entry.notes || '',
        reflection: entry.reflection || '',
      },
      rawMessage: `Trade Journal Auto-Sync: ${entry.date} ${entry.time ? `[${entry.time}] ` : ''}[${entry.mood} - ⭐${entry.discipline_score}]`,
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
    console.error('Background Auto-sync to GGD failed:', err.message);
    return { synced: false, error: err.message };
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // e.g. '2026-09'

    let query = 'SELECT * FROM trade_journal';
    const params = [];

    if (month) {
      query += ' WHERE date LIKE ?';
      params.push(`${month}%`);
    }

    query += ' ORDER BY date ASC, time ASC, id ASC';

    const entries = db.prepare(query).all(...params);

    // Group entries into array per day: dailyMap['YYYY-MM-DD'] = [entry1, entry2, ...]
    const dailyMap = {};
    for (const e of entries) {
      if (!dailyMap[e.date]) {
        dailyMap[e.date] = [];
      }
      dailyMap[e.date].push(e);
    }

    // Compute psychology statistics
    const totalEntries = entries.length;
    const uniqueDays = Object.keys(dailyMap).length;
    let totalDiscipline = 0;
    let disciplinedCount = 0;
    let fomoCount = 0;
    let revengeCount = 0;
    let fearCount = 0;
    let tiredCount = 0;

    for (const e of entries) {
      totalDiscipline += e.discipline_score || 0;
      const m = (e.mood || '').toUpperCase();
      if (m === 'CALM' || m === 'DISCIPLINED') {
        disciplinedCount++;
      } else if (m === 'FOMO') {
        fomoCount++;
      } else if (m === 'REVENGE') {
        revengeCount++;
      } else if (m === 'FEAR') {
        fearCount++;
      } else if (m === 'TIRED') {
        tiredCount++;
      }
    }

    const avgDiscipline = totalEntries > 0 ? Math.round((totalDiscipline / totalEntries) * 10) / 10 : 0;
    const disciplinedPct = totalEntries > 0 ? Math.round((disciplinedCount / totalEntries) * 100) : 0;
    const emotionalTriggersCount = fomoCount + revengeCount;

    return NextResponse.json({
      success: true,
      entries,
      dailyMap,
      stats: {
        totalEntries,
        uniqueDays,
        avgDiscipline,
        disciplinedCount,
        disciplinedPct,
        emotionalTriggersCount,
        fomoCount,
        revengeCount,
        fearCount,
        tiredCount,
      },
    });
  } catch (error) {
    console.error('Error in Trade Journal GET API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function getAiDisciplineScore(mood) {
  switch ((mood || '').toUpperCase()) {
    case 'DISCIPLINED':
    case 'CALM':
      return 5;
    case 'FOMO':
    case 'FEAR':
    case 'TIRED':
      return 2;
    case 'REVENGE':
      return 1;
    default:
      return 5;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { date, time, session, mood, discipline_score, notes, reflection } = body;

    if (!date || !mood) {
      return NextResponse.json(
        { success: false, error: 'Date and Mood are required' },
        { status: 400 }
      );
    }

    const score = discipline_score !== undefined ? parseInt(discipline_score, 10) : getAiDisciplineScore(mood);
    const entryTime = time || new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const entrySession = session || '';

    const insertStmt = db.prepare(`
      INSERT INTO trade_journal (date, time, session, mood, discipline_score, notes, reflection, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const info = insertStmt.run(date, entryTime, entrySession, mood, score, notes || '', reflection || '');
    const newId = info.lastInsertRowid;

    // AUTO-SYNC TO GGD (Google Sheets / Drive Webhook)
    const syncResult = await autoSyncToGgd({
      id: newId,
      date,
      time: entryTime,
      session: entrySession,
      mood,
      discipline_score: score,
      notes,
      reflection,
    });

    if (syncResult.synced) {
      db.prepare('UPDATE trade_journal SET synced_to_ggd = 1 WHERE id = ?').run(newId);
    }

    return NextResponse.json({
      success: true,
      id: newId,
      autoSynced: syncResult.synced,
      message: syncResult.synced
        ? `บันทึกอารมณ์และซิงค์ GGD เรียบร้อย! (${date} ${entryTime})`
        : `บันทึกในเครื่องสำเร็จ (${date} ${entryTime})`,
    });
  } catch (error) {
    console.error('Error in Trade Journal POST API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, date, time, session, mood, discipline_score, notes, reflection } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Entry ID is required' }, { status: 400 });
    }

    const score = discipline_score !== undefined ? parseInt(discipline_score, 10) : getAiDisciplineScore(mood);
    const entrySession = session || '';

    db.prepare(`
      UPDATE trade_journal
      SET date = COALESCE(?, date),
          time = COALESCE(?, time),
          session = COALESCE(?, session),
          mood = COALESCE(?, mood),
          discipline_score = ?,
          notes = ?,
          reflection = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(date, time, entrySession, mood, score, notes || '', reflection || '', id);

    const updated = db.prepare('SELECT * FROM trade_journal WHERE id = ?').get(id);

    if (updated) {
      autoSyncToGgd(updated).then((syncResult) => {
        if (syncResult.synced) {
          db.prepare('UPDATE trade_journal SET synced_to_ggd = 1 WHERE id = ?').run(id);
        }
      }).catch((e) => console.error('PUT background sync error:', e));
    }

    return NextResponse.json({
      success: true,
      message: `อัปเดตบันทึกอารมณ์ #${id} สำเร็จ`,
      entry: updated,
    });
  } catch (error) {
    console.error('Error in Trade Journal PUT API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const date = searchParams.get('date');

    if (id) {
      db.prepare('DELETE FROM trade_journal WHERE id = ?').run(id);
      return NextResponse.json({ success: true, message: `ลบบันทึกไม้ #${id} สำเร็จ` });
    } else if (date) {
      db.prepare('DELETE FROM trade_journal WHERE date = ?').run(date);
      return NextResponse.json({ success: true, message: `ลบบันทึกวันที่ ${date} สำเร็จ` });
    } else {
      return NextResponse.json({ success: false, error: 'ID or Date is required' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in Trade Journal DELETE API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
