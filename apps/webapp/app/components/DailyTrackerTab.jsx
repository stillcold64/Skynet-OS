'use client';

import { useState, useEffect, useRef } from 'react';

// Format HH:MM:SS from seconds
function formatTimerClock(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Format duration into readable Thai
function formatThaiDuration(minutes) {
  if (!minutes || minutes <= 0) return '0 นาที';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} นาที`;
  if (m === 0) return `${h} ชม.`;
  return `${h} ชม. ${m} นาที`;
}

// Format time from ISO (e.g. 09:30)
function formatTimeOnly(isoStr) {
  if (!isoStr) return '--:--';
  try {
    const dt = new Date(isoStr);
    return new Intl.DateTimeFormat('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    }).format(dt);
  } catch (e) {
    return isoStr.slice(11, 16) || isoStr;
  }
}

// Format date into Thai short format
function formatThaiDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d} ${months[m - 1]} ${y + 543}`;
  } catch (e) {
    return dateStr;
  }
}

export default function DailyTrackerTab() {
  const [activities, setActivities] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [todayLogs, setTodayLogs] = useState([]);
  const [todayStats, setTodayStats] = useState({ totalMinutes: 0, totalFormatted: '0 นาที', breakdown: [] });
  const [heatmaps, setHeatmaps] = useState([]);
  const [daysCount, setDaysCount] = useState(60);
  const [todayStr, setTodayStr] = useState(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  });

  const [loading, setLoading] = useState(true);
  const [punchingId, setPunchingId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(0);

  // Filter for heatmaps
  const [selectedHeatmapCategory, setSelectedHeatmapCategory] = useState('ALL');

  // Modals
  const [showManualModal, setShowManualModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showEditLogModal, setShowEditLogModal] = useState(false);

  // Modal forms
  const [manualForm, setManualForm] = useState({
    activityId: '',
    date: todayStr,
    startTime: '09:00',
    endTime: '10:00',
    durationMinutes: 60,
    note: '',
  });

  const [editingLog, setEditingLog] = useState(null);
  const [editLogForm, setEditLogForm] = useState({
    activity_id: '',
    date: '',
    start_time: '',
    end_time: '',
    duration_minutes: 0,
    note: '',
  });

  const [editingActivity, setEditingActivity] = useState(null);
  const [activityForm, setActivityForm] = useState({
    name: '',
    emoji: '⚡',
    color: '#64d2ff',
    description: '',
  });

  // Hover Tooltip for heatmap cells
  const [hoveredCell, setHoveredCell] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch all tracker data
  const fetchData = async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      const res = await fetch(`/api/tracker?date=${todayStr}&days=${daysCount}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
        setActiveSession(data.activeSession || null);
        setTodayLogs(data.todayLogs || []);
        setTodayStats(data.todayStats || { totalMinutes: 0, totalFormatted: '0 นาที', breakdown: [] });
        setHeatmaps(data.heatmaps || []);
        if (data.todayStr) setTodayStr(data.todayStr);

        if (data.activeSession) {
          const start = new Date(data.activeSession.start_time).getTime();
          const now = Date.now();
          setLiveElapsedSeconds(Math.max(0, Math.floor((now - start) / 1000)));
        } else {
          setLiveElapsedSeconds(0);
        }
      }
    } catch (err) {
      console.error('Failed to load tracker data:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, [daysCount]);

  // Real-time ticking clock for active session
  useEffect(() => {
    if (!activeSession) {
      setLiveElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      const start = new Date(activeSession.start_time).getTime();
      const now = Date.now();
      const secs = Math.max(0, Math.floor((now - start) / 1000));
      setLiveElapsedSeconds(secs);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  // Punch / Switch Activity
  const handlePunch = async (activity) => {
    if (punchingId) return;
    setPunchingId(activity.id);

    try {
      const res = await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'punch', activityId: activity.id }),
      });

      if (res.ok) {
        const data = await res.json();
        const resObj = data.result;

        if (resObj.action === 'started') {
          showToast(`🟢 เริ่มบันทึก: ${activity.emoji} ${activity.name}`);
        } else if (resObj.action === 'switched') {
          const closed = resObj.closedSession;
          const dur = closed ? formatThaiDuration(closed.duration_minutes) : '';
          showToast(`⚡ สลับไป ${activity.emoji} ${activity.name} (บันทึก ${closed?.activity_name || 'กิจกรรมก่อนหน้า'} ${dur} เรียบร้อย)`);
        } else if (resObj.action === 'stopped') {
          const dur = resObj.closedSession ? formatThaiDuration(resObj.closedSession.duration_minutes) : '';
          showToast(`⏹️ หยุดจับเวลา: ${activity.emoji} ${activity.name} (รวม ${dur})`);
        }

        await fetchData(false);
      } else {
        const err = await res.json();
        showToast(err.error || 'เกิดข้อผิดพลาดในการบันทึกเวลา');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setPunchingId(null);
    }
  };

  // Stop Active Session
  const handleStop = async () => {
    if (!activeSession || punchingId) return;
    setPunchingId('stop');

    try {
      const res = await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });

      if (res.ok) {
        const data = await res.json();
        const closed = data.result?.closedSession;
        const dur = closed ? formatThaiDuration(closed.duration_minutes) : '';
        showToast(`⏹️ บันทึกเสร็จสิ้น: ${closed?.activity_name || ''} (${dur})`);
        await fetchData(false);
      } else {
        showToast('เกิดข้อผิดพลาดในการหยุดจับเวลา');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setPunchingId(null);
    }
  };

  // Resolve Stale Session (cut at specified time e.g. 01:00 AM, optionally log sleep)
  const handleResolveStale = async (customEndTime = '01:00', addSleepBlock = true) => {
    if (!activeSession || punchingId) return;
    setPunchingId('resolve');

    try {
      const res = await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve_stale',
          customEndTime,
          note: `ตัดจบเมื่อ ${customEndTime} น. (เผลอหลับ/ลืมปิด)`,
          addSleepBlock,
        }),
      });

      if (res.ok) {
        showToast(`✂️ ตัดจบเวลา ${customEndTime} น. และบันทึกเวลานอนเรียบร้อย`);
        await fetchData(false);
      } else {
        showToast('เกิดข้อผิดพลาดในการตัดจบเวลา');
      }
    } catch (e) {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setPunchingId(null);
    }
  };

  // Save Manual Log
  const handleSaveManualLog = async (e) => {
    e.preventDefault();
    if (!manualForm.activityId) {
      showToast('กรุณาเลือกกิจกรรม');
      return;
    }

    try {
      const res = await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manual_add',
          ...manualForm,
        }),
      });

      if (res.ok) {
        showToast('✨ บันทึกเวลากิจกรรมย้อนหลังสำเร็จ');
        setShowManualModal(false);
        setManualForm({
          activityId: activities[0]?.id || '',
          date: todayStr,
          startTime: '09:00',
          endTime: '10:00',
          durationMinutes: 60,
          note: '',
        });
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error || 'บันทึกไม่สำเร็จ');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  // Update Log
  const handleUpdateLog = async (e) => {
    e.preventDefault();
    if (!editingLog) return;

    try {
      const res = await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_log',
          id: editingLog.id,
          fields: editLogForm,
        }),
      });

      if (res.ok) {
        showToast('แก้ไขข้อมูลบันทึกเวลาสำเร็จ');
        setShowEditLogModal(false);
        setEditingLog(null);
        fetchData();
      } else {
        showToast('เกิดข้อผิดพลาดในการแก้ไข');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  // Delete Log
  const handleDeleteLog = async (id, actName) => {
    if (!confirm(`คุณต้องการลบรายการ "${actName}" หรือไม่?`)) return;

    try {
      const res = await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_log', id }),
      });

      if (res.ok) {
        showToast('ลบรายการสำเร็จ');
        fetchData();
      } else {
        showToast('เกิดข้อผิดพลาดในการลบ');
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาด');
    }
  };

  // Save Activity (Add / Update)
  const handleSaveActivity = async (e) => {
    e.preventDefault();
    if (!activityForm.name.trim()) {
      showToast('กรุณาระบุชื่อกิจกรรม');
      return;
    }

    try {
      if (editingActivity) {
        const res = await fetch('/api/tracker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_activity',
            id: editingActivity.id,
            fields: activityForm,
          }),
        });

        if (res.ok) {
          showToast('แก้ไขหมวดกิจกรรมสำเร็จ');
          setShowActivityModal(false);
          setEditingActivity(null);
          fetchData();
        }
      } else {
        const res = await fetch('/api/tracker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_activity',
            ...activityForm,
          }),
        });

        if (res.ok) {
          showToast('เพิ่มหมวดกิจกรรมใหม่สำเร็จ');
          setShowActivityModal(false);
          setActivityForm({ name: '', emoji: '⚡', color: '#64d2ff', description: '' });
          fetchData();
        }
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการบันทึกกิจกรรม');
    }
  };

  // Filter heatmaps
  const filteredHeatmaps = heatmaps.filter((hm) => {
    if (selectedHeatmapCategory !== 'ALL' && hm.activity.id !== Number(selectedHeatmapCategory)) {
      return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'rgba(15, 20, 28, 0.96)',
            border: '1px solid #30d158',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.92rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          <span>⏱️</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Floating Heatmap Cell Tooltip */}
      {hoveredCell && (
        <div
          style={{
            position: 'fixed',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y - 48}px`,
            transform: 'translateX(-50%)',
            background: 'rgba(15, 20, 28, 0.98)',
            border: `1px solid ${hoveredCell.color || 'rgba(255,255,255,0.2)'}`,
            borderRadius: '8px',
            padding: '6px 12px',
            color: '#fff',
            fontSize: '0.78rem',
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ fontWeight: '700', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>{hoveredCell.emoji}</span>
            <span>{hoveredCell.activityName}</span>
          </div>
          <div style={{ color: '#aeaeb2' }}>
            {formatThaiDate(hoveredCell.date)} ({hoveredCell.thaiDay}):{' '}
            <strong style={{ color: hoveredCell.minutes > 0 ? '#30d158' : '#8e8e93' }}>
              {hoveredCell.minutes > 0 ? formatThaiDuration(hoveredCell.minutes) : 'ไม่ได้ทำ'}
            </strong>
            {hoveredCell.count > 0 && ` • ${hoveredCell.count} ครั้ง`}
          </div>
        </div>
      )}

      {/* TOP HERO PUNCH-CLOCK & STATE CONTROLLER */}
      <section
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '18px',
          background: activeSession
            ? `linear-gradient(135deg, ${activeSession.color || '#64d2ff'}18 0%, rgba(20, 24, 33, 0.9) 100%)`
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(20, 24, 33, 0.85) 100%)',
          border: activeSession
            ? `1px solid ${activeSession.color || '#64d2ff'}60`
            : '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: activeSession ? `0 10px 30px ${activeSession.color || '#64d2ff'}15` : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Title Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '1.4rem' }}>⏱️</span>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#fff', margin: 0 }}>
                Daily Tracker (บันทึกเวลา & วินัยกิจกรรม)
              </h2>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#8e8e93', margin: 0, lineHeight: '1.5' }}>
              สลับสเตตัสกิจกรรมอัตโนมัติ • กดเริ่มได้ทันที ระบบจะปิดและบันทึกช่วงเวลาของกิจกรรมเดิมให้เอง • Heatmap แสดงความสม่ำเสมอแยกหมวด
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setManualForm({
                  activityId: activities[0]?.id || '',
                  date: todayStr,
                  startTime: '09:00',
                  endTime: '10:00',
                  durationMinutes: 60,
                  note: '',
                });
                setShowManualModal(true);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
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
              <span>บันทึกย้อนหลัง (Manual)</span>
            </button>

            <button
              onClick={() => {
                setEditingActivity(null);
                setActivityForm({ name: '', emoji: '⚡', color: '#64d2ff', description: '' });
                setShowActivityModal(true);
              }}
              style={{
                background: 'rgba(100, 210, 255, 0.15)',
                color: '#64d2ff',
                border: '1px solid rgba(100, 210, 255, 0.3)',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              + หมวดกิจกรรม
            </button>

            <button
              onClick={() => fetchData(true)}
              title="รีเฟรชข้อมูล"
              style={{
                background: 'transparent',
                color: '#8e8e93',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '7px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              🔄
            </button>
          </div>
        </div>

        {/* STALE OVERNIGHT WARNING BANNER */}
        {activeSession && activeSession.isStale && (
          <div
            style={{
              background: 'rgba(255, 69, 58, 0.12)',
              border: '1px solid rgba(255, 69, 58, 0.45)',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.3rem' }}>⚠️</span>
              <div>
                <strong style={{ color: '#ff453a', fontSize: '0.92rem' }}>
                  ตรวจพบกิจกรรมเปิดค้างข้ามคืน / นานผิดปกติ (ผ่านไป {formatThaiDuration(activeSession.elapsedMinutes)})
                </strong>
                <div style={{ fontSize: '0.78rem', color: '#aeaeb2', marginTop: '2px' }}>
                  เริ่มตั้งแต่: {activeSession.date} เวลา {formatTimeOnly(activeSession.start_time)} น. (หากคุณเผลอหลับ สามารถเลือกตัดจบเวลาได้ทันทีด้านล่าง ระบบจะบันทึกเวลานอนต่อให้เอง)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '4px' }}>
              <span style={{ fontSize: '0.78rem', color: '#8e8e93', fontWeight: '600' }}>ตัดจบด่วน:</span>
              <button
                onClick={() => handleResolveStale('01:00', true)}
                style={{
                  background: 'rgba(255, 69, 58, 0.2)',
                  border: '1px solid #ff453a',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                ✂️ ตัดจบตอนตี 1 (01:00 น.) + เซฟเวลานอน
              </button>
              <button
                onClick={() => handleResolveStale('00:00', true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                ✂️ ตัดจบเที่ยงคืน (00:00 น.)
              </button>
              <button
                onClick={() => handleStop()}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#aeaeb2',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                ⏹️ จบ ณ เวลาปัจจุบัน
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE TIMER BANNER */}
        {activeSession ? (
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.45)',
              border: `1px solid ${activeSession.color || '#64d2ff'}40`,
              borderRadius: '14px',
              padding: '18px 22px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '14px',
                  background: `${activeSession.color || '#64d2ff'}25`,
                  border: `2px solid ${activeSession.color || '#64d2ff'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.6rem',
                  boxShadow: `0 0 20px ${activeSession.color || '#64d2ff'}40`,
                  animation: 'pulse 2s infinite',
                }}
              >
                {activeSession.emoji || '⚡'}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#30d158',
                      boxShadow: '0 0 10px #30d158',
                    }}
                  />
                  <span style={{ fontSize: '0.8rem', fontWeight: '700', color: activeSession.color || '#64d2ff', textTransform: 'uppercase' }}>
                    กำลังบันทึกเวลา
                  </span>
                </div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#fff', margin: '0 0 4px 0' }}>
                  {activeSession.activity_name}
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#8e8e93' }}>
                  เริ่มเมื่อ: <strong style={{ color: '#fff' }}>{formatTimeOnly(activeSession.start_time)} น.</strong> (วันนี้)
                  {activeSession.note && ` • "${activeSession.note}"`}
                </div>
              </div>
            </div>

            {/* LIVE DIGITAL CLOCK & STOP BUTTON */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '2rem',
                    fontWeight: '800',
                    color: '#fff',
                    letterSpacing: '2px',
                    textShadow: `0 0 16px ${activeSession.color || '#64d2ff'}60`,
                  }}
                >
                  {formatTimerClock(liveElapsedSeconds)}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#8e8e93' }}>
                  ผ่านไปแล้ว {formatThaiDuration(Math.floor(liveElapsedSeconds / 60))}
                </div>
              </div>

              <button
                onClick={handleStop}
                disabled={punchingId === 'stop'}
                style={{
                  background: 'rgba(255, 69, 58, 0.15)',
                  color: '#ff453a',
                  border: '1px solid rgba(255, 69, 58, 0.4)',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  cursor: punchingId === 'stop' ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>⏹️</span>
                <span>{punchingId === 'stop' ? 'กำลังบันทึก...' : 'หยุดจับเวลา / พัก'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px dashed rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div style={{ fontSize: '1.5rem', opacity: 0.7 }}>⚪</div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#fff', marginBottom: '2px' }}>
                สถานะปัจจุบัน: ว่าง / ยังไม่ได้เริ่มจับเวลา
              </div>
              <div style={{ fontSize: '0.8rem', color: '#8e8e93' }}>
                คลิกเลือกกิจกรรมด้านล่างเพื่อเริ่มจับเวลา ระบบจะสลับและบันทึกช่วงเวลาให้อัตโนมัติเมื่อเปลี่ยนกิจกรรม
              </div>
            </div>
          </div>
        )}

        {/* ONE-CLICK STATE SWITCHER GRID */}
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#aeaeb2', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ⚡ เลือกกิจกรรมเพื่อเริ่มหรือสลับทันที:
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '10px',
            }}
          >
            {activities.map((act) => {
              const isActive = activeSession && activeSession.activity_id === act.id;
              const isPunching = punchingId === act.id;

              return (
                <button
                  key={act.id}
                  onClick={() => handlePunch(act)}
                  disabled={Boolean(punchingId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: isActive
                      ? `linear-gradient(135deg, ${act.color}35 0%, rgba(20, 24, 33, 0.95) 100%)`
                      : 'rgba(255, 255, 255, 0.04)',
                    border: isActive ? `1.5px solid ${act.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: isActive ? `0 0 16px ${act.color}30` : 'none',
                    cursor: punchingId ? 'wait' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.18s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <span style={{ fontSize: '1.4rem' }}>{act.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.88rem',
                        fontWeight: '700',
                        color: isActive ? '#fff' : '#f5f5f7',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {act.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: isActive ? act.color : '#8e8e93', marginTop: '2px' }}>
                      {isActive ? '● กำลังทำ (กดเพื่อหยุด)' : 'คลิกเพื่อเริ่ม'}
                    </div>
                  </div>

                  {isActive && (
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: act.color,
                        boxShadow: `0 0 8px ${act.color}`,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mini Meta Badges */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.78rem', color: '#8e8e93', paddingTop: '4px' }}>
          <div>
            เวลารวมที่บันทึกวันนี้: <strong style={{ color: '#fff' }}>{todayStats.totalFormatted}</strong>
          </div>
          <div>•</div>
          <div>
            จำนวนรอบวันนี้: <strong style={{ color: '#ffd60a' }}>{todayLogs.length} รอบ</strong>
          </div>
          <div>•</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#30d158' }}>
            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#30d158' }} />
            <span>Google Sheets Auto-Sync (Silent Redundancy)</span>
          </div>
          <div>•</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64d2ff' }}>
            <span>⚡</span>
            <span>Auto-Tracker เปิดใช้งาน (ตรวจจับ Dota 2 & เกม Steam อัตโนมัติ + ตัดจบเมื่อหลับเกิน 40 นาที)</span>
          </div>
        </div>
      </section>

      {/* TODAY'S TIME DISTRIBUTION BAR & RECENT LOGS */}
      <section
        className="glass-panel"
        style={{
          padding: '20px',
          borderRadius: '16px',
          background: 'rgba(20, 24, 33, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.1rem' }}>📊</span>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#fff', margin: 0 }}>
              สัดส่วนเวลาวันนี้ (Today's Time Distribution)
            </h3>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#8e8e93' }}>
            รวมวันนี้: <strong style={{ color: '#30d158' }}>{todayStats.totalFormatted}</strong>
          </div>
        </div>

        {/* Stacked Proportional Bar */}
        {todayStats.breakdown.length > 0 ? (
          <div>
            <div
              style={{
                width: '100%',
                height: '14px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.06)',
                overflow: 'hidden',
                display: 'flex',
                marginBottom: '10px',
              }}
            >
              {todayStats.breakdown.map((b) => (
                <div
                  key={b.activity_id}
                  title={`${b.name}: ${b.formatted} (${b.percentage}%)`}
                  style={{
                    width: `${b.percentage}%`,
                    height: '100%',
                    background: b.color || '#64d2ff',
                    transition: 'width 0.3s ease',
                  }}
                />
              ))}
            </div>

            {/* Breakdown Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {todayStats.breakdown.map((b) => (
                <div
                  key={b.activity_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${b.color || '#fff'}30`,
                    fontSize: '0.78rem',
                  }}
                >
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: b.color }} />
                  <span>{b.emoji}</span>
                  <span style={{ fontWeight: '600', color: '#fff' }}>{b.name}</span>
                  <span style={{ color: '#8e8e93' }}>
                    {b.formatted} ({b.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.85rem', color: '#8e8e93', textAlign: 'center', padding: '10px 0' }}>
            ยังไม่มีบันทึกเวลาสำหรับวันนี้ เริ่มต้นด้วยการกดกิจกรรมด้านบนได้เลย
          </div>
        )}

        {/* TODAY'S TIMELINE LOGS */}
        {todayLogs.length > 0 && (
          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '14px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#aeaeb2', marginBottom: '10px' }}>
              ไทม์ไลน์บันทึกเวลาวันนี้ ({todayLogs.length} รายการ):
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {todayLogs.map((log) => {
                const isOngoing = !log.end_time;
                const dur = isOngoing
                  ? Math.floor(liveElapsedSeconds / 60)
                  : log.duration_minutes;

                return (
                  <div
                    key={log.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: isOngoing ? 'rgba(48, 209, 88, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: isOngoing ? '1px solid rgba(48, 209, 88, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '1.1rem' }}>{log.emoji || '⚡'}</span>
                      <div>
                        <strong style={{ color: '#fff' }}>{log.activity_name}</strong>
                        {log.note && <span style={{ color: '#8e8e93', marginLeft: '6px' }}>— {log.note}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <span style={{ color: '#8e8e93', fontFamily: 'monospace' }}>
                        {formatTimeOnly(log.start_time)} - {isOngoing ? 'ปัจจุบัน' : formatTimeOnly(log.end_time)}
                      </span>

                      <span
                        style={{
                          fontWeight: '700',
                          color: isOngoing ? '#30d158' : '#fff',
                          background: isOngoing ? 'rgba(48, 209, 88, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.76rem',
                        }}
                      >
                        {formatThaiDuration(dur)}
                      </span>

                      {!isOngoing && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => {
                              setEditingLog(log);
                              setEditLogForm({
                                activity_id: log.activity_id,
                                date: log.date,
                                start_time: log.start_time,
                                end_time: log.end_time,
                                duration_minutes: log.duration_minutes,
                                note: log.note || '',
                              });
                              setShowEditLogModal(true);
                            }}
                            title="แก้ไขบันทึกนี้"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#8e8e93',
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteLog(log.id, log.activity_name)}
                            title="ลบบันทึกนี้"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ff453a',
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* CATEGORY HEATMAPS SECTION (THE CORE HABIT & DISCIPLINE VISUALIZER) */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.25rem' }}>🗓️</span>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#fff', margin: 0 }}>
                Activity Heatmaps (ความเข้มข้นวินัยรายวันแยกตามหัวข้อ)
              </h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#8e8e93', margin: '4px 0 0 0' }}>
              แสดงชั่วโมงที่ใช้จริงในแต่ละกิจกรรมย้อนหลัง {daysCount} วัน • สไตล์ GitHub Contribution เพื่อตรวจสอบวินัยว่าทำจริงไหม
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Range Toggle */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px', border: '1px solid rgba(255,255,255,0.1)' }}>
              {[30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDaysCount(d)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: daysCount === d ? '#64d2ff' : 'transparent',
                    color: daysCount === d ? '#000' : '#8e8e93',
                    fontSize: '0.76rem',
                    fontWeight: daysCount === d ? '700' : 'normal',
                    cursor: 'pointer',
                  }}
                >
                  {d} วัน
                </button>
              ))}
            </div>

            {/* Category Filter Pills */}
            <select
              value={selectedHeatmapCategory}
              onChange={(e) => setSelectedHeatmapCategory(e.target.value)}
              style={{
                background: '#1a1d26',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '5px 10px',
                borderRadius: '8px',
                fontSize: '0.78rem',
              }}
            >
              <option value="ALL">ทุกหมวดกิจกรรม</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Heatmaps List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredHeatmaps.map((hm) => {
            const act = hm.activity;
            const stats = hm.stats;

            return (
              <div
                key={act.id}
                className="glass-panel"
                style={{
                  padding: '20px',
                  borderRadius: '16px',
                  background: 'rgba(20, 24, 33, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Header row: Activity Info + Quick Stats */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: `${act.color}25`,
                        border: `1px solid ${act.color}60`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                      }}
                    >
                      {act.emoji}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#fff', margin: 0 }}>
                        {act.name}
                      </h4>
                      {act.description && (
                        <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>{act.description}</span>
                      )}
                    </div>
                  </div>

                  {/* Stats Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                    <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '4px 10px', borderRadius: '6px' }}>
                      <span style={{ color: '#8e8e93' }}>วันนี้: </span>
                      <strong style={{ color: stats.todayMinutes > 0 ? '#30d158' : '#fff' }}>
                        {stats.todayFormatted}
                      </strong>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '4px 10px', borderRadius: '6px' }}>
                      <span style={{ color: '#8e8e93' }}>7 วัน: </span>
                      <strong style={{ color: act.color }}>{stats.sevenDayFormatted}</strong>
                      <span style={{ color: '#636e7b', marginLeft: '4px' }}>({stats.sevenDayAvgHours} ชม./วัน)</span>
                    </div>

                    <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '4px 10px', borderRadius: '6px' }}>
                      <span style={{ color: '#8e8e93' }}>30 วัน: </span>
                      <strong style={{ color: '#ffd60a' }}>{stats.thirtyDayFormatted}</strong>
                    </div>

                    {stats.streak > 0 && (
                      <div
                        style={{
                          background: 'rgba(255, 214, 10, 0.12)',
                          color: '#ffd60a',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontWeight: '700',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>🔥</span>
                        <span>{stats.streak} วันติด</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* The Heatmap Grid */}
                <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridAutoFlow: 'column',
                      gridTemplateRows: 'repeat(7, 13px)',
                      gap: '4px',
                      width: 'fit-content',
                    }}
                  >
                    {hm.days.map((day, idx) => {
                      // Intensity style
                      let bg = 'rgba(255, 255, 255, 0.05)';
                      let border = '1px solid rgba(255, 255, 255, 0.04)';
                      let boxShadow = 'none';

                      if (day.intensity === 1) {
                        bg = `${act.color}35`;
                        border = `1px solid ${act.color}50`;
                      } else if (day.intensity === 2) {
                        bg = `${act.color}65`;
                        border = `1px solid ${act.color}80`;
                      } else if (day.intensity === 3) {
                        bg = `${act.color}95`;
                        border = `1px solid ${act.color}`;
                      } else if (day.intensity === 4) {
                        bg = act.color;
                        border = `1px solid #fff`;
                        boxShadow = `0 0 6px ${act.color}`;
                      }

                      if (day.isToday) {
                        border = '1px solid #fff';
                      }

                      return (
                        <div
                          key={day.date}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
                            setHoveredCell({
                              ...day,
                              activityName: act.name,
                              emoji: act.emoji,
                              color: act.color,
                            });
                          }}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{
                            width: '13px',
                            height: '13px',
                            borderRadius: '3px',
                            background: bg,
                            border,
                            boxShadow,
                            cursor: 'pointer',
                            transition: 'transform 0.1s ease',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Heatmap Legend */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#636e7b' }}>
                  <span>น้อย (0 น.)</span>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(255, 255, 255, 0.05)' }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: `${act.color}35` }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: `${act.color}65` }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: `${act.color}95` }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: act.color }} />
                  <span>มาก (5+ ชม.)</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* MODAL 1: MANUAL ADD LOG */}
      {showManualModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            backdropFilter: 'blur(6px)',
            padding: '16px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              borderRadius: '16px',
              background: '#1a1d26',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff', margin: 0 }}>
                ⏱️ บันทึกเวลากิจกรรมย้อนหลัง
              </h3>
              <button
                onClick={() => setShowManualModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#8e8e93', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveManualLog} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  เลือกกิจกรรม *
                </label>
                <select
                  required
                  value={manualForm.activityId}
                  onChange={(e) => setManualForm({ ...manualForm, activityId: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: '#12151d',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.88rem',
                  }}
                >
                  <option value="">-- กรุณาเลือก --</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.emoji} {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  วันที่ *
                </label>
                <input
                  type="date"
                  required
                  value={manualForm.date}
                  onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.88rem',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                    เวลาเริ่มต้น
                  </label>
                  <input
                    type="time"
                    value={manualForm.startTime}
                    onChange={(e) => setManualForm({ ...manualForm, startTime: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.88rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                    เวลาสิ้นสุด
                  </label>
                  <input
                    type="time"
                    value={manualForm.endTime}
                    onChange={(e) => setManualForm({ ...manualForm, endTime: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.88rem',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  หรือระบุระยะเวลาตรง ๆ (นาที)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="เช่น 60, 120"
                  value={manualForm.durationMinutes}
                  onChange={(e) => setManualForm({ ...manualForm, durationMinutes: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.88rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  โน้ต / บันทึกย่อ (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  placeholder="เช่น ตัดต่อคลิป EP.2, เทรดทองคำ"
                  value={manualForm.note}
                  onChange={(e) => setManualForm({ ...manualForm, note: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.88rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
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
                    background: '#64d2ff',
                    color: '#000',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  บันทึกเวลา
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT LOG */}
      {showEditLogModal && editingLog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            backdropFilter: 'blur(6px)',
            padding: '16px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
              borderRadius: '16px',
              background: '#1a1d26',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff', margin: 0 }}>
                ✏️ แก้ไขบันทึกเวลา #{editingLog.id}
              </h3>
              <button
                onClick={() => setShowEditLogModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#8e8e93', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateLog} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  กิจกรรม
                </label>
                <select
                  value={editLogForm.activity_id}
                  onChange={(e) => setEditLogForm({ ...editLogForm, activity_id: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: '#12151d',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.88rem',
                  }}
                >
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.emoji} {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  ระยะเวลา (นาที)
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={editLogForm.duration_minutes}
                  onChange={(e) => setEditLogForm({ ...editLogForm, duration_minutes: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.88rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  โน้ต
                </label>
                <input
                  type="text"
                  value={editLogForm.note}
                  onChange={(e) => setEditLogForm({ ...editLogForm, note: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.88rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditLogModal(false)}
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
                    background: '#64d2ff',
                    color: '#000',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD / EDIT ACTIVITY CATEGORY */}
      {showActivityModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            backdropFilter: 'blur(6px)',
            padding: '16px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
              borderRadius: '16px',
              background: '#1a1d26',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#fff', margin: 0 }}>
                {editingActivity ? '⚙️ แก้ไขหมวดกิจกรรม' : '✨ เพิ่มหมวดกิจกรรมใหม่'}
              </h3>
              <button
                onClick={() => setShowActivityModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#8e8e93', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveActivity} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                    ไอคอน
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={activityForm.emoji}
                    onChange={(e) => setActivityForm({ ...activityForm, emoji: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '1.2rem',
                      textAlign: 'center',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                    ชื่อกิจกรรม *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น วิจัย EA, นั่งสมาธิ"
                    value={activityForm.name}
                    onChange={(e) => setActivityForm({ ...activityForm, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.88rem',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  สีประจำกิจกรรม (Hex)
                </label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={activityForm.color}
                    onChange={(e) => setActivityForm({ ...activityForm, color: e.target.value })}
                    style={{
                      width: '40px',
                      height: '38px',
                      padding: 0,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                  />
                  <input
                    type="text"
                    value={activityForm.color}
                    onChange={(e) => setActivityForm({ ...activityForm, color: e.target.value })}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.88rem',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#aeaeb2', marginBottom: '5px' }}>
                  คำอธิบายเพิ่มเติม
                </label>
                <input
                  type="text"
                  placeholder="เช่น รูทีนก่อนนอน, เป้าหมายฝึกจิตใจ"
                  value={activityForm.description}
                  onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.88rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowActivityModal(false)}
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
                    background: '#64d2ff',
                    color: '#000',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {editingActivity ? 'บันทึกการแก้ไข' : 'สร้างหมวดกิจกรรม'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
