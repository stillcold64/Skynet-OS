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

  // Active modal date & entries
  const [activeDate, setActiveDate] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);

  const initialForm = {
    time: '',
    session: 'ทั่วไป',
    mood: 'CALM',
    discipline_score: 5,
    notes: '',
    reflection: '',
  };
  const [modalForm, setModalForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const fetchJournal = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/journal?month=${monthStr}`);
      if (res.ok) {
        const data = await res.json();
        // Normalize dailyMap so each date is always an array of entries
        const normalized = {};
        const rawMap = data.dailyMap || {};
        for (const [dateStr, val] of Object.entries(rawMap)) {
          normalized[dateStr] = Array.isArray(val) ? val : [val];
        }
        setDailyMap(normalized);
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

  // Open modal for a specific day
  const handleDayClick = (dateStr) => {
    setActiveDate(dateStr);
    const dayEntries = dailyMap[dateStr] || [];
    if (dayEntries.length === 0) {
      // No entries yet -> directly open the add form
      handleOpenAdd(dateStr);
    } else {
      // Entries exist -> show list first
      setIsFormOpen(false);
      setEditingEntryId(null);
    }
  };

  // Open Add Form for a day
  const handleOpenAdd = (dateStr) => {
    const targetDate = dateStr || activeDate;
    setEditingEntryId(null);
    const currentTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const existingCount = (dailyMap[targetDate] || []).length;
    setModalForm({
      time: currentTime,
      session: `ไม้ที่ ${existingCount + 1}`,
      mood: 'CALM',
      discipline_score: 5,
      notes: '',
      reflection: '',
    });
    setIsFormOpen(true);
  };

  // Open Edit Form for an existing entry
  const handleOpenEdit = (entry) => {
    setEditingEntryId(entry.id);
    setModalForm({
      time: entry.time || '',
      session: entry.session || 'ทั่วไป',
      mood: entry.mood || 'CALM',
      discipline_score: entry.discipline_score !== undefined ? entry.discipline_score : 5,
      notes: entry.notes || '',
      reflection: entry.reflection || '',
    });
    setIsFormOpen(true);
  };

  // Save Entry (Create new or Update existing)
  const handleSaveEntry = async (e) => {
    e.preventDefault();
    if (!activeDate) return;

    try {
      setSaving(true);
      let res;
      if (editingEntryId) {
        // PUT update
        res = await fetch('/api/journal', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingEntryId,
            date: activeDate,
            ...modalForm,
          }),
        });
      } else {
        // POST create
        res = await fetch('/api/journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: activeDate,
            ...modalForm,
          }),
        });
      }

      const data = await res.json();
      if (data.success) {
        setToastMessage(data.message || 'บันทึกสำเร็จ!');
        setTimeout(() => setToastMessage(null), 4000);
        setIsFormOpen(false);
        setEditingEntryId(null);
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

  // Delete a specific entry by id
  const handleDeleteEntry = async (id) => {
    if (!confirm(`ยืนยันลบบันทึกไม้นี้?`)) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/journal?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setToastMessage('ลบบันทึกไม้สำเร็จ');
        setTimeout(() => setToastMessage(null), 3000);
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
      entries: dailyMap[dStr] || [],
      isToday: dStr === now.toISOString().split('T')[0],
      key: dStr,
    });
  }

  const activeDayEntries = activeDate ? (dailyMap[activeDate] || []) : [];

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
                บันทึกความรู้สึกและสติรายไม้ (บันทึกได้หลายไม้ต่อวัน) — ระบบ <strong>Auto-Sync ขึ้น Google (GGD) อัตโนมัติทุกครั้งที่บันทึก</strong>
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
              มีสติ & วินัยดี ({stats?.disciplinedCount || 0} / {stats?.totalEntries || 0} ไม้ที่จด)
            </div>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon">⭐</div>
          <div>
            <div className="stat-value" style={{ color: '#ffd60a' }}>
              {stats?.avgDiscipline || 0} / 5
            </div>
            <div className="stat-label">คะแนนวินัยเฉลี่ยทุกไม้</div>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon">⚠️</div>
          <div>
            <div className="stat-value" style={{ color: (stats?.emotionalTriggersCount || 0) > 0 ? '#ff453a' : 'var(--text-secondary)' }}>
              {stats?.emotionalTriggersCount || 0} ไม้
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

            const entries = cell.entries;
            const hasEntries = entries.length > 0;
            const singleItem = entries.length === 1 ? entries[0] : null;
            const singleMoodCfg = singleItem ? (MOODS[singleItem.mood] || MOODS.CALM) : null;

            return (
              <div
                key={cell.key}
                className={`cal-cell ${hasEntries ? 'journaled' : 'blank'} ${cell.isToday ? 'today' : ''}`}
                style={singleItem ? { borderColor: singleMoodCfg?.border } : {}}
                onClick={() => handleDayClick(cell.dateStr)}
              >
                <div className="cal-cell-top">
                  <span className="day-number">{cell.day}</span>
                  {cell.isToday && <span className="today-chip">วันนี้</span>}

                  {entries.length > 1 && (
                    <span className="cell-multi-count-tag" title={`มี ${entries.length} ไม้ในวันนี้`}>
                      📝 {entries.length} ไม้
                    </span>
                  )}

                  {hasEntries && entries.some((e) => e.synced_to_ggd) && (
                    <span className="ggd-synced-dot" title="Auto-Synced to GGD">☁️</span>
                  )}
                </div>

                {/* CASE 1: Exactly 1 Entry */}
                {entries.length === 1 && (
                  <div className="cell-mood-wrap">
                    {singleItem.time && (
                      <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '600' }}>
                        ⏰ {singleItem.time}
                      </span>
                    )}
                    <div
                      className="cell-mood-badge"
                      style={{ backgroundColor: singleMoodCfg?.bg, color: singleMoodCfg?.color }}
                    >
                      <span className="cell-emoji">{singleMoodCfg?.emoji}</span>
                      <span className="cell-label">{singleMoodCfg?.label.split('/')[0]}</span>
                    </div>

                    <div className="cell-stars">
                      {'⭐'.repeat(singleItem.discipline_score || 5)}
                    </div>

                    {singleItem.notes && (
                      <p className="cell-note-preview">“{singleItem.notes}”</p>
                    )}
                  </div>
                )}

                {/* CASE 2: Multiple Entries (> 1) */}
                {entries.length > 1 && (
                  <div className="cell-multi-entries-stack">
                    {entries.slice(0, 3).map((item) => {
                      const mCfg = MOODS[item.mood] || MOODS.CALM;
                      return (
                        <div
                          key={item.id}
                          className="mini-entry-pill"
                          style={{ backgroundColor: mCfg.bg, color: mCfg.color, borderColor: mCfg.border }}
                        >
                          <span className="mini-time">{item.time || '-'}</span>
                          <span>{mCfg.emoji}</span>
                          <span className="mini-mood">{mCfg.label.split('/')[0]}</span>
                          <span className="mini-stars">{'⭐'.repeat(item.discipline_score || 5)}</span>
                        </div>
                      );
                    })}
                    {entries.length > 3 && (
                      <span className="mini-more-tag">+{entries.length - 3} ไม้อื่นๆ</span>
                    )}
                  </div>
                )}

                {/* CASE 3: No entries */}
                {entries.length === 0 && (
                  <div className="cell-placeholder">
                    <span className="add-hint">+ จดอารมณ์</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. DAY DETAIL & MULTI-ENTRY MODAL */}
      {activeDate && (
        <div className="modal-overlay" onClick={() => setActiveDate(null)}>
          <div className="modal-content journal-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">🧠</span>
                <div>
                  <h3>บันทึกอารมณ์และสติการเทรด</h3>
                  <p className="modal-subtitle">
                    วันที่ {activeDate} • บันทึกได้หลายไม้ พร้อม <strong>Auto-Sync ขึ้น GGD ทันที</strong>
                  </p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setActiveDate(null)}>✕</button>
            </div>

            {/* VIEW A: LIST OF RECORDED ENTRIES FOR THIS DAY */}
            {!isFormOpen && (
              <div className="journal-day-view">
                <div className="day-modal-top-bar">
                  <div className="day-modal-count-title">
                    📋 บันทึกไม้เทรดในวันนี้ ({activeDayEntries.length} ไม้)
                  </div>
                  <button className="add-entry-btn" onClick={() => handleOpenAdd(activeDate)}>
                    <span>➕ จดบันทึกไม้ใหม่ในวันนี้</span>
                  </button>
                </div>

                {activeDayEntries.length === 0 ? (
                  <div className="empty-state" style={{ padding: '24px 0' }}>
                    <p>ยังไม่มีบันทึกอารมณ์สำหรับวันนี้</p>
                    <button className="primary-btn" style={{ marginTop: '10px' }} onClick={() => handleOpenAdd(activeDate)}>
                      ➕ เริ่มต้นจดบันทึกไม้นี้
                    </button>
                  </div>
                ) : (
                  <div className="journal-entries-list">
                    {activeDayEntries.map((item, idx) => {
                      const moodCfg = MOODS[item.mood] || MOODS.CALM;
                      return (
                        <div
                          key={item.id}
                          className="journal-entry-card glass-panel"
                          style={{ borderLeft: `4px solid ${moodCfg.color}` }}
                        >
                          <div className="entry-card-header">
                            <div className="entry-meta-left">
                              <span className="entry-num-badge">ไม้ที่ {idx + 1}</span>
                              {item.time && <span className="entry-time-tag">⏰ {item.time}</span>}
                              {item.session && <span className="entry-session-tag">🏷️ {item.session}</span>}
                            </div>

                            <div className="entry-actions">
                              <button
                                className="icon-action-btn"
                                onClick={() => handleOpenEdit(item)}
                                title="แก้ไขไม้นี้"
                              >
                                ✏️
                              </button>
                              <button
                                className="icon-action-btn delete"
                                onClick={() => handleDeleteEntry(item.id)}
                                title="ลบไม้นี้"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          <div className="entry-card-mood-row">
                            <span
                              className="cell-mood-badge"
                              style={{
                                backgroundColor: moodCfg.bg,
                                color: moodCfg.color,
                                borderColor: moodCfg.border,
                              }}
                            >
                              <span>{moodCfg.emoji}</span>
                              <span>{moodCfg.label}</span>
                            </span>
                            <div className="cell-stars">
                              {'⭐'.repeat(item.discipline_score || 5)}
                            </div>
                          </div>

                          {item.notes && (
                            <div className="entry-notes-quote">
                              <span className="quote-mark">“</span>
                              <span>{item.notes}</span>
                            </div>
                          )}

                          {item.reflection && (
                            <div className="entry-reflection-box">
                              <span>💡 บทเรียนเตือนสติ: {item.reflection}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* VIEW B: ADD OR EDIT FORM */}
            {isFormOpen && (
              <form onSubmit={handleSaveEntry} className="trade-modal-form">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ color: '#64d2ff', fontSize: '13.5px' }}>
                    {editingEntryId ? `✏️ แก้ไขบันทึกไม้ #${editingEntryId}` : `➕ เพิ่มบันทึกอารมณ์ไม้ใหม่`}
                  </strong>
                  {activeDayEntries.length > 0 && (
                    <button
                      type="button"
                      className="icon-action-btn"
                      style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
                      onClick={() => { setIsFormOpen(false); setEditingEntryId(null); }}
                    >
                      ◀ กลับหน้ารวมไม้ ({activeDayEntries.length})
                    </button>
                  )}
                </div>

                {/* Row 1: Time & Session / Trade label */}
                <div className="form-row two-cols">
                  <div className="form-field">
                    <label>เวลาที่เทรด / รู้สึก (Time)</label>
                    <input
                      type="text"
                      placeholder="เช่น 07:35, 14:20"
                      value={modalForm.time}
                      onChange={(e) => setModalForm({ ...modalForm, time: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>รอบ / ไม้ที่ (Session / Trade Tag)</label>
                    <input
                      type="text"
                      placeholder="เช่น ไม้ที่ 1, รอบเช้า, London, US"
                      value={modalForm.session}
                      onChange={(e) => setModalForm({ ...modalForm, session: e.target.value })}
                    />
                  </div>
                </div>

                {/* Row 2: Emotion Selector */}
                <div className="form-field">
                  <label>อารมณ์และสภาวะจิตใจของไม้นี้</label>
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

                {/* Row 3: Discipline Star Rating */}
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

                {/* Row 4: Notes */}
                <div className="form-field">
                  <label>💭 ความรู้สึกและสิ่งที่เกิดขึ้นในใจของไม้นี้ (Journal Note)</label>
                  <textarea
                    rows="3"
                    placeholder="ไม้นี้รู้สึกอย่างไร? สภาพจิตใจก่อน-ระหว่าง-หลังเทรดเป็นอย่างไร? มีความกลัวหรือโลภเกิดขึ้นไหม?"
                    value={modalForm.notes}
                    onChange={(e) => setModalForm({ ...modalForm, notes: e.target.value })}
                  />
                </div>

                {/* Row 5: Reflection / Lesson */}
                <div className="form-field">
                  <label>💡 บทเรียนเตือนสติสำหรับไม้นี้ / ครั้งถัดไป (Emotional Lesson)</label>
                  <textarea
                    rows="2"
                    placeholder="เช่น เสี่ยงได้แต่ต้องรู้ข้อจำกัดตัวเอง, ต้องรอให้แท่งเทียนปิดก่อนเสมอ..."
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
                    {activeDayEntries.length > 0 && (
                      <button
                        type="button"
                        className="action-btn cancel-btn"
                        onClick={() => { setIsFormOpen(false); setEditingEntryId(null); }}
                      >
                        ◀ ยกเลิกกลับหน้ารวมไม้
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className="action-btn cancel-btn"
                      onClick={() => setActiveDate(null)}
                    >
                      ปิด
                    </button>
                    <button
                      type="submit"
                      className="primary-btn"
                      disabled={saving}
                    >
                      {saving ? 'กำลังบันทึก & ซิงค์...' : (editingEntryId ? '💾 บันทึกการแก้ไข (Auto-Sync GGD)' : '💾 บันทึกไม้นี้ (Auto-Sync GGD)')}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
