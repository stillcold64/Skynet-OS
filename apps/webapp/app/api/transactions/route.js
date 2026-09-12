import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const transactions = db
      .prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC')
      .all();

    const totals = db
      .prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'ค่าใช้จ่าย' THEN amount ELSE 0 END), 0) AS totalExpense,
          COALESCE(SUM(CASE WHEN type = 'การลงทุน' THEN amount ELSE 0 END), 0) AS totalInvestment
        FROM transactions
      `)
      .get();

    return NextResponse.json({
      transactions,
      totalExpense: totals.totalExpense,
      totalInvestment: totals.totalInvestment,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { date, type, category, amount, note } = body;

    if (!date || !type || !category || amount === undefined || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'Missing or invalid required fields' }, { status: 400 });
    }

    if (type !== 'ค่าใช้จ่าย' && type !== 'การลงทุน') {
      return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 });
    }

    const stmt = db.prepare(`
      INSERT INTO transactions (date, type, category, amount, note)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      date,
      type,
      category.trim(),
      parseFloat(amount),
      note ? note.trim() : null
    );

    const newRecord = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);

    return NextResponse.json({ success: true, transaction: newRecord }, { status: 201 });
  } catch (error) {
    console.error('Error adding transaction:', error);
    return NextResponse.json({ error: 'Failed to save transaction' }, { status: 500 });
  }
}
