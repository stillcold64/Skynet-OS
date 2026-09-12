import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const logs = db
      .prepare('SELECT * FROM bot_logs ORDER BY id DESC LIMIT 20')
      .all();

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Fetch logs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
