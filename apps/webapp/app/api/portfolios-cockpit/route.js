import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // e.g. '2026-11' or current month

    const pillars = db.prepare('SELECT * FROM portfolio_pillars ORDER BY sort_order ASC, id ASC').all();
    const items = db.prepare('SELECT * FROM portfolio_items ORDER BY sort_order ASC, id ASC').all();

    // Default current month if not provided
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const targetMonth = month || currentMonthStr;

    // Fetch transactions linked to investing/portfolios from bot & personal finance
    const transactions = db.prepare(`
      SELECT id, date, category, category_group, sub_category, type, amount, raw_text, note, created_at
      FROM transactions
      WHERE category_group = 'INVESTING'
         OR category LIKE '%ลงทุน%'
         OR category LIKE '%dca%'
         OR category LIKE '%พอร์ต%'
         OR category LIKE '%crypto%'
         OR category LIKE '%btc%'
         OR category LIKE '%gold%'
         OR raw_text LIKE '%ลงทุน%'
         OR raw_text LIKE '%dca%'
         OR raw_text LIKE '%พอร์ต%'
         OR raw_text LIKE '%beta%'
         OR raw_text LIKE '%alpha%'
      ORDER BY date DESC, id DESC
    `).all();

    // Monthly breakdown & total breakdown by portfolio pillar
    // Rule mapping:
    // - ALPHA: EA, robot, mt5, demo, cent, alpha
    // - BETA: grid, btc, xau, gold, snowball, beta, ซื้อรอบ
    // - CASH: dca, spxc, ออม, สะสม, สำรอง, cash, คริปโตทั่วไป (fallback default for general 'ลงทุน' or 'dca')
    const classifyTxToPillar = (tx) => {
      const text = `${tx.category || ''} ${tx.sub_category || ''} ${tx.raw_text || ''}`.toLowerCase();
      if (text.includes('alpha') || text.includes('ea') || text.includes('cent') || text.includes('mt5')) {
        return 'ALPHA';
      }
      if (text.includes('beta') || text.includes('grid') || text.includes('snowball') || (text.includes('gold') && !text.includes('dca'))) {
        return 'BETA';
      }
      // Default DCA, investment reserve, general crypto investing goes to CASH / DCA pillar
      return 'CASH';
    };

    const monthlyTxs = transactions.filter((t) => (t.date || '').startsWith(targetMonth));

    const portfolioStats = {
      ALPHA: { totalAllTime: 0, totalThisMonth: 0, countThisMonth: 0, items: [] },
      BETA: { totalAllTime: 0, totalThisMonth: 0, countThisMonth: 0, items: [] },
      CASH: { totalAllTime: 0, totalThisMonth: 0, countThisMonth: 0, items: [] },
    };

    transactions.forEach((tx) => {
      const pCode = classifyTxToPillar(tx);
      const isThisMonth = (tx.date || '').startsWith(targetMonth);
      if (portfolioStats[pCode]) {
        portfolioStats[pCode].totalAllTime += Number(tx.amount) || 0;
        if (isThisMonth) {
          portfolioStats[pCode].totalThisMonth += Number(tx.amount) || 0;
          portfolioStats[pCode].countThisMonth += 1;
        }
      }
    });

    const cashPillar = pillars.find((p) => p.pillar_code === 'CASH');
    const principle = cashPillar?.note || 'Ray Dalio Principle: "แยกพอร์ตให้ขาด อารมณ์จะไม่กวนเงินสด"';

    return NextResponse.json({
      success: true,
      targetMonth,
      pillars,
      items,
      principle,
      stats: portfolioStats,
      monthlyTransactions: monthlyTxs,
      allTransactions: transactions,
    });
  } catch (err) {
    console.error('Error fetching 3-portfolio cockpit:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, pillar_code, amount, note, date, title, desc } = body;

    // Action 1: Add a quick deposit / transaction directly from Cockpit
    if (action === 'quick_deposit') {
      const pCode = pillar_code || 'BETA';
      const amt = Number(amount);
      if (!amt || amt <= 0) {
        return NextResponse.json({ error: 'จำนวนเงินต้องมากกว่า 0' }, { status: 400 });
      }

      const txDate = date || new Date().toISOString().split('T')[0];
      const categoryName = pCode === 'ALPHA' ? 'เติมพอร์ต Alpha' : (pCode === 'BETA' ? 'เติมพอร์ต Beta' : 'DCA พอร์ตแคช');

      const stmt = db.prepare(`
        INSERT INTO transactions (date, category_group, category, sub_category, type, amount, raw_text, note)
        VALUES (?, 'INVESTING', ?, ?, 'การลงทุน', ?, ?, ?)
      `);

      const raw = `${categoryName} ${amt}`;
      const subCat = pCode === 'BETA' ? 'Grid/Snowball' : (pCode === 'ALPHA' ? 'EA/เครื่องยนต์' : 'DCA/ออมสะสม');
      const result = stmt.run(txDate, categoryName, subCat, amt, raw, note || 'บันทึกผ่านศูนย์ 3 พอร์ต (Web)');

      return NextResponse.json({ success: true, transactionId: result.lastInsertRowid });
    }

    // Action 2: Add or update sub-portfolio item
    if (action === 'save_item') {
      if (body.id) {
        db.prepare(`
          UPDATE portfolio_items
          SET pillar_code = ?, title = ?, desc = ?, status = ?, amount = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(pillar_code, title, desc || '', body.status || 'ACTIVE', Number(amount) || 0, body.id);
      } else {
        db.prepare(`
          INSERT INTO portfolio_items (pillar_code, title, desc, status, amount, sort_order)
          VALUES (?, ?, ?, ?, ?, 99)
        `).run(pillar_code, title, desc || '', body.status || 'ACTIVE', Number(amount) || 0);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('Error in 3-portfolio POST:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
