import { NextResponse } from 'next/server';
import { getBetaPortfolioDashboard, getBetaPortfolioEvents } from '@/lib/beta_portfolios';

export async function GET(request) {
  try {
    const dashboard = getBetaPortfolioDashboard();
    const idParam = new URL(request.url).searchParams.get('id');

    if (idParam !== null) {
      const id = Number(idParam);
      if (!Number.isSafeInteger(id) || id < 1) {
        return NextResponse.json({ error: 'Invalid portfolio id' }, { status: 400 });
      }
      const portfolio = dashboard.accounts.find((account) => account.id === id);
      if (!portfolio) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
      return NextResponse.json({ portfolio, events: getBetaPortfolioEvents(id) });
    }

    return NextResponse.json(dashboard);
  } catch (err) {
    console.error('Error loading Beta portfolios:', err);
    return NextResponse.json({ error: 'Failed to load Beta portfolios' }, { status: 500 });
  }
}
