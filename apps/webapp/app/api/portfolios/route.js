import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const pillars = db.prepare('SELECT * FROM portfolio_pillars ORDER BY sort_order ASC, id ASC').all();
    const items = db.prepare('SELECT * FROM portfolio_items ORDER BY sort_order ASC, id ASC').all();
    
    // Default principle from CASH pillar note or standard Ray Dalio rule
    const cashPillar = pillars.find((p) => p.pillar_code === 'CASH');
    const principle = cashPillar?.note || 'Ray Dalio Principle: "แยกพอร์ตให้ขาด อารมณ์จะไม่กวนเงินสด"';

    return NextResponse.json({ pillars, items, principle });
  } catch (err) {
    console.error('Error fetching portfolio structure:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { pillars = [], items = [], principle } = body;

    const updateTx = db.transaction(() => {
      // 1. Update Pillars
      const updatePillar = db.prepare(`
        UPDATE portfolio_pillars 
        SET title = ?, badge = ?, emoji = ?, color = ?, note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE pillar_code = ?
      `);

      for (const p of pillars) {
        const pillarNote = (p.pillar_code === 'CASH' && principle !== undefined) ? principle : (p.note || null);
        updatePillar.run(
          p.title || '',
          p.badge || '',
          p.emoji || '📊',
          p.color || '#00f2fe',
          pillarNote,
          p.pillar_code
        );
      }

      // 2. Sync Items
      const existingItems = db.prepare('SELECT id FROM portfolio_items').all().map((r) => r.id);
      const incomingIds = items.filter((it) => it.id && typeof it.id === 'number').map((it) => it.id);

      // Delete removed items
      const idsToDelete = existingItems.filter((id) => !incomingIds.includes(id));
      if (idsToDelete.length > 0) {
        const deleteStmt = db.prepare(`DELETE FROM portfolio_items WHERE id = ?`);
        for (const delId of idsToDelete) {
          deleteStmt.run(delId);
        }
      }

      // Insert or Update items
      const updateItemStmt = db.prepare(`
        UPDATE portfolio_items 
        SET pillar_code = ?, title = ?, desc = ?, status = ?, amount = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      const insertItemStmt = db.prepare(`
        INSERT INTO portfolio_items (pillar_code, title, desc, status, amount, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      let order = 1;
      for (const it of items) {
        if (it.id && existingItems.includes(it.id)) {
          updateItemStmt.run(
            it.pillar_code,
            it.title || '',
            it.desc || '',
            it.status || 'ACTIVE',
            Number(it.amount) || 0,
            it.sort_order || order++,
            it.id
          );
        } else {
          insertItemStmt.run(
            it.pillar_code,
            it.title || '',
            it.desc || '',
            it.status || 'ACTIVE',
            Number(it.amount) || 0,
            it.sort_order || order++
          );
        }
      }
    });

    updateTx();

    const updatedPillars = db.prepare('SELECT * FROM portfolio_pillars ORDER BY sort_order ASC, id ASC').all();
    const updatedItems = db.prepare('SELECT * FROM portfolio_items ORDER BY sort_order ASC, id ASC').all();
    const cashPillar = updatedPillars.find((p) => p.pillar_code === 'CASH');

    return NextResponse.json({
      success: true,
      pillars: updatedPillars,
      items: updatedItems,
      principle: cashPillar?.note || principle,
    });
  } catch (err) {
    console.error('Error saving portfolio structure:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
