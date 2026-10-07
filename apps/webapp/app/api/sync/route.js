import { NextResponse } from 'next/server';
import { backupAllToGoogleSheets } from '@/scripts/backup_to_sheets';

export async function POST(request) {
  try {
    const result = await backupAllToGoogleSheets();
    if (result.success) {
      return NextResponse.json({
        success: true,
        count: result.count,
        message: `สำรองข้อมูลทั้งหมด ${result.count} รายการลง Google Sheets เรียบร้อยแล้ว`,
        response: result.response,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to sync to Google Sheets',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('API Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
