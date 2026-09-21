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

    const setups = db.prepare('SELECT * FROM playbook_setups ORDER BY id ASC').all();

    const formattedSetups = setups.map((s) => ({
      id: s.id,
      code: s.code,
      title: s.title,
      grade: s.grade || 'A+',
      direction: s.direction || 'BOTH',
      timeframe: s.timeframe || '-',
      session: s.session || '-',
      target_rr: s.target_rr || 3.0,
      thesis: s.thesis || '',
      entry_rules: s.entry_rules || '',
      invalidation_rules: s.invalidation_rules || '',
      exit_rules: s.exit_rules || '',
      risk_rules: s.risk_rules || '',
      mistakes_to_avoid: s.mistakes_to_avoid || '',
      chart_blueprint_url: s.chart_blueprint_url || '',
      updated_at: s.updated_at || '',
    }));

    const payload = {
      action: 'sync_playbook_setups',
      type: 'PLAYBOOK_SETUPS',
      setups: formattedSetups,
      rawMessage: `Playbook Setups Backup: ${formattedSetups.length} blueprints`,
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
        count: formattedSetups.length,
        timestamp: payload.timestamp,
        response: json,
        message: `สำรองข้อมูล Playbook Setups ทั้งหมด ${formattedSetups.length} ท่าเทรดลง Google (GGD) สำเร็จ!`,
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
    console.error('Error syncing Playbook Setups to GGD:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อไปยัง Google Webhook',
      },
      { status: 500 }
    );
  }
}
