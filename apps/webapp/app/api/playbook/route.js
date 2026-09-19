import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    // 1. Fetch Master Strategy & Core Thesis
    let strategy = db.prepare('SELECT * FROM playbook_strategy WHERE id = 1').get();
    if (!strategy) {
      strategy = {
        id: 1,
        title: 'Skynet Unified Trading Plan & Thesis',
        core_thesis: 'เข้าเทรดเฉพาะเมื่อโครงสร้างตลาด High Timeframe ชัดเจน เกิดการดึงสภาพคล่อง (Liquidity Sweep) หรือย่อทดสอบจุดรับสำคัญ ไม่ไล่ราคา รอให้ตลาดวิ่งเข้าหาโซน และรักษา R:R ขั้นต่ำ 1:2 เสมอ',
        entry_rules: '1. HTF Trend & Market Structure ตรงทิศทาง\n2. เกิด Liquidity Grab หรือ Rejection ในโซนที่ได้เปรียบ\n3. มีสัญญาณแท่งเทียนกลับตัวหรือคอนเฟิร์มใน Lower Timeframe\n4. อัตราส่วน Risk:Reward ขั้นต่ำ 1:2 R ขึ้นไป',
        invalidation_rules: '1. ราคาปิดทะลุ Invalid Level (ระดับโครงสร้างเสีย)\n2. เกิดข่าวด่วนหรือ Event กระทบพื้นฐานอย่างมีนัยสำคัญที่ขัดแย้งกับ Thesis\n3. โครงสร้างเปลี่ยนเป็นฝั่งตรงข้ามก่อนถึงจุดเข้า',
        risk_rules: '• เสี่ยงไม่เกิน 1-2% ของพอร์ตต่อไม้เด็ดขาด\n• ห้าม Overtrade หรือ Revenge trade\n• เมื่อกำไรถึง 1.5R พิจารณาขยับ SL บังทุน (BE)',
      };
    }

    // 2. Fetch all Trade Executions
    const trades = db.prepare('SELECT * FROM playbook_trades ORDER BY date DESC, id DESC').all();

    // Parse checklist JSON if needed
    const parsedTrades = trades.map((t) => {
      let checklist = [];
      try {
        if (t.checklist) checklist = JSON.parse(t.checklist);
      } catch (e) {
        checklist = [];
      }
      return {
        ...t,
        checklist,
      };
    });

    // 3. Compute Aggregated Stats
    const totalTrades = trades.length;
    const activeCount = trades.filter((t) => t.status === 'ACTIVE').length;
    const watchlistCount = trades.filter((t) => t.status === 'WATCHLIST').length;
    const winCount = trades.filter((t) => t.status === 'WIN').length;
    const lossCount = trades.filter((t) => t.status === 'LOSS').length;
    const breakevenCount = trades.filter((t) => t.status === 'BREAKEVEN').length;
    const cancelledCount = trades.filter((t) => t.status === 'CANCELLED').length;
    const closedDecisive = winCount + lossCount;
    const winRate = closedDecisive > 0 ? Math.round((winCount / closedDecisive) * 100 * 10) / 10 : 0;

    const totalRealizedR = trades.reduce((sum, t) => sum + (t.realized_r || 0), 0);
    const roundedR = Math.round(totalRealizedR * 100) / 100;

    return NextResponse.json({
      success: true,
      strategy,
      trades: parsedTrades,
      stats: {
        totalTrades,
        activeCount,
        watchlistCount,
        winCount,
        lossCount,
        breakevenCount,
        cancelledCount,
        winRate,
        totalRealizedR: roundedR,
      },
    });
  } catch (error) {
    console.error('Error in Playbook GET API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Case A: Update Master Strategy
    if (body.action === 'update_strategy') {
      const { title, core_thesis, entry_rules, invalidation_rules, risk_rules } = body.strategy || {};
      db.prepare(`
        INSERT INTO playbook_strategy (id, title, core_thesis, entry_rules, invalidation_rules, risk_rules, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          core_thesis = excluded.core_thesis,
          entry_rules = excluded.entry_rules,
          invalidation_rules = excluded.invalidation_rules,
          risk_rules = excluded.risk_rules,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        title || 'Skynet Unified Trading Plan & Thesis',
        core_thesis || '',
        entry_rules || '',
        invalidation_rules || '',
        risk_rules || ''
      );
      return NextResponse.json({ success: true, message: 'Updated master strategy successfully' });
    }

    // Case B: Create new Playbook Trade Setup
    const {
      date,
      title,
      symbol,
      direction,
      status,
      entry_price,
      sl_price,
      tp_price,
      rr_ratio,
      risk_usd,
      thesis,
      checklist,
      chart_url,
      realized_r,
      realized_pnl,
      review_notes,
    } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    const tradeDate = date || new Date().toISOString().split('T')[0];
    const checklistJson = Array.isArray(checklist) ? JSON.stringify(checklist) : '[]';

    const insert = db.prepare(`
      INSERT INTO playbook_trades (
        date, title, symbol, direction, status,
        entry_price, sl_price, tp_price, rr_ratio, risk_usd,
        thesis, checklist, chart_url, realized_r, realized_pnl, review_notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      tradeDate,
      title,
      symbol || '',
      direction || 'LONG',
      status || 'WATCHLIST',
      entry_price ? parseFloat(entry_price) : null,
      sl_price ? parseFloat(sl_price) : null,
      tp_price ? parseFloat(tp_price) : null,
      rr_ratio ? parseFloat(rr_ratio) : null,
      risk_usd ? parseFloat(risk_usd) : null,
      thesis || '',
      checklistJson,
      chart_url || '',
      realized_r ? parseFloat(realized_r) : null,
      realized_pnl ? parseFloat(realized_pnl) : null,
      review_notes || ''
    );

    return NextResponse.json({
      success: true,
      id: result.lastInsertRowid,
      message: 'Trade setup created successfully',
    });
  } catch (error) {
    console.error('Error in Playbook POST API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Trade ID is required' }, { status: 400 });
    }

    const {
      date,
      title,
      symbol,
      direction,
      status,
      entry_price,
      sl_price,
      tp_price,
      rr_ratio,
      risk_usd,
      thesis,
      checklist,
      chart_url,
      realized_r,
      realized_pnl,
      review_notes,
    } = body;

    const checklistJson = Array.isArray(checklist) ? JSON.stringify(checklist) : typeof checklist === 'string' ? checklist : '[]';

    db.prepare(`
      UPDATE playbook_trades
      SET
        date = COALESCE(?, date),
        title = COALESCE(?, title),
        symbol = COALESCE(?, symbol),
        direction = COALESCE(?, direction),
        status = COALESCE(?, status),
        entry_price = ?,
        sl_price = ?,
        tp_price = ?,
        rr_ratio = ?,
        risk_usd = ?,
        thesis = COALESCE(?, thesis),
        checklist = ?,
        chart_url = COALESCE(?, chart_url),
        realized_r = ?,
        realized_pnl = ?,
        review_notes = COALESCE(?, review_notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      date,
      title,
      symbol,
      direction,
      status,
      entry_price !== undefined ? (entry_price ? parseFloat(entry_price) : null) : null,
      sl_price !== undefined ? (sl_price ? parseFloat(sl_price) : null) : null,
      tp_price !== undefined ? (tp_price ? parseFloat(tp_price) : null) : null,
      rr_ratio !== undefined ? (rr_ratio ? parseFloat(rr_ratio) : null) : null,
      risk_usd !== undefined ? (risk_usd ? parseFloat(risk_usd) : null) : null,
      thesis,
      checklistJson,
      chart_url,
      realized_r !== undefined ? (realized_r !== null && realized_r !== '' ? parseFloat(realized_r) : null) : null,
      realized_pnl !== undefined ? (realized_pnl !== null && realized_pnl !== '' ? parseFloat(realized_pnl) : null) : null,
      review_notes,
      id
    );

    return NextResponse.json({ success: true, message: 'Trade setup updated successfully' });
  } catch (error) {
    console.error('Error in Playbook PUT API:', error);
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

    db.prepare('DELETE FROM playbook_trades WHERE id = ?').run(id);

    return NextResponse.json({ success: true, message: 'Trade setup deleted successfully' });
  } catch (error) {
    console.error('Error in Playbook DELETE API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
