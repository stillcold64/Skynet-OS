'use client';

import { useState, useEffect } from 'react';

const OUTCOME_CONFIG = {
  WIN: { label: 'WIN (ชนะเป้า)', emoji: '🟢', color: '#30d158', bg: 'rgba(48, 209, 88, 0.15)', border: 'rgba(48, 209, 88, 0.4)' },
  LOSS: { label: 'LOSS (แพ้)', emoji: '🔴', color: '#ff453a', bg: 'rgba(255, 69, 58, 0.15)', border: 'rgba(255, 69, 58, 0.4)' },
  BREAKEVEN: { label: 'BE (เสมอทุน)', emoji: '⚪', color: '#98989d', bg: 'rgba(152, 152, 157, 0.15)', border: 'rgba(152, 152, 157, 0.4)' },
  BE: { label: 'BE (เสมอทุน)', emoji: '⚪', color: '#98989d', bg: 'rgba(152, 152, 157, 0.15)', border: 'rgba(152, 152, 157, 0.4)' },
  RUNNING: { label: 'RUNNING (กำลังถือ)', emoji: '🔵', color: '#0a84ff', bg: 'rgba(10, 132, 255, 0.15)', border: 'rgba(10, 132, 255, 0.4)' },
};

export default function TradeTrackerTab() {
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [playbookSetups, setPlaybookSetups] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [setupFilter, setSetupFilter] = useState('ALL');

  // Modals & Forms
  const [showModal, setShowModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const initialForm = {
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    symbol: 'BTC',
    direction: 'LONG',
    playbook_code: 'SETUP-01',
    playbook_title: '',
    outcome: 'RUNNING',
    notes: '',
    chart_url: '',
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [trackerRes, playbookRes] = await Promise.all([
        fetch('/api/tracker'),
        fetch('/api/playbook'),
      ]);

      if (trackerRes.ok) {
        const data = await trackerRes.json();
        setTrades(data.trades || []);
        setStats(data.stats || null);
      }

      if (playbookRes.ok) {
        const pData = await playbookRes.json();
        setPlaybookSetups(pData.setups || []);
      }
    } catch (err) {
      console.error('Failed to load trade tracker data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingTrade(null);
    const defaultSetup = playbookSetups[0];
    setFormData({
      ...initialForm,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      playbook_code: defaultSetup ? defaultSetup.code : 'SETUP-01',
      playbook_title: defaultSetup ? defaultSetup.title : '',
    });
    setShowModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (t) => {
    setEditingTrade(t);
    setFormData({
      date: t.date || '',
      time: t.time || '',
      symbol: t.symbol || '',
      direction: t.direction || 'LONG',
      playbook_code: t.playbook_code || 'SETUP-01',
      playbook_title: t.playbook_title || '',
      outcome: t.outcome || 'RUNNING',
      notes: t.notes || '',
      chart_url: t.chart_url || '',
    });
    setShowModal(true);
  };

  // Save Trade (Create or Update) with Auto-Sync
  const handleSaveTrade = async (e) => {
    e.preventDefault();
    try {
      // Find matching title for selected setup code
      const matchedSetup = playbookSetups.find((s) => s.code === formData.playbook_code);
      const titleToSave = matchedSetup ? matchedSetup.title : formData.playbook_title;

      const payload = {
        ...formData,
        playbook_title: titleToSave,
      };

      if (editingTrade) {
        const res = await fetch('/api/tracker', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingTrade.id, ...payload }),
        });
        const data = await res.json();
        if (data.success) {
          setShowModal(false);
          setToastMessage(data.message || 'อัปเดตไม้เทรดสำเร็จ!');
          setTimeout(() => setToastMessage(null), 3500);
          await fetchData();
        }
      } else {
        const res = await fetch('/api/tracker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setShowModal(false);
          setToastMessage(data.message || 'บันทึกไม้เทรดสำเร็จ!');
          setTimeout(() => setToastMessage(null), 3500);
          await fetchData();
        }
      }
    } catch (err) {
      console.error('Error saving trade:', err);
    }
  };

  // 1-Click Quick Outcome Toggle on the card
  const handleQuickOutcome = async (trade, newOutcome) => {
    try {
      const res = await fetch('/api/tracker', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: trade.id, outcome: newOutcome }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Error updating outcome:', err);
    }
  };

  // Delete Trade
  const handleDeleteTrade = async (id, symbol) => {
    if (!confirm(`ยืนยันลบไม้เทรด ${symbol} นี้?`)) return;
    try {
      const res = await fetch(`/api/tracker?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Error deleting trade:', err);
    }
  };

  // Filter Trades
  const filteredTrades = trades.filter((t) => {
    if (outcomeFilter !== 'ALL') {
      if (outcomeFilter === 'BE' && (t.outcome !== 'BE' && t.outcome !== 'BREAKEVEN')) return false;
      if (outcomeFilter !== 'BE' && t.outcome !== outcomeFilter) return false;
    }
    if (setupFilter !== 'ALL' && t.playbook_code !== setupFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSymbol = (t.symbol || '').toLowerCase().includes(q);
      const matchCode = (t.playbook_code || '').toLowerCase().includes(q);
      const matchTitle = (t.playbook_title || '').toLowerCase().includes(q);
      const matchNotes = (t.notes || '').toLowerCase().includes(q);
      if (!matchSymbol && !matchCode && !matchTitle && !matchNotes) return false;
    }
    return true;
  });

  return (
    <div className="tracker-container">
      {/* 1. HERO & ACTION BAR */}
      <div className="glass-panel tracker-master-card">
        <div className="tracker-header-top">
          <div className="tracker-title-wrap">
            <span className="tracker-icon">⚡</span>
            <div>
              <h3>Trade Tracker — บันทึกไม้เทรดเรียลไทม์</h3>
              <p className="tracker-subtitle">
                บันทึกการเทรดแต่ละไม้ เชื่อมโยงกับ Playbook Setup — เร็ว ชัดเจน ไม่มี RR/TP/SL ให้รก พร้อม <strong>Auto-Sync ขึ้น Google (GGD) อัตโนมัติ</strong>
              </p>
            </div>
          </div>

          <div className="master-actions">
            <button className="primary-btn add-trade-btn" onClick={handleOpenAdd}>
              <span>➕ จดไม้เทรดใหม่</span>
            </button>
          </div>
        </div>

        {/* Live Auto-Sync Toast */}
        {toastMessage && (
          <div className="sync-toast success" style={{ marginTop: '14px' }}>
            <span>⚡</span>
            <span>{toastMessage}</span>
          </div>
        )}
      </div>

      {/* 2. STATS OVERVIEW BAR */}
      <div className="tracker-stats-grid">
        <div className="stat-card glass-panel">
          <div className="stat-icon">📊</div>
          <div>
            <div className="stat-value">{stats?.totalTrades || 0}</div>
            <div className="stat-label">ไม้ทั้งหมดที่บันทึก</div>
          </div>
        </div>

        <div className="stat-card glass-panel highlight-r">
          <div className="stat-icon">🏆</div>
          <div>
            <div className="stat-value" style={{ color: '#30d158' }}>
              {stats?.winRate || 0}%
            </div>
            <div className="stat-label">
              Win Rate ({stats?.winCount || 0}W / {stats?.lossCount || 0}L / {stats?.beCount || 0}BE)
            </div>
          </div>
        </div>

        <div className="stat-card glass-panel highlight-active">
          <div className="stat-icon">🎯</div>
          <div>
            <div className="stat-value" style={{ color: '#64d2ff', fontSize: '18px' }}>
              {stats?.bestSetup ? `${stats.bestSetup.code} (${stats.bestSetup.winRate}%)` : 'ยังไม่มีข้อมูล'}
            </div>
            <div className="stat-label">ท่าไม้ตายที่ชนะบ่อยสุด</div>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon">🔵</div>
          <div>
            <div className="stat-value" style={{ color: '#0a84ff' }}>
              {stats?.runningCount || 0}
            </div>
            <div className="stat-label">ไม้ที่กำลังถืออยู่ (Running)</div>
          </div>
        </div>
      </div>

      {/* 3. TOOLBAR & CONTROLS */}
      <div className="playbook-toolbar glass-panel">
        <div className="toolbar-left">
          {/* Search Box */}
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="ค้นหาเหรียญ (BTC, Gold), รหัส Setup หรือ Notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>
        </div>

        <div className="toolbar-right">
          {/* Outcome Filter */}
          <div className="pill-group">
            <button
              className={`pill-btn ${outcomeFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setOutcomeFilter('ALL')}
            >
              ทั้งหมด
            </button>
            <button
              className={`pill-btn long ${outcomeFilter === 'WIN' ? 'active' : ''}`}
              onClick={() => setOutcomeFilter('WIN')}
            >
              WIN 🟢
            </button>
            <button
              className={`pill-btn short ${outcomeFilter === 'LOSS' ? 'active' : ''}`}
              onClick={() => setOutcomeFilter('LOSS')}
            >
              LOSS 🔴
            </button>
            <button
              className={`pill-btn ${outcomeFilter === 'BE' ? 'active' : ''}`}
              onClick={() => setOutcomeFilter('BE')}
            >
              BE ⚪
            </button>
            <button
              className={`pill-btn ${outcomeFilter === 'RUNNING' ? 'active' : ''}`}
              style={{ color: outcomeFilter === 'RUNNING' ? '#0a84ff' : '' }}
              onClick={() => setOutcomeFilter('RUNNING')}
            >
              RUNNING 🔵
            </button>
          </div>

          {/* Playbook Setup Filter Dropdown */}
          <select
            className="status-dropdown-filter"
            value={setupFilter}
            onChange={(e) => setSetupFilter(e.target.value)}
          >
            <option value="ALL">ทุก Playbook Setup</option>
            {playbookSetups.map((s) => (
              <option key={s.id} value={s.code}>
                {s.code}: {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. TRADES LIST */}
      {loading ? (
        <div className="empty-state glass-panel">
          <div className="pulse-dot" style={{ margin: '0 auto 16px auto' }}></div>
          <p>กำลังโหลด Trade Tracker...</p>
        </div>
      ) : filteredTrades.length === 0 ? (
        <div className="empty-state glass-panel">
          <div className="empty-icon">⚡</div>
          <h3>ยังไม่มีรายการไม้เทรดในมุมมองนี้</h3>
          <p>กดปุ่ม <strong>"➕ จดไม้เทรดใหม่"</strong> เพื่อเริ่มบันทึกไม้เทรดได้เลย</p>
        </div>
      ) : (
        <div className="tracker-trades-grid">
          {filteredTrades.map((t) => {
            const outcomeCfg = OUTCOME_CONFIG[t.outcome] || OUTCOME_CONFIG.RUNNING;
            const isLong = t.direction === 'LONG';

            return (
              <div key={t.id} className="trade-card tracker-card glass-panel">
                {/* Top Row: Symbol, Direction, Date/Time & Outcome Badge */}
                <div className="card-top-row">
                  <div className="card-symbol-badge">
                    <strong className="symbol-name large">{t.symbol}</strong>
                    <span className={`direction-badge ${isLong ? 'long' : 'short'}`}>
                      {isLong ? '🟢 LONG' : '🔴 SHORT'}
                    </span>
                    <span className="card-date">{t.date} {t.time ? `• ${t.time}` : ''}</span>
                  </div>

                  <span
                    className="status-badge-pill"
                    style={{
                      backgroundColor: outcomeCfg.bg,
                      color: outcomeCfg.color,
                      borderColor: outcomeCfg.border,
                    }}
                  >
                    {outcomeCfg.emoji} {outcomeCfg.label.split('(')[0]}
                  </span>
                </div>

                {/* Linked Playbook Setup Banner */}
                <div className="tracker-setup-pill">
                  <span className="setup-mini-tag">{t.playbook_code}</span>
                  <span className="setup-mini-title">{t.playbook_title || 'Playbook Setup'}</span>
                </div>

                {/* Notes Snippet */}
                {t.notes && (
                  <div className="tracker-notes-box">
                    <span className="notes-quote">“</span>
                    <span className="notes-text">{t.notes}</span>
                  </div>
                )}

                {/* Chart Link if available */}
                {t.chart_url && (
                  <div className="card-chart-link">
                    <a href={t.chart_url} target="_blank" rel="noopener noreferrer">
                      📈 ดูรูปชาร์ตไม้เทรด ↗
                    </a>
                  </div>
                )}

                {/* Footer: 1-Click Quick Outcome Toggles & Edit/Delete */}
                <div className="card-footer">
                  <div className="quick-status-buttons">
                    <button
                      className={`qs-btn win ${t.outcome === 'WIN' ? 'active' : ''}`}
                      onClick={() => handleQuickOutcome(t, 'WIN')}
                      title="ชนะเป้า"
                    >
                      🟢 Win
                    </button>
                    <button
                      className={`qs-btn loss ${t.outcome === 'LOSS' ? 'active' : ''}`}
                      onClick={() => handleQuickOutcome(t, 'LOSS')}
                      title="แพ้"
                    >
                      🔴 Loss
                    </button>
                    <button
                      className={`qs-btn be ${t.outcome === 'BE' || t.outcome === 'BREAKEVEN' ? 'active' : ''}`}
                      onClick={() => handleQuickOutcome(t, 'BE')}
                      title="เสมอทุน"
                    >
                      ⚪ BE
                    </button>
                    <button
                      className={`qs-btn ${t.outcome === 'RUNNING' ? 'active' : ''}`}
                      onClick={() => handleQuickOutcome(t, 'RUNNING')}
                      title="กำลังถือ"
                    >
                      🔵 Running
                    </button>
                  </div>

                  <div className="card-actions">
                    <button className="icon-action-btn" onClick={() => handleOpenEdit(t)} title="แก้ไข">
                      ✏️
                    </button>
                    <button className="icon-action-btn delete" onClick={() => handleDeleteTrade(t.id, t.symbol)} title="ลบ">
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. ADD / EDIT FAST ENTRY MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">{editingTrade ? '✏️' : '⚡'}</span>
                <div>
                  <h3>{editingTrade ? 'แก้ไขไม้เทรด' : 'จดบันทึกไม้เทรดใหม่'}</h3>
                  <p className="modal-subtitle">บันทึกง่าย รวดเร็ว เชื่อมโยง Playbook — ระบบ Auto-Sync ขึ้น GGD อัตโนมัติ</p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveTrade} className="trade-modal-form">
              {/* Row 1: Symbol with Quick Chips */}
              <div className="form-field">
                <label>คู่เหรียญ / สินทรัพย์ (Symbol)</label>
                <div className="symbol-input-group">
                  <input
                    type="text"
                    placeholder="เช่น BTC, ETH, XAUUSD, EURUSD"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    required
                  />
                  <div className="quick-symbol-chips">
                    {['BTC', 'ETH', 'SOL', 'XAUUSD', 'EURUSD'].map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        className={`chip-btn ${formData.symbol === sym ? 'active' : ''}`}
                        onClick={() => setFormData({ ...formData, symbol: sym })}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 2: Direction & Outcome */}
              <div className="form-row two-cols">
                <div className="form-field">
                  <label>ทิศทาง (Direction)</label>
                  <div className="direction-toggle-group">
                    <button
                      type="button"
                      className={`dir-btn long ${formData.direction === 'LONG' ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, direction: 'LONG' })}
                    >
                      🟢 LONG
                    </button>
                    <button
                      type="button"
                      className={`dir-btn short ${formData.direction === 'SHORT' ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, direction: 'SHORT' })}
                    >
                      🔴 SHORT
                    </button>
                  </div>
                </div>

                <div className="form-field">
                  <label>ผลลัพธ์ของไม้ (Outcome)</label>
                  <select
                    value={formData.outcome}
                    onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
                  >
                    <option value="RUNNING">🔵 RUNNING (กำลังถืออยู่)</option>
                    <option value="WIN">🟢 WIN (ชนะเป้า)</option>
                    <option value="LOSS">🔴 LOSS (แพ้/โดนคัท)</option>
                    <option value="BREAKEVEN">⚪ BREAKEVEN (เสมอทุน)</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Playbook Setup Selector (Key Feature!) */}
              <div className="form-field">
                <label>🎯 Playbook Setup ที่ใช้ (ดึงจากคลังพิมพ์เขียว)</label>
                <select
                  value={formData.playbook_code}
                  onChange={(e) => {
                    const code = e.target.value;
                    const matched = playbookSetups.find((s) => s.code === code);
                    setFormData({
                      ...formData,
                      playbook_code: code,
                      playbook_title: matched ? matched.title : '',
                    });
                  }}
                  required
                >
                  {playbookSetups.map((s) => (
                    <option key={s.id} value={s.code}>
                      [{s.code}] {s.title} ({s.grade})
                    </option>
                  ))}
                </select>
              </div>

              {/* Row 4: Date & Time */}
              <div className="form-row two-cols">
                <div className="form-field">
                  <label>วันที่เข้าเทรด</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>เวลา</label>
                  <input
                    type="text"
                    placeholder="เช่น 14:30"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="form-field">
                <label>📝 บันทึกสั้นๆ หน้างาน (Notes)</label>
                <textarea
                  rows="2"
                  placeholder="เช่น เข้าตอนเกิด Rejection สวยงาม, ไม่กลัวตกรถ, ทำตามแผนเป๊ะ"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              {/* Chart URL */}
              <div className="form-field">
                <label>📈 ลิงก์รูปชาร์ตไม้เทรด (TradingView / Google Drive URL)</label>
                <input
                  type="url"
                  placeholder="https://www.tradingview.com/x/..."
                  value={formData.chart_url}
                  onChange={(e) => setFormData({ ...formData, chart_url: e.target.value })}
                />
              </div>

              {/* Auto Sync Notice */}
              <div className="auto-sync-notice">
                <span>⚡</span>
                <span>บันทึกปุ๊บ ระบบจะ <strong>Auto-Sync ขึ้น Google Sheets (GGD) ทันที</strong> ในเบื้องหลัง</span>
              </div>

              {/* Modal Footer */}
              <div className="modal-footer">
                <button type="button" className="action-btn cancel-btn" onClick={() => setShowModal(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="primary-btn">
                  💾 {editingTrade ? 'บันทึกการแก้ไข' : 'บันทึกไม้เทรด (Auto-Sync GGD)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
