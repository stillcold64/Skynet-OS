import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { undoBotLog } from '@/lib/parser';
import { backupAllToGoogleSheets } from '@/scripts/backup_to_sheets';

export async function GET() {
  try {
    const logs = db
      .prepare('SELECT * FROM bot_logs ORDER BY id DESC LIMIT 30')
      .all();

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Fetch logs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id');

    if (!id) {
      try {
        const body = await request.json();
        id = body.id;
      } catch (e) {}
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing log ID' }, { status: 400 });
    }

    const result = undoBotLog(parseInt(id, 10));

    if (result.success) {
      // Sync Google Sheets to mirror the removal
      backupAllToGoogleSheets().catch((err) =>
        console.error('Failed to sync to Google Sheets after undo:', err.message)
      );
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    console.error('Delete/Undo log error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
