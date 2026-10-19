'use client';

import { useState, useEffect } from 'react';

export default function DailyReflectionTab() {
  const [selectedDate, setSelectedDate] = useState('');
  const [todayStr, setTodayStr] = useState('');
  const [logicalDate, setLogicalDate] = useState('');
  const [formData, setFormData] = useState({
    luck_text: '',
    finish_text: '',
    next_day_text: '',
  });
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({
    todayStr: '',
    totalEntries: 0,
    totalLuckCount: 0,
    totalFinishCount: 0,
    currentStreak: 0,
    isTodayCompleted: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg, duration = 3500) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), duration);
  };

  // Helper to get yesterday's date string
  const getYesterdayStr = (baseDateStr) => {
    try {
      const d = baseDateStr ? new Date(baseDateStr) : new Date();
      d.setDate(d.getDate() - 1);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
    } catch (e) {
      return '';
    }
  };

  // Helper to shift date by +1 or -1
  const shiftDate = (dateStr, days) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d + days);
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(dateObj);
    } catch (e) {
      return dateStr;
    }
  };

  // Fetch data for a specific date
  const loadDateReflection = async (targetDate) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/reflections?date=${targetDate}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedDate(data.selectedDate || targetDate);
        setTodayStr(data.todayStr || '');
        setLogicalDate(data.logicalDate || data.todayStr);
        setFormData({
          luck_text: data.today?.luck_text || '',
          finish_text: data.today?.finish_text || '',
          next_day_text: data.today?.next_day_text || '',
        });
        setHistory(data.history || []);
        setStats(data.stats || {});
      }
    } catch (err) {
      console.error('Failed to load reflections:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetch('/api/reflections')
      .then((r) => r.json())
      .then((data) => {
        const initialDate = data.logicalDate || data.todayStr;
        setSelectedDate(initialDate);
        setTodayStr(data.todayStr || '');
        setLogicalDate(data.logicalDate || data.todayStr);
        setFormData({
          luck_text: data.today?.luck_text || '',
          finish_text: data.today?.finish_text || '',
          next_day_text: data.today?.next_day_text || '',
        });
        setHistory(data.history || []);
        setStats(data.stats || {});
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!selectedDate) return;
    try {
      setSaving(true);
      const res = await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          luck_text: formData.luck_text,
          finish_text: formData.finish_text,
          next_day_text: formData.next_day_text,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.stats) setStats(json.stats);
        showToast(`✅ บันทึกข้อมูลของวันที่ ${selectedDate} เรียบร้อยแล้ว!`);
        // Refresh history
        const hRes = await fetch('/api/reflections');
        if (hRes.ok) {
          const hData = await hRes.json();
          setHistory(hData.history || []);
        }
      } else {
        showToast('⚠️ เกิดข้อผิดพลาดในการบันทึก');
      }
    } catch (err) {
      console.error('Error saving reflection:', err);
      showToast('⚠️ บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleClearBoxes = () => {
    if (confirm(`ต้องการล้างข้อความในกล่องของวันที่ ${selectedDate} หรือไม่?`)) {
      setFormData({
        luck_text: '',
        finish_text: '',
        next_day_text: '',
      });
      showToast('🧹 ล้างข้อความในกล่องแล้ว (กดบันทึกหากต้องการลบออกจากระบบ)');
    }
  };

  const isCurrentSelectionCompleted = Boolean(
    (formData.luck_text && formData.luck_text.trim()) ||
    (formData.finish_text && formData.finish_text.trim()) ||
    (formData.next_day_text && formData.next_day_text.trim())
  );

  const isNightOwlTime = logicalDate && todayStr && logicalDate !== todayStr;
  const isSelectedYesterday = selectedDate === getYesterdayStr(todayStr);
  const isSelectedToday = selectedDate === todayStr;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '10px 0 50px 0', position: 'relative' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 9999,
            background: 'rgba(10, 20, 15, 0.95)',
            color: '#30d158',
            border: '1px solid #30d158',
            borderRadius: '12px',
            padding: '14px 20px',
            fontSize: '14px',
            fontWeight: '700',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 16px rgba(48, 209, 88, 0.3)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* 1. Header Banner */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(20, 22, 28, 0.95) 0%, rgba(10, 11, 15, 0.98) 100%)',
          border: '1px solid rgba(255, 214, 10, 0.25)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '28px' }}>🍀</span>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>
              Daily Luck & Finish Dashboard
            </h1>
            <span
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 214, 10, 0.15)',
                color: '#ffd60a',
                border: '1px solid rgba(255, 214, 10, 0.3)',
                fontWeight: '600',
              }}
            >
              TELEGRAM SYNC
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#a0aec0', lineHeight: '1.6' }}>
            จดบันทึกความโชคดี 1 เรื่องต่อวัน • ทบทวนสิ่งที่ทำเสร็จ • วางเป้าหมายลุยวันพรุ่งนี้
            {isNightOwlTime && (
              <span style={{ color: '#64d2ff', marginLeft: '8px', fontWeight: '600' }}>
                🌙 โหมดรอบดึก: หลังเที่ยงคืนระบบจะนับเป็นของเมื่อวานให้อัตโนมัติ
              </span>
            )}
          </p>
        </div>

        {/* Telegram Shortcut Pill */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#cbd5e0',
            lineHeight: '1.5',
          }}
        >
          <div style={{ color: '#64d2ff', fontWeight: '700', marginBottom: '4px' }}>⚡ พิมพ์ในบอทสั้นๆ:</div>
          <div><code>dl</code> [เรื่องโชคดี] • <code>f</code> [สิ่งที่ทำเสร็จ] • <code>ndl</code> [ลุยพรุ่งนี้]</div>
        </div>
      </div>

      {/* 2. Executive Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* Streak */}
        <div
          className="glass-panel"
          style={{
            padding: '18px',
            borderRadius: '14px',
            background: 'rgba(15, 17, 23, 0.8)',
            border: '1px solid rgba(255, 69, 58, 0.25)',
          }}
        >
          <div style={{ fontSize: '12px', color: '#a0aec0', marginBottom: '6px', fontWeight: '600' }}>
            🔥 REFLECTION STREAK
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#ff453a' }}>
            {stats.currentStreak || 0} <span style={{ fontSize: '14px', fontWeight: '500', color: '#a0aec0' }}>วันติด</span>
          </div>
          <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>ความต่อเนื่องในการสรุปวัน</div>
        </div>

        {/* Total Luck Dumped */}
        <div
          className="glass-panel"
          style={{
            padding: '18px',
            borderRadius: '14px',
            background: 'rgba(15, 17, 23, 0.8)',
            border: '1px solid rgba(255, 214, 10, 0.25)',
          }}
        >
          <div style={{ fontSize: '12px', color: '#a0aec0', marginBottom: '6px', fontWeight: '600' }}>
            🍀 TOTAL LUCK RECORDED
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#ffd60a' }}>
            {stats.totalLuckCount || 0} <span style={{ fontSize: '14px', fontWeight: '500', color: '#a0aec0' }}>เรื่อง</span>
          </div>
          <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>เรื่องดี ๆ ที่ดึงดูดเข้ามาในชีวิต</div>
        </div>

        {/* Finished Days */}
        <div
          className="glass-panel"
          style={{
            padding: '18px',
            borderRadius: '14px',
            background: 'rgba(15, 17, 23, 0.8)',
            border: '1px solid rgba(48, 209, 88, 0.25)',
          }}
        >
          <div style={{ fontSize: '12px', color: '#a0aec0', marginBottom: '6px', fontWeight: '600' }}>
            🏁 DAYS WITH FINISHED LIST
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#30d158' }}>
            {stats.totalFinishCount || 0} <span style={{ fontSize: '14px', fontWeight: '500', color: '#a0aec0' }}>วัน</span>
          </div>
          <div style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>วันที่บันทึกงานเสร็จสมบูรณ์</div>
        </div>

        {/* Selection Status */}
        <div
          className="glass-panel"
          style={{
            padding: '18px',
            borderRadius: '14px',
            background: 'rgba(15, 17, 23, 0.8)',
            border: `1px solid ${isCurrentSelectionCompleted ? 'rgba(48, 209, 88, 0.3)' : 'rgba(100, 210, 255, 0.25)'}`,
          }}
        >
          <div style={{ fontSize: '12px', color: '#a0aec0', marginBottom: '6px', fontWeight: '600' }}>
            📅 สถานะวันที่เลือก ({selectedDate || 'Select Date'})
          </div>
          <div style={{ fontSize: '18px', fontWeight: '800', color: isCurrentSelectionCompleted ? '#30d158' : '#64d2ff', marginTop: '4px' }}>
            {isCurrentSelectionCompleted ? '✅ มีข้อมูลบันทึกแล้ว' : '⏳ ยังว่างอยู่ (พร้อมบันทึก)'}
          </div>
          <div style={{ fontSize: '11px', color: '#718096', marginTop: '6px' }}>
            {isCurrentSelectionCompleted ? 'สามารถแก้ไขข้อความได้ตลอดเวลา' : 'พิมพ์เนื้อหาแล้วกดบันทึกได้เลย'}
          </div>
        </div>
      </div>

      {/* 3. Date Navigator Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '14px 20px',
          borderRadius: '14px',
          background: 'rgba(20, 24, 33, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Date Selector with Next / Prev */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => loadDateReflection(shiftDate(selectedDate, -1))}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
            }}
          >
            ◀ วันก่อนหน้า
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) loadDateReflection(e.target.value);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: '#000',
              border: '1px solid rgba(100, 210, 255, 0.3)',
              color: '#64d2ff',
              fontSize: '14px',
              fontWeight: '700',
              outline: 'none',
              cursor: 'pointer',
            }}
          />

          <button
            onClick={() => loadDateReflection(shiftDate(selectedDate, 1))}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
            }}
          >
            วันถัดไป ▶
          </button>
        </div>

        {/* Quick Jump Buttons: Yesterday / Today */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => loadDateReflection(getYesterdayStr(todayStr))}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: isSelectedYesterday ? 'rgba(255, 214, 10, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${isSelectedYesterday ? '#ffd60a' : 'rgba(255, 255, 255, 0.1)'}`,
              color: isSelectedYesterday ? '#ffd60a' : '#cbd5e0',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '700',
            }}
          >
            🌙 เมื่อวาน ({getYesterdayStr(todayStr)})
          </button>

          <button
            onClick={() => loadDateReflection(todayStr)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: isSelectedToday ? 'rgba(100, 210, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${isSelectedToday ? '#64d2ff' : 'rgba(255, 255, 255, 0.1)'}`,
              color: isSelectedToday ? '#64d2ff' : '#cbd5e0',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '700',
            }}
          >
            ☀️ วันนี้ ({todayStr})
          </button>
        </div>
      </div>

      {/* 4. Active Reflection Deck (3 Editable Cards) */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '16px',
          background: 'rgba(15, 18, 24, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: '32px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>
                📝 บันทึกทบทวนประจำวัน: <span style={{ color: '#64d2ff' }}>{selectedDate}</span>
              </h2>
              {isCurrentSelectionCompleted && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(48, 209, 88, 0.15)',
                    color: '#30d158',
                    border: '1px solid rgba(48, 209, 88, 0.3)',
                    fontWeight: '600',
                  }}
                >
                  บันทึกแล้ว
                </span>
              )}
            </div>
            <span style={{ fontSize: '12px', color: '#a0aec0' }}>
              กำลังจัดการข้อมูลของวันที่ {selectedDate} (แก้ไขได้ตลอดเวลา และสามารถสลับไปวันอื่นได้ที่แถบด้านบน)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleClearBoxes}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'rgba(255, 69, 58, 0.1)',
                color: '#ff453a',
                border: '1px solid rgba(255, 69, 58, 0.25)',
                fontWeight: '600',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="ล้างข้อความในกล่องทั้งหมด"
            >
              🧹 ล้างช่องกรอก
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 22px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0a84ff 0%, #0066cc 100%)',
                color: '#fff',
                border: 'none',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 16px rgba(10, 132, 255, 0.4)',
                transition: 'all 0.2s',
              }}
            >
              {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึกข้อมูล'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {/* Box 1: Dump Luck Daily (dl) */}
          <div
            style={{
              background: 'rgba(255, 214, 10, 0.04)',
              border: '1px solid rgba(255, 214, 10, 0.25)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '20px' }}>🍀</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#ffd60a' }}>Dump Luck Daily (dl)</div>
                <div style={{ fontSize: '11px', color: '#a0aec0' }}>วันนี้โชคดีเรื่องอะไร 1 เรื่อง?</div>
              </div>
            </div>
            <textarea
              value={formData.luck_text}
              onChange={(e) => setFormData({ ...formData, luck_text: e.target.value })}
              placeholder="พิมพ์เรื่องโชคดีวันนี้ 1 เรื่อง... (หรือพิมพ์ในบอท: dl ลูกค้าคอนเฟิร์มงานไว)"
              style={{
                width: '100%',
                flex: 1,
                minHeight: '120px',
                background: 'rgba(0, 0, 0, 0.6)',
                border: '1px solid rgba(255, 214, 10, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                color: '#fff',
                fontSize: '13px',
                lineHeight: '1.6',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Box 2: Finish List (f) */}
          <div
            style={{
              background: 'rgba(48, 209, 88, 0.04)',
              border: '1px solid rgba(48, 209, 88, 0.25)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '20px' }}>🏁</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#30d158' }}>Finish List (f)</div>
                <div style={{ fontSize: '11px', color: '#a0aec0' }}>วันนี้ทำอะไรเสร็จแล้วบ้าง?</div>
              </div>
            </div>
            <textarea
              value={formData.finish_text}
              onChange={(e) => setFormData({ ...formData, finish_text: e.target.value })}
              placeholder="• ตัดต่อคลิป EP.2 เสร็จแล้ว&#10;• วิดพื้นครบ 50 ที&#10;(หรือพิมพ์ในบอท: f ตัดต่อคลิปจบ)"
              style={{
                width: '100%',
                flex: 1,
                minHeight: '120px',
                background: 'rgba(0, 0, 0, 0.6)',
                border: '1px solid rgba(48, 209, 88, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                color: '#fff',
                fontSize: '13px',
                lineHeight: '1.6',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Box 3: Next Day Plan (ndl) */}
          <div
            style={{
              background: 'rgba(100, 210, 255, 0.04)',
              border: '1px solid rgba(100, 210, 255, 0.25)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '20px' }}>🚀</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#64d2ff' }}>Next Day Plan (ndl)</div>
                <div style={{ fontSize: '11px', color: '#a0aec0' }}>พรุ่งนี้จะทำอะไรต่อ?</div>
              </div>
            </div>
            <textarea
              value={formData.next_day_text}
              onChange={(e) => setFormData({ ...formData, next_day_text: e.target.value })}
              placeholder="• วางสตอรี่บอร์ดคลิปใหม่&#10;• จ่ายบิลค่าไฟ&#10;(หรือพิมพ์ในบอท: ndl เริ่มคลิปใหม่)"
              style={{
                width: '100%',
                flex: 1,
                minHeight: '120px',
                background: 'rgba(0, 0, 0, 0.6)',
                border: '1px solid rgba(100, 210, 255, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                color: '#fff',
                fontSize: '13px',
                lineHeight: '1.6',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
      </div>

      {/* 5. Historical Archive & Timeline */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '16px',
          background: 'rgba(12, 14, 19, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#fff', margin: 0 }}>
            📖 ประวัติการทบทวนย้อนหลัง ({history.length} วัน)
          </h2>
          <span style={{ fontSize: '12px', color: '#718096' }}>คลิกที่วันใดก็ได้เพื่อดึงขึ้นมาดูหรือแก้ไข</span>
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#718096', fontSize: '14px' }}>
            ยังไม่มีบันทึกย้อนหลัง เริ่มต้นบันทึกวันแรกได้เลยครับ! 🌟
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {history.map((item) => {
              const isSelectedRow = item.date === selectedDate;
              return (
                <div
                  key={item.id || item.date}
                  onClick={() => {
                    loadDateReflection(item.date);
                    window.scrollTo({ top: 300, behavior: 'smooth' });
                  }}
                  style={{
                    background: isSelectedRow ? 'rgba(30, 41, 59, 0.8)' : 'rgba(20, 24, 33, 0.6)',
                    border: `1px solid ${isSelectedRow ? 'rgba(100, 210, 255, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
                    borderRadius: '12px',
                    padding: '16px 20px',
                    display: 'grid',
                    gridTemplateColumns: '130px 1fr 1fr 1fr',
                    gap: '16px',
                    alignItems: 'start',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  title="คลิกเพื่อแก้ไขรายการของวันนี้"
                >
                  {/* Date & Badge */}
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: isSelectedRow ? '#64d2ff' : '#fff' }}>
                      {item.date}
                    </div>
                    <div style={{ fontSize: '11px', color: '#718096', marginTop: '2px' }}>
                      {item.is_completed ? '✅ บันทึกแล้ว' : '⏳ ไม่สมบูรณ์'}
                    </div>
                    {isSelectedRow && (
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: '6px',
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(100, 210, 255, 0.15)',
                          color: '#64d2ff',
                          fontWeight: '700',
                        }}
                      >
                        กำลังเปิดดู
                      </span>
                    )}
                  </div>

                  {/* Luck */}
                  <div>
                    <div style={{ fontSize: '11px', color: '#ffd60a', fontWeight: '700', marginBottom: '4px' }}>
                      🍀 เรื่องโชคดี (dl):
                    </div>
                    <div style={{ fontSize: '12px', color: '#e2e8f0', whiteSpace: 'pre-line', lineHeight: '1.5' }}>
                      {item.luck_text || <span style={{ color: '#4a5568' }}>-</span>}
                    </div>
                  </div>

                  {/* Finished */}
                  <div>
                    <div style={{ fontSize: '11px', color: '#30d158', fontWeight: '700', marginBottom: '4px' }}>
                      🏁 งานที่ทำเสร็จ (f):
                    </div>
                    <div style={{ fontSize: '12px', color: '#e2e8f0', whiteSpace: 'pre-line', lineHeight: '1.5' }}>
                      {item.finish_text || <span style={{ color: '#4a5568' }}>-</span>}
                    </div>
                  </div>

                  {/* Next Day */}
                  <div>
                    <div style={{ fontSize: '11px', color: '#64d2ff', fontWeight: '700', marginBottom: '4px' }}>
                      🚀 แผนวันพรุ่งนี้ (ndl):
                    </div>
                    <div style={{ fontSize: '12px', color: '#e2e8f0', whiteSpace: 'pre-line', lineHeight: '1.5' }}>
                      {item.next_day_text || <span style={{ color: '#4a5568' }}>-</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
