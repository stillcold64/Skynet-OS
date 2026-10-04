import { NextResponse } from 'next/server';
import { getMonthlyFixedCostsStatus, getAllRecurringBills } from '@/lib/bills_db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // e.g. '2026-10'

    const status = getMonthlyFixedCostsStatus(month);
    const allBills = getAllRecurringBills();

    return NextResponse.json({
      success: true,
      status,
      allBills,
    });
  } catch (err) {
    console.error('API /api/bills GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
