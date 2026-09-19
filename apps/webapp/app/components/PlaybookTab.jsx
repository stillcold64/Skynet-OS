'use client';

import { useState, useEffect } from 'react';

const GRADE_CONFIG = {
  'A+': {
    label: 'Grade A+ ⭐⭐⭐ (High Conviction)',
    color: '#bf5af2',
    bg: 'rgba(191, 90, 242, 0.15)',
    border: 'rgba(191, 90, 242, 0.4)',
    badgeText: 'A+ ⭐⭐⭐',
  },
  'A': {
    label: 'Grade A ⭐⭐ (Standard Core)',
    color: '#0a84ff',
    bg: 'rgba(10, 132, 255, 0.15)',
    border: 'rgba(10, 132, 255, 0.4)',
    badgeText: 'A ⭐⭐',
  },
  'B': {
    label: 'Grade B ⭐ (Secondary / Reduced Size)',
    color: '#ff9f0a',
    bg: 'rgba(255, 159, 10, 0.15)',
    border: 'rgba(255, 159, 10, 0.4)',
    badgeText: 'B ⭐',
  },
};

export default function PlaybookTab() {
  const [setups, setSetups] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [copyToast, setCopyToast] = useState('');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [directionFilter, setDirectionFilter] = useState('ALL');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingSetup, setEditingSetup] = useState(null);
  const [viewDetailSetup, setViewDetailSetup] = useState(null);

  // Setup Form State
  const initialForm = {
    code: '',
    title: '',
    grade: 'A+',
    direction: 'BOTH',
    timeframe: '15M - 1H',
    session: 'London / NY',
    target_rr: '3.0',
    thesis: '',
    entry_rules: '',
    invalidation_rules: '',
    exit_rules: '',
    risk_rules: 'เสี่ยง 1.0% ของพอร์ต',
    mistakes_to_avoid: '',
    chart_blueprint_url: '',
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchSetups = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/playbook');
      if (res.ok) {
        const data = await res.json();
        setSetups(data.setups || []);
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error('Failed to load playbook setups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSetups();
  }, []);

  // Handle Sync to GGD (Google Sheets / Drive)
  const handleSyncGgd = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      const res = await fetch('/api/playbook/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncResult({ success: true, message: data.message, time: new Date().toLocaleTimeString('th-TH') });
      } else {
        setSyncResult({ success: false, message: data.error || 'ซิงค์ไม่สำเร็จ' });
      }
    } catch (err) {
      setSyncResult({ success: false, message: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setSyncing(false);
    }
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingSetup(null);
    const nextCode = `SETUP-${String(setups.length + 1).padStart(2, '0')}`;
    setFormData({
      ...initialForm,
      code: nextCode,
    });
    setShowModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (s) => {
    setEditingSetup(s);
    setFormData({
      code: s.code || '',
      title: s.title || '',
      grade: s.grade || 'A+',
      direction: s.direction || 'BOTH',
      timeframe: s.timeframe || '',
      session: s.session || '',
      target_rr: s.target_rr !== null ? String(s.target_rr) : '3.0',
      thesis: s.thesis || '',
      entry_rules: s.entry_rules || '',
      invalidation_rules: s.invalidation_rules || '',
      exit_rules: s.exit_rules || '',
      risk_rules: s.risk_rules || '',
      mistakes_to_avoid: s.mistakes_to_avoid || '',
      chart_blueprint_url: s.chart_blueprint_url || '',
    });
    setShowModal(true);
  };

  // Save Setup (Create or Update)
  const handleSaveSetup = async (e) => {
    e.preventDefault();
    try {
      if (editingSetup) {
        // Update
        const res = await fetch('/api/playbook', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingSetup.id, ...formData }),
        });
        if (res.ok) {
          setShowModal(false);
          await fetchSetups();
        }
      } else {
        // Create
        const res = await fetch('/api/playbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          setShowModal(false);
          await fetchSetups();
        }
      }
    } catch (err) {
      console.error('Error saving playbook setup:', err);
    }
  };

  // Delete Setup
  const handleDeleteSetup = async (id, code) => {
    if (!confirm(`ยืนยันลบพิมพ์เขียวเซ็ตอัพ ${code} ออกจาก Playbook?`)) return;
    try {
      const res = await fetch(`/api/playbook?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (viewDetailSetup && viewDetailSetup.id === id) setViewDetailSetup(null);
        await fetchSetups();
      }
    } catch (err) {
      console.error('Error deleting setup:', err);
    }
  };

  // Copy Tag to Clipboard for future trade linking
  const handleCopyTag = (s) => {
    const tag = `Playbook Setup: [${s.code}: ${s.title}]`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(tag);
      setCopyToast(`คัดลอก "${tag}" เรียบร้อยแล้ว!`);
      setTimeout(() => setCopyToast(''), 3500);
    }
  };

  // Filter Setups
  const filteredSetups = setups.filter((s) => {
    if (gradeFilter !== 'ALL' && (s.grade || '').toUpperCase() !== gradeFilter) return false;
    if (directionFilter !== 'ALL' && (s.direction || '').toUpperCase() !== directionFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (s.title || '').toLowerCase().includes(q);
      const matchCode = (s.code || '').toLowerCase().includes(q);
      const matchThesis = (s.thesis || '').toLowerCase().includes(q);
      const matchRules = (s.entry_rules || '').toLowerCase().includes(q);
      if (!matchTitle && !matchCode && !matchThesis && !matchRules) return false;
    }
    return true;
  });

  return (
    <div className="playbook-container">
      {/* 1. HERO MASTER PLAYBOOK HEADER */}
      <div className="glass-panel playbook-master-card">
        <div className="playbook-master-header">
          <div className="master-badge-title">
            <span className="master-icon">📖</span>
            <div>
              <h3>Trading Playbook — Setups & Theses Library</h3>
              <p className="master-subtitle">
                คลังพิมพ์เขียวและกฎเซ็ตอัพการเทรด — กำหนดมาตรฐานท่าเทรดเพื่อใช้เชื่อมโยงกับหน้าบันทึกการเทรด (Trade Log)
              </p>
            </div>
          </div>
          <div className="master-actions">
            <button className="primary-btn add-trade-btn" onClick={handleOpenAdd}>
              <span>➕ สร้าง Setup ท่าเทรดใหม่</span>
            </button>
            <button
              className={`action-btn sync-ggd-btn ${syncing ? 'loading' : ''}`}
              onClick={handleSyncGgd}
              disabled={syncing}
              title="ส่งสำรองคลัง Playbook Setups ขึ้น Google Sheets/Drive"
            >
              <span>☁️ {syncing ? 'กำลังซิงค์ GGD...' : 'ซิงค์ Playbook ไป Google (GGD)'}</span>
            </button>
          </div>
        </div>

        {/* Sync status toast */}
        {syncResult && (
          <div className={`sync-toast ${syncResult.success ? 'success' : 'error'}`}>
            <span>{syncResult.success ? '✅' : '⚠️'}</span>
            <span>{syncResult.message}</span>
            {syncResult.time && <span className="sync-time">({syncResult.time})</span>}
          </div>
        )}

        {/* Copy to clipboard toast */}
        {copyToast && (
          <div className="sync-toast success" style={{ marginTop: '10px' }}>
            <span>📋</span>
            <span>{copyToast}</span>
          </div>
        )}
      </div>

      {/* 2. STATS BAR */}
      <div className="playbook-stats-grid">
        <div className="stat-card glass-panel">
          <div className="stat-icon">📚</div>
          <div>
            <div className="stat-value">{stats?.totalSetups || 0}</div>
            <div className="stat-label">พิมพ์เขียวท่าเทรดทั้งหมด</div>
          </div>
        </div>
        <div className="stat-card glass-panel highlight-r">
          <div className="stat-icon">⭐</div>
          <div>
            <div className="stat-value" style={{ color: '#bf5af2' }}>{stats?.gradeAPlusCount || 0}</div>
            <div className="stat-label">Grade A+ (ท่าไม้ตายหลัก)</div>
          </div>
        </div>
        <div className="stat-card glass-panel highlight-active">
          <div className="stat-icon">🎯</div>
          <div>
            <div className="stat-value">{stats?.gradeACount || 0}</div>
            <div className="stat-label">Grade A (ท่าเทรดมาตรฐาน)</div>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon">📐</div>
          <div>
            <div className="stat-value" style={{ color: '#ffd60a' }}>
              1 : {stats?.avgTargetRR || 0} R
            </div>
            <div className="stat-label">Avg. Target Risk:Reward</div>
          </div>
        </div>
      </div>

      {/* 3. TOOLBAR & FILTERS */}
      <div className="playbook-toolbar glass-panel">
        <div className="toolbar-left">
          {/* Search Box */}
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="ค้นหารหัส, ชื่อเซ็ตอัพ, หรือ Thesis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>
        </div>

        <div className="toolbar-right">
          {/* Grade Filter */}
          <div className="pill-group">
            <button
              className={`pill-btn ${gradeFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setGradeFilter('ALL')}
            >
              All Grades
            </button>
            <button
              className={`pill-btn ${gradeFilter === 'A+' ? 'active' : ''}`}
              style={{ color: gradeFilter === 'A+' ? '#bf5af2' : '' }}
              onClick={() => setGradeFilter('A+')}
            >
              Grade A+ ⭐⭐⭐
            </button>
            <button
              className={`pill-btn ${gradeFilter === 'A' ? 'active' : ''}`}
              style={{ color: gradeFilter === 'A' ? '#0a84ff' : '' }}
              onClick={() => setGradeFilter('A')}
            >
              Grade A ⭐⭐
            </button>
            <button
              className={`pill-btn ${gradeFilter === 'B' ? 'active' : ''}`}
              style={{ color: gradeFilter === 'B' ? '#ff9f0a' : '' }}
              onClick={() => setGradeFilter('B')}
            >
              Grade B ⭐
            </button>
          </div>

          {/* Direction Filter */}
          <select
            className="status-dropdown-filter"
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
          >
            <option value="ALL">ทิศทางทั้งหมด (All)</option>
            <option value="BOTH">🔄 เล่นได้ทั้ง LONG & SHORT</option>
            <option value="LONG">🟢 LONG เท่านั้น</option>
            <option value="SHORT">🔴 SHORT เท่านั้น</option>
          </select>
        </div>
      </div>

      {/* 4. SETUPS BLUEPRINT GRID */}
      {loading ? (
        <div className="empty-state glass-panel">
          <div className="pulse-dot" style={{ margin: '0 auto 16px auto' }}></div>
          <p>กำลังโหลด Playbook Setups...</p>
        </div>
      ) : filteredSetups.length === 0 ? (
        <div className="empty-state glass-panel">
          <div className="empty-icon">📖</div>
          <h3>ยังไม่มีเซ็ตอัพท่าเทรดในมุมมองนี้</h3>
          <p>กดปุ่ม <strong>"➕ สร้าง Setup ท่าเทรดใหม่"</strong> เพื่อบันทึกพิมพ์เขียวการเทรดแรกของคุณ</p>
        </div>
      ) : (
        <div className="trades-grid playbook-setups-grid">
          {filteredSetups.map((s) => {
            const gradeCfg = GRADE_CONFIG[s.grade] || GRADE_CONFIG['A+'];
            const entryRulesList = (s.entry_rules || '').split('\n').filter(Boolean);

            return (
              <div key={s.id} className="trade-card playbook-card glass-panel">
                {/* Header Row: Code, Direction & Grade Badge */}
                <div className="card-top-row">
                  <div className="card-symbol-badge">
                    <span className="setup-code-badge">{s.code}</span>
                    <span className={`direction-badge ${s.direction === 'LONG' ? 'long' : s.direction === 'SHORT' ? 'short' : 'both'}`}>
                      {s.direction === 'LONG' ? '🟢 LONG' : s.direction === 'SHORT' ? '🔴 SHORT' : '🔄 BOTH'}
                    </span>
                  </div>

                  <span
                    className="status-badge-pill grade-pill"
                    style={{
                      backgroundColor: gradeCfg.bg,
                      color: gradeCfg.color,
                      borderColor: gradeCfg.border,
                    }}
                  >
                    {gradeCfg.badgeText}
                  </span>
                </div>

                {/* Setup Title */}
                <h4 className="card-title" onClick={() => setViewDetailSetup(s)} title="คลิกเพื่อดูพิมพ์เขียวเต็มจอ">
                  {s.title}
                </h4>

                {/* Quick Specs Pill Bar */}
                <div className="setup-specs-bar">
                  <span className="spec-pill rr-spec">🎯 Target R:R: <strong>1 : {s.target_rr}R</strong></span>
                  <span className="spec-pill">⏱️ {s.timeframe || 'Any TF'}</span>
                  <span className="spec-pill">🌍 {s.session || 'All Sessions'}</span>
                </div>

                {/* 1. Core Thesis & Market Edge */}
                <div className="blueprint-section">
                  <div className="blueprint-label">💡 Core Thesis & Market Edge</div>
                  <p className="blueprint-thesis">{s.thesis}</p>
                </div>

                {/* 2. Entry Checklist */}
                <div className="blueprint-section">
                  <div className="blueprint-label">✅ Entry Checklist (กฎที่ต้องครบ)</div>
                  <div className="blueprint-rules-list">
                    {entryRulesList.map((rule, idx) => (
                      <div key={idx} className="rule-item">
                        <span className="check-icon">✓</span>
                        <span>{rule.replace(/^[0-9]+\.\s*/, '')}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Invalidation & Stop Loss */}
                {s.invalidation_rules && (
                  <div className="blueprint-section invalidation-highlight">
                    <div className="blueprint-label">🛑 Stop Loss & Invalidation Criteria</div>
                    <div className="blueprint-content rule-multiline">{s.invalidation_rules}</div>
                  </div>
                )}

                {/* 4. Exit / Target Rules */}
                {s.exit_rules && (
                  <div className="blueprint-section">
                    <div className="blueprint-label">🎯 Exit Strategy & Targets</div>
                    <div className="blueprint-content rule-multiline">{s.exit_rules}</div>
                  </div>
                )}

                {/* 5. Mistakes to Avoid */}
                {s.mistakes_to_avoid && (
                  <div className="blueprint-section warning-highlight">
                    <div className="blueprint-label">⚠️ ข้อควรระวัง / สิ่งที่ห้ามทำ</div>
                    <div className="blueprint-content rule-multiline">{s.mistakes_to_avoid}</div>
                  </div>
                )}

                {/* 6. Chart Blueprint Link */}
                {s.chart_blueprint_url && (
                  <div className="card-chart-link">
                    <a href={s.chart_blueprint_url} target="_blank" rel="noopener noreferrer">
                      📈 ดูรูปชาร์ตพิมพ์เขียวตัวอย่างในอุดมคติ ↗
                    </a>
                  </div>
                )}

                {/* Card Footer Actions */}
                <div className="card-footer">
                  <button
                    className="action-btn copy-link-btn"
                    onClick={() => handleCopyTag(s)}
                    title="คัดลอก Tag เซ็ตอัพนี้สำหรับใช้อ้างอิงในบันทึกการเทรด"
                  >
                    <span>📋 คัดลอก Link/Tag</span>
                  </button>

                  <div className="card-actions">
                    <button className="icon-action-btn" onClick={() => handleOpenEdit(s)} title="แก้ไขพิมพ์เขียว">
                      ✏️
                    </button>
                    <button className="icon-action-btn delete" onClick={() => handleDeleteSetup(s.id, s.code)} title="ลบ">
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. ADD / EDIT SETUP MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">{editingSetup ? '✏️' : '➕'}</span>
                <div>
                  <h3>{editingSetup ? 'แก้ไขพิมพ์เขียว Playbook Setup' : 'สร้าง Playbook Setup ท่าเทรดใหม่'}</h3>
                  <p className="modal-subtitle">กำหนดเกณฑ์ สมมติฐาน และกฎการเทรดเพื่อใช้เป็นมาตรฐานในการเทรด</p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveSetup} className="trade-modal-form">
              {/* Row 1: Code & Title */}
              <div className="form-row two-cols">
                <div className="form-field">
                  <label>รหัสเซ็ตอัพ (Setup Code เช่น SETUP-01)</label>
                  <input
                    type="text"
                    placeholder="SETUP-01"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>ชื่อเซ็ตอัพ / ท่าเทรด (Setup Title)</label>
                  <input
                    type="text"
                    placeholder="เช่น Liquidity Sweep & MSS, Trend Pullback to EMA"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Row 2: Grade & Direction */}
              <div className="form-row two-cols">
                <div className="form-field">
                  <label>เกรดความมั่นใจ (Setup Grade)</label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  >
                    <option value="A+">⭐ Grade A+ (ท่าไม้ตายหลัก / High Conviction / ใส่เต็ม Size)</option>
                    <option value="A">⭐ Grade A (ท่าเทรดมาตรฐาน / Standard Size)</option>
                    <option value="B">⭐ Grade B (ท่าเทรดเสริม / ลดขนาดความเสี่ยงครึ่งหนึ่ง)</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>ทิศทางที่ใช้ได้ (Direction)</label>
                  <select
                    value={formData.direction}
                    onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                  >
                    <option value="BOTH">🔄 เล่นได้ทั้งสองฝั่ง (LONG & SHORT)</option>
                    <option value="LONG">🟢 LONG (ซื้ออย่างเดียว)</option>
                    <option value="SHORT">🔴 SHORT (ขายอย่างเดียว)</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Target R:R, Timeframe, Session */}
              <div className="form-row three-cols">
                <div className="form-field">
                  <label>R:R เป้าหมาย (Target R:R)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="3.0"
                    value={formData.target_rr}
                    onChange={(e) => setFormData({ ...formData, target_rr: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>Timeframe ที่เหมาะสม</label>
                  <input
                    type="text"
                    placeholder="เช่น 15M - 1H, 4H"
                    value={formData.timeframe}
                    onChange={(e) => setFormData({ ...formData, timeframe: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>ช่วงเวลา / Session</label>
                  <input
                    type="text"
                    placeholder="เช่น London / New York"
                    value={formData.session}
                    onChange={(e) => setFormData({ ...formData, session: e.target.value })}
                  />
                </div>
              </div>

              {/* Core Thesis */}
              <div className="form-field">
                <label>💡 Core Thesis & Market Edge (ทำไมท่านี้ถึงชนะในตลาด / กลไกราคาคืออะไร?)</label>
                <textarea
                  rows="3"
                  placeholder="อธิบายเหตุผลทางพฤติกรรมราคา การกระทำของ Smart Money หรือความได้เปรียบทางสถิติ..."
                  value={formData.thesis}
                  onChange={(e) => setFormData({ ...formData, thesis: e.target.value })}
                  required
                />
              </div>

              {/* Entry Rules Checklist */}
              <div className="form-field">
                <label>✅ Entry Checklist (เงื่อนไขและกฎการเข้าออเดอร์ — พิมพ์แยกข้อละ 1 บรรทัด)</label>
                <textarea
                  rows="4"
                  placeholder="1. สภาพคล่อง High/Low เดิมถูกกวาด&#10;2. เกิดแท่งเทียน Rejection ใน 15M&#10;3. ย่อเข้าโซน FVG/OB&#10;4. Risk:Reward ขั้นต่ำ 1:2.5R"
                  value={formData.entry_rules}
                  onChange={(e) => setFormData({ ...formData, entry_rules: e.target.value })}
                  required
                />
              </div>

              {/* Stop Loss & Invalidation */}
              <div className="form-field">
                <label>🛑 Stop Loss & Invalidation Criteria (จุดตัดขาดทุน / เงื่อนไขที่บอกว่าท่านี้พัง)</label>
                <textarea
                  rows="2"
                  placeholder="วาง SL ตรงไหน และอะไรคือสิ่งที่บอกว่าท่านี้ผิดทางให้รีบตัดขาดทุน..."
                  value={formData.invalidation_rules}
                  onChange={(e) => setFormData({ ...formData, invalidation_rules: e.target.value })}
                />
              </div>

              {/* Exit Rules */}
              <div className="form-field">
                <label>🎯 Exit & Take Profit Strategy (กฎการทำกำไร & Trailing Stop)</label>
                <textarea
                  rows="2"
                  placeholder="เช่น TP1 ที่ 2.0R แบ่งปิด 50% เลื่อน SL บังทุน, TP2 ที่ขอบ Liquidity Pool ฝั่งตรงข้าม"
                  value={formData.exit_rules}
                  onChange={(e) => setFormData({ ...formData, exit_rules: e.target.value })}
                />
              </div>

              {/* Mistakes to Avoid */}
              <div className="form-field">
                <label>⚠️ สิ่งที่ห้ามทำ / ข้อควรระวัง (Do's & Don'ts)</label>
                <textarea
                  rows="2"
                  placeholder="เช่น ห้ามเข้าก่อนเห็นแท่งปิดคอนเฟิร์ม, ห้ามเล่นช่วงข่าวกล่องแดง..."
                  value={formData.mistakes_to_avoid}
                  onChange={(e) => setFormData({ ...formData, mistakes_to_avoid: e.target.value })}
                />
              </div>

              {/* Chart URL */}
              <div className="form-field">
                <label>📈 ลิงก์รูปชาร์ตพิมพ์เขียวตัวอย่างในอุดมคติ (Ideal Chart URL / TradingView)</label>
                <input
                  type="url"
                  placeholder="https://www.tradingview.com/x/... หรือ Google Drive link"
                  value={formData.chart_blueprint_url}
                  onChange={(e) => setFormData({ ...formData, chart_blueprint_url: e.target.value })}
                />
              </div>

              {/* Modal Footer */}
              <div className="modal-footer">
                <button type="button" className="action-btn cancel-btn" onClick={() => setShowModal(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="primary-btn save-trade-btn">
                  💾 {editingSetup ? 'บันทึกการแก้ไขพิมพ์เขียว' : 'บันทึก Setup ลง Playbook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. DETAIL INSPECTOR MODAL */}
      {viewDetailSetup && (
        <div className="modal-overlay" onClick={() => setViewDetailSetup(null)}>
          <div className="modal-content detail-inspector glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="setup-code-badge large">{viewDetailSetup.code}</span>
                <div>
                  <h3>{viewDetailSetup.title}</h3>
                  <p className="modal-subtitle">
                    {GRADE_CONFIG[viewDetailSetup.grade]?.label} • {viewDetailSetup.direction}
                  </p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setViewDetailSetup(null)}>✕</button>
            </div>

            <div className="detail-body">
              <div className="setup-specs-bar" style={{ marginBottom: '14px' }}>
                <span className="spec-pill rr-spec">🎯 Target R:R: <strong>1 : {viewDetailSetup.target_rr}R</strong></span>
                <span className="spec-pill">⏱️ {viewDetailSetup.timeframe}</span>
                <span className="spec-pill">🌍 {viewDetailSetup.session}</span>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">💡 Core Thesis & Market Edge</div>
                <p className="detail-text">{viewDetailSetup.thesis}</p>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">✅ Entry Checklist</div>
                <div className="blueprint-rules-list">
                  {(viewDetailSetup.entry_rules || '').split('\n').filter(Boolean).map((rule, idx) => (
                    <div key={idx} className="rule-item">
                      <span className="check-icon">✓</span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>

              {viewDetailSetup.invalidation_rules && (
                <div className="detail-section">
                  <div className="detail-section-title">🛑 Stop Loss & Invalidation Criteria</div>
                  <p className="detail-text invalidation-text">{viewDetailSetup.invalidation_rules}</p>
                </div>
              )}

              {viewDetailSetup.exit_rules && (
                <div className="detail-section">
                  <div className="detail-section-title">🎯 Exit Strategy & Targets</div>
                  <p className="detail-text">{viewDetailSetup.exit_rules}</p>
                </div>
              )}

              {viewDetailSetup.mistakes_to_avoid && (
                <div className="detail-section">
                  <div className="detail-section-title">⚠️ ข้อควรระวัง / สิ่งที่ห้ามทำ</div>
                  <p className="detail-text warning-text">{viewDetailSetup.mistakes_to_avoid}</p>
                </div>
              )}

              {viewDetailSetup.chart_blueprint_url && (
                <div className="detail-section">
                  <div className="detail-section-title">📈 Reference Chart</div>
                  <a
                    href={viewDetailSetup.chart_blueprint_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chart-open-link"
                  >
                    เปิดดูชาร์ตพิมพ์เขียวตัวอย่างในแท็บใหม่ ↗
                  </a>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="action-btn"
                onClick={() => handleCopyTag(viewDetailSetup)}
              >
                📋 คัดลอก Link/Tag
              </button>
              <button
                type="button"
                className="action-btn edit-strategy-btn"
                onClick={() => {
                  setViewDetailSetup(null);
                  handleOpenEdit(viewDetailSetup);
                }}
              >
                ✏️ แก้ไขพิมพ์เขียวนี้
              </button>
              <button type="button" className="primary-btn" onClick={() => setViewDetailSetup(null)}>
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
