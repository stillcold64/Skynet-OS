import { NextResponse } from 'next/server';
import {
  getBangkokDateStr,
  getActivities,
  getActiveSession,
  punchActivity,
  stopActiveSession,
  addManualLog,
  updateLog,
  deleteLog,
  getTodayLogs,
  getActivityHeatmaps,
  createActivity,
  updateActivity,
  deleteActivity,
} from '@/lib/tracker_db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date') || getBangkokDateStr();
    const days = parseInt(searchParams.get('days') || '60', 10);

    const activities = getActivities();
    const activeSession = getActiveSession();
    const todayData = getTodayLogs(dateStr);
    const heatmapData = getActivityHeatmaps(days, dateStr);

    return NextResponse.json({
      success: true,
      todayStr: dateStr,
      activities,
      activeSession,
      todayLogs: todayData.logs,
      todayStats: {
        totalMinutes: todayData.totalMinutesToday,
        totalFormatted: todayData.totalFormatted,
        breakdown: todayData.breakdown,
      },
      heatmaps: heatmapData.heatmaps,
      daysCount: days,
    });
  } catch (err) {
    console.error('Daily Tracker GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    // 1. Punch / Switch activity
    if (action === 'punch') {
      const { activityId, note = '' } = body;
      if (!activityId) {
        return NextResponse.json({ success: false, error: 'กรุณาระบุกิจกรรม' }, { status: 400 });
      }

      const result = punchActivity(activityId, note);
      return NextResponse.json({ success: true, result });
    }

    // 2. Stop ongoing session
    if (action === 'stop') {
      const { note = '' } = body;
      const result = stopActiveSession(note);
      return NextResponse.json({ success: true, result });
    }

    // 3. Manual Add Log
    if (action === 'manual_add') {
      const { activityId, date, startTime, endTime, durationMinutes, note } = body;
      if (!activityId) {
        return NextResponse.json({ success: false, error: 'กรุณาเลือกกิจกรรม' }, { status: 400 });
      }

      const newLog = addManualLog({
        activityId,
        date,
        startTime,
        endTime,
        durationMinutes,
        note,
      });

      return NextResponse.json({ success: true, log: newLog });
    }

    // 4. Update Log
    if (action === 'update_log') {
      const { id, fields } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: 'Missing log id' }, { status: 400 });
      }

      const updated = updateLog(id, fields);
      return NextResponse.json({ success: true, log: updated });
    }

    // 5. Delete Log
    if (action === 'delete_log') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: 'Missing log id' }, { status: 400 });
      }

      deleteLog(id);
      return NextResponse.json({ success: true, deletedId: id });
    }

    // 6. Add Custom Activity
    if (action === 'add_activity') {
      const { name, emoji, color, description } = body;
      if (!name || !name.trim()) {
        return NextResponse.json({ success: false, error: 'กรุณาระบุชื่อกิจกรรม' }, { status: 400 });
      }

      const newAct = createActivity({ name, emoji, color, description });
      return NextResponse.json({ success: true, activity: newAct });
    }

    // 7. Update Activity
    if (action === 'update_activity') {
      const { id, fields } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: 'Missing activity id' }, { status: 400 });
      }

      const updated = updateActivity(id, fields);
      return NextResponse.json({ success: true, activity: updated });
    }

    // 8. Delete Activity
    if (action === 'delete_activity') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: 'Missing activity id' }, { status: 400 });
      }

      deleteActivity(id);
      return NextResponse.json({ success: true, deletedId: id });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Daily Tracker POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
