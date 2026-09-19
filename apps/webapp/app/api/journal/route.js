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
        date: entry.date,
        mood: entry.mood,
        discipline_score: entry.discipline_score,
        notes: entry.notes || '',
        reflection: entry.reflection || '',
      },
      rawMessage: `Trade Journal Auto-Sync: ${entry.date} [${entry.mood} - ⭐${entry.discipline_score}]`,
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

    query += ' ORDER BY date ASC';

    const entries = db.prepare(query).all(...params);

    // Build fast daily map for calendar: dailyMap['YYYY-MM-DD'] = entry
    const dailyMap = {};
    for (const e of entries) {
      dailyMap[e.date] = e;
    }

    // Compute monthly psychology statistics
    const totalDays = entries.length;
    let totalDiscipline = 0;
    let disciplinedDaysCount = 0;
    let fomoCount = 0;
    let revengeCount = 0;
    let fearCount = 0;
    let tiredCount = 0;

    for (const e of entries) {
      totalDiscipline += e.discipline_score || 0;
      const m = (e.mood || '').toUpperCase();
      if (m === 'CALM' || m === 'DISCIPLINED') {
        disciplinedDaysCount++;
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

    const avgDiscipline = totalDays > 0 ? Math.round((totalDiscipline / totalDays) * 10) / 10 : 0;
    const disciplinedPct = totalDays > 0 ? Math.round((disciplinedDaysCount / totalDays) * 100) : 0;
    const emotionalTriggersCount = fomoCount + revengeCount;

    return NextResponse.json({
      success: true,
      entries,
      dailyMap,
      stats: {
        totalDays,
        avgDiscipline,
        disciplinedDaysCount,
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

export async function POST(request) {
  try {
    const body = await request.json();
    const { date, mood, discipline_score, notes, reflection } = body;

    if (!date || !mood) {
      return NextResponse.json(
        { success: false, error: 'Date and Mood are required' },
        { status: 400 }
      );
    }

    const score = discipline_score !== undefined ? parseInt(discipline_score, 10) : 5;

    // Upsert into local SQLite
    db.prepare(`
      INSERT INTO trade_journal (date, mood, discipline_score, notes, reflection, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(date) DO UPDATE SET
        mood = excluded.mood,
        discipline_score = excluded.discipline_score,
        notes = excluded.notes,
        reflection = excluded.reflection,
        updated_at = CURRENT_TIMESTAMP
    `).run(date, mood, score, notes || '', reflection || '');

    // AUTO-SYNC TO GGD (Google Sheets / Drive Webhook) AUTOMATICALLY!
    const syncResult = await autoSyncToGgd({
      date,
      mood,
      discipline_score: score,
      notes,
      reflection,
    });

    if (syncResult.synced) {
      db.prepare('UPDATE trade_journal SET synced_to_ggd = 1 WHERE date = ?').run(date);
    }

    return NextResponse.json({
      success: true,
      autoSynced: syncResult.synced,
      message: syncResult.synced
        ? `บันทึกและซิงค์ GGD อัตโนมัติเรียบร้อย! (${date})`
        : `บันทึกในเครื่องสำเร็จ (รอซิงค์คลาวด์)`,
    });
  } catch (error) {
    console.error('Error in Trade Journal POST API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ success: false, error: 'Date is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM trade_journal WHERE date = ?').run(date);

    return NextResponse.json({ success: true, message: `ลบบันทึกวันที่ ${date} สำเร็จ` });
  } catch (error) {
    console.error('Error in Trade Journal DELETE API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
