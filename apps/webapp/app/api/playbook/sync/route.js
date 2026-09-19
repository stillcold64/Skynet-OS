import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';

function getWebhookUrl() {
  let url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/GOOGLE_SHEETS_WEBHOOK_URL\s*=\s*(.+)/);
      if (match) url = match[1].trim();
    }
  }
  return url;
}

export async function POST(request) {
  try {
    const url = getWebhookUrl();
    if (!url) {
      return NextResponse.json(
        {
          success: false,
          error: 'ไม่พบ GOOGLE_SHEETS_WEBHOOK_URL ใน .env (โปรดระบุ Webhook URL เพื่อซิงค์ลง Google)',
        },
        { status: 400 }
      );
    }

    const strategy = db.prepare('SELECT * FROM playbook_strategy WHERE id = 1').get();
    const trades = db.prepare('SELECT * FROM playbook_trades ORDER BY date DESC, id DESC').all();

    const formattedTrades = trades.map((t) => {
      let checklist = [];
      try {
        if (t.checklist) checklist = JSON.parse(t.checklist);
      } catch (e) {
        checklist = [];
      }
      return {
        id: t.id,
        date: t.date,
        title: t.title,
        symbol: t.symbol || '-',
        direction: t.direction,
        status: t.status,
        entry_price: t.entry_price || '-',
        sl_price: t.sl_price || '-',
        tp_price: t.tp_price || '-',
        rr_ratio: t.rr_ratio || '-',
        risk_usd: t.risk_usd || '-',
        thesis: t.thesis || '',
        checklist: checklist.join(', '),
        chart_url: t.chart_url || '',
        realized_r: t.realized_r !== null ? t.realized_r : '-',
        review_notes: t.review_notes || '',
      };
    });

    const payload = {
      action: 'sync_playbook',
      type: 'PLAYBOOK',
      strategy,
      items: formattedTrades,
      rawMessage: `Playbook Backup: ${formattedTrades.length} trades & master plan`,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();

    if (res.status === 401 || res.status === 403 || text.includes('drive-logo') || text.includes('accounts.google.com')) {
      return NextResponse.json(
        {
          success: false,
          needPermission: true,
          error: 'Google Apps Script ต้องการสิทธิ์ "Anyone": โปรดตั้งค่า Who has access เป็น Anyone',
        },
        { status: 403 }
      );
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = { raw: text };
    }

    if (res.ok) {
      return NextResponse.json({
        success: true,
        count: formattedTrades.length,
        timestamp: payload.timestamp,
        response: json,
        message: `สำรองข้อมูล Playbook ${formattedTrades.length} รายการลง Google (GGD) สำเร็จ!`,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: `Google Sheets / GGD ส่งกลับสถานะผิดพลาด (${res.status}): ${text}`,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('Error syncing Playbook to GGD:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อไปยัง Google Webhook',
      },
      { status: 500 }
    );
  }
}
