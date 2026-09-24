'use client';

import { useState, useEffect } from 'react';
import PlaybookTab from './components/PlaybookTab';
import JournalTab from './components/JournalTab';
import TradeTrackerTab from './components/TradeTrackerTab';
import FocusTab from './components/FocusTab';

const CATEGORY_META = {
  LIFE: { name: 'LIFE', emoji: '🌿', label: 'ชีวิตประจำวัน / อาหาร', color: 'var(--life-color)' },
  EXTRAVAGANT: { name: 'EXTRAVAGANT', emoji: '✨', label: 'ฟุ่มเฟือย / บันเทิง', color: 'var(--extravagant-color)' },
  BILL: { name: 'BILL', emoji: '📄', label: 'บิล / หนี้สิน / คงที่', color: 'var(--bill-color)' },
  INVESTING: { name: 'INVESTING', emoji: '📈', label: 'การลงทุน / ออมเงิน', color: 'var(--investing-color)' },
  ETC: { name: 'ETC', emoji: '📦', label: 'เบ็ดเตล็ด / อื่น ๆ', color: 'var(--etc-color)' },
};

export default function Home() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedDateStr, setSelectedDateStr] = useState(null);

  // Mode state: 'finance' | 'trading'
  const [appMode, setAppMode] = useState('finance');
  // Tab state: 'calendar' | 'debts' | 'focus' | 'tracker' | 'playbook' | 'journal'
  const [activeTab, setActiveTab] = useState('calendar');

  const handleSwitchMode = (mode) => {
    setAppMode(mode);
    if (mode === 'finance') {
      if (activeTab === 'playbook' || activeTab === 'tracker' || activeTab === 'journal' || activeTab === 'focus') {
        setActiveTab('calendar');
      }
    } else {
      if (activeTab === 'calendar' || activeTab === 'debts') {
        setActiveTab('focus');
      }
    }
  };

  // Data states
  const [transactions, setTransactions] = useState([]);
  const [groupTotals, setGroupTotals] = useState({ LIFE: 0, EXTRAVAGANT: 0, BILL: 0, INVESTING: 0, ETC: 0 });
  const [dailyMap, setDailyMap] = useState({});
  const [botLogs, setBotLogs] = useState([]);
  const [debtsData, setDebtsData] = useState(null);
  const [allTimeStats, setAllTimeStats] = useState(null);
  const [drilldownModal, setDrilldownModal] = useState(null);
  const [rateInput, setRateInput] = useState('36.0');
  const [loading, setLoading] = useState(true);

  const currentMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  const fetchData = async () => {
    try {
      setLoading(true);
      const [txRes, logRes, debtRes] = await Promise.all([
        fetch(`/api/transactions?month=${currentMonthStr}`),
        fetch('/api/logs'),
        fetch('/api/debts'),
      ]);

      if (txRes.ok) {
        const data = await txRes.json();
        setTransactions(data.transactions || []);
        setGroupTotals(data.groupTotals || { LIFE: 0, EXTRAVAGANT: 0, BILL: 0, INVESTING: 0, ETC: 0 });
        setDailyMap(data.dailyMap || {});
        setAllTimeStats(data.allTimeStats || null);
      }

      if (logRes.ok) {
        const logData = await logRes.json();
        setBotLogs(logData.logs || []);
      }

      if (debtRes.ok) {
        const dData = await debtRes.json();
        setDebtsData(dData);
        if (dData.drawdown && dData.drawdown.exchangeRate) {
          setRateInput(String(dData.drawdown.exchangeRate));
        }
      }
    } catch (err) {
      console.error('Fetch data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 4 seconds so when user sends a message in Telegram, web updates in real time
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setDrilldownModal(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('ยืนยันลบรายการนี้?')) return;
    try {
      const res = await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleUpdateCategory = async (id, newGroup) => {
    // Optimistic UI update
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              category_group: newGroup,
              type: newGroup === 'INVESTING' ? 'การลงทุน' : 'ค่าใช้จ่าย',
            }
          : t
      )
    );

    try {
      const res = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, category_group: newGroup }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        console.error('Update category failed');
        await fetchData();
      }
    } catch (err) {
      console.error('Update category error:', err);
      await fetchData();
    }
  };


  const handleUpdateRate = async (newRate) => {
    setRateInput(newRate);
    const num = parseFloat(newRate);
    if (!isNaN(num) && num > 0) {
      try {
        await fetch('/api/debts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_rate', exchangeRate: num }),
        });
        const res = await fetch('/api/debts');
        if (res.ok) setDebtsData(await res.json());
      } catch (e) {
        console.error('Update rate error:', e);
      }
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  // Month navigation
  const prevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // Calendar calculations
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const firstDayIndex = new Date(selectedYear, selectedMonth - 1, 1).getDay(); // 0 = Sun, 1 = Mon ...
  const monthNamesThai = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];

  const calendarDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarDays.push({
      day: d,
      dateStr: dStr,
      data: dailyMap[dStr] || null,
    });
  }

  const selectedDayItems = selectedDateStr
    ? transactions.filter((t) => t.date === selectedDateStr)
    : [];

  const selectedDayTotal = selectedDayItems.reduce((sum, item) => sum + item.amount, 0);

  // Monthly & Multi-month Calculations
  const monthlyExpenses = (groupTotals.LIFE || 0) + (groupTotals.EXTRAVAGANT || 0) + (groupTotals.BILL || 0) + (groupTotals.ETC || 0);
  const monthlyFixed = groupTotals.BILL || 0;
  const monthlyVariable = (groupTotals.LIFE || 0) + (groupTotals.EXTRAVAGANT || 0) + (groupTotals.ETC || 0);
  const fixedPct = monthlyExpenses > 0 ? ((monthlyFixed / monthlyExpenses) * 100).toFixed(0) : '0';
  const variablePct = monthlyExpenses > 0 ? ((monthlyVariable / monthlyExpenses) * 100).toFixed(0) : '0';

  const allTimeTotal = allTimeStats?.totalExpense ?? monthlyExpenses;
  const allTimeMonthsCount = allTimeStats?.monthsCount ?? 1;
  const allTimeMonthlyAvg = allTimeStats?.monthlyAverage ?? monthlyExpenses;

  return (
    <main>
      {/* iOS Header */}
      <header className="glass-panel ios-header">
        <div className="brand">
          <div className="brand-icon">⚡</div>
          <div>
            <h1>Skynet OS</h1>
            <p>
              {appMode === 'finance'
                ? 'ระบบบริหารการเงินส่วนตัว & จัดการหนี้สิน (รับข้อมูลอัตโนมัติจาก Telegram @my_skynet_money_bot)'
                : 'ระบบบริหารการเทรด (Trade Tracker บันทึกไม้เทรด, Playbook พิมพ์เขียว & Emotion Journal)'}
            </p>
          </div>
        </div>

        <div className="status-badge">
          <div className="pulse-dot" />
          <span>{appMode === 'finance' ? 'Telegram Sync Live' : 'GGD Auto-Sync Active'}</span>
        </div>
      </header>

      {/* Mode Switcher: Personal Finance vs Trading System */}
      <div className="mode-switcher-container">
        <div className="mode-segmented-control">
          <button
            className={`mode-tab-btn finance ${appMode === 'finance' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('finance')}
          >
            <span>💰</span>
            <span>การเงินส่วนตัว</span>
          </button>
          <button
            className={`mode-tab-btn trading ${appMode === 'trading' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('trading')}
          >
            <span>📈</span>
            <span>ระบบการเทรด</span>
          </button>
        </div>

        {/* Sub-tabs for the selected mode */}
        <div className="ios-segmented-control sub-nav-control">
          {appMode === 'finance' ? (
            <>
              <button
                className={`segmented-button ${activeTab === 'calendar' ? 'active' : ''}`}
                onClick={() => setActiveTab('calendar')}
              >
                <span>📅</span>
                <span>ปฏิทิน & ค่าใช้จ่าย</span>
              </button>
              <button
                className={`segmented-button ${activeTab === 'debts' ? 'active' : ''}`}
                onClick={() => setActiveTab('debts')}
              >
                <span>💳</span>
                <span>หนี้สิน & พอร์ตติดลบ</span>
              </button>
            </>
          ) : (
            <>
              <button
                className={`segmented-button ${activeTab === 'focus' ? 'active' : ''}`}
                onClick={() => setActiveTab('focus')}
              >
                <span>🔥</span>
                <span>Focus & Heatmap (เป้าหมาย 3 ข้อ)</span>
              </button>
              <button
                className={`segmented-button ${activeTab === 'tracker' ? 'active' : ''}`}
                onClick={() => setActiveTab('tracker')}
              >
                <span>⚡</span>
                <span>Trade Tracker (บันทึกไม้เทรด)</span>
              </button>
              <button
                className={`segmented-button ${activeTab === 'playbook' ? 'active' : ''}`}
                onClick={() => setActiveTab('playbook')}
              >
                <span>🎯</span>
                <span>Playbook & Thesis (พิมพ์เขียว)</span>
              </button>
              <button
                className={`segmented-button ${activeTab === 'journal' ? 'active' : ''}`}
                onClick={() => setActiveTab('journal')}
              >
                <span>🧠</span>
                <span>Emotion Journal (ปฏิทินอารมณ์)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* TAB 1: CALENDAR & EXPENSES */}
      {activeTab === 'calendar' && (
        <>
          {/* Overview Hero Cards (ยอดประจำเดือน & สรุปภาพรวมสะสมทุกเดือน) */}
          <section className="monthly-hero-grid">
            <div className="glass-panel monthly-hero-card total" onClick={() => setDrilldownModal('total')} title="กดเพื่อดูรายละเอียดค่าใช้จ่ายเดือนนี้">
              <div className="hero-top-row">
                <div className="hero-label">
                  <span>💳</span>
                  <span>ยอดรวมประจำเดือน</span>
                </div>
                <span className="hero-badge badge-month">📅 เดือนนี้</span>
              </div>
              <div className="hero-value">{formatCurrency(monthlyExpenses)} ฿</div>
              <div className="hero-sub">เดือน{monthNamesThai[selectedMonth - 1]} {selectedYear} ({transactions.length} รายการ)</div>
              <div className="hero-click-hint"><span>🔍 กดดูที่มา & รายการทั้งหมด</span></div>
            </div>

            <div className="glass-panel monthly-hero-card fixed" onClick={() => setDrilldownModal('fixed')} title="กดเพื่อดูที่มาของค่าใช้จ่ายที่แน่นอน">
              <div className="hero-top-row">
                <div className="hero-label">
                  <span>📌</span>
                  <span>ค่าใช้จ่ายที่แน่นอน</span>
                </div>
                <span className="hero-badge badge-month">📅 เดือนนี้</span>
              </div>
              <div className="hero-value">{formatCurrency(monthlyFixed)} ฿</div>
              <div className="hero-sub">บิล ค่างวด และหนี้สิน ({fixedPct}% ของเดือนนี้)</div>
              <div className="hero-click-hint"><span>🔍 กดดูรายการบิล & หนี้สิน</span></div>
            </div>

            <div className="glass-panel monthly-hero-card variable" onClick={() => setDrilldownModal('variable')} title="กดเพื่อดูที่มาของค่าใช้จ่ายผันแปร">
              <div className="hero-top-row">
                <div className="hero-label">
                  <span>🌿</span>
                  <span>ค่าใช้จ่ายผันแปร</span>
                </div>
                <span className="hero-badge badge-month">📅 เดือนนี้</span>
              </div>
              <div className="hero-value">{formatCurrency(monthlyVariable)} ฿</div>
              <div className="hero-sub">อาหาร ค่าใช้จ่ายทั่วไป ({variablePct}% ของเดือนนี้)</div>
              <div className="hero-click-hint"><span>🔍 กดดูรายการกินอยู่ & ทั่วไป</span></div>
            </div>

            <div className="glass-panel monthly-hero-card grand-total" onClick={() => setDrilldownModal('grand-total')} title="กดเพื่อดูสรุปรายเดือนทุกเดือน">
              <div className="hero-top-row">
                <div className="hero-label">
                  <span>🌐</span>
                  <span>ผลรวมสะสม (ทุกเดือน)</span>
                </div>
                <span className="hero-badge badge-alltime">🌐 สะสมทุกเดือน</span>
              </div>
              <div className="hero-value">{formatCurrency(allTimeTotal)} ฿</div>
              <div className="hero-sub">รวมค่าใช้จ่ายสะสม {allTimeMonthsCount} เดือนในระบบ</div>
              <div className="hero-click-hint"><span>🔍 กดดูตารางรวมทุกเดือน</span></div>
            </div>

            <div className="glass-panel monthly-hero-card grand-avg" onClick={() => setDrilldownModal('grand-avg')} title="กดเพื่อดูสูตรและการคำนวณค่าเฉลี่ย">
              <div className="hero-top-row">
                <div className="hero-label">
                  <span>📊</span>
                  <span>ค่าเฉลี่ยรวมต่อเดือน</span>
                </div>
                <span className="hero-badge badge-alltime">🌐 เฉลี่ยทุกเดือน</span>
              </div>
              <div className="hero-value">{formatCurrency(allTimeMonthlyAvg)} ฿ <span style={{ fontSize: '16px', fontWeight: '500' }}>/ ด.</span></div>
              <div className="hero-sub">เฉลี่ยภาพรวมทุกเดือน (คำนวณเดือนถัดไปอัตโนมัติ)</div>
              <div className="hero-click-hint"><span>🔍 กดดูสูตรและการคำนวณ</span></div>
            </div>
          </section>

          {/* 5 iOS Category Cards */}
          <section className="categories-grid">
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <div key={key} className={`glass-panel category-card ${key.toLowerCase()}`}>
                <div className="card-top">
                  <div className="card-title">
                    <span>{meta.emoji}</span>
                    <span>{meta.name}</span>
                  </div>
                </div>
                <div className="card-amount">{formatCurrency(groupTotals[key])} ฿</div>
              </div>
            ))}
          </section>

          {/* Main Dashboard: Calendar + Day Details */}
          <section className="dashboard-grid">
            {/* Calendar View */}
            <div className="glass-panel calendar-card">
              <div className="calendar-nav">
                <button onClick={prevMonth} className="calendar-nav-btn">◀ เดือนก่อนหน้า</button>
                <div className="calendar-month-title">
                  📅 {monthNamesThai[selectedMonth - 1]} {selectedYear}
                </div>
                <button onClick={nextMonth} className="calendar-nav-btn">เดือนถัดไป ▶</button>
              </div>

              <div className="calendar-weekdays">
                <span>อา.</span>
                <span>จ.</span>
                <span>อ.</span>
                <span>พ.</span>
                <span>พฤ.</span>
                <span>ศ.</span>
                <span>ส.</span>
              </div>

              <div className="calendar-days-grid">
                {calendarDays.map((item, idx) => {
                  if (!item) {
                    return <div key={`empty-${idx}`} className="calendar-cell empty" />;
                  }

                  const hasData = Boolean(item.data && item.data.total > 0);
                  const isSelected = selectedDateStr === item.dateStr;
                  const isToday =
                    item.dateStr ===
                    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                  return (
                    <div
                      key={item.dateStr}
                      onClick={() => setSelectedDateStr(item.dateStr)}
                      className={`calendar-cell ${hasData ? 'has-data' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                    >
                      <div className="cell-top">
                        <span className="cell-day-num">{item.day}</span>
                      </div>

                      {hasData && (
                        <>
                          <div className="cell-amount">{formatCurrency(item.data.total)}</div>
                          <div className="cell-badges">
                            {Object.keys(item.data.groups || {}).map((grp) => (
                              <span key={grp} className="badge-dot" title={grp}>
                                {CATEGORY_META[grp]?.emoji || '•'}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Day Details Panel */}
            <div className="glass-panel day-details-card">
              <div className="day-details-header">
                <div className="day-details-title">
                  {selectedDateStr ? `รายละเอียดประจำวันที่ ${selectedDateStr}` : 'คลิกเลือกวันที่ในปฏิทิน'}
                </div>
                {selectedDateStr && (
                  <div className="day-details-total">
                    ยอดรวม: {formatCurrency(selectedDayTotal)} ฿
                  </div>
                )}
              </div>

              {!selectedDateStr ? (
                <div className="empty-placeholder">
                  เลือกวันที่ในตารางปฏิทินเพื่อดูรายการของวันนั้น
                </div>
              ) : selectedDayItems.length === 0 ? (
                <div className="empty-placeholder">
                  ไม่มีรายการบันทึกในวันนี้
                </div>
              ) : (
                <div className="day-items-list">
                  {selectedDayItems.map((item) => (
                    <div key={item.id} className="day-item-row">
                      <div className="item-left">
                        <span className="item-name">{item.category}</span>
                        <select
                          value={item.category_group}
                          onChange={(e) => handleUpdateCategory(item.id, e.target.value)}
                          className={`item-group-select ${item.category_group}`}
                          title="คลิกเพื่อเปลี่ยนหมวดหมู่"
                        >
                          <option value="LIFE">🌿 LIFE</option>
                          <option value="EXTRAVAGANT">✨ EXTRAVAGANT</option>
                          <option value="BILL">📄 BILL</option>
                          <option value="INVESTING">📈 INVESTING</option>
                          <option value="ETC">📦 ETC</option>
                        </select>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="item-amount">{formatCurrency(item.amount)} ฿</div>
                        <button
                          onClick={() => handleDelete(item.id)}
                          title="ลบรายการนี้"
                          style={{
                            background: 'rgba(255, 55, 95, 0.15)',
                            border: '1px solid rgba(255, 55, 95, 0.4)',
                            color: '#ff375f',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '600',
                          }}
                        >
                          🗑️ ลบ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* All Transactions Table & Management */}
          <section className="glass-panel audit-log-card" style={{ marginBottom: '24px' }}>
            <div className="audit-log-header">
              <div className="audit-log-title">
                <span>📋</span>
                <span>รายการธุรกรรมทั้งหมด ({transactions.length} รายการ) — สามารถกดลบรายการเฉพาะบรรทัดได้</span>
              </div>
            </div>

            {transactions.length === 0 ? (
              <div className="empty-placeholder">ไม่มีข้อมูลธุรกรรมในระบบ ส่งข้อความผ่าน Telegram เพื่อเริ่มต้นบันทึก</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '10px 12px' }}>วันที่</th>
                      <th style={{ padding: '10px 12px' }}>หมวดหมู่</th>
                      <th style={{ padding: '10px 12px' }}>ชื่อรายการ</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>จำนวนเงิน</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '10px 12px' }}>{item.date}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <select
                            value={item.category_group}
                            onChange={(e) => handleUpdateCategory(item.id, e.target.value)}
                            className={`item-group-select ${item.category_group}`}
                            title="คลิกเพื่อเปลี่ยนหมวดหมู่"
                          >
                            <option value="LIFE">🌿 LIFE</option>
                            <option value="EXTRAVAGANT">✨ EXTRAVAGANT</option>
                            <option value="BILL">📄 BILL</option>
                            <option value="INVESTING">📈 INVESTING</option>
                            <option value="ETC">📦 ETC</option>
                          </select>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: '600' }}>{item.category}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700' }}>
                          {formatCurrency(item.amount)} ฿
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDelete(item.id)}
                            style={{
                              background: 'rgba(255, 55, 95, 0.15)',
                              border: '1px solid rgba(255, 55, 95, 0.4)',
                              color: '#ff375f',
                              borderRadius: '6px',
                              padding: '3px 8px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: '600',
                            }}
                          >
                            🗑️ ลบ
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* TAB 2: DEBTS & INVESTMENT DRAWDOWN */}
      {activeTab === 'debts' && debtsData && (
        <>
          {/* Debts Overview Hero Cards */}
          <section className="monthly-hero-grid">
            <div className="glass-panel monthly-hero-card total">
              <div className="hero-label">
                <span>💳</span>
                <span>ยอดหนี้คงเหลือรวม</span>
              </div>
              <div className="hero-value">{formatCurrency(debtsData.totalRemainingDebt)} ฿</div>
              <div className="hero-sub">จากยอดหนี้ตั้งต้น {formatCurrency(debtsData.totalInitialDebt)} ฿</div>
            </div>

            <div className="glass-panel monthly-hero-card average">
              <div className="hero-label">
                <span>✅</span>
                <span>ชำระหนี้แล้วสะสม</span>
              </div>
              <div className="hero-value" style={{ color: '#30d158' }}>
                {formatCurrency(debtsData.totalPaidDebt)} ฿{' '}
                <span style={{ fontSize: '18px', fontWeight: '600', color: '#30d158' }}>
                  ({debtsData.overallProgressPct}%)
                </span>
              </div>
              <div className="hero-sub">คำนวณตัดลบอัตโนมัติจากค่าใช้จ่ายใน Telegram</div>
            </div>

            <div className="glass-panel monthly-hero-card invest">
              <div className="hero-label">
                <span>📉</span>
                <span>ยอดติดลบจากการลงทุน</span>
              </div>
              <div className="hero-value" style={{ color: '#bf5af2' }}>
                ${formatCurrency(debtsData.drawdown.amountUsd)} USD
              </div>
              <div className="hero-sub">
                ตีเป็นเงินไทย: {formatCurrency(debtsData.drawdown.amountThb)} ฿ (เรท {debtsData.drawdown.exchangeRate} ฿/$)
              </div>
            </div>

            <div className="glass-panel monthly-hero-card" style={{ border: '1px solid rgba(255, 69, 58, 0.4)' }}>
              <div className="hero-label">
                <span>🔴</span>
                <span>ภาระรวมสุทธิ (หนี้ + พอร์ตติดลบ)</span>
              </div>
              <div className="hero-value" style={{ color: '#ff453a' }}>
                {formatCurrency(debtsData.totalLiabilitiesTHB)} ฿
              </div>
              <div className="hero-sub">หนี้คงเหลือ ({formatCurrency(debtsData.totalRemainingDebt)} ฿) + พอร์ต ({formatCurrency(debtsData.drawdown.amountThb)} ฿)</div>
            </div>
          </section>

          {/* Investment Drawdown Control Card */}
          <section className="glass-panel drawdown-card">
            <div className="drawdown-header">
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#bf5af2' }}>
                  📉 ยอดติดลบจากพอร์ตการลงทุน ($5,000 USD)
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  คำนวณมูลค่าความเสียหายเทียบเท่าเงินบาท สามารถปรับอัตราแลกเปลี่ยนได้
                </p>
              </div>

              <div className="rate-control">
                <span>อัตราแลกเปลี่ยน (THB/USD):</span>
                <input
                  type="number"
                  step="0.05"
                  className="rate-input"
                  value={rateInput}
                  onChange={(e) => handleUpdateRate(e.target.value)}
                />
                <span>฿</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>ยอดติดลบในพอร์ต (USD)</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#f5f5f7' }}>
                  ${formatCurrency(debtsData.drawdown.amountUsd)}
                </div>
              </div>
              <div style={{ fontSize: '20px', color: 'var(--text-tertiary)' }}>➔</div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>คิดเป็นเงินบาทไทย (THB)</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#bf5af2' }}>
                  {formatCurrency(debtsData.drawdown.amountThb)} ฿
                </div>
              </div>
            </div>
          </section>

          {/* 4 Debts Cards Grid */}
          <section style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📑</span>
              <span>รายการหนี้สิน 4 รายการ (ตัดลดยอดอัตโนมัติเมื่อมีค่าใช้จ่ายเข้า)</span>
            </h3>

            <div className="debts-grid">
              {debtsData.debts.map((debt) => (
                <div key={debt.id} className="glass-panel debt-card">
                  <div className="debt-card-header">
                    <div className="debt-name-box">
                      <h3>{debt.name}</h3>
                      <span>{debt.note}</span>
                    </div>
                    <span className="interest-badge">ดอกเบี้ย {debt.interestRate}%/ปี</span>
                  </div>

                  <div className="debt-amounts-row">
                    <div className="amount-col">
                      <label>ยอดตั้งต้น</label>
                      <div className="val">{formatCurrency(debt.initialAmount)} ฿</div>
                    </div>
                    <div className="amount-col paid">
                      <label>ชำระแล้ว ({debt.paymentsCount} ครั้ง)</label>
                      <div className="val">-{formatCurrency(debt.paidAmount)} ฿</div>
                    </div>
                    <div className="amount-col rem">
                      <label>คงเหลือ</label>
                      <div className="val">{formatCurrency(debt.remainingAmount)} ฿</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="progress-box">
                    <div className="progress-labels">
                      <span>ความคืบหน้าการปลดหนี้</span>
                      <strong style={{ color: debt.progressPct > 0 ? '#30d158' : 'var(--text-secondary)' }}>
                        {debt.progressPct}%
                      </strong>
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${debt.progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Payment transactions history linked to this debt */}
                  {debt.payments && debt.payments.length > 0 && (
                    <div className="debt-history-box">
                      <div className="debt-history-title">
                        <span>ประวัติการชำระที่ตัดยอด ({debt.payments.length} รายการ):</span>
                      </div>
                      {debt.payments.map((p) => (
                        <div key={p.id} className="debt-history-item">
                          <span>[{p.date}] {p.category}</span>
                          <strong style={{ color: '#30d158' }}>-{formatCurrency(p.amount)} ฿</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* TRADING TABS */}
      {activeTab === 'focus' && <FocusTab />}
      {activeTab === 'tracker' && <TradeTrackerTab />}
      {activeTab === 'playbook' && <PlaybookTab />}
      {activeTab === 'journal' && <JournalTab />}

      {/* Bot Audit & Activity Log (Only in Personal Finance mode) */}
      {appMode === 'finance' && (
        <section className="glass-panel audit-log-card">
          <div className="audit-log-header">
            <div className="audit-log-title">
              <span>🛡️</span>
              <span>Bot Audit Log (ประวัติข้อความจาก Telegram และผลการแยกแยะ)</span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              ล่าสุด 20 รายการ
            </span>
          </div>

          {botLogs.length === 0 ? (
            <div className="empty-placeholder">ยังไม่มีประวัติการส่งข้อมูลจาก Telegram</div>
          ) : (
            <div className="audit-log-list">
              {botLogs.map((log) => {
                let parsedItems = [];
                try {
                  parsedItems = JSON.parse(log.parsed_data || '[]');
                } catch (e) {}

                return (
                  <div key={log.id} className="audit-log-item">
                    <div className="log-item-top">
                      <span>Log #{log.id} • บันทึกสำเร็จ {log.parsed_count} รายการ</span>
                      <span>{log.created_at}</span>
                    </div>
                    <div className="log-item-raw">"{log.raw_message}"</div>
                    {parsedItems.length > 0 && (
                      <div className="log-item-summary">
                        <strong>ผลการจำแนก:</strong>{' '}
                        {parsedItems.map((p, i) => (
                          <span key={i} style={{ marginRight: '10px' }}>
                            [{p.date}] {CATEGORY_META[p.category_group]?.emoji} {p.category}: {formatCurrency(p.amount)} ฿
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* DRILLDOWN INSPECTOR MODAL */}
      {drilldownModal && (
        <div className="drilldown-overlay" onClick={() => setDrilldownModal(null)}>
          <div className="drilldown-modal" onClick={(e) => e.stopPropagation()}>
            {/* 1. FIXED (ค่าใช้จ่ายที่แน่นอน) */}
            {drilldownModal === 'fixed' && (() => {
              const fixedItems = transactions
                .filter((t) => t.category_group === 'BILL' && t.type === 'ค่าใช้จ่าย')
                .sort((a, b) => b.amount - a.amount);
              return (
                <>
                  <div className="drilldown-header">
                    <div className="drilldown-title-group">
                      <span className="drilldown-icon">📌</span>
                      <div>
                        <h2 className="drilldown-title">ที่มา: ค่าใช้จ่ายที่แน่นอน</h2>
                        <div className="drilldown-subtitle">ประจำเดือน{monthNamesThai[selectedMonth - 1]} {selectedYear}</div>
                      </div>
                    </div>
                    <button className="drilldown-close-btn" onClick={() => setDrilldownModal(null)}>✕</button>
                  </div>

                  <div className="drilldown-kpi-bar">
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">ยอดรวมค่าใช้จ่ายที่แน่นอน</span>
                      <span className="drilldown-kpi-val" style={{ color: '#ffd60a' }}>{formatCurrency(monthlyFixed)} ฿</span>
                    </div>
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">จำนวนรายการ</span>
                      <span className="drilldown-kpi-val">{fixedItems.length} รายการ</span>
                    </div>
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">สัดส่วนในเดือนนี้</span>
                      <span className="drilldown-kpi-val">{fixedPct}%</span>
                    </div>
                  </div>

                  <div className="drilldown-formula-box">
                    <div className="drilldown-formula-title">💡 คำอธิบายหมวดค่าใช้จ่ายที่แน่นอน</div>
                    <div>
                      รวบรวมจากรายการหมวด <strong>📄 BILL</strong> ซึ่งประกอบด้วยค่างวดหนี้สิน (เช่น ธันเดอร์, PayLater, EasyCash, ฟินนิกซ์), ค่าบริการรายเดือน (เน็ต, GPU+YouTube), ค่าสาธารณูปโภค (ค่าน้ำ) และบิลประจำที่ต้องจ่ายแน่นอนในแต่ละเดือน
                    </div>
                  </div>

                  <div className="drilldown-body">
                    <div className="drilldown-item-list">
                      {fixedItems.map((item) => (
                        <div key={item.id} className="drilldown-row">
                          <div className="drilldown-row-left">
                            <div className="drilldown-row-title">
                              <span>📄</span>
                              <span>{item.category}</span>
                            </div>
                            <div className="drilldown-row-meta">
                              <span>📅 {item.date}</span>
                              {item.raw_text && <span>• ข้อความ: "{item.raw_text}"</span>}
                            </div>
                          </div>
                          <div className="drilldown-row-amount" style={{ color: '#ffd60a' }}>
                            {formatCurrency(item.amount)} ฿
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* 2. VARIABLE (ค่าใช้จ่ายผันแปร) */}
            {drilldownModal === 'variable' && (() => {
              const varItems = transactions
                .filter((t) => t.category_group !== 'BILL' && t.type === 'ค่าใช้จ่าย')
                .sort((a, b) => b.amount - a.amount);
              return (
                <>
                  <div className="drilldown-header">
                    <div className="drilldown-title-group">
                      <span className="drilldown-icon">🌿</span>
                      <div>
                        <h2 className="drilldown-title">ที่มา: ค่าใช้จ่ายผันแปร</h2>
                        <div className="drilldown-subtitle">ประจำเดือน{monthNamesThai[selectedMonth - 1]} {selectedYear}</div>
                      </div>
                    </div>
                    <button className="drilldown-close-btn" onClick={() => setDrilldownModal(null)}>✕</button>
                  </div>

                  <div className="drilldown-kpi-bar">
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">ยอดรวมค่าใช้จ่ายผันแปร</span>
                      <span className="drilldown-kpi-val" style={{ color: '#30d158' }}>{formatCurrency(monthlyVariable)} ฿</span>
                    </div>
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">จำนวนรายการ</span>
                      <span className="drilldown-kpi-val">{varItems.length} รายการ</span>
                    </div>
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">สัดส่วนในเดือนนี้</span>
                      <span className="drilldown-kpi-val">{variablePct}%</span>
                    </div>
                  </div>

                  <div className="drilldown-formula-box" style={{ background: 'rgba(48, 209, 88, 0.08)', borderColor: 'rgba(48, 209, 88, 0.25)', color: '#d2f9dc' }}>
                    <div className="drilldown-formula-title" style={{ color: '#30d158' }}>💡 คำอธิบายหมวดค่าใช้จ่ายผันแปร</div>
                    <div>
                      รวบรวมจากหมวด <strong>🌿 LIFE</strong> (ค่าอาหาร, แมว, ข้าวของเครื่องใช้), <strong>✨ EXTRAVAGANT</strong> (กาแฟ, เบียร์, พักผ่อนหย่อนใจ), และ <strong>📦 ETC</strong> (จิปาถะทั่วไป) ซึ่งเป็นค่าใช้จ่ายที่ปรับเปลี่ยนได้ตามการใช้ชีวิตประจำวัน
                    </div>
                  </div>

                  <div className="drilldown-body">
                    <div className="drilldown-item-list">
                      {varItems.map((item) => (
                        <div key={item.id} className="drilldown-row">
                          <div className="drilldown-row-left">
                            <div className="drilldown-row-title">
                              <span>{CATEGORY_META[item.category_group]?.emoji || '📦'}</span>
                              <span>{item.category}</span>
                              <span style={{ fontSize: '10px', padding: '1px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }}>
                                {item.category_group}
                              </span>
                            </div>
                            <div className="drilldown-row-meta">
                              <span>📅 {item.date}</span>
                              {item.raw_text && <span>• ข้อความ: "{item.raw_text}"</span>}
                            </div>
                          </div>
                          <div className="drilldown-row-amount" style={{ color: '#30d158' }}>
                            {formatCurrency(item.amount)} ฿
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* 3. MONTH TOTAL (ยอดรวมประจำเดือน) */}
            {drilldownModal === 'total' && (() => {
              const allMonthItems = transactions.filter((t) => t.type === 'ค่าใช้จ่าย');
              return (
                <>
                  <div className="drilldown-header">
                    <div className="drilldown-title-group">
                      <span className="drilldown-icon">💳</span>
                      <div>
                        <h2 className="drilldown-title">ที่มา: ยอดรวมค่าใช้จ่ายประจำเดือน</h2>
                        <div className="drilldown-subtitle">ประจำเดือน{monthNamesThai[selectedMonth - 1]} {selectedYear}</div>
                      </div>
                    </div>
                    <button className="drilldown-close-btn" onClick={() => setDrilldownModal(null)}>✕</button>
                  </div>

                  <div className="drilldown-kpi-bar">
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">ยอดรวมค่าใช้จ่ายเดือนนี้</span>
                      <span className="drilldown-kpi-val" style={{ color: '#64d2ff' }}>{formatCurrency(monthlyExpenses)} ฿</span>
                    </div>
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">จำนวนรายการ</span>
                      <span className="drilldown-kpi-val">{allMonthItems.length} รายการ</span>
                    </div>
                  </div>

                  <div className="drilldown-formula-box">
                    <div className="drilldown-formula-title">📊 สรุปโครงสร้างค่าใช้จ่ายเดือนนี้</div>
                    <div>
                      📌 ค่าใช้จ่ายที่แน่นอน (หนี้/บิล): <strong>{formatCurrency(monthlyFixed)} ฿ ({fixedPct}%)</strong><br/>
                      🌿 ค่าใช้จ่ายผันแปร (กินอยู่/ช้อป): <strong>{formatCurrency(monthlyVariable)} ฿ ({variablePct}%)</strong><br/>
                      รวมกันได้ยอดสุทธิ = <strong>{formatCurrency(monthlyExpenses)} ฿</strong>
                    </div>
                  </div>

                  <div className="drilldown-body">
                    <div className="drilldown-item-list">
                      {allMonthItems.map((item) => (
                        <div key={item.id} className="drilldown-row">
                          <div className="drilldown-row-left">
                            <div className="drilldown-row-title">
                              <span>{CATEGORY_META[item.category_group]?.emoji || '📦'}</span>
                              <span>{item.category}</span>
                              <span style={{ fontSize: '10px', padding: '1px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }}>
                                {item.category_group}
                              </span>
                            </div>
                            <div className="drilldown-row-meta">
                              <span>📅 {item.date}</span>
                              {item.raw_text && <span>• "{item.raw_text}"</span>}
                            </div>
                          </div>
                          <div className="drilldown-row-amount">
                            {formatCurrency(item.amount)} ฿
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* 4. GRAND TOTAL (ผลรวมสะสมทุกเดือน) */}
            {drilldownModal === 'grand-total' && (() => {
              const months = allTimeStats?.months || [{ ym: currentMonthStr, expense: monthlyExpenses, fixed: monthlyFixed, variable: monthlyVariable, count: transactions.length }];
              return (
                <>
                  <div className="drilldown-header">
                    <div className="drilldown-title-group">
                      <span className="drilldown-icon">🌐</span>
                      <div>
                        <h2 className="drilldown-title">ที่มา: ผลรวมสะสมทั้งหมด (ทุกเดือน)</h2>
                        <div className="drilldown-subtitle">รวบรวมข้อมูลรายจ่ายจากทุกเดือนในระบบ</div>
                      </div>
                    </div>
                    <button className="drilldown-close-btn" onClick={() => setDrilldownModal(null)}>✕</button>
                  </div>

                  <div className="drilldown-kpi-bar">
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">ยอดรวมสะสมทุกเดือน</span>
                      <span className="drilldown-kpi-val" style={{ color: '#da8fff' }}>{formatCurrency(allTimeTotal)} ฿</span>
                    </div>
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">จำนวนเดือนที่มีประวัติ</span>
                      <span className="drilldown-kpi-val">{allTimeMonthsCount} เดือน</span>
                    </div>
                  </div>

                  <div className="drilldown-formula-box" style={{ background: 'rgba(175, 82, 222, 0.08)', borderColor: 'rgba(175, 82, 222, 0.25)', color: '#f3e1ff' }}>
                    <div className="drilldown-formula-title" style={{ color: '#da8fff' }}>💡 วิธีการสะสมยอด</div>
                    <div>
                      ระบบดึงยอดค่าใช้จ่ายรวมจากทุกเดือนที่มีบันทึกมารวมกันอัตโนมัติ เมื่อขึ้นเดือนถัดไป (เช่น ตุลาคม, พฤศจิกายน ฯลฯ) ยอดค่าใช้จ่ายของเดือนใหม่จะถูกนำมาบวกทบเข้ากับยอดสะสมทันทีแบบเรียลไทม์
                    </div>
                  </div>

                  <div className="drilldown-body">
                    <table className="drilldown-table">
                      <thead>
                        <tr>
                          <th>เดือน</th>
                          <th>ที่แน่นอน (Fixed)</th>
                          <th>ผันแปร (Variable)</th>
                          <th>จำนวน</th>
                          <th style={{ textAlign: 'right' }}>ยอดรวมเดือน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {months.map((m) => (
                          <tr key={m.ym}>
                            <td style={{ fontWeight: '700', color: '#fff' }}>{m.ym}</td>
                            <td style={{ color: '#ffd60a' }}>{formatCurrency(m.fixed)} ฿</td>
                            <td style={{ color: '#30d158' }}>{formatCurrency(m.variable)} ฿</td>
                            <td>{m.count} รายการ</td>
                            <td style={{ textAlign: 'right', fontWeight: '800', color: '#64d2ff' }}>{formatCurrency(m.expense)} ฿</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.02)' }}>
                          <td colSpan={4} style={{ fontWeight: '700', color: '#fff' }}>รวมสะสมทั้งหมด ({months.length} เดือน)</td>
                          <td style={{ textAlign: 'right', fontWeight: '900', fontSize: '15px', color: '#da8fff' }}>{formatCurrency(allTimeTotal)} ฿</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              );
            })()}

            {/* 5. GRAND AVERAGE (ค่าเฉลี่ยรวมต่อเดือน) */}
            {drilldownModal === 'grand-avg' && (() => {
              const months = allTimeStats?.months || [{ ym: currentMonthStr, expense: monthlyExpenses, fixed: monthlyFixed, variable: monthlyVariable, count: transactions.length }];
              return (
                <>
                  <div className="drilldown-header">
                    <div className="drilldown-title-group">
                      <span className="drilldown-icon">📊</span>
                      <div>
                        <h2 className="drilldown-title">ที่มา: การคำนวณค่าเฉลี่ยรวมต่อเดือน</h2>
                        <div className="drilldown-subtitle">สูตรและการเฉลี่ยข้อมูลจากทุกเดือนในระบบ</div>
                      </div>
                    </div>
                    <button className="drilldown-close-btn" onClick={() => setDrilldownModal(null)}>✕</button>
                  </div>

                  <div className="drilldown-kpi-bar">
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">ค่าเฉลี่ยรวมต่อเดือน</span>
                      <span className="drilldown-kpi-val" style={{ color: '#ff7597' }}>{formatCurrency(allTimeMonthlyAvg)} ฿ / ด.</span>
                    </div>
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">ยอดรวมสะสมทุกเดือน</span>
                      <span className="drilldown-kpi-val">{formatCurrency(allTimeTotal)} ฿</span>
                    </div>
                    <div className="drilldown-kpi-item">
                      <span className="drilldown-kpi-label">หารด้วย</span>
                      <span className="drilldown-kpi-val">{allTimeMonthsCount} เดือน</span>
                    </div>
                  </div>

                  <div className="drilldown-formula-box" style={{ background: 'rgba(255, 55, 95, 0.08)', borderColor: 'rgba(255, 55, 95, 0.25)', color: '#ffe5ec' }}>
                    <div className="drilldown-formula-title" style={{ color: '#ff7597' }}>📐 สูตรการคำนวณ</div>
                    <div style={{ fontSize: '14px', margin: '4px 0 8px 0', fontFamily: 'monospace', fontWeight: 'bold' }}>
                      ค่าเฉลี่ยต่อเดือน = ยอดรวมทุกเดือน ({formatCurrency(allTimeTotal)} ฿) ÷ {allTimeMonthsCount} เดือน = {formatCurrency(allTimeMonthlyAvg)} ฿/เดือน
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>
                      💡 เมื่อมีเดือนถัดไป (เช่น ต.ค. ยอด 10,000 ฿) ระบบจะคำนวณ: ({formatCurrency(allTimeTotal)} + 10,000) ÷ 2 = ยอดเฉลี่ยใหม่ทันทีโดยอัตโนมัติ
                    </div>
                  </div>

                  <div className="drilldown-body">
                    <h3 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: 'var(--text-secondary)' }}>ข้อมูลรายเดือนที่นำมาคำนวณค่าเฉลี่ย:</h3>
                    <table className="drilldown-table">
                      <thead>
                        <tr>
                          <th>เดือน</th>
                          <th>คงที่ (Fixed)</th>
                          <th>ผันแปร (Variable)</th>
                          <th style={{ textAlign: 'right' }}>ยอดค่าใช้จ่ายเดือน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {months.map((m) => (
                          <tr key={m.ym}>
                            <td style={{ fontWeight: '700', color: '#fff' }}>{m.ym}</td>
                            <td style={{ color: '#ffd60a' }}>{formatCurrency(m.fixed)} ฿</td>
                            <td style={{ color: '#30d158' }}>{formatCurrency(m.variable)} ฿</td>
                            <td style={{ textAlign: 'right', fontWeight: '800', color: '#64d2ff' }}>{formatCurrency(m.expense)} ฿</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </main>
  );
}
