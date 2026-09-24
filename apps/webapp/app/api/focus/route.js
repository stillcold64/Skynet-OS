import { NextResponse } from 'next/server';
import {
  getAllFocusTasks,
  getActiveTop3Tasks,
  createFocusTask,
  updateFocusTask,
  setTop3Order,
  deleteFocusTask,
  toggleFocusCheckIn,
  getTodayCheckIns,
  getHeatmapData,
  getFocusStats,
  syncFocusToGoogleSheets,
} from '@/lib/focus_db';

function getBangkokTodayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

export async function GET(request) {
  try {
    const todayStr = getBangkokTodayStr();
    const tasks = getAllFocusTasks();
    const todayTop3 = getTodayCheckIns(todayStr);
    const heatmap = getHeatmapData(180); // past 180 days (half year)
    const stats = getFocusStats(todayStr);

    return NextResponse.json({
      success: true,
      todayStr,
      tasks,
      todayTop3,
      heatmap,
      stats,
    });
  } catch (err) {
    console.error('Focus GET API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    const todayStr = body.date || getBangkokTodayStr();

    if (action === 'checkin') {
      const { taskId, status = 'COMPLETED', note = '' } = body;
      const result = toggleFocusCheckIn(taskId, todayStr, status, 'WEB', note);

      // Auto-sync to Google Sheets in background
      if (result.action !== 'REMOVED') {
        const stats = getFocusStats(todayStr);
        const task = getAllFocusTasks().find((t) => t.id === taskId);
        syncFocusToGoogleSheets({
          date: todayStr,
          taskId,
          taskTitle: task ? task.title : 'Task #' + taskId,
          rank: task ? task.rank : 0,
          status,
          channel: 'WEB',
          streak: stats.currentStreak,
          reminderTime: task ? task.reminder_time : '',
          note: note || 'Checked in from Web Dashboard',
        }).catch(() => {});
      }

      return NextResponse.json({ success: true, result });
    }

    if (action === 'checkin_all') {
      const top3 = getActiveTop3Tasks();
      const results = [];
      for (const t of top3) {
        const res = toggleFocusCheckIn(t.id, todayStr, 'COMPLETED', 'WEB', 'โอเคทำครบทั้งหมด');
        results.push(res);
      }
      const stats = getFocusStats(todayStr);
      syncFocusToGoogleSheets({
        date: todayStr,
        taskId: 0,
        taskTitle: '✅ ทำครบทั้งหมด 3 ข้อ (Web All-Done)',
        rank: 0,
        status: 'COMPLETED',
        channel: 'WEB',
        streak: stats.currentStreak,
        reminderTime: 'ALL',
        note: 'ติ๊กเสร็จทั้งหมด 3 ข้อผ่านเว็บ',
      }).catch(() => {});

      return NextResponse.json({ success: true, results });
    }

    if (action === 'create_task') {
      const newTask = createFocusTask(body.task || {});
      return NextResponse.json({ success: true, task: newTask });
    }

    if (action === 'update_task') {
      const { id, fields } = body;
      const updated = updateFocusTask(id, fields || {});
      return NextResponse.json({ success: true, task: updated });
    }

    if (action === 'set_top3') {
      const { taskIds } = body;
      if (!Array.isArray(taskIds)) {
        return NextResponse.json({ success: false, error: 'taskIds must be an array' }, { status: 400 });
      }
      const newTop3 = setTop3Order(taskIds);
      return NextResponse.json({ success: true, top3: newTop3 });
    }

    if (action === 'delete_task') {
      const { id } = body;
      deleteFocusTask(id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('Focus POST API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
