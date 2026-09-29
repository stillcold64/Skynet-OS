import { NextResponse } from 'next/server';
import {
  getHabitsWithStatus,
  toggleHabitLog,
  checkInAllHabits,
  createMicroHabit,
  updateMicroHabit,
  deleteMicroHabit,
  getHabitMomentumStats,
  syncHabitToGoogleSheets,
} from '@/lib/habits_db';

function getBangkokTodayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date') || getBangkokTodayStr();

    const habits = getHabitsWithStatus(dateStr);
    const stats = getHabitMomentumStats(dateStr);

    return NextResponse.json({
      success: true,
      todayStr: dateStr,
      habits,
      stats,
    });
  } catch (err) {
    console.error('Micro Habits GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    const dateStr = body.date || getBangkokTodayStr();

    if (action === 'toggle') {
      const { habitId, note = '' } = body;
      const result = toggleHabitLog(habitId, dateStr, note);

      // Auto-sync to Google Sheets in background if checked
      if (result.status === 'COMPLETED') {
        const stats = getHabitMomentumStats(dateStr);
        syncHabitToGoogleSheets({
          date: dateStr,
          habitId,
          habitTitle: result.habit ? result.habit.title : `Habit #${habitId}`,
          category: result.habit ? result.habit.category : 'ROUTINE',
          status: 'COMPLETED',
          streak: result.streak,
          dailyProgressPct: stats.percentage,
          note: note || 'ติ๊กผ่านเว็บ',
        }).catch((e) => console.error('Silent GGS habit sync error:', e));
      }

      return NextResponse.json({
        success: true,
        result,
        stats: getHabitMomentumStats(dateStr),
      });
    }

    if (action === 'checkin_all') {
      const result = checkInAllHabits(dateStr);
      const stats = getHabitMomentumStats(dateStr);

      syncHabitToGoogleSheets({
        date: dateStr,
        habitId: 0,
        habitTitle: '✅ ทำครบทุกนิสัยประจำวัน (All Habits Done)',
        category: 'ALL',
        status: 'COMPLETED',
        streak: 0,
        dailyProgressPct: 100,
        note: 'ติ๊กครบทั้งหมดผ่านเว็บ',
      }).catch((e) => console.error('Silent GGS all-habits sync error:', e));

      return NextResponse.json({
        success: true,
        result,
        stats,
      });
    }

    if (action === 'add') {
      const { title, description, category, icon, time_of_day, target_days_per_week } = body;
      if (!title || !title.trim()) {
        return NextResponse.json({ success: false, error: 'กรุณาระบุชื่อนิสัย' }, { status: 400 });
      }

      const newHabit = createMicroHabit({
        title: title.trim(),
        description: description?.trim() || '',
        category: category || 'ROUTINE',
        icon: icon || '⚡',
        time_of_day: time_of_day || 'ANYTIME',
        target_days_per_week: target_days_per_week || 7,
      });

      return NextResponse.json({ success: true, habit: newHabit });
    }

    if (action === 'update') {
      const { id, fields } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: 'Missing habit id' }, { status: 400 });
      }

      const updated = updateMicroHabit(id, fields);
      return NextResponse.json({ success: true, habit: updated });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: 'Missing habit id' }, { status: 400 });
      }

      deleteMicroHabit(id);
      return NextResponse.json({ success: true, deletedId: id });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Micro Habits POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
