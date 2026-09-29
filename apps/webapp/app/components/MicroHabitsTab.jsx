'use client';

import { useState, useEffect } from 'react';

const CATEGORY_MAP = {
  CREATIVE: { label: 'งานครีเอทีฟ / ตัดคลิป', emoji: '🎨', color: '#bf5af2', bg: 'rgba(191, 90, 242, 0.15)' },
  HEALTH: { label: 'สุขภาพ / กายภาพ', emoji: '🌿', color: '#30d158', bg: 'rgba(48, 209, 88, 0.15)' },
  MINDSET: { label: 'จิตวิทยา / ความคิด', emoji: '🧠', color: '#ffd60a', bg: 'rgba(255, 214, 10, 0.15)' },
  ROUTINE: { label: 'รูทีนชีวิตทั่วไป', emoji: '⚡', color: '#0a84ff', bg: 'rgba(10, 132, 255, 0.15)' },
  WORK: { label: 'งาน / ผลิตภาพ', emoji: '💻', color: '#64d2ff', bg: 'rgba(100, 210, 255, 0.15)' },
};

const TIME_MAP = {
  ANYTIME: { label: 'ทุกเวลา', icon: '⏰' },
  MORNING: { label: 'ช่วงเช้า', icon: '🌅' },
  AFTERNOON: { label: 'ช่วงบ่าย', icon: '☀️' },
  EVENING: { label: 'ช่วงเย็น/ค่ำ', icon: '🌙' },
};

export default function MicroHabitsTab() {
  const [habits, setHabits] = useState([]);
  const [stats, setStats] = useState({ totalHabits: 0, completedToday: 0, percentage: 0, totalCompletions: 0, activeDays: 0 });
  const [todayStr, setTodayStr] = useState('');
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters
  const [filterTime, setFilterTime] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const initialForm = {
    title: '',
    description: '',
    category: 'CREATIVE',
    icon: '🎬',
    time_of_day: 'MORNING',
    target_days_per_week: 7,
  };
  const [formData, setFormData] = useState(initialForm);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/habits');
      if (res.ok) {
        const data = await res.json();
        setHabits(data.habits || []);
        setStats(data.stats || { totalHabits: 0, completedToday: 0, percentage: 0, totalCompletions: 0, activeDays: 0 });
        setTodayStr(data.todayStr || '');
      }
    } catch (err) {
      console.error('Failed to load micro habits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Toggle single habit
  const handleToggle = async (habitId, currentStatus) => {
    // Optimistic UI update
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id === habitId) {
          const nextDone = !h.is_done_today;
          return {
            ...h,
            is_done_today: nextDone,
            current_streak: nextDone ? h.current_streak + 1 : Math.max(0, h.current_streak - 1),
          };
        }
        return h;
      })
    );

    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', habitId, date: todayStr }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.result.status === 'COMPLETED' ? '✨ ติ๊กสำเร็จ! ซิงค์ Sheets เรียบร้อย' : 'ยกเลิกการติ๊กแล้ว');
        fetchData();
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการบันทึก');
      fetchData();
    }
  };

  // Check in all
  const handleCheckInAll = async () => {
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkin_all', date: todayStr }),
      });
      if (res.ok) {
        showToast('🌟 ติ๊กครบ 100% ทุกนิสัยแล้ว! ยอดเยี่ยมมาก');
        fetchData();
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาด');
    }
  };

  // Save Habit (Add or Update)
  const handleSaveHabit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showToast('กรุณากรอกชื่อนิสัย');
      return;
    }

    try {
      if (editingHabit) {
        const res = await fetch('/api/habits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            id: editingHabit.id,
            fields: formData,
          }),
        });
        if (res.ok) {
          showToast('แก้ไขข้อมูลนิสัยสำเร็จ');
          setShowModal(false);
          setEditingHabit(null);
          fetchData();
        }
      } else {
        const res = await fetch('/api/habits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', ...formData }),
        });
        if (res.ok) {
          showToast('เพิ่มนิสัยใหม่สำเร็จ');
          setShowModal(false);
          setFormData(initialForm);
          fetchData();
        }
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  // Delete Habit
  const handleDeleteHabit = async (id, title) => {
    if (!confirm(`คุณต้องการลบนิสัย "${title}" หรือไม่?`)) return;
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      if (res.ok) {
        showToast('ลบนิสัยสำเร็จ');
        fetchData();
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาด');
    }
  };

  // Filtered habits
  const filteredHabits = habits.filter((h) => {
    if (filterTime !== 'ALL' && h.time_of_day !== filterTime && h.time_of_day !== 'ANYTIME') return false;
    if (filterCategory !== 'ALL' && h.category !== filterCategory) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'rgba(20, 24, 33, 0.95)',
            border: '1px solid #30d158',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.92rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          <span>⚡</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP MOMENTUM BANNER */}
      <section
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(191, 90, 242, 0.08) 0%, rgba(48, 209, 88, 0.08) 50%, rgba(20, 24, 33, 0.8) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '1.2rem' }}>⚡</span>
              <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#fff', margin: 0 }}>
                Micro Habits Tracker (รูทีน & นิสัยรายวัน)
              </h2>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#8e8e93', margin: 0 }}>
              เก็บชัยชนะเล็ก ๆ วันละนิด • สร้างโมเมนตัมให้ตัวเองโดยไร้ความกดดัน • ซิงค์ Google Sheets เงียบ ๆ
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {stats.completedToday < stats.totalHabits && stats.totalHabits > 0 && (
              <button
                onClick={handleCheckInAll}
                style={{
                  background: 'rgba(48, 209, 88, 0.15)',
                  color: '#30d158',
                  border: '1px solid rgba(48, 209, 88, 0.4)',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                ✓ ติ๊กครบทั้งหมด
              </button>
            )}

            <button
              onClick={() => {
                setEditingHabit(null);
                setFormData(initialForm);
                setShowModal(true);
              }}
              style={{
                background: '#bf5af2',
                color: '#fff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>+</span>
              <span>เพิ่มนิสัยใหม่</span>
            </button>
          </div>
        </div>

        {/* Progress Bar & KPI */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.85rem' }}>
            <span style={{ color: '#aeaeb2' }}>
              ความคืบหน้าวันนี้: <strong style={{ color: '#fff' }}>{stats.completedToday}</strong> / {stats.totalHabits} รายการ
            </span>
            <span style={{ fontWeight: '700', color: stats.percentage >= 100 ? '#30d158' : '#bf5af2' }}>
              {stats.percentage}% {stats.percentage >= 100 && '🎉 ครบ 100% แล้ว'}
            </span>
          </div>

          <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${stats.percentage}%`,
                height: '100%',
                background: stats.percentage >= 100 ? '#30d158' : 'linear-gradient(90deg, #bf5af2, #30d158)',
                borderRadius: '4px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Mini Meta Badges */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.78rem', color: '#8e8e93' }}>
          <div>
            บันทึกสะสมทั้งหมด: <strong style={{ color: '#fff' }}>{stats.totalCompletions} ครั้ง</strong>
          </div>
          <div>•</div>
          <div>
            วันที่เคยทำสำเร็จ: <strong style={{ color: '#ffd60a' }}>{stats.activeDays} วัน</strong>
          </div>
          <div>•</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#30d158' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#30d158' }} />
            <span>Google Sheets Auto-Sync (Silent Backup)</span>
          </div>
        </div>
      </section>

      {/* FILTER BUTTONS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        {/* Time of Day Filters */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'ALL', label: 'ทั้งหมด' },
            { id: 'MORNING', label: '🌅 เช้า' },
            { id: 'AFTERNOON', label: '☀️ บ่าย' },
            { id: 'EVENING', label: '🌙 เย็น' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilterTime(t.id)}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: filterTime === t.id ? '1px solid #bf5af2' : '1px solid rgba(255, 255, 255, 0.1)',
                background: filterTime === t.id ? 'rgba(191, 90, 242, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                color: filterTime === t.id ? '#fff' : '#8e8e93',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: filterTime === t.id ? '600' : 'normal',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Category Filters */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['ALL', 'CREATIVE', 'HEALTH', 'MINDSET', 'ROUTINE'].map((c) => {
            const meta = CATEGORY_MAP[c];
            return (
              <button
                key={c}
                onClick={() => setFilterCategory(c)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '20px',
                  border: filterCategory === c ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                  background: filterCategory === c ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                  color: filterCategory === c ? '#fff' : '#636e7b',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                {c === 'ALL' ? 'ทุกหมวด' : `${meta.emoji} ${meta.label.split('/')[0]}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* HABIT LIST CARDS */}
      {filteredHabits.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '40px 20px',
            borderRadius: '16px',
            textAlign: 'center',
            color: '#8e8e93',
            fontSize: '0.9rem',
          }}
        >
          <span>ยังไม่มีนิสัยในหมวดหมู่นี้ กดปุ่ม <strong>"+ เพิ่มนิสัยใหม่"</strong> ด้านบนได้เลย</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
          {filteredHabits.map((habit) => {
            const cat = CATEGORY_MAP[habit.category] || CATEGORY_MAP.ROUTINE;
            const timeMeta = TIME_MAP[habit.time_of_day] || TIME_MAP.ANYTIME;

            return (
              <div
                key={habit.id}
                className="glass-panel"
                style={{
                  padding: '16px 18px',
                  borderRadius: '14px',
                  background: habit.is_done_today
                    ? 'linear-gradient(135deg, rgba(48, 209, 88, 0.12) 0%, rgba(20, 24, 33, 0.85) 100%)'
                    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(20, 24, 33, 0.85) 100%)',
                  border: habit.is_done_today ? '1px solid rgba(48, 209, 88, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                  transition: 'all 0.2s ease',
                  boxShadow: habit.is_done_today ? '0 6px 20px rgba(48, 209, 88, 0.1)' : 'none',
                }}
              >
                <div>
                  {/* Top Row: Category badge & Time tag & Streak */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: '600',
                          color: cat.color,
                          background: cat.bg,
                          padding: '2px 7px',
                          borderRadius: '5px',
                        }}
                      >
                        {cat.emoji} {cat.label.split('/')[0]}
                      </span>

                      <span style={{ fontSize: '0.72rem', color: '#8e8e93' }}>
                        {timeMeta.icon} {timeMeta.label}
                      </span>
                    </div>

                    {habit.current_streak > 0 && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          color: '#ffd60a',
                          background: 'rgba(255, 214, 10, 0.12)',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <span>🔥</span>
                        <span>{habit.current_streak} วันติด</span>
                      </span>
                    )}
                  </div>

                  {/* Habit Title & Description */}
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: '700',
                      color: habit.is_done_today ? '#fff' : '#f5f5f7',
                      margin: '0 0 4px 0',
                      textDecoration: habit.is_done_today ? 'none' : 'none',
                      lineHeight: '1.4',
                    }}
                  >
                    {habit.title}
                  </h3>

                  {habit.description && (
                    <p style={{ fontSize: '0.78rem', color: '#8e8e93', margin: '0 0 10px 0', lineHeight: '1.4' }}>
                      {habit.description}
                    </p>
                  )}

                  {/* 7-Day Mini Consistency Dots */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '10px' }}>
                    <span style={{ fontSize: '0.68rem', color: '#636e7b', marginRight: '4px' }}>7 วันล่าสุด:</span>
                    {habit.recent_days &&
                      habit.recent_days.map((day, idx) => (
                        <div
                          key={idx}
                          title={`${day.date} (${day.dayName}): ${day.isDone ? 'สำเร็จ' : 'ไม่ได้ทำ'}`}
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: day.isDone ? '#30d158' : 'rgba(255, 255, 255, 0.1)',
                            border: day.isToday ? '1px solid #fff' : 'none',
                          }}
                        />
                      ))}
                  </div>
                </div>

                {/* Bottom Row: Checkbox Button & Settings */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <button
                    onClick={() => handleToggle(habit.id, habit.is_done_today)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: habit.is_done_today ? '#30d158' : 'rgba(255, 255, 255, 0.08)',
                      color: habit.is_done_today ? '#000' : '#fff',
                      fontWeight: '700',
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{habit.is_done_today ? '✅ ทำแล้ว' : '⏳ รอทำ (คลิกติ๊ก)'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingHabit(habit);
                      setFormData({
                        title: habit.title,
                        description: habit.description || '',
                        category: habit.category,
                        icon: habit.icon || '⚡',
                        time_of_day: habit.time_of_day || 'MORNING',
                        target_days_per_week: habit.target_days_per_week || 7,
                      });
                      setShowModal(true);
                    }}
                    title="แก้ไขนิสัยนี้"
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      color: '#8e8e93',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                    }}
                  >
                    ⚙️
                  </button>

                  <button
                    onClick={() => handleDeleteHabit(habit.id, habit.title)}
                    title="ลบนิสัยนี้"
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 69, 58, 0.2)',
                      background: 'transparent',
                      color: '#ff453a',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(8px)',
            padding: '16px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              borderRadius: '16px',
              background: '#1a1d26',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff', margin: 0 }}>
                {editingHabit ? '⚙️ แก้ไขนิสัย' : '✨ เพิ่มนิสัยใหม่'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#8e8e93', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveHabit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  ชื่อนิสัย / รูทีน *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ตัดคลิปเช้า 30 นาที, วิดพื้น 20 ที"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  รายละเอียด / โน้ตเตือนใจสั้น ๆ (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  placeholder="เช่น ทำท่อน Hook ให้เสร็จ, ดื่มน้ำแก้วใหญ่"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                    หมวดหมู่
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: '#1a1d26',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="CREATIVE">🎨 งานครีเอทีฟ / ตัดคลิป</option>
                    <option value="HEALTH">🌿 สุขภาพ / กายภาพ</option>
                    <option value="MINDSET">🧠 จิตใจ / ความคิด</option>
                    <option value="ROUTINE">⚡ รูทีนชีวิตทั่วไป</option>
                    <option value="WORK">💻 งาน / ผลิตภาพ</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                    ช่วงเวลาที่ทำ
                  </label>
                  <select
                    value={formData.time_of_day}
                    onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: '#1a1d26',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="MORNING">🌅 ช่วงเช้า</option>
                    <option value="AFTERNOON">☀️ ช่วงบ่าย</option>
                    <option value="EVENING">🌙 ช่วงเย็น / ก่อนนอน</option>
                    <option value="ANYTIME">⏰ ทุกเวลา</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'transparent',
                    color: '#8e8e93',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#bf5af2',
                    color: '#fff',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {editingHabit ? 'บันทึกการแก้ไข' : 'บันทึกนิสัยใหม่'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
