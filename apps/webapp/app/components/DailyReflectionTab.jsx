'use client';

import { useState, useEffect } from 'react';

export default function DailyReflectionTab() {
  const [todayData, setTodayData] = useState({
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
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchReflectionData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/reflections');
      if (res.ok) {
        const data = await res.json();
        setTodayData({
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

  useEffect(() => {
    fetchReflectionData();
    // Auto-refresh every 6 seconds to reflect Telegram updates
    const interval = setInterval(() => {
      fetch('/api/reflections')
        .then((r) => r.json())
        .then((data) => {
          if (data && data.today) {
            setHistory(data.history || []);
            setStats(data.stats || {});
          }
        })
        .catch(() => {});
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveToday = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: stats.todayStr,
          luck_text: todayData.luck_text,
          finish_text: todayData.finish_text,
          next_day_text: todayData.next_day_text,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.stats) setStats(json.stats);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        fetchReflectionData();
      }
    } catch (err) {
      console.error('Error saving reflection:', err);
    } finally {
      setSaving(false);
    }
  };

  const isTodayComplete = Boolean(
    (todayData.luck_text && todayData.luck_text.trim()) ||
    (todayData.finish_text && todayData.finish_text.trim()) ||
    (todayData.next_day_text && todayData.next_day_text.trim())
  );

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '10px 0 50px 0' }}>
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
            จดบันทึกความโชคดี 1 เรื่องต่อวัน • ทบทวนสิ่งที่ทำเสร็จ • วางเป้าหมายลุยวันพรุ่งนี้ (บอทเตือน 23:00 น.)
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

        {/* Today's Status */}
        <div
          className="glass-panel"
          style={{
            padding: '18px',
            borderRadius: '14px',
            background: 'rgba(15, 17, 23, 0.8)',
            border: `1px solid ${isTodayComplete ? 'rgba(48, 209, 88, 0.3)' : 'rgba(100, 210, 255, 0.25)'}`,
          }}
        >
          <div style={{ fontSize: '12px', color: '#a0aec0', marginBottom: '6px', fontWeight: '600' }}>
            📅 วันนี้ ({stats.todayStr || 'Today'})
          </div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: isTodayComplete ? '#30d158' : '#64d2ff', marginTop: '4px' }}>
            {isTodayComplete ? '✅ บันทึกแล้ว' : '⏳ รอสรุป 23:00 น.'}
          </div>
          <div style={{ fontSize: '11px', color: '#718096', marginTop: '6px' }}>
            {isTodayComplete ? 'บอทจะไม่รบกวนตอน 5 ทุ่ม' : 'บอทจะเตือนหากยังไม่บันทึก'}
          </div>
        </div>
      </div>

      {/* 3. Today's Triple Column Editor Deck */}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>
              📝 บันทึกทบทวนประจำวัน ({stats.todayStr})
            </h2>
            <span style={{ fontSize: '12px', color: '#a0aec0' }}>
              พิมพ์แก้ไขได้จากตรงนี้ หรือพิมพ์ใน Telegram Bot ด้วยตัวย่อ <code>dl</code>, <code>f</code>, <code>ndl</code>
            </span>
          </div>

          <button
            onClick={handleSaveToday}
            disabled={saving}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              background: saveSuccess ? '#30d158' : 'linear-gradient(135deg, #0a84ff 0%, #0066cc 100%)',
              color: '#fff',
              border: 'none',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            {saving ? '⏳ กำลังบันทึก...' : saveSuccess ? '✅ บันทึกสำเร็จ!' : '💾 บันทึกข้อมูล'}
          </button>
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
              value={todayData.luck_text}
              onChange={(e) => setTodayData({ ...todayData, luck_text: e.target.value })}
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
              value={todayData.finish_text}
              onChange={(e) => setTodayData({ ...todayData, finish_text: e.target.value })}
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
              value={todayData.next_day_text}
              onChange={(e) => setTodayData({ ...todayData, next_day_text: e.target.value })}
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

      {/* 4. Historical Archive & Timeline */}
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
          <span style={{ fontSize: '12px', color: '#718096' }}>คลังสะสมความโชคดีและความสำเร็จ</span>
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#718096', fontSize: '14px' }}>
            ยังไม่มีบันทึกย้อนหลัง เริ่มต้นบันทึกวันแรกได้เลยครับ! 🌟
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {history.map((item) => (
              <div
                key={item.id || item.date}
                style={{
                  background: 'rgba(20, 24, 33, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 1fr 1fr',
                  gap: '16px',
                  alignItems: 'start',
                }}
              >
                {/* Date */}
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: '#fff' }}>{item.date}</div>
                  <div style={{ fontSize: '11px', color: '#718096', marginTop: '2px' }}>
                    {item.is_completed ? '✅ บันทึกแล้ว' : '⏳ ไม่สมบูรณ์'}
                  </div>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
