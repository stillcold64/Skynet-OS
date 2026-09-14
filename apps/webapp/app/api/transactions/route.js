import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // e.g. '2026-09'

    let transactionsQuery = 'SELECT * FROM transactions';
    const params = [];

    if (month) {
      transactionsQuery += ' WHERE date LIKE ?';
      params.push(`${month}%`);
    }

    transactionsQuery += ' ORDER BY date DESC, id DESC';

    const transactions = db.prepare(transactionsQuery).all(...params);

    // Group totals (LIFE, EXTRAVAGANT, BILL, INVESTING, ETC)
    const groups = db
      .prepare(`
        SELECT 
          category_group,
          COALESCE(SUM(amount), 0) as total,
          COUNT(id) as count
        FROM transactions
        ${month ? "WHERE date LIKE ?" : ""}
        GROUP BY category_group
      `)
      .all(...params);

    const groupTotals = {
      LIFE: 0,
      EXTRAVAGANT: 0,
      BILL: 0,
      INVESTING: 0,
      ETC: 0,
    };

    for (const g of groups) {
      if (groupTotals[g.category_group] !== undefined) {
        groupTotals[g.category_group] = g.total;
      }
    }

    // Type totals (Expense vs Investment)
    const typeTotals = db
      .prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'ค่าใช้จ่าย' THEN amount ELSE 0 END), 0) AS totalExpense,
          COALESCE(SUM(CASE WHEN type = 'การลงทุน' THEN amount ELSE 0 END), 0) AS totalInvestment
        FROM transactions
        ${month ? "WHERE date LIKE ?" : ""}
      `)
      .get(...params);

    // Daily breakdown for the calendar
    const dailyRows = db
      .prepare(`
        SELECT 
          date,
          category_group,
          SUM(amount) as amount,
          COUNT(id) as count
        FROM transactions
        ${month ? "WHERE date LIKE ?" : ""}
        GROUP BY date, category_group
        ORDER BY date ASC
      `)
      .all(...params);

    const dailyMap = {};
    for (const row of dailyRows) {
      if (!dailyMap[row.date]) {
        dailyMap[row.date] = {
          total: 0,
          groups: {},
          count: 0,
        };
      }
      dailyMap[row.date].total += row.amount;
      dailyMap[row.date].count += row.count;
      dailyMap[row.date].groups[row.category_group] = row.amount;
    }

    // Multi-month aggregation across all time
    const monthRows = db
      .prepare(`
        SELECT 
          substr(date, 1, 7) as ym,
          COALESCE(SUM(CASE WHEN type = 'ค่าใช้จ่าย' THEN amount ELSE 0 END), 0) as expense,
          COALESCE(SUM(CASE WHEN type = 'ค่าใช้จ่าย' AND category_group = 'BILL' THEN amount ELSE 0 END), 0) as fixed,
          COALESCE(SUM(CASE WHEN type = 'ค่าใช้จ่าย' AND category_group != 'BILL' THEN amount ELSE 0 END), 0) as variable,
          COUNT(id) as count
        FROM transactions
        GROUP BY ym
        ORDER BY ym ASC
      `)
      .all();

    const allTimeTotalExpense = Math.round(monthRows.reduce((sum, r) => sum + r.expense, 0) * 100) / 100;
    const allTimeTotalFixed = Math.round(monthRows.reduce((sum, r) => sum + r.fixed, 0) * 100) / 100;
    const allTimeTotalVariable = Math.round(monthRows.reduce((sum, r) => sum + r.variable, 0) * 100) / 100;
    const allTimeMonthsCount = Math.max(1, monthRows.length);
    const allTimeMonthlyAvg = Math.round((allTimeTotalExpense / allTimeMonthsCount) * 100) / 100;
    const allTimeFixedAvg = Math.round((allTimeTotalFixed / allTimeMonthsCount) * 100) / 100;

    const allTimeStats = {
      totalExpense: allTimeTotalExpense,
      totalFixed: allTimeTotalFixed,
      totalVariable: allTimeTotalVariable,
      monthsCount: allTimeMonthsCount,
      monthlyAverage: allTimeMonthlyAvg,
      monthlyFixedAverage: allTimeFixedAvg,
      months: monthRows,
    };

    return NextResponse.json({
      transactions,
      groupTotals,
      totalExpense: typeTotals.totalExpense,
      totalInvestment: typeTotals.totalInvestment,
      dailyMap,
      allTimeStats,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const all = searchParams.get('all');

    if (all === 'true') {
      db.prepare('DELETE FROM transactions').run();
      db.prepare('DELETE FROM bot_logs').run();
      return NextResponse.json({ success: true, message: 'All transactions cleared' });
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing transaction ID' }, { status: 400 });
    }

    const info = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return NextResponse.json({ success: true, deletedId: id, changes: info.changes });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, category_group } = body;

    if (!id || !category_group) {
      return NextResponse.json({ error: 'Missing id or category_group' }, { status: 400 });
    }

    const validGroups = ['LIFE', 'EXTRAVAGANT', 'BILL', 'INVESTING', 'ETC'];
    if (!validGroups.includes(category_group)) {
      return NextResponse.json({ error: 'Invalid category_group' }, { status: 400 });
    }

    const newType = category_group === 'INVESTING' ? 'การลงทุน' : 'ค่าใช้จ่าย';

    // 1. Update transaction row
    const info = db
      .prepare('UPDATE transactions SET category_group = ?, type = ? WHERE id = ?')
      .run(category_group, newType, id);

    if (info.changes === 0) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // 2. Fetch the transaction item name to learn the keyword for future messages
    const tx = db.prepare('SELECT category FROM transactions WHERE id = ?').get(id);
    if (tx && tx.category) {
      const kw = tx.category.trim().toLowerCase();
      if (kw.length >= 2) {
        db.prepare(`
          INSERT OR REPLACE INTO category_rules (keyword, category_group, suggested_type)
          VALUES (?, ?, ?)
        `).run(kw, category_group, newType);
      }
    }

    return NextResponse.json({ success: true, id, category_group, type: newType });
  } catch (error) {
    console.error('Error updating transaction category:', error);
    return NextResponse.json({ error: 'Failed to update transaction category' }, { status: 500 });
  }
}

