'use client';

import { useState, useEffect } from 'react';

const MOODS = {
  DISCIPLINED: {
    key: 'DISCIPLINED',
    label: 'มีวินัย / ตามแผนเป๊ะ',
    emoji: '🦁',
    color: '#30d158',
    bg: 'rgba(48, 209, 88, 0.15)',
    border: 'rgba(48, 209, 88, 0.4)',
  },
  CALM: {
    key: 'CALM',
    label: 'นิ่งสงบ / Flow State',
    emoji: '🧘',
    color: '#64d2ff',
    bg: 'rgba(100, 210, 255, 0.15)',
    border: 'rgba(100, 210, 255, 0.4)',
  },
  FOMO: {
    key: 'FOMO',
    label: 'FOMO / กลัวตกรถ / คันมือ',
    emoji: '😤',
    color: '#ff9f0a',
    bg: 'rgba(255, 159, 10, 0.15)',
    border: 'rgba(255, 159, 10, 0.4)',
  },
  REVENGE: {
    key: 'REVENGE',
    label: 'หัวร้อน / อยากเอาคืน (Revenge)',
    emoji: '😡',
    color: '#ff453a',
    bg: 'rgba(255, 69, 58, 0.15)',
    border: 'rgba(255, 69, 58, 0.4)',
  },
  FEAR: {
    key: 'FEAR',
    label: 'กลัว / ลังเล ไม่กล้ากด',
    emoji: '😰',
    color: '#bf5af2',
    bg: 'rgba(191, 90, 242, 0.15)',
    border: 'rgba(191, 90, 242, 0.4)',
  },
  TIRED: {
    key: 'TIRED',
    label: 'เหนื่อยล้า / ไม่มีสมาธิ',
    emoji: '😴',
    color: '#98989d',
    bg: 'rgba(152, 152, 157, 0.15)',
    border: 'rgba(152, 152, 157, 0.4)',
  },
};

const MONTH_NAMES_THAI = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export default function JournalTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [dailyMap, setDailyMap] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Active modal date
  const [activeDate, setActiveDate] = useState(null);
  const [modalForm, setModalForm] = useState({
    mood: 'CALM',
    discipline_score: 5,
    notes: '',
    reflection: '',
  });
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const fetchJournal = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/journal?month=${monthStr}`);
      if (res.ok) {
        const data = await res.json();
        setDailyMap(data.dailyMap || {});
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error('Failed to load journal:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJournal();
  }, [year, month]);

  // Navigate Months
  const handlePrevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleCurrentMonth = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  // Open modal for day
  const handleDayClick = (dateStr) => {
    setActiveDate(dateStr);
    const existing = dailyMap[dateStr];
    if (existing) {
      setModalForm({
        mood: existing.mood || 'CALM',
        discipline_score: existing.discipline_score !== undefined ? existing.discipline_score : 5,
        notes: existing.notes || '',
        reflection: existing.reflection || '',
      });
    } else {
      setModalForm({
        mood: 'CALM',
        discipline_score: 5,
        notes: '',
        reflection: '',
      });
    }
  };

  // Save Entry (with AUTO-SYNC to GGD in background)
  const handleSaveEntry = async (e) => {
    e.preventDefault();
    if (!activeDate) return;

    try {
      setSaving(true);
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: activeDate,
          ...modalForm,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setToastMessage(data.message || 'บันทึกสำเร็จ!');
        setTimeout(() => setToastMessage(null), 4000);
        setActiveDate(null);
        await fetchJournal();
      } else {
        alert(data.error || 'บันทึกไม่สำเร็จ');
      }
    } catch (err) {
      console.error('Error saving journal:', err);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  // Delete Entry
  const handleDeleteEntry = async () => {
    if (!activeDate || !confirm(`ยืนยันลบบันทึกอารมณ์วันที่ ${activeDate}?`)) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/journal?date=${activeDate}`, { method: 'DELETE' });
      if (res.ok) {
        setActiveDate(null);
        await fetchJournal();
      }
    } catch (err) {
      console.error('Delete journal error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Calendar calculations
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sunday, 1 = Monday...

  const calendarCells = [];
  // Pad empty cells before 1st of month
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push({ empty: true, key: `pad-${i}` });
  }
  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({
      empty: false,
      day: d,
      dateStr: dStr,
      data: dailyMap[dStr] || null,
      isToday: dStr === now.toISOString().split('T')[0],
      key: dStr,
    });
  }

  return (
    <div className="journal-container">
      {/* 1. HERO HEADER & PSYCHOLOGY BAR */}
      <div className="glass-panel journal-master-card">
        <div className="journal-header-top">
          <div className="journal-title-wrap">
            <span className="journal-icon">🧠</span>
            <div>
              <h3>Trade Journal — ปฏิทินอารมณ์และสติการเทรด</h3>
              <p className="journal-subtitle">
                บันทึกความรู้สึกและระดับวินัยประจำวัน — ระบบ <strong>Auto-Sync ขึ้น Google (GGD) อัตโนมัติทุกครั้งที่บันทึก</strong>
              </p>
            </div>
          </div>

          {/* Month Navigator */}
          <div className="month-navigator">
            <button className="nav-btn" onClick={handlePrevMonth} title="เดือนก่อนหน้า">◀</button>
            <div className="current-month-label">
              <span className="month-name">{MONTH_NAMES_THAI[month - 1]}</span>
              <span className="year-num">{year}</span>
            </div>
            <button className="nav-btn" onClick={handleNextMonth} title="เดือนถัดไป">▶</button>
            <button className="today-btn" onClick={handleCurrentMonth}>📅 วันนี้</button>
          </div>
        </div>

        {/* Global Auto-Sync Live Toast */}
        {toastMessage && (
          <div className="sync-toast success" style={{ marginTop: '14px' }}>
            <span>⚡</span>
            <span>{toastMessage}</span>
          </div>
        )}
      </div>

      {/* 2. PSYCHOLOGICAL HEALTH METRICS BAR */}
      <div className="journal-stats-grid">
        <div className="stat-card glass-panel highlight-active">
          <div className="stat-icon">🧘</div>
          <div>
            <div className="stat-value" style={{ color: '#30d158' }}>
              {stats?.disciplinedPct || 0}%
            </div>
            <div className="stat-label">
              มีสติ & วินัยดี ({stats?.disciplinedDaysCount || 0} / {stats?.totalDays || 0} วันที่จด)
            </div>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon">⭐</div>
          <div>
            <div className="stat-value" style={{ color: '#ffd60a' }}>
              {stats?.avgDiscipline || 0} / 5
            </div>
            <div className="stat-label">คะแนนวินัยเฉลี่ย</div>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon">⚠️</div>
          <div>
            <div className="stat-value" style={{ color: (stats?.emotionalTriggersCount || 0) > 0 ? '#ff453a' : 'var(--text-secondary)' }}>
              {stats?.emotionalTriggersCount || 0} วัน
            </div>
            <div className="stat-label">
              หลุดอารมณ์ (FOMO: {stats?.fomoCount || 0}, Revenge: {stats?.revengeCount || 0})
            </div>
          </div>
        </div>

        <div className="stat-card glass-panel highlight-r">
          <div className="stat-icon">☁️</div>
          <div>
            <div className="stat-value" style={{ fontSize: '16px', color: '#64d2ff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="pulse-dot" style={{ width: '8px', height: '8px' }}></span>
              Auto-Sync Live
            </div>
            <div className="stat-label">สำรองขึ้น GGD อัตโนมัติทุกไม้</div>
          </div>
        </div>
      </div>

      {/* 3. CALENDAR GRID */}
      <div className="calendar-panel glass-panel">
        {/* Day of Week Headers */}
        <div className="calendar-days-header">
          {['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'].map((name, i) => (
            <div key={name} className={`day-header-col ${i === 0 || i === 6 ? 'weekend' : ''}`}>
              {name}
            </div>
          ))}
        </div>

        {/* Month Days Grid */}
        <div className="calendar-grid">
          {calendarCells.map((cell) => {
            if (cell.empty) {
              return <div key={cell.key} className="cal-cell empty"></div>;
            }

            const item = cell.data;
            const moodCfg = item ? (MOODS[item.mood] || MOODS.CALM) : null;

            return (
              <div
                key={cell.key}
                className={`cal-cell ${item ? 'journaled' : 'blank'} ${cell.isToday ? 'today' : ''}`}
                style={item ? { borderColor: moodCfg?.border } : {}}
                onClick={() => handleDayClick(cell.dateStr)}
              >
                <div className="cal-cell-top">
                  <span className="day-number">{cell.day}</span>
                  {cell.isToday && <span className="today-chip">วันนี้</span>}
                  {item?.synced_to_ggd ? (
                    <span className="ggd-synced-dot" title="Auto-Synced to GGD">☁️</span>
                  ) : null}
                </div>

                {item ? (
                  <div className="cell-mood-wrap">
                    <div
                      className="cell-mood-badge"
                      style={{ backgroundColor: moodCfg?.bg, color: moodCfg?.color }}
                    >
                      <span className="cell-emoji">{moodCfg?.emoji}</span>
                      <span className="cell-label">{moodCfg?.label.split('/')[0]}</span>
                    </div>

                    {/* Star rating */}
                    <div className="cell-stars">
                      {'⭐'.repeat(item.discipline_score || 5)}
                    </div>

                    {/* Note preview snippet */}
                    {item.notes && (
                      <p className="cell-note-preview">“{item.notes}”</p>
                    )}
                  </div>
                ) : (
                  <div className="cell-placeholder">
                    <span className="add-hint">+ จดอารมณ์</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. EMOTION ENTRY MODAL */}
      {activeDate && (
        <div className="modal-overlay" onClick={() => setActiveDate(null)}>
          <div className="modal-content journal-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">{MOODS[modalForm.mood]?.emoji || '🧠'}</span>
                <div>
                  <h3>บันทึกอารมณ์และสติการเทรด</h3>
                  <p className="modal-subtitle">
                    วันที่ {activeDate} • ระบบจะ <strong>Auto-Sync ขึ้น Google Sheets (GGD) ทันที</strong>
                  </p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setActiveDate(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveEntry} className="trade-modal-form">
              {/* Emotion Selector */}
              <div className="form-field">
                <label>อารมณ์และสภาวะจิตใจหลักของวันนี้</label>
                <div className="mood-buttons-grid">
                  {Object.values(MOODS).map((m) => {
                    const isSelected = modalForm.mood === m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        className={`mood-select-btn ${isSelected ? 'selected' : ''}`}
                        style={isSelected ? { borderColor: m.color, background: m.bg } : {}}
                        onClick={() => setModalForm({ ...modalForm, mood: m.key })}
                      >
                        <span className="mood-btn-emoji">{m.emoji}</span>
                        <div className="mood-btn-text">
                          <strong style={{ color: isSelected ? m.color : '#fff' }}>{m.label.split('/')[0]}</strong>
                          <span>{m.label.includes('/') ? m.label.split('/')[1] : ''}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Discipline Star Rating */}
              <div className="form-field">
                <label>คะแนนความมีสติ / รักษาวินัยตามแผน (Discipline Score)</label>
                <div className="stars-input-wrap">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star-select-btn ${star <= modalForm.discipline_score ? 'active' : ''}`}
                      onClick={() => setModalForm({ ...modalForm, discipline_score: star })}
                    >
                      ⭐
                    </button>
                  ))}
                  <span className="score-desc">
                    {modalForm.discipline_score === 5 && '🌟 วินัย 100% ไม่หลุดแผนเลยแม้แต่น้อย'}
                    {modalForm.discipline_score === 4 && '✨ มีวินัยดีมาก ทำตามแผนเกือบสมบูรณ์'}
                    {modalForm.discipline_score === 3 && '⚖️ พอใช้ได้ มีความรู้สึกลังเลนิดหน่อย'}
                    {modalForm.discipline_score === 2 && '⚠️ เผลอตามอารมณ์ คันมือ หรือเทรดนอกแผน'}
                    {modalForm.discipline_score === 1 && '🚨 หลุดวินัยหนักมาก / หัวร้อน / FOMO'}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className="form-field">
                <label>💭 ความรู้สึกและสิ่งที่เกิดขึ้นในใจวันนี้ (Journal Note)</label>
                <textarea
                  rows="3"
                  placeholder="วันนี้รู้สึกอย่างไร? สภาพจิตใจก่อน-ระหว่าง-หลังเทรดเป็นอย่างไร? มีความกลัวหรือโลภเกิดขึ้นไหม?"
                  value={modalForm.notes}
                  onChange={(e) => setModalForm({ ...modalForm, notes: e.target.value })}
                />
              </div>

              {/* Reflection / Lesson */}
              <div className="form-field">
                <label>💡 กฎเตือนสติตัวเองสำหรับวันพรุ่งนี้ (Emotional Lesson)</label>
                <textarea
                  rows="2"
                  placeholder="เช่น พรุ่งนี้ห้ามเทรดตอนไม่มีเซ็ตอัพ, ต้องรอให้แท่งเทียนปิดก่อนเสมอ..."
                  value={modalForm.reflection}
                  onChange={(e) => setModalForm({ ...modalForm, reflection: e.target.value })}
                />
              </div>

              {/* Auto Sync Notification Pill */}
              <div className="auto-sync-notice">
                <span>⚡</span>
                <span>ระบบจะบันทึกลงเครื่องและ <strong>Auto-Sync ขึ้น Google Sheets (GGD) ทันที</strong> เมื่อกดบันทึก</span>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                <div>
                  {dailyMap[activeDate] && (
                    <button
                      type="button"
                      className="icon-action-btn delete"
                      onClick={handleDeleteEntry}
                      title="ลบบันทึกวันนี้"
                    >
                      🗑️ ลบบันทึก
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="action-btn cancel-btn"
                    onClick={() => setActiveDate(null)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="primary-btn"
                    disabled={saving}
                  >
                    {saving ? 'กำลังบันทึก & ซิงค์...' : '💾 บันทึกและ Auto-Sync GGD'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
