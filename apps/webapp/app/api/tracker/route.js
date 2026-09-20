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

// Background Auto-Sync to Google Sheets / GGD
async function autoSyncToGgd(trade) {
  const url = getWebhookUrl();
  if (!url) return { synced: false, reason: 'No webhook URL' };

  try {
    const payload = {
      action: 'sync_tracker',
      type: 'TRADE_TRACKER',
      trade: {
        id: trade.id,
        date: trade.date,
        time: trade.time || '',
        symbol: trade.symbol,
        direction: trade.direction,
        playbook_code: trade.playbook_code,
        playbook_title: trade.playbook_title || '',
        outcome: trade.outcome || 'RUNNING',
        notes: trade.notes || '',
        chart_url: trade.chart_url || '',
      },
      rawMessage: `Trade Tracker Auto-Sync: ${trade.symbol} (${trade.direction}) [${trade.playbook_code}] - ${trade.outcome}`,
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
    const playbook = searchParams.get('playbook'); // optional filter
    const outcome = searchParams.get('outcome'); // optional filter

    let query = 'SELECT * FROM trade_tracker';
    const conditions = [];
    const params = [];

    if (playbook && playbook !== 'ALL') {
      conditions.push('playbook_code = ?');
      params.push(playbook);
    }

    if (outcome && outcome !== 'ALL') {
      conditions.push('outcome = ?');
      params.push(outcome);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY date DESC, id DESC';

    const trades = db.prepare(query).all(...params);

    // Compute Overall Stats
    const allTrades = db.prepare('SELECT * FROM trade_tracker').all();
    const totalTrades = allTrades.length;
    const winCount = allTrades.filter((t) => t.outcome === 'WIN').length;
    const lossCount = allTrades.filter((t) => t.outcome === 'LOSS').length;
    const beCount = allTrades.filter((t) => t.outcome === 'BREAKEVEN' || t.outcome === 'BE').length;
    const runningCount = allTrades.filter((t) => t.outcome === 'RUNNING').length;
    const closedDecisive = winCount + lossCount;
    const winRate = closedDecisive > 0 ? Math.round((winCount / closedDecisive) * 100 * 10) / 10 : 0;

    // Compute Stats per Playbook Setup
    const setupMap = {};
    for (const t of allTrades) {
      const code = t.playbook_code || 'OTHER';
      if (!setupMap[code]) {
        setupMap[code] = {
          code,
          title: t.playbook_title || code,
          total: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
        };
      }
      setupMap[code].total++;
      if (t.outcome === 'WIN') setupMap[code].wins++;
      if (t.outcome === 'LOSS') setupMap[code].losses++;
    }

    const setupStats = Object.values(setupMap).map((s) => {
      const decisive = s.wins + s.losses;
      s.winRate = decisive > 0 ? Math.round((s.wins / decisive) * 100) : 0;
      return s;
    });

    // Best setup by winRate with at least 1 win
    const bestSetup = setupStats
      .filter((s) => s.wins > 0)
      .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)[0] || null;

    return NextResponse.json({
      success: true,
      trades,
      stats: {
        totalTrades,
        winCount,
        lossCount,
        beCount,
        runningCount,
        winRate,
        setupStats,
        bestSetup,
      },
    });
  } catch (error) {
    console.error('Error in Trade Tracker GET API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      date,
      time,
      symbol,
      direction,
      playbook_code,
      playbook_title,
      outcome,
      notes,
      chart_url,
    } = body;

    if (!symbol || !playbook_code) {
      return NextResponse.json(
        { success: false, error: 'Symbol and Playbook Setup are required' },
        { status: 400 }
      );
    }

    const tradeDate = date || new Date().toISOString().split('T')[0];
    const tradeTime = time || new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    const insert = db.prepare(`
      INSERT INTO trade_tracker (
        date, time, symbol, direction, playbook_code, playbook_title, outcome, notes, chart_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      tradeDate,
      tradeTime,
      symbol.toUpperCase().trim(),
      direction || 'LONG',
      playbook_code.toUpperCase().trim(),
      playbook_title || '',
      outcome || 'RUNNING',
      notes || '',
      chart_url || ''
    );

    const insertedId = result.lastInsertRowid;

    // Background Auto-Sync to GGD
    const syncResult = await autoSyncToGgd({
      id: insertedId,
      date: tradeDate,
      time: tradeTime,
      symbol: symbol.toUpperCase().trim(),
      direction: direction || 'LONG',
      playbook_code: playbook_code.toUpperCase().trim(),
      playbook_title,
      outcome: outcome || 'RUNNING',
      notes,
      chart_url,
    });

    if (syncResult.synced) {
      db.prepare('UPDATE trade_tracker SET synced_to_ggd = 1 WHERE id = ?').run(insertedId);
    }

    return NextResponse.json({
      success: true,
      id: insertedId,
      autoSynced: syncResult.synced,
      message: `บันทึกไม้เทรด ${symbol} (${direction}) สำเร็จ! ${syncResult.synced ? '☁️ ซิงค์ GGD เรียบร้อย' : ''}`,
    });
  } catch (error) {
    console.error('Error in Trade Tracker POST API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, outcome, notes, chart_url, symbol, direction, playbook_code, playbook_title } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Trade ID is required' }, { status: 400 });
    }

    db.prepare(`
      UPDATE trade_tracker
      SET
        outcome = COALESCE(?, outcome),
        notes = COALESCE(?, notes),
        chart_url = COALESCE(?, chart_url),
        symbol = COALESCE(?, symbol),
        direction = COALESCE(?, direction),
        playbook_code = COALESCE(?, playbook_code),
        playbook_title = COALESCE(?, playbook_title),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      outcome,
      notes,
      chart_url,
      symbol ? symbol.toUpperCase() : null,
      direction,
      playbook_code ? playbook_code.toUpperCase() : null,
      playbook_title,
      id
    );

    const updated = db.prepare('SELECT * FROM trade_tracker WHERE id = ?').get(id);

    // Background Auto-Sync to GGD
    if (updated) {
      autoSyncToGgd(updated).then((res) => {
        if (res.synced) {
          db.prepare('UPDATE trade_tracker SET synced_to_ggd = 1 WHERE id = ?').run(id);
        }
      });
    }

    return NextResponse.json({ success: true, message: 'อัปเดตไม้เทรดสำเร็จ' });
  } catch (error) {
    console.error('Error in Trade Tracker PUT API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Trade ID is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM trade_tracker WHERE id = ?').run(id);

    return NextResponse.json({ success: true, message: 'ลบไม้เทรดสำเร็จ' });
  } catch (error) {
    console.error('Error in Trade Tracker DELETE API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
