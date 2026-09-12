import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const debtsRows = db.prepare('SELECT * FROM debts ORDER BY id ASC').all();
    const allTransactions = db.prepare('SELECT * FROM transactions ORDER BY date ASC, id ASC').all();

    let totalInitialDebt = 0;
    let totalPaidDebt = 0;

    const debts = debtsRows.map((debt) => {
      const keywords = debt.keywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

      // Find transactions that match any of the debt keywords
      const matchedTransactions = allTransactions.filter((tx) => {
        const cat = (tx.category || '').toLowerCase();
        return keywords.some((kw) => cat.includes(kw));
      });

      const paidAmount = Math.round(matchedTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0) * 100) / 100;
      const remainingAmount = Math.round(Math.max(0, debt.initial_amount - paidAmount) * 100) / 100;
      const progressPct = debt.initial_amount > 0 ? Math.min(100, (paidAmount / debt.initial_amount) * 100) : 0;

      totalInitialDebt += debt.initial_amount;
      totalPaidDebt += paidAmount;

      return {
        id: debt.id,
        name: debt.name,
        keywords: debt.keywords,
        initialAmount: debt.initial_amount,
        interestRate: debt.interest_rate,
        note: debt.note,
        paidAmount,
        remainingAmount,
        progressPct: parseFloat(progressPct.toFixed(1)),
        paymentsCount: matchedTransactions.length,
        payments: matchedTransactions,
      };
    });

    totalInitialDebt = Math.round(totalInitialDebt * 100) / 100;
    totalPaidDebt = Math.round(totalPaidDebt * 100) / 100;
    const totalRemainingDebt = Math.round(Math.max(0, totalInitialDebt - totalPaidDebt) * 100) / 100;
    const overallProgressPct = totalInitialDebt > 0 ? parseFloat(((totalPaidDebt / totalInitialDebt) * 100).toFixed(1)) : 0;

    // Investment Drawdown
    const drawdown = db.prepare('SELECT * FROM investment_drawdown ORDER BY id DESC LIMIT 1').get() || {
      amount_usd: 5000,
      exchange_rate: 36.0,
      note: 'ยอดติดลบจากพอร์ตการลงทุน ($5,000 USD)',
    };

    const amountThb = Math.round(drawdown.amount_usd * drawdown.exchange_rate * 100) / 100;
    const totalLiabilitiesTHB = Math.round((totalRemainingDebt + amountThb) * 100) / 100;

    return NextResponse.json({
      debts,
      totalInitialDebt,
      totalPaidDebt,
      totalRemainingDebt,
      overallProgressPct: parseFloat(overallProgressPct.toFixed(1)),
      drawdown: {
        amountUsd: drawdown.amount_usd,
        exchangeRate: drawdown.exchange_rate,
        amountThb,
        note: drawdown.note,
      },
      totalLiabilitiesTHB,
    });
  } catch (error) {
    console.error('Error fetching debts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, exchangeRate, debt } = body;

    // Action 1: Update exchange rate
    if (action === 'update_rate' && exchangeRate && !isNaN(Number(exchangeRate))) {
      db.prepare('UPDATE investment_drawdown SET exchange_rate = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(
        parseFloat(exchangeRate)
      );
      return NextResponse.json({ success: true, newRate: parseFloat(exchangeRate) });
    }

    // Action 2: Update debt initial amount or interest
    if (action === 'update_debt' && debt && debt.id) {
      db.prepare(`
        UPDATE debts 
        SET initial_amount = ?, interest_rate = ?, note = ?
        WHERE id = ?
      `).run(
        parseFloat(debt.initialAmount),
        parseFloat(debt.interestRate),
        debt.note || '',
        debt.id
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action or parameters' }, { status: 400 });
  } catch (error) {
    console.error('Error updating debts API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
