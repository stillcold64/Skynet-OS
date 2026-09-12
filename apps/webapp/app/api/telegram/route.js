import { NextResponse } from 'next/server';
import { ingestMessage } from '@/lib/parser';

export async function POST(request) {
  try {
    const body = await request.json();

    // Extract text from either direct { text: "..." } or Telegram Webhook { message: { text: "..." } }
    const rawText = body.text || (body.message && body.message.text);

    if (!rawText || typeof rawText !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'No text provided in request' },
        { status: 400 }
      );
    }

    const result = ingestMessage(rawText);

    return NextResponse.json({
      ok: result.success,
      count: result.count,
      items: result.items,
      logId: result.logId,
      message: result.success ? `Successfully saved ${result.count} transactions` : result.message,
    });
  } catch (error) {
    console.error('Telegram API route error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
