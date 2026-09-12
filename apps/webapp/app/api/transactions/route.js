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

    return NextResponse.json({
      transactions,
      groupTotals,
      totalExpense: typeTotals.totalExpense,
      totalInvestment: typeTotals.totalInvestment,
      dailyMap,
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

    if (!id) {
      return NextResponse.json({ error: 'Missing transaction ID' }, { status: 400 });
    }

    db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }
}
