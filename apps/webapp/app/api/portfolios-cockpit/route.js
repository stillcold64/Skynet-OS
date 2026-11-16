import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // e.g. '2026-11' or current month

    const pillars = db.prepare('SELECT * FROM portfolio_pillars ORDER BY sort_order ASC, id ASC').all();
    const items = db.prepare('SELECT * FROM portfolio_items ORDER BY sort_order ASC, id ASC').all();

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
         OR category LIKE '%beta%'
         OR category LIKE '%alpha%'
         OR raw_text LIKE '%ลงทุน%'
         OR raw_text LIKE '%dca%'
         OR raw_text LIKE '%พอร์ต%'
         OR raw_text LIKE '%beta%'
         OR raw_text LIKE '%alpha%'
      ORDER BY date DESC, id DESC
    `).all();

    // Classification Rule:
    // 1. ALPHA: ea, robot, mt5, cent, alpha
    // 2. BETA: beta, grid, snowball, gold, btc (when not explicitly labeled dca)
    // 3. CASH / DCA: dca, spxc, ออม, สะสม, สำรอง, cash
    const classifyTx = (tx) => {
      const text = `${tx.category || ''} ${tx.sub_category || ''} ${tx.raw_text || ''} ${tx.note || ''}`.toLowerCase();
      
      if (text.includes('alpha') || text.includes('ea') || text.includes('cent') || text.includes('mt5')) {
        return {
          pillarCode: 'ALPHA',
          symbol: 'EA / Cent',
          displayName: 'พอร์ต Alpha',
          badgeColor: '#00f2fe',
          emoji: '🤖',
        };
      }

      if (text.includes('beta') || text.includes('grid') || text.includes('snowball')) {
        return {
          pillarCode: 'BETA',
          symbol: 'THB (Grid Capital)',
          displayName: 'พอร์ต Beta (Grid Buy)',
          badgeColor: '#f59e0b',
          emoji: '🌱',
        };
      }

      // Extract symbol for DCA (e.g. SPXC, BTC, ETH)
      let symbol = 'DCA Asset';
      if (text.includes('spxc')) symbol = 'SPXC';
      else if (text.includes('btc')) symbol = 'BTC';
      else if (text.includes('eth')) symbol = 'ETH';
      else if (text.includes('gold') || text.includes('ทอง')) symbol = 'GOLD';

      return {
        pillarCode: 'CASH',
        symbol,
        displayName: 'พอร์ตแคช / DCA ระยะยาว',
        badgeColor: '#10b981',
        emoji: '💼',
      };
    };

    const portfolioStats = {
      ALPHA: { totalAllTime: 0, totalThisMonth: 0, countThisMonth: 0 },
      BETA: { totalAllTime: 0, totalThisMonth: 0, countThisMonth: 0 },
      CASH: { totalAllTime: 0, totalThisMonth: 0, countThisMonth: 0 },
    };

    const enrichedTransactions = transactions.map((tx) => {
      const meta = classifyTx(tx);
      const isThisMonth = (tx.date || '').startsWith(targetMonth);
      if (portfolioStats[meta.pillarCode]) {
        portfolioStats[meta.pillarCode].totalAllTime += Number(tx.amount) || 0;
        if (isThisMonth) {
          portfolioStats[meta.pillarCode].totalThisMonth += Number(tx.amount) || 0;
          portfolioStats[meta.pillarCode].countThisMonth += 1;
        }
      }
      return {
        ...tx,
        pillarCode: meta.pillarCode,
        symbol: meta.symbol,
        pillarName: meta.displayName,
        badgeColor: meta.badgeColor,
        emoji: meta.emoji,
      };
    });

    const monthlyTxs = enrichedTransactions.filter((t) => (t.date || '').startsWith(targetMonth));

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
      allTransactions: enrichedTransactions,
    });
  } catch (err) {
    console.error('Error fetching 3-portfolio cockpit:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, pillar_code, amount, symbol, note, date } = body;

    if (action === 'quick_deposit') {
      const pCode = pillar_code || 'BETA';
      const amt = Number(amount);
      if (!amt || amt <= 0) {
        return NextResponse.json({ error: 'จำนวนเงินต้องมากกว่า 0' }, { status: 400 });
      }

      const txDate = date || new Date().toISOString().split('T')[0];
      let categoryName = '';
      let subCat = '';
      let raw = '';

      if (pCode === 'BETA') {
        categoryName = 'พอร์ต Beta (Grid)';
        subCat = 'Grid Buy - BTC & XAU';
        raw = `Beta ${amt}`;
      } else if (pCode === 'ALPHA') {
        categoryName = 'พอร์ต Alpha';
        subCat = 'EA / เครื่องยนต์';
        raw = `Alpha ${amt}`;
      } else {
        const sym = (symbol || 'SPXC').toUpperCase();
        categoryName = `DCA ${sym}`;
        subCat = 'DCA คริปโต/สินทรัพย์';
        raw = `DCA ${sym} ${amt}`;
      }

      const stmt = db.prepare(`
        INSERT INTO transactions (date, category_group, category, sub_category, type, amount, raw_text, note)
        VALUES (?, 'INVESTING', ?, ?, 'การลงทุน', ?, ?, ?)
      `);

      const customNote = note || (pCode === 'CASH' ? `DCA สัญลักษณ์ [${symbol || 'SPXC'}]` : 'บันทึกเติมเงินพอร์ต');
      const result = stmt.run(txDate, categoryName, subCat, amt, raw, customNote);

      return NextResponse.json({ success: true, transactionId: result.lastInsertRowid });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('Error in 3-portfolio POST:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
