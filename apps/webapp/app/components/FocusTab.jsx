'use client';

import { useState, useEffect } from 'react';

const CATEGORY_MAP = {
  TRADING_DISCIPLINE: { label: 'วินัยการเทรด', emoji: '🛑', color: '#ff453a', bg: 'rgba(255, 69, 58, 0.15)' },
  EA_CODE: { label: 'EA & โค้ดดิ้ง', emoji: '💻', color: '#0a84ff', bg: 'rgba(10, 132, 255, 0.15)' },
  SELF_DEV: { label: 'พัฒนาตัวเอง / จิตวิทยา', emoji: '🧠', color: '#bf5af2', bg: 'rgba(191, 90, 242, 0.15)' },
  HEALTH: { label: 'สุขภาพ & การพักผ่อน', emoji: '🌿', color: '#30d158', bg: 'rgba(48, 209, 88, 0.15)' },
  OTHER: { label: 'เป้าหมายอื่น ๆ', emoji: '🎯', color: '#ffd60a', bg: 'rgba(255, 214, 10, 0.15)' },
};

export default function FocusTab() {
  const [tasks, setTasks] = useState([]);
  const [todayTop3, setTodayTop3] = useState([]);
  const [heatmap, setHeatmap] = useState({});
  const [stats, setStats] = useState({ currentStreak: 0, bestStreak: 0, totalCompletions: 0, totalDaysActive: 0 });
  const [todayStr, setTodayStr] = useState('');
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  // Modals & Form
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedHeatmapDate, setSelectedHeatmapDate] = useState(null);

  const initialForm = {
    title: '',
    description: '',
    category: 'TRADING_DISCIPLINE',
    target_days: 7,
    reminder_time: '09:00',
  };
  const [formData, setFormData] = useState(initialForm);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/focus');
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        setTodayTop3(data.todayTop3 || []);
        setHeatmap(data.heatmap || {});
        setStats(data.stats || { currentStreak: 0, bestStreak: 0, totalCompletions: 0, totalDaysActive: 0 });
        setTodayStr(data.todayStr || '');
      }
    } catch (err) {
      console.error('Failed to load focus data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // auto-refresh to mirror Telegram bot actions
    return () => clearInterval(interval);
  }, []);

  // Check-in action (Toggle Done)
  const handleCheckIn = async (taskId, currentStatus) => {
    try {
      const res = await fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkin',
          taskId,
          status: currentStatus ? 'TOGGLE' : 'COMPLETED',
          date: todayStr,
        }),
      });

      if (res.ok) {
        showToast(currentStatus ? 'ยกเลิกการติ๊กเสร็จ' : '🔥 บันทึกความต่อเนื่องสำเร็จ! Heatmap อัปเดตแล้ว');
        fetchData();
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  // Check-in All Top 3 at once
  const handleCheckInAll = async () => {
    try {
      const res = await fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkin_all', date: todayStr }),
      });
      if (res.ok) {
        showToast('🌟 บันทึกครบทั้ง 3 ข้อสำเร็จ! Heatmap เขียวเต็ม 100%');
        fetchData();
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาด');
    }
  };

  // Ping Telegram Bot with interactive checklist
  const handlePingTelegram = async () => {
    try {
      const res = await fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ping_telegram' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('📱 ส่งรายการภารกิจเข้า Telegram เรียบร้อย! ตรวจสอบมือถือและกดติ๊กได้ทันที');
      } else {
        showToast('⚠️ ไม่สามารถส่งได้: ' + (data.error || 'กรุณาลองใหม่'));
      }
    } catch (err) {
      showToast('⚠️ เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  // Save Task (Create or Update)
  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showToast('กรุณากรอกชื่อภารกิจ');
      return;
    }

    try {
      if (editingTask) {
        const res = await fetch('/api/focus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_task',
            id: editingTask.id,
            fields: formData,
          }),
        });
        if (res.ok) {
          showToast('บันทึกการแก้ไขภารกิจสำเร็จ');
          setShowModal(false);
          setEditingTask(null);
          fetchData();
        }
      } else {
        const res = await fetch('/api/focus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_task',
            task: formData,
          }),
        });
        if (res.ok) {
          showToast('เพิ่มภารกิจใหม่ลงในคลังสำเร็จ');
          setShowModal(false);
          setFormData(initialForm);
          fetchData();
        }
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  // Set Top 3 Rank
  const handleSetRank = async (taskId, targetRank) => {
    // Current top 3 IDs
    const currentTop3Ids = todayTop3.map((t) => t.id);
    const newTop3 = [...currentTop3Ids];

    // Remove if already in list
    const existingIdx = newTop3.indexOf(taskId);
    if (existingIdx !== -1) {
      newTop3.splice(existingIdx, 1);
    }

    // Insert at desired rank (0-indexed)
    newTop3.splice(targetRank - 1, 0, taskId);

    // Keep only top 3
    const finalTop3 = newTop3.slice(0, 3);

    try {
      const res = await fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_top3',
          taskIds: finalTop3,
        }),
      });

      if (res.ok) {
        showToast(`📌 ตั้งภารกิจเป็นอันดับ ${targetRank} เรียบร้อย (Telegram ซิงค์แล้ว)`);
        fetchData();
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการเปลี่ยนอันดับ');
    }
  };

  // Delete Task
  const handleDeleteTask = async (id, title) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบภารกิจ "${title}"?`)) return;
    try {
      const res = await fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_task', id }),
      });
      if (res.ok) {
        showToast('ลบภารกิจสำเร็จ');
        fetchData();
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาด');
    }
  };

  // Generate 16 weeks of Heatmap dates (Sun to Sat)
  const generateHeatmapGrid = () => {
    const weeks = [];
    const today = new Date();
    // Go back ~112 days (16 weeks)
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 111);
    // Align to Sunday
    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek);

    let cur = new Date(startDate);
    let currentWeek = [];

    while (cur <= today || currentWeek.length > 0) {
      const dStr = cur.toISOString().slice(0, 10);
      const isFuture = cur > today;
      const data = heatmap[dStr] || { count: 0, tasks: [] };

      currentWeek.push({
        date: dStr,
        count: isFuture ? 0 : data.count,
        tasks: data.tasks || [],
        isFuture,
        isToday: dStr === todayStr,
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
        if (cur > today) break;
      }

      cur.setDate(cur.getDate() + 1);
    }

    return weeks;
  };

  const heatmapWeeks = generateHeatmapGrid();
  const completedTodayCount = todayTop3.filter((t) => t.is_done_today).length;

  return (
    <div className="focus-tab-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
            fontSize: '0.95rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          <span>⚡</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Stats Header */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Card 1: Streak */}
        <div
          className="glass-panel"
          style={{
            padding: '20px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(255, 69, 58, 0.1) 0%, rgba(20, 24, 33, 0.6) 100%)',
            border: '1px solid rgba(255, 69, 58, 0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#ff453a', fontWeight: 'bold' }}>🔥 ความสม่ำเสมอ (STREAK)</span>
            <span style={{ fontSize: '1.2rem' }}>⚡</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#fff', letterSpacing: '-0.5px' }}>
            {stats.currentStreak} <span style={{ fontSize: '1rem', fontWeight: 'normal', color: '#8e8e93' }}>วันต่อเนื่อง</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#8e8e93', marginTop: '6px' }}>
            สถิติต่อเนื่องสูงสุด: <strong style={{ color: '#ffd60a' }}>{stats.bestStreak} วัน</strong>
          </div>
        </div>

        {/* Card 2: Today Progress */}
        <div
          className="glass-panel"
          style={{
            padding: '20px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(48, 209, 88, 0.1) 0%, rgba(20, 24, 33, 0.6) 100%)',
            border: '1px solid rgba(48, 209, 88, 0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#30d158', fontWeight: 'bold' }}>🎯 วันนี้ (TODAY FOCUS)</span>
            <span style={{ fontSize: '1.2rem' }}>✅</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#fff' }}>
            {completedTodayCount} / {todayTop3.length}{' '}
            <span style={{ fontSize: '1rem', fontWeight: 'normal', color: '#8e8e93' }}>ข้อสำเร็จ</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
            <span style={{ fontSize: '0.82rem', color: '#8e8e93' }}>
              {completedTodayCount === 3 ? '🌟 ทำครบ 100% แล้ววันนี้' : 'รอเช็คอิน Telegram / Web'}
            </span>
            {completedTodayCount < 3 && (
              <button
                onClick={handleCheckInAll}
                style={{
                  background: 'rgba(48, 209, 88, 0.2)',
                  color: '#30d158',
                  border: '1px solid rgba(48, 209, 88, 0.4)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                ✓ ติ๊กครบทั้งหมด
              </button>
            )}
          </div>
        </div>

        {/* Card 3: Total Completed Check-ins */}
        <div
          className="glass-panel"
          style={{
            padding: '20px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(10, 132, 255, 0.1) 0%, rgba(20, 24, 33, 0.6) 100%)',
            border: '1px solid rgba(10, 132, 255, 0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: '#0a84ff', fontWeight: 'bold' }}>📊 ความมีวินัยสะสม</span>
            <span style={{ fontSize: '1.2rem' }}>📈</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#fff' }}>
            {stats.totalCompletions}{' '}
            <span style={{ fontSize: '1rem', fontWeight: 'normal', color: '#8e8e93' }}>ครั้ง</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#8e8e93', marginTop: '6px' }}>
            จำนวนวันที่แอคทีฟทั้งหมด: <strong>{stats.totalDaysActive} วัน</strong>
          </div>
        </div>

        {/* Card 4: Telegram & GGS Status */}
        <div
          className="glass-panel"
          style={{
            padding: '20px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(191, 90, 242, 0.1) 0%, rgba(20, 24, 33, 0.6) 100%)',
            border: '1px solid rgba(191, 90, 242, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.85rem', color: '#bf5af2', fontWeight: 'bold' }}>📱 TELEGRAM & GGS SYNC</span>
              <span style={{ fontSize: '1.1rem' }}>☁️</span>
            </div>
            <div style={{ fontSize: '0.92rem', color: '#fff', fontWeight: '600' }}>บอททักเตือนตามเวลาแต่ละข้อ</div>
            <div style={{ fontSize: '0.8rem', color: '#8e8e93', marginTop: '4px' }}>
              ตอบกลับ <code>"โอเค"</code> หรือกดปุ่มใน Telegram เพื่ออัปเดต Heatmap
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#30d158' }} />
            <span style={{ fontSize: '0.78rem', color: '#30d158' }}>Google Sheets Redundancy Active</span>
          </div>
        </div>
      </section>

      {/* SECTION 1: TOP 3 ACTIVE FOCUS CARDS */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#fff', margin: 0 }}>
              🎯 3 อันดับภารกิจหลัก (Active Top 3 Focus)
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#8e8e93', margin: '4px 0 0 0' }}>
              บอท Telegram จะแจ้งเตือนตามเวลาที่คุณตั้งไว้ของแต่ละข้อ และเชื่อมโยงกับ Heatmap อัตโนมัติ
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handlePingTelegram}
              style={{
                background: 'rgba(10, 132, 255, 0.15)',
                color: '#64d2ff',
                border: '1px solid rgba(10, 132, 255, 0.35)',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="ส่งรายการภารกิจเข้า Telegram ของคุณทันทีเพื่อให้กดติ๊กในมือถือได้"
            >
              <span>📱</span>
              <span>ส่งเข้า Telegram ทันที</span>
            </button>

            <button
              onClick={() => {
                setEditingTask(null);
                setFormData(initialForm);
                setShowModal(true);
              }}
              style={{
                background: '#0a84ff',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>+</span>
              <span>เพิ่มภารกิจใหม่</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {todayTop3.map((task) => {
            const cat = CATEGORY_MAP[task.category] || CATEGORY_MAP.OTHER;
            const rankLabel = task.rank === 1 ? '🥇 อันดับ 1' : task.rank === 2 ? '🥈 อันดับ 2' : '🥉 อันดับ 3';
            const rankColor = task.rank === 1 ? '#ffd60a' : task.rank === 2 ? '#e5e5ea' : '#ff9f0a';

            return (
              <div
                key={task.id}
                className="glass-panel"
                style={{
                  padding: '20px',
                  borderRadius: '16px',
                  background: task.is_done_today
                    ? 'linear-gradient(145deg, rgba(48, 209, 88, 0.12) 0%, rgba(20, 24, 33, 0.8) 100%)'
                    : 'linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, rgba(20, 24, 33, 0.8) 100%)',
                  border: task.is_done_today ? '1px solid rgba(48, 209, 88, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: task.is_done_today ? '0 8px 24px rgba(48, 209, 88, 0.15)' : 'none',
                  transition: 'all 0.25s ease',
                }}
              >
                <div>
                  {/* Top Bar: Rank & Category */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 'bold',
                        color: rankColor,
                        background: 'rgba(255, 255, 255, 0.07)',
                        padding: '3px 10px',
                        borderRadius: '20px',
                      }}
                    >
                      {rankLabel}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: cat.color,
                        background: cat.bg,
                        padding: '3px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      {cat.emoji} {cat.label}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff', margin: '0 0 8px 0', lineHeight: '1.4' }}>
                    {task.title}
                  </h3>

                  {/* Description / Reminder text */}
                  {task.description && (
                    <p style={{ fontSize: '0.85rem', color: '#8e8e93', margin: '0 0 12px 0', fontStyle: 'italic' }}>
                      "{task.description}"
                    </p>
                  )}

                  {/* Meta: Reminder Time & Target Days */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>⏰</span>
                      <span>{task.reminder_time ? `แจ้งเตือน ${task.reminder_time} น.` : 'ไม่แจ้งเตือน'}</span>
                    </div>
                    {task.target_days > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🎯</span>
                        <span>เป้าหมาย {task.target_days} วัน</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🔄</span>
                        <span>รูทีนรายวัน</span>
                      </div>
                    )}
                  </div>

                  {/* Progress Bar if Challenge */}
                  {task.target_days > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#8e8e93', marginBottom: '4px' }}>
                        <span>ความคืบหน้าสะสม</span>
                        <span>
                          <strong style={{ color: '#fff' }}>{task.total_completed_days}</strong> / {task.target_days} วัน ({task.progress_pct}%)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${task.progress_pct}%`,
                            height: '100%',
                            background: task.progress_pct >= 100 ? '#30d158' : 'linear-gradient(90deg, #0a84ff, #30d158)',
                            borderRadius: '3px',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Actions: Check-in Button & Edit */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button
                    onClick={() => handleCheckIn(task.id, task.is_done_today)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: 'none',
                      background: task.is_done_today ? '#30d158' : 'rgba(255, 255, 255, 0.1)',
                      color: task.is_done_today ? '#000' : '#fff',
                      fontWeight: '700',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <span>{task.is_done_today ? '✅ ทำสำเร็จแล้ววันนี้ (โอเค)' : '⏳ รอทำวันนี้ (กดเพื่อติ๊กโอเค)'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingTask(task);
                      setFormData({
                        title: task.title,
                        description: task.description || '',
                        category: task.category,
                        target_days: task.target_days,
                        reminder_time: task.reminder_time || '09:00',
                      });
                      setShowModal(true);
                    }}
                    title="แก้ไขเวลาหรือข้อมูลภารกิจนี้"
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#aeaeb2',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    ⚙️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: CONSISTENCY HEATMAP */}
      <section className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff', margin: 0 }}>
              🟩 ตารางความต่อเนื่อง (Consistency Heatmap)
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#8e8e93', margin: '4px 0 0 0' }}>
              สถิติบันทึกความสม่ำเสมอรายวัน (16 สัปดาห์ย้อนหลัง) ยิ่งทำครบ 3 ข้อ สีเขียวจะยิ่งสว่างสดใส
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#8e8e93' }}>
            <span>น้อย</span>
            <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#1c2128' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#0e4429' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#006d32' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#39d353' }} />
            <span>ครบ 3 ข้อ</span>
          </div>
        </div>

        {/* Heatmap Grid Container */}
        <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '4px', minWidth: '700px' }}>
            {/* Day Labels Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: '6px', fontSize: '0.7rem', color: '#636e7b', justifyContent: 'space-around' }}>
              <span>อา</span>
              <span>จ</span>
              <span>อ</span>
              <span>พ</span>
              <span>พฤ</span>
              <span>ศ</span>
              <span>ส</span>
            </div>

            {/* Weeks columns */}
            {heatmapWeeks.map((week, wIdx) => (
              <div key={wIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {week.map((day) => {
                  if (day.isFuture) {
                    return (
                      <div
                        key={day.date}
                        style={{
                          width: '13px',
                          height: '13px',
                          borderRadius: '2px',
                          background: 'transparent',
                        }}
                      />
                    );
                  }

                  let bg = '#161b22';
                  let border = '1px solid rgba(255,255,255,0.04)';
                  let glow = 'none';

                  if (day.count === 1) {
                    bg = '#0e4429';
                    border = '1px solid rgba(14, 68, 41, 0.8)';
                  } else if (day.count === 2) {
                    bg = '#006d32';
                    border = '1px solid rgba(0, 109, 50, 0.9)';
                  } else if (day.count >= 3) {
                    bg = '#39d353';
                    border = '1px solid #39d353';
                    glow = '0 0 6px rgba(57, 211, 83, 0.4)';
                  }

                  if (day.isToday) {
                    border = '1.5px solid #fff';
                  }

                  return (
                    <div
                      key={day.date}
                      onClick={() => setSelectedHeatmapDate(day)}
                      title={`${day.date}: ทำสำเร็จ ${day.count} ข้อ${day.tasks.length > 0 ? ' (' + day.tasks.join(', ') + ')' : ''}`}
                      style={{
                        width: '13px',
                        height: '13px',
                        borderRadius: '2.5px',
                        background: bg,
                        border: border,
                        boxShadow: glow,
                        cursor: 'pointer',
                        transition: 'transform 0.1s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Selected Date Detail Popup / Callout */}
        {selectedHeatmapDate && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <strong style={{ color: '#fff', fontSize: '0.9rem' }}>📅 วันที่ {selectedHeatmapDate.date}</strong>
              <div style={{ fontSize: '0.82rem', color: '#8e8e93', marginTop: '2px' }}>
                {selectedHeatmapDate.count === 0 ? (
                  'ไม่มีบันทึกการเช็คอินในวันนี้'
                ) : (
                  <span>
                    ทำสำเร็จ {selectedHeatmapDate.count} ข้อ: <span style={{ color: '#30d158' }}>{selectedHeatmapDate.tasks.join(', ')}</span>
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelectedHeatmapDate(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8e8e93',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              ปิด ✕
            </button>
          </div>
        )}
      </section>

      {/* SECTION 3: TASK LIBRARY & MANAGER (คลังภารกิจทั้งหมด & สลับ 3 อันดับ) */}
      <section className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff', margin: 0 }}>
              📚 คลังภารกิจทั้งหมด (Task Pool & Library)
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#8e8e93', margin: '4px 0 0 0' }}>
              คุณสามารถสร้างภารกิจไว้กี่ข้อก็ได้ แล้วกดปุ่มปักหมุด 📌 เพื่อเลือกหรือสลับเป็น 3 อันดับหลักได้ตลอดเวลา
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#8e8e93', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>สถานะ</th>
                <th style={{ padding: '10px 12px' }}>ชื่อภารกิจ</th>
                <th style={{ padding: '10px 12px' }}>หมวดหมู่</th>
                <th style={{ padding: '10px 12px' }}>เป้าหมาย</th>
                <th style={{ padding: '10px 12px' }}>เวลาแจ้งเตือน</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>เลือกเป็น 3 อันดับหลัก</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const cat = CATEGORY_MAP[t.category] || CATEGORY_MAP.OTHER;
                return (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      background: t.is_active ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '12px' }}>
                      {t.is_active ? (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: t.rank === 1 ? 'rgba(255, 214, 10, 0.2)' : t.rank === 2 ? 'rgba(229, 229, 234, 0.2)' : 'rgba(255, 159, 10, 0.2)',
                            color: t.rank === 1 ? '#ffd60a' : t.rank === 2 ? '#e5e5ea' : '#ff9f0a',
                          }}
                        >
                          Top #{t.rank}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#636e7b' }}>ในคลัง</span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <strong style={{ color: '#fff' }}>{t.title}</strong>
                      {t.description && (
                        <div style={{ fontSize: '0.78rem', color: '#8e8e93', marginTop: '2px' }}>{t.description}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: cat.color,
                          background: cat.bg,
                          padding: '3px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {cat.emoji} {cat.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: '#aeaeb2' }}>
                      {t.target_days > 0 ? `${t.target_days} วัน` : 'รูทีนต่อเนื่อง'}
                    </td>
                    <td style={{ padding: '12px', color: '#aeaeb2' }}>
                      {t.reminder_time ? `⏰ ${t.reminder_time} น.` : '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          onClick={() => handleSetRank(t.id, 1)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: t.rank === 1 ? '1px solid #ffd60a' : '1px solid rgba(255, 255, 255, 0.1)',
                            background: t.rank === 1 ? 'rgba(255, 214, 10, 0.2)' : 'transparent',
                            color: t.rank === 1 ? '#ffd60a' : '#8e8e93',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Top 1
                        </button>
                        <button
                          onClick={() => handleSetRank(t.id, 2)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: t.rank === 2 ? '1px solid #e5e5ea' : '1px solid rgba(255, 255, 255, 0.1)',
                            background: t.rank === 2 ? 'rgba(229, 229, 234, 0.2)' : 'transparent',
                            color: t.rank === 2 ? '#e5e5ea' : '#8e8e93',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Top 2
                        </button>
                        <button
                          onClick={() => handleSetRank(t.id, 3)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: t.rank === 3 ? '1px solid #ff9f0a' : '1px solid rgba(255, 255, 255, 0.1)',
                            background: t.rank === 3 ? 'rgba(255, 159, 10, 0.2)' : 'transparent',
                            color: t.rank === 3 ? '#ff9f0a' : '#8e8e93',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Top 3
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          onClick={() => {
                            setEditingTask(t);
                            setFormData({
                              title: t.title,
                              description: t.description || '',
                              category: t.category,
                              target_days: t.target_days,
                              reminder_time: t.reminder_time || '09:00',
                            });
                            setShowModal(true);
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            color: '#aeaeb2',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          ✏️ แก้ไข
                        </button>
                        <button
                          onClick={() => handleDeleteTask(t.id, t.title)}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(255, 69, 58, 0.3)',
                            color: '#ff453a',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODAL: ADD / EDIT TASK */}
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
              maxWidth: '520px',
              padding: '28px',
              borderRadius: '20px',
              background: '#1a1d26',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#fff', margin: 0 }}>
                {editingTask ? '⚙️ แก้ไขภารกิจ & เวลาแจ้งเตือน' : '✨ เพิ่มภารกิจใหม่ลงในคลัง'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#8e8e93', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTask} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aeaeb2', marginBottom: '6px' }}>
                  ชื่อภารกิจ / เป้าหมาย *
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น 🛑 หยุดเทรดมือ 7 วัน"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aeaeb2', marginBottom: '6px' }}>
                  ข้อความเตือนใจที่บอทจะส่งมา (Prompt)
                </label>
                <input
                  type="text"
                  placeholder="เช่น ตลาดเปิดแล้ว ตั้งสติ คุมมือ ไม่เข้าออเดอร์นอกแผนเด็ดขาด!"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#aeaeb2', marginBottom: '6px' }}>
                    หมวดหมู่
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#232838',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  >
                    <option value="TRADING_DISCIPLINE">🛑 วินัยการเทรด</option>
                    <option value="EA_CODE">💻 EA & โค้ดดิ้ง</option>
                    <option value="SELF_DEV">🧠 พัฒนาตัวเอง / จิตวิทยา</option>
                    <option value="HEALTH">🌿 สุขภาพ & การพักผ่อน</option>
                    <option value="OTHER">🎯 เป้าหมายอื่น ๆ</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#aeaeb2', marginBottom: '6px' }}>
                    เป้าหมายจำนวนวัน
                  </label>
                  <select
                    value={formData.target_days}
                    onChange={(e) => setFormData({ ...formData, target_days: parseInt(e.target.value, 10) })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#232838',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem',
                    }}
                  >
                    <option value={7}>ชาเลนจ์ 7 วัน</option>
                    <option value={14}>ชาเลนจ์ 14 วัน</option>
                    <option value={21}>ชาเลนจ์ 21 วัน (สร้างนิสัย)</option>
                    <option value={30}>ชาเลนจ์ 30 วัน</option>
                    <option value={66}>ชาเลนจ์ 66 วัน (ซึมซับสันดาน)</option>
                    <option value={0}>ทำต่อเนื่องตลอดไป (รูทีน)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#aeaeb2', marginBottom: '6px' }}>
                  ⏰ เวลาที่ให้ Telegram Bot ทักมาเตือน (เวลาประเทศไทย)
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="time"
                    value={formData.reminder_time || ''}
                    onChange={(e) => setFormData({ ...formData, reminder_time: e.target.value })}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.95rem',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, reminder_time: '' })}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#8e8e93',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    ไม่แจ้งเตือน
                  </button>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#636e7b', marginTop: '4px' }}>
                  เมื่อถึงเวลานี้ บอทจะทักมาถามเจาะจงข้อนี้ พร้อมปุ่มให้กด "โอเค" ทันที
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#aeaeb2',
                    cursor: 'pointer',
                  }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    background: '#0a84ff',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  {editingTask ? 'บันทึกการแก้ไข' : 'เพิ่มภารกิจ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
