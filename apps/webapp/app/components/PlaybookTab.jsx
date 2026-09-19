'use client';

import { useState, useEffect } from 'react';

const STATUS_CONFIG = {
  WATCHLIST: { label: 'เฝ้าระวัง / แผนรอ', color: '#ff9f0a', bg: 'rgba(255, 159, 10, 0.15)', border: 'rgba(255, 159, 10, 0.3)', emoji: '🟡' },
  ACTIVE: { label: 'เข้าออเดอร์แล้ว / รันอยู่', color: '#0a84ff', bg: 'rgba(10, 132, 255, 0.15)', border: 'rgba(10, 132, 255, 0.3)', emoji: '🔵' },
  WIN: { label: 'ชนเป้า (WIN)', color: '#30d158', bg: 'rgba(48, 209, 88, 0.15)', border: 'rgba(48, 209, 88, 0.3)', emoji: '🟢' },
  LOSS: { label: 'โดนตัดขาดทุน (LOSS)', color: '#ff453a', bg: 'rgba(255, 69, 58, 0.15)', border: 'rgba(255, 69, 58, 0.3)', emoji: '🔴' },
  BREAKEVEN: { label: 'เสมอทุน (BE)', color: '#98989d', bg: 'rgba(152, 152, 157, 0.15)', border: 'rgba(152, 152, 157, 0.3)', emoji: '⚪' },
  CANCELLED: { label: 'ยกเลิกแผน', color: '#636366', bg: 'rgba(99, 99, 102, 0.15)', border: 'rgba(99, 99, 102, 0.3)', emoji: '⚫' },
};

export default function PlaybookTab() {
  const [strategy, setStrategy] = useState(null);
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [directionFilter, setDirectionFilter] = useState('ALL');

  // Modals
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [viewDetailTrade, setViewDetailTrade] = useState(null);

  // Trade Form State
  const initialForm = {
    date: new Date().toISOString().split('T')[0],
    title: '',
    symbol: 'BTC',
    direction: 'LONG',
    status: 'WATCHLIST',
    entry_price: '',
    sl_price: '',
    tp_price: '',
    rr_ratio: '',
    risk_usd: '100',
    thesis: '',
    checklist: ['HTF Trend In Favor', 'Key Level Rejection', 'R:R >= 2.0', 'Risk <= 1%'],
    chart_url: '',
    realized_r: '',
    review_notes: '',
  };
  const [formData, setFormData] = useState(initialForm);

  // Strategy Form State
  const [strategyForm, setStrategyForm] = useState({
    title: '',
    core_thesis: '',
    entry_rules: '',
    invalidation_rules: '',
    risk_rules: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/playbook');
      if (res.ok) {
        const data = await res.json();
        setStrategy(data.strategy || null);
        setTrades(data.trades || []);
        setStats(data.stats || null);
        if (data.strategy) {
          setStrategyForm(data.strategy);
        }
      }
    } catch (err) {
      console.error('Failed to load playbook data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Calculate R:R automatically when entry, sl, tp change
  useEffect(() => {
    const entry = parseFloat(formData.entry_price);
    const sl = parseFloat(formData.sl_price);
    const tp = parseFloat(formData.tp_price);

    if (entry && sl && tp) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      if (risk > 0) {
        const ratio = Math.round((reward / risk) * 10) / 10;
        setFormData((prev) => ({ ...prev, rr_ratio: ratio }));
      }
    }
  }, [formData.entry_price, formData.sl_price, formData.tp_price]);

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
    setEditingTrade(null);
    setFormData({
      ...initialForm,
      date: new Date().toISOString().split('T')[0],
    });
    setShowTradeModal(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (trade) => {
    setEditingTrade(trade);
    setFormData({
      date: trade.date || new Date().toISOString().split('T')[0],
      title: trade.title || '',
      symbol: trade.symbol || '',
      direction: trade.direction || 'LONG',
      status: trade.status || 'WATCHLIST',
      entry_price: trade.entry_price !== null ? String(trade.entry_price) : '',
      sl_price: trade.sl_price !== null ? String(trade.sl_price) : '',
      tp_price: trade.tp_price !== null ? String(trade.tp_price) : '',
      rr_ratio: trade.rr_ratio !== null ? String(trade.rr_ratio) : '',
      risk_usd: trade.risk_usd !== null ? String(trade.risk_usd) : '',
      thesis: trade.thesis || '',
      checklist: Array.isArray(trade.checklist) ? trade.checklist : [],
      chart_url: trade.chart_url || '',
      realized_r: trade.realized_r !== null ? String(trade.realized_r) : '',
      review_notes: trade.review_notes || '',
    });
    setShowTradeModal(true);
  };

  // Save Trade (Create or Update)
  const handleSaveTrade = async (e) => {
    e.preventDefault();
    try {
      if (editingTrade) {
        // Update
        const res = await fetch('/api/playbook', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingTrade.id, ...formData }),
        });
        if (res.ok) {
          setShowTradeModal(false);
          await fetchData();
        }
      } else {
        // Create
        const res = await fetch('/api/playbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          setShowTradeModal(false);
          await fetchData();
        }
      }
    } catch (err) {
      console.error('Error saving trade:', err);
    }
  };

  // Quick Change Status
  const handleQuickStatus = async (trade, newStatus) => {
    try {
      let realized_r = trade.realized_r;
      if (newStatus === 'WIN' && (realized_r === null || realized_r === undefined)) {
        realized_r = trade.rr_ratio || 2.0;
      } else if (newStatus === 'LOSS' && (realized_r === null || realized_r === undefined)) {
        realized_r = -1.0;
      } else if (newStatus === 'BREAKEVEN') {
        realized_r = 0.0;
      }

      const res = await fetch('/api/playbook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: trade.id, status: newStatus, realized_r }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Error updating trade status:', err);
    }
  };

  // Delete Trade
  const handleDeleteTrade = async (id) => {
    if (!confirm('ยืนยันลบแผนการเทรดนี้ออกจาก Playbook?')) return;
    try {
      const res = await fetch(`/api/playbook?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (viewDetailTrade && viewDetailTrade.id === id) setViewDetailTrade(null);
        await fetchData();
      }
    } catch (err) {
      console.error('Error deleting trade:', err);
    }
  };

  // Save Strategy
  const handleSaveStrategy = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_strategy',
          strategy: strategyForm,
        }),
      });
      if (res.ok) {
        setShowStrategyModal(false);
        await fetchData();
      }
    } catch (err) {
      console.error('Error updating strategy:', err);
    }
  };

  // Toggle Checklist item in Trade Form
  const toggleChecklist = (item) => {
    setFormData((prev) => {
      const current = prev.checklist || [];
      if (current.includes(item)) {
        return { ...prev, checklist: current.filter((x) => x !== item) };
      } else {
        return { ...prev, checklist: [...current, item] };
      }
    });
  };

  // Filter Trades
  const filteredTrades = trades.filter((t) => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (directionFilter !== 'ALL' && t.direction !== directionFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (t.title || '').toLowerCase().includes(q);
      const matchSymbol = (t.symbol || '').toLowerCase().includes(q);
      const matchThesis = (t.thesis || '').toLowerCase().includes(q);
      if (!matchTitle && !matchSymbol && !matchThesis) return false;
    }
    return true;
  });

  return (
    <div className="playbook-container">
      {/* 1. MASTER UNIFIED PLAN & THESIS BANNER */}
      <div className="glass-panel playbook-master-card">
        <div className="playbook-master-header">
          <div className="master-badge-title">
            <span className="master-icon">🎯</span>
            <div>
              <h3>{strategy?.title || 'Skynet Unified Trading Plan & Thesis'}</h3>
              <p className="master-subtitle">แผนหลักหนึ่งเดียว — ใช้เกณฑ์เดียวกันกับทุกเหรียญและทุกการเทรด</p>
            </div>
          </div>
          <div className="master-actions">
            <button
              className="action-btn edit-strategy-btn"
              onClick={() => {
                if (strategy) setStrategyForm(strategy);
                setShowStrategyModal(true);
              }}
            >
              <span>⚙️ ปรับแต่งแผนหลัก & เกณฑ์</span>
            </button>
            <button
              className={`action-btn sync-ggd-btn ${syncing ? 'loading' : ''}`}
              onClick={handleSyncGgd}
              disabled={syncing}
              title="ส่งสำรองข้อมูลทั้งหมดขึ้น Google Sheets/Drive"
            >
              <span>☁️ {syncing ? 'กำลังซิงค์ GGD...' : 'ซิงค์ไป Google (GGD)'}</span>
            </button>
          </div>
        </div>

        {/* Master Rules Highlights */}
        <div className="master-rules-grid">
          <div className="rule-box thesis-box">
            <div className="rule-label">💡 Core Thesis (สมมติฐานหลัก)</div>
            <div className="rule-content">{strategy?.core_thesis || '-'}</div>
          </div>
          <div className="rule-box entry-box">
            <div className="rule-label">✅ Entry Checklist (เงื่อนไขการเข้า)</div>
            <div className="rule-content rule-multiline">{strategy?.entry_rules || '-'}</div>
          </div>
          <div className="rule-box invalidation-box">
            <div className="rule-label">⚠️ Invalidation (จุดผิดทาง)</div>
            <div className="rule-content rule-multiline">{strategy?.invalidation_rules || '-'}</div>
          </div>
          <div className="rule-box risk-box">
            <div className="rule-label">⚖️ Risk Rules (การคุมความเสี่ยง)</div>
            <div className="rule-content rule-multiline">{strategy?.risk_rules || '-'}</div>
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
      </div>

      {/* 2. STATS OVERVIEW BAR */}
      <div className="playbook-stats-grid">
        <div className="stat-card glass-panel">
          <div className="stat-icon">📚</div>
          <div>
            <div className="stat-value">{stats?.totalTrades || 0}</div>
            <div className="stat-label">บันทึกทั้งหมด</div>
          </div>
        </div>
        <div className="stat-card glass-panel highlight-active">
          <div className="stat-icon">⚡</div>
          <div>
            <div className="stat-value">{stats?.activeCount || 0}</div>
            <div className="stat-label">กำลังเทรด (Active)</div>
          </div>
        </div>
        <div className="stat-card glass-panel">
          <div className="stat-icon">🎯</div>
          <div>
            <div className="stat-value">{stats?.winRate || 0}%</div>
            <div className="stat-label">Win Rate ({stats?.winCount || 0}W / {stats?.lossCount || 0}L)</div>
          </div>
        </div>
        <div className="stat-card glass-panel highlight-r">
          <div className="stat-icon">📈</div>
          <div>
            <div className="stat-value" style={{ color: (stats?.totalRealizedR || 0) >= 0 ? 'var(--life-color)' : 'var(--extravagant-color)' }}>
              {(stats?.totalRealizedR || 0) >= 0 ? `+${stats?.totalRealizedR || 0}` : stats?.totalRealizedR || 0} R
            </div>
            <div className="stat-label">Net Realized R</div>
          </div>
        </div>
      </div>

      {/* 3. TOOLBAR & CONTROLS */}
      <div className="playbook-toolbar glass-panel">
        <div className="toolbar-left">
          <button className="primary-btn add-trade-btn" onClick={handleOpenAdd}>
            <span>➕ จดบันทึก Setup ใหม่</span>
          </button>

          {/* Search Box */}
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="ค้นหาชื่อแผน, เหรียญ, หรือ Thesis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>
        </div>

        <div className="toolbar-right">
          {/* Direction Filter */}
          <div className="pill-group">
            <button
              className={`pill-btn ${directionFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setDirectionFilter('ALL')}
            >
              All
            </button>
            <button
              className={`pill-btn long ${directionFilter === 'LONG' ? 'active' : ''}`}
              onClick={() => setDirectionFilter('LONG')}
            >
              LONG 🟢
            </button>
            <button
              className={`pill-btn short ${directionFilter === 'SHORT' ? 'active' : ''}`}
              onClick={() => setDirectionFilter('SHORT')}
            >
              SHORT 🔴
            </button>
          </div>

          {/* Status Filter */}
          <select
            className="status-dropdown-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">สถานะทั้งหมด</option>
            <option value="WATCHLIST">🟡 เฝ้าระวัง / แผนรอ</option>
            <option value="ACTIVE">🔵 เข้าออเดอร์แล้ว (Active)</option>
            <option value="WIN">🟢 ชนเป้า (WIN)</option>
            <option value="LOSS">🔴 โดน SL (LOSS)</option>
            <option value="BREAKEVEN">⚪ เสมอทุน (BE)</option>
            <option value="CANCELLED">⚫ ยกเลิกแผน</option>
          </select>
        </div>
      </div>

      {/* 4. TRADES GRID */}
      {loading ? (
        <div className="empty-state glass-panel">
          <div className="pulse-dot" style={{ margin: '0 auto 16px auto' }}></div>
          <p>กำลังโหลด Playbook...</p>
        </div>
      ) : filteredTrades.length === 0 ? (
        <div className="empty-state glass-panel">
          <div className="empty-icon">📖</div>
          <h3>ยังไม่มีรายการบันทึกในมุมมองนี้</h3>
          <p>กดปุ่ม <strong>"➕ จดบันทึก Setup ใหม่"</strong> เพื่อเริ่มบันทึกแผนตาม Master Strategy ได้เลย</p>
        </div>
      ) : (
        <div className="trades-grid">
          {filteredTrades.map((t) => {
            const statusCfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.WATCHLIST;
            const isLong = t.direction === 'LONG';

            return (
              <div key={t.id} className="trade-card glass-panel">
                {/* Top Row: Symbol, Direction, Date & Status */}
                <div className="card-top-row">
                  <div className="card-symbol-badge">
                    <span className={`direction-badge ${isLong ? 'long' : 'short'}`}>
                      {isLong ? '🟢 LONG' : '🔴 SHORT'}
                    </span>
                    <strong className="symbol-name">{t.symbol || 'ASSET'}</strong>
                    <span className="card-date">{t.date}</span>
                  </div>

                  <span
                    className="status-badge-pill"
                    style={{
                      backgroundColor: statusCfg.bg,
                      color: statusCfg.color,
                      borderColor: statusCfg.border,
                    }}
                  >
                    {statusCfg.emoji} {statusCfg.label}
                  </span>
                </div>

                {/* Card Title */}
                <h4 className="card-title" onClick={() => setViewDetailTrade(t)} title="คลิกเพื่อดูรายละเอียด">
                  {t.title}
                </h4>

                {/* Price & RR Highlights */}
                <div className="card-price-grid">
                  <div className="price-item">
                    <span className="p-label">Entry</span>
                    <span className="p-val">{t.entry_price ? t.entry_price.toLocaleString() : '-'}</span>
                  </div>
                  <div className="price-item sl">
                    <span className="p-label">Stop Loss</span>
                    <span className="p-val">{t.sl_price ? t.sl_price.toLocaleString() : '-'}</span>
                  </div>
                  <div className="price-item tp">
                    <span className="p-label">Take Profit</span>
                    <span className="p-val">{t.tp_price ? t.tp_price.toLocaleString() : '-'}</span>
                  </div>
                  <div className="price-item rr">
                    <span className="p-label">R:R Planned</span>
                    <span className="p-val bold">{t.rr_ratio ? `1 : ${t.rr_ratio}R` : '-'}</span>
                  </div>
                </div>

                {/* Thesis Snippet */}
                {t.thesis && (
                  <div className="card-thesis-snippet" onClick={() => setViewDetailTrade(t)}>
                    <span className="thesis-quote-icon">“</span>
                    <span className="thesis-text">{t.thesis}</span>
                  </div>
                )}

                {/* Checklist Chips */}
                {t.checklist && t.checklist.length > 0 && (
                  <div className="card-chips-wrap">
                    {t.checklist.map((item, idx) => (
                      <span key={idx} className="confluence-chip">✓ {item}</span>
                    ))}
                  </div>
                )}

                {/* Outcome & Review (if closed) */}
                {(t.status === 'WIN' || t.status === 'LOSS' || t.status === 'BREAKEVEN') && (
                  <div className={`card-outcome-banner ${t.status.toLowerCase()}`}>
                    <div className="outcome-r">
                      <strong>ผลลัพธ์:</strong>{' '}
                      <span className="r-tag">
                        {t.realized_r !== null && t.realized_r !== undefined
                          ? t.realized_r >= 0
                            ? `+${t.realized_r} R`
                            : `${t.realized_r} R`
                          : '-'}
                      </span>
                    </div>
                    {t.review_notes && (
                      <div className="outcome-review">
                        📝 <em>{t.review_notes}</em>
                      </div>
                    )}
                  </div>
                )}

                {/* Chart Link if available */}
                {t.chart_url && (
                  <div className="card-chart-link">
                    <a href={t.chart_url} target="_blank" rel="noopener noreferrer">
                      📈 ดูรูปชาร์ตการเทรด ↗
                    </a>
                  </div>
                )}

                {/* Card Footer: Quick Status Toggles & Actions */}
                <div className="card-footer">
                  <div className="quick-status-buttons">
                    <button
                      className={`qs-btn ${t.status === 'ACTIVE' ? 'active' : ''}`}
                      onClick={() => handleQuickStatus(t, 'ACTIVE')}
                      title="กำลังเทรด"
                    >
                      🔵 Active
                    </button>
                    <button
                      className={`qs-btn win ${t.status === 'WIN' ? 'active' : ''}`}
                      onClick={() => handleQuickStatus(t, 'WIN')}
                      title="ชนะเป้า"
                    >
                      🟢 Win
                    </button>
                    <button
                      className={`qs-btn loss ${t.status === 'LOSS' ? 'active' : ''}`}
                      onClick={() => handleQuickStatus(t, 'LOSS')}
                      title="แพ้ SL"
                    >
                      🔴 Loss
                    </button>
                    <button
                      className={`qs-btn be ${t.status === 'BREAKEVEN' ? 'active' : ''}`}
                      onClick={() => handleQuickStatus(t, 'BREAKEVEN')}
                      title="เสมอทุน"
                    >
                      ⚪ BE
                    </button>
                  </div>

                  <div className="card-actions">
                    <button className="icon-action-btn" onClick={() => handleOpenEdit(t)} title="แก้ไข">
                      ✏️
                    </button>
                    <button className="icon-action-btn delete" onClick={() => handleDeleteTrade(t.id)} title="ลบ">
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. ADD / EDIT TRADE MODAL */}
      {showTradeModal && (
        <div className="modal-overlay" onClick={() => setShowTradeModal(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">{editingTrade ? '✏️' : '➕'}</span>
                <div>
                  <h3>{editingTrade ? 'แก้ไขแผนการเทรด' : 'จดบันทึก Setup ใหม่ตามแผนหลัก'}</h3>
                  <p className="modal-subtitle">บันทึกรายละเอียด แผนการเข้า และ Thesis เฉพาะไม้นี้</p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowTradeModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveTrade} className="trade-modal-form">
              {/* Row 1: Symbol & Direction */}
              <div className="form-row two-cols">
                <div className="form-field">
                  <label>สัญลักษณ์ / เหรียญ (Symbol)</label>
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

                <div className="form-field">
                  <label>ทิศทาง (Direction)</label>
                  <div className="direction-toggle-group">
                    <button
                      type="button"
                      className={`dir-btn long ${formData.direction === 'LONG' ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, direction: 'LONG' })}
                    >
                      🟢 LONG (ซื้อ)
                    </button>
                    <button
                      type="button"
                      className={`dir-btn short ${formData.direction === 'SHORT' ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, direction: 'SHORT' })}
                    >
                      🔴 SHORT (ขาย)
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Title & Date */}
              <div className="form-row two-cols">
                <div className="form-field">
                  <label>ชื่อเซ็ตอัพ / หัวข้อแผน</label>
                  <input
                    type="text"
                    placeholder="เช่น HTF Key Support Sweep & Rejection"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>วันที่วางแผน / เข้าเทรด</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Row 3: Prices & Auto R:R */}
              <div className="form-row four-cols prices-row">
                <div className="form-field">
                  <label>ราคาเข้า (Entry)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={formData.entry_price}
                    onChange={(e) => setFormData({ ...formData, entry_price: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>Stop Loss (SL)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={formData.sl_price}
                    onChange={(e) => setFormData({ ...formData, sl_price: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>Take Profit (TP)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={formData.tp_price}
                    onChange={(e) => setFormData({ ...formData, tp_price: e.target.value })}
                  />
                </div>
                <div className="form-field rr-field">
                  <label>R:R คำนวณอัตโนมัติ</label>
                  <div className="auto-rr-box">
                    <strong>{formData.rr_ratio ? `1 : ${formData.rr_ratio} R` : '-'}</strong>
                  </div>
                </div>
              </div>

              {/* Confluence Checklist */}
              <div className="form-field">
                <label>เงื่อนไขคอนเฟิร์มตามแผนหลัก (Checklist)</label>
                <div className="checklist-toggle-wrap">
                  {[
                    'HTF Trend In Favor',
                    'Key Level Rejection',
                    'Liquidity Swept',
                    'Momentum / Divergence',
                    'R:R >= 2.0',
                    'Risk <= 1%',
                  ].map((rule) => {
                    const checked = formData.checklist.includes(rule);
                    return (
                      <button
                        key={rule}
                        type="button"
                        className={`checklist-tag ${checked ? 'checked' : ''}`}
                        onClick={() => toggleChecklist(rule)}
                      >
                        {checked ? '✓ ' : '+ '} {rule}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Specific Trade Thesis */}
              <div className="form-field">
                <label>สมมติฐานการเทรดเฉพาะไม้นี้ (Thesis)</label>
                <textarea
                  rows="2"
                  placeholder="เหตุผลทำไมถึงเปิดออเดอร์ไม้นี้? พฤติกรรมราคาหรือข่าวอะไรที่สนับสนุน?"
                  value={formData.thesis}
                  onChange={(e) => setFormData({ ...formData, thesis: e.target.value })}
                />
              </div>

              {/* Chart URL & Status */}
              <div className="form-row two-cols">
                <div className="form-field">
                  <label>ลิงก์ภาพชาร์ต (Chart URL / TradingView)</label>
                  <input
                    type="url"
                    placeholder="https://www.tradingview.com/x/... หรือ Google Drive link"
                    value={formData.chart_url}
                    onChange={(e) => setFormData({ ...formData, chart_url: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>สถานะของออเดอร์</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="WATCHLIST">🟡 เฝ้าระวัง / แผนรอ</option>
                    <option value="ACTIVE">🔵 เข้าออเดอร์แล้ว (Active)</option>
                    <option value="WIN">🟢 ชนเป้า (WIN)</option>
                    <option value="LOSS">🔴 โดน SL (LOSS)</option>
                    <option value="BREAKEVEN">⚪ เสมอทุน (BE)</option>
                    <option value="CANCELLED">⚫ ยกเลิกแผน</option>
                  </select>
                </div>
              </div>

              {/* Post-Trade Outcome (Collapsible / Visible when closed) */}
              {(formData.status === 'WIN' || formData.status === 'LOSS' || formData.status === 'BREAKEVEN') && (
                <div className="post-trade-section glass-panel">
                  <h5>📝 บันทึกผลลัพธ์หลังปิดออเดอร์ (Post-Trade Review)</h5>
                  <div className="form-row two-cols">
                    <div className="form-field">
                      <label>Realized R (ผลตอบแทนจริง)</label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="เช่น 3.0 หรือ -1.0 หรือ 0"
                        value={formData.realized_r}
                        onChange={(e) => setFormData({ ...formData, realized_r: e.target.value })}
                      />
                    </div>
                    <div className="form-field">
                      <label>บทเรียน / สิ่งที่ทำได้ดี / ข้อผิดพลาด</label>
                      <input
                        type="text"
                        placeholder="เช่น รันตามแผนได้ดี, ไม่ขยับ SL สุ่มสี่สุ่มห้า"
                        value={formData.review_notes}
                        onChange={(e) => setFormData({ ...formData, review_notes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="modal-footer">
                <button type="button" className="action-btn cancel-btn" onClick={() => setShowTradeModal(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="primary-btn save-trade-btn">
                  💾 {editingTrade ? 'บันทึกการแก้ไข' : 'บันทึกแผนลง Playbook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. EDIT MASTER STRATEGY MODAL */}
      {showStrategyModal && (
        <div className="modal-overlay" onClick={() => setShowStrategyModal(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="modal-icon">🎯</span>
                <div>
                  <h3>ปรับแต่ง Master Trading Plan & Unified Thesis</h3>
                  <p className="modal-subtitle">ตั้งค่าเกณฑ์และสมมติฐานหลักหนึ่งเดียวที่จะนำไปใช้กับทุกการเทรด</p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setShowStrategyModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveStrategy} className="strategy-modal-form">
              <div className="form-field">
                <label>ชื่อแผนการเทรดหลัก (Master Plan Title)</label>
                <input
                  type="text"
                  value={strategyForm.title}
                  onChange={(e) => setStrategyForm({ ...strategyForm, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>💡 Core Thesis (สมมติฐานหลัก / ทำไมระบบนี้ถึงมี Edge ในตลาด)</label>
                <textarea
                  rows="3"
                  value={strategyForm.core_thesis}
                  onChange={(e) => setStrategyForm({ ...strategyForm, core_thesis: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>✅ Entry Rules & Checklist (เงื่อนไขและเกณฑ์การเข้าออเดอร์)</label>
                <textarea
                  rows="4"
                  value={strategyForm.entry_rules}
                  onChange={(e) => setStrategyForm({ ...strategyForm, entry_rules: e.target.value })}
                  placeholder="แยกข้อละ 1 บรรทัด..."
                />
              </div>

              <div className="form-field">
                <label>⚠️ Invalidation Criteria (จุดหรือสัญญาณที่บ่งบอกว่าสมมติฐานพัง)</label>
                <textarea
                  rows="3"
                  value={strategyForm.invalidation_rules}
                  onChange={(e) => setStrategyForm({ ...strategyForm, invalidation_rules: e.target.value })}
                  placeholder="แยกข้อละ 1 บรรทัด..."
                />
              </div>

              <div className="form-field">
                <label>⚖️ Risk Management Rules (กฎการบริหารความเสี่ยง & การคุม Drawdown)</label>
                <textarea
                  rows="3"
                  value={strategyForm.risk_rules}
                  onChange={(e) => setStrategyForm({ ...strategyForm, risk_rules: e.target.value })}
                  placeholder="เช่น เสี่ยงไม่เกิน 1% ต่อไม้, R:R >= 2.0 เสมอ"
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="action-btn cancel-btn" onClick={() => setShowStrategyModal(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="primary-btn save-trade-btn">
                  💾 บันทึกแผนหลัก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. TRADE DETAIL INSPECTOR MODAL */}
      {viewDetailTrade && (
        <div className="modal-overlay" onClick={() => setViewDetailTrade(null)}>
          <div className="modal-content detail-inspector glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className={`direction-badge ${viewDetailTrade.direction === 'LONG' ? 'long' : 'short'}`}>
                  {viewDetailTrade.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}
                </span>
                <div>
                  <h3>{viewDetailTrade.title}</h3>
                  <p className="modal-subtitle">{viewDetailTrade.symbol || 'ASSET'} • {viewDetailTrade.date}</p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setViewDetailTrade(null)}>✕</button>
            </div>

            <div className="detail-body">
              {/* Status & RR */}
              <div className="detail-pills-row">
                <span className="status-badge-pill">
                  {STATUS_CONFIG[viewDetailTrade.status]?.emoji} {STATUS_CONFIG[viewDetailTrade.status]?.label}
                </span>
                {viewDetailTrade.rr_ratio && (
                  <span className="rr-badge-pill">
                    🎯 R:R Planned: 1 : {viewDetailTrade.rr_ratio}R
                  </span>
                )}
                {viewDetailTrade.realized_r !== null && viewDetailTrade.realized_r !== undefined && (
                  <span className={`rr-badge-pill ${viewDetailTrade.realized_r >= 0 ? 'win' : 'loss'}`}>
                    📊 Realized: {viewDetailTrade.realized_r >= 0 ? `+${viewDetailTrade.realized_r}` : viewDetailTrade.realized_r} R
                  </span>
                )}
              </div>

              {/* Price Details */}
              <div className="card-price-grid detail-price-grid">
                <div className="price-item">
                  <span className="p-label">Entry</span>
                  <span className="p-val">{viewDetailTrade.entry_price ? viewDetailTrade.entry_price.toLocaleString() : '-'}</span>
                </div>
                <div className="price-item sl">
                  <span className="p-label">Stop Loss</span>
                  <span className="p-val">{viewDetailTrade.sl_price ? viewDetailTrade.sl_price.toLocaleString() : '-'}</span>
                </div>
                <div className="price-item tp">
                  <span className="p-label">Take Profit</span>
                  <span className="p-val">{viewDetailTrade.tp_price ? viewDetailTrade.tp_price.toLocaleString() : '-'}</span>
                </div>
              </div>

              {/* Thesis */}
              {viewDetailTrade.thesis && (
                <div className="detail-section">
                  <div className="detail-section-title">💡 Trade Thesis</div>
                  <p className="detail-text">{viewDetailTrade.thesis}</p>
                </div>
              )}

              {/* Checklist */}
              {viewDetailTrade.checklist && viewDetailTrade.checklist.length > 0 && (
                <div className="detail-section">
                  <div className="detail-section-title">✅ Confirmed Criteria</div>
                  <div className="card-chips-wrap">
                    {viewDetailTrade.checklist.map((item, idx) => (
                      <span key={idx} className="confluence-chip">✓ {item}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Post-Trade Review */}
              {viewDetailTrade.review_notes && (
                <div className="detail-section">
                  <div className="detail-section-title">📝 Post-Trade Reflection & Review</div>
                  <p className="detail-text review-box">{viewDetailTrade.review_notes}</p>
                </div>
              )}

              {/* Chart Link */}
              {viewDetailTrade.chart_url && (
                <div className="detail-section">
                  <div className="detail-section-title">📈 Chart Snapshot</div>
                  <a
                    href={viewDetailTrade.chart_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chart-open-link"
                  >
                    เปิดดูชาร์ตการเทรดในแท็บใหม่ ↗
                  </a>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="action-btn edit-strategy-btn"
                onClick={() => {
                  setViewDetailTrade(null);
                  handleOpenEdit(viewDetailTrade);
                }}
              >
                ✏️ แก้ไขแผนนี้
              </button>
              <button type="button" className="primary-btn" onClick={() => setViewDetailTrade(null)}>
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
