'use client';

import { useState, useEffect } from 'react';
import PlaybookTab from './components/PlaybookTab';
import JournalTab from './components/JournalTab';
import TradeTrackerTab from './components/TradeTrackerTab';
import FocusTab from './components/FocusTab';
import DailyTrackerTab from './components/DailyTrackerTab';
import MemoryAnchorTab from './components/MemoryAnchorTab';
import DailyReflectionTab from './components/DailyReflectionTab';
import ExpenseWaveChart from './components/ExpenseWaveChart';
import MissionControlTab from './components/MissionControlTab';

const CATEGORY_META = {
  LIFE: { name: 'LIFE', emoji: '🌿', label: 'ชีวิตประจำวัน / อาหาร', color: 'var(--life-color)' },
  EXTRAVAGANT: { name: 'EXTRAVAGANT', emoji: '✨', label: 'ฟุ่มเฟือย / บันเทิง', color: 'var(--extravagant-color)' },
  BILL: { name: 'BILL', emoji: '📄', label: 'บิล / หนี้สิน / คงที่', color: 'var(--bill-color)' },
  INVESTING: { name: 'INVESTING', emoji: '📈', label: 'การลงทุน / ออมเงิน', color: 'var(--investing-color)' },
  ETC: { name: 'ETC', emoji: '📦', label: 'เบ็ดเตล็ด / อื่น ๆ', color: 'var(--etc-color)' },
  INCOME: { name: 'INCOME', emoji: '💵', label: 'รายรับ / เงินกู้ฉุกเฉิน', color: '#10b981' },
};

export default function Home() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedDateStr, setSelectedDateStr] = useState(null);

  // Mode state: 'mission' | 'finance' | 'trading' | 'selfdev' (Command Center & 3 Core Pillars)
  const [appMode, setAppMode] = useState('mission');
  // Tab state: 'mission' | 'calendar' | 'debts' | 'tracker' | 'playbook' | 'journal' | 'focus' | 'habits'
  const [activeTab, setActiveTab] = useState('mission');

  const handleSwitchMode = (mode) => {
    setAppMode(mode);
    if (mode === 'mission') {
      setActiveTab('mission');
    } else if (mode === 'finance') {
      if (activeTab !== 'calendar' && activeTab !== 'debts') {
        setActiveTab('calendar');
      }
    } else if (mode === 'trading') {
      if (activeTab !== 'tracker' && activeTab !== 'playbook' && activeTab !== 'journal') {
        setActiveTab('tracker');
      }
    } else if (mode === 'selfdev') {
      if (activeTab !== 'reflections' && activeTab !== 'focus' && activeTab !== 'anchor' && activeTab !== 'habits') {
        setActiveTab('reflections');
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
  const [usdInput, setUsdInput] = useState('5000');
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [debtFormData, setDebtFormData] = useState({
    name: '',
    keywords: '',
    initialAmount: '',
    interestRate: '0',
    note: '',
  });
  const [editingTx, setEditingTx] = useState(null);
  const [txFormData, setTxFormData] = useState({
    date: '',
    category: '',
    category_group: 'LIFE',
    sub_category: 'ทั่วไป',
    amount: '',
  });
  const [loading, setLoading] = useState(true);
  const [isAuditLogCollapsed, setIsAuditLogCollapsed] = useState(true);

  const handleUndoLog = async (logId) => {
    if (!window.confirm(`ยืนยันการลบและยกเลิกรายการที่บันทึกจาก Log #${logId} หรือไม่?`)) return;
    try {
      const res = await fetch(`/api/logs?id=${logId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(err.message || 'เกิดข้อผิดพลาดในการยกเลิก');
      }
    } catch (e) {
      console.error('Error undoing log:', e);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

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
        if (dData.drawdown && dData.drawdown.amountUsd !== undefined) {
          setUsdInput(String(dData.drawdown.amountUsd));
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
      if (e.key === 'Escape') {
        setDrilldownModal(null);
        setShowDebtModal(false);
        setEditingTx(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenEditTx = (tx) => {
    setEditingTx(tx);
    setTxFormData({
      date: tx.date,
      category: tx.category,
      category_group: tx.category_group,
      sub_category: tx.sub_category || 'ทั่วไป',
      amount: String(tx.amount),
    });
  };

  const handleSaveEditTx = async (e) => {
    if (e) e.preventDefault();
    if (!editingTx) return;

    try {
      const res = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTx.id,
          date: txFormData.date,
          category: txFormData.category,
          category_group: txFormData.category_group,
          sub_category: txFormData.sub_category,
          amount: parseFloat(txFormData.amount),
        }),
      });
      if (res.ok) {
        setEditingTx(null);
        await fetchData();
      } else {
        alert('บันทึกการแก้ไขไม่สำเร็จ');
      }
    } catch (err) {
      console.error('Error saving tx edit:', err);
    }
  };

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
              type: newGroup === 'INVESTING' ? 'การลงทุน' : newGroup === 'INCOME' ? 'รายรับ' : 'ค่าใช้จ่าย',
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

  const handleUpdateDrawdownUsd = async (newUsd) => {
    setUsdInput(newUsd);
    const num = parseFloat(newUsd);
    if (!isNaN(num) && num >= 0) {
      try {
        await fetch('/api/debts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_drawdown', amountUsd: num }),
        });
        const res = await fetch('/api/debts');
        if (res.ok) setDebtsData(await res.json());
      } catch (e) {
        console.error('Update drawdown USD error:', e);
      }
    }
  };

  const handleSaveDebt = async (e) => {
    e.preventDefault();
    if (!debtFormData.name.trim() || !debtFormData.initialAmount) {
      alert('กรุณากรอกชื่อหนี้สินและยอดเงินตั้งต้น');
      return;
    }

    try {
      if (editingDebt) {
        const res = await fetch('/api/debts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_debt',
            debt: {
              id: editingDebt.id,
              name: debtFormData.name,
              keywords: debtFormData.keywords,
              initialAmount: parseFloat(debtFormData.initialAmount),
              interestRate: parseFloat(debtFormData.interestRate) || 0,
              note: debtFormData.note,
            },
          }),
        });
        if (res.ok) {
          setShowDebtModal(false);
          setEditingDebt(null);
          await fetchData();
        }
      } else {
        const res = await fetch('/api/debts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add_debt',
            debt: {
              name: debtFormData.name,
              keywords: debtFormData.keywords,
              initialAmount: parseFloat(debtFormData.initialAmount),
              interestRate: parseFloat(debtFormData.interestRate) || 0,
              note: debtFormData.note,
            },
          }),
        });
        if (res.ok) {
          setShowDebtModal(false);
          setDebtFormData({ name: '', keywords: '', initialAmount: '', interestRate: '0', note: '' });
          await fetchData();
        }
      }
    } catch (e) {
      console.error('Save debt error:', e);
    }
  };

  const handleDeleteDebt = async (id, name) => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการหนี้ "${name}"?`)) return;
    try {
      const res = await fetch('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_debt', id }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error('Delete debt error:', e);
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

  const jumpToCurrentMonth = () => {
    const today = new Date();
    setSelectedYear(today.getFullYear());
    setSelectedMonth(today.getMonth() + 1);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setSelectedDateStr(todayStr);
  };

  const isCurrentMonthActive =
    selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;

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
              {appMode === 'mission'
                ? 'ศูนย์บัญชาการภาพรวม & จุดเซฟเกม (The North Star Blueprint, 3 Portfolios & Project Vault)'
                : appMode === 'quant'
                ? 'Quantum Research & Tail Probability Terminal (ระบบจำลองโมเดลสถิติความน่าจะเป็น & ฟิสิกส์การเทรดแบบในภาพเรฟ)'
                : appMode === 'finance'
                ? 'ระบบบริหารการเงินส่วนตัว & จัดการหนี้สิน (รับข้อมูลอัตโนมัติจาก Telegram @my_skynet_money_bot)'
                : appMode === 'trading'
                ? 'ระบบบริหารการเทรด (Trade Tracker บันทึกไม้เทรด, Playbook พิมพ์เขียว & Emotion Journal)'
                : 'ระบบพัฒนาตนเอง & สร้างวินัย (Top 3 Focus, Consistency Heatmap & รูทีนประจำวัน)'}
            </p>
          </div>
        </div>

        <div className="status-badge">
          <div className="pulse-dot" />
          <span>
            {appMode === 'mission'
              ? 'Master Plan // Save Point Active'
              : appMode === 'finance'
              ? 'Telegram Money Sync Live'
              : appMode === 'trading'
              ? 'GGD Auto-Sync Active'
              : 'Telegram Focus & Heatmap Live'}
          </span>
        </div>
      </header>

      {/* Mode Switcher: 4 Core Pillars (Overview Roadmap, Finance, Trading, Self-Development) */}
      <div className="mode-switcher-container">
        <div className="mode-segmented-control">
          <button
            className={`mode-tab-btn mission ${appMode === 'mission' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('mission')}
          >
            <span>🧭</span>
            <span>แผนภาพรวม & Roadmap</span>
          </button>
          <button
            className={`mode-tab-btn finance ${appMode === 'finance' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('finance')}
          >
            <span>💰</span>
            <span>การเงินส่วนตัว (Cash)</span>
          </button>
          <button
            className={`mode-tab-btn trading ${appMode === 'trading' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('trading')}
          >
            <span>📈</span>
            <span>ระบบการเทรด (Alpha & Beta)</span>
          </button>
          <button
            className={`mode-tab-btn selfdev ${appMode === 'selfdev' ? 'active' : ''}`}
            onClick={() => handleSwitchMode('selfdev')}
          >
            <span>🔥</span>
            <span>พัฒนาตนเอง (Self-Dev)</span>
          </button>
        </div>

        {/* Sub-tabs for the selected mode */}
        <div className="ios-segmented-control sub-nav-control">
          {appMode === 'mission' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', fontSize: '12px', color: 'var(--cyan-neon, #00f2fe)', fontFamily: 'monospace' }}>
              <span>⌘</span>
              <span>MASTER BLUEPRINT // 3-PHASE CAPITAL & EXECUTION ARCHITECTURE</span>
            </div>
          )}

          {appMode === 'finance' && (
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
          )}

          {appMode === 'trading' && (
            <>
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

          {appMode === 'selfdev' && (
            <>
              <button
                className={`segmented-button ${activeTab === 'reflections' ? 'active' : ''}`}
                onClick={() => setActiveTab('reflections')}
              >
                <span>🍀</span>
                <span>Daily Luck & Finish (สรุปวัน & โชคดี)</span>
              </button>
              <button
                className={`segmented-button ${activeTab === 'focus' ? 'active' : ''}`}
                onClick={() => setActiveTab('focus')}
              >
                <span>🔥</span>
                <span>Top 3 Focus (เป้าหมาย 3 ข้อ & Heatmap)</span>
              </button>
              <button
                className={`segmented-button ${activeTab === 'anchor' ? 'active' : ''}`}
                onClick={() => setActiveTab('anchor')}
              >
                <span>⚓</span>
                <span>Memory Anchor (สติ & สัญญาใจ)</span>
              </button>
              <button
                className={`segmented-button ${activeTab === 'habits' ? 'active' : ''}`}
                onClick={() => setActiveTab('habits')}
              >
                <span>⏱️</span>
                <span>Daily Tracker (บันทึกเวลา & วินัยรายวัน)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* MISSION CONTROL TAB */}
      {appMode === 'mission' && (
        <MissionControlTab debtsData={debtsData} transactions={transactions} />
      )}

      {/* TAB 1: CALENDAR & EXPENSES */}
      {appMode === 'finance' && activeTab === 'calendar' && (
        <>
          {/* TACTILE MONTH CONTROL PANEL & QUICK SELECTOR RIBBON */}
          <div className="month-control-panel glass-panel">
            <div className="month-control-header">
              <div className="month-control-left">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="calendar-nav-btn"
                  title="เดือนก่อนหน้า"
                >
                  ◀ ก่อนหน้า
                </button>
                <button
                  type="button"
                  onClick={jumpToCurrentMonth}
                  className={`calendar-nav-btn ${isCurrentMonthActive ? 'current-active' : ''}`}
                  title="คลิกเดียวกลับมาเดือนปัจจุบัน (วันนี้)"
                >
                  <span className="current-dot" />
                  <span>⚡ เดือนปัจจุบัน</span>
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="calendar-nav-btn"
                  title="เดือนถัดไป"
                >
                  ถัดไป ▶
                </button>
              </div>

              <div className="month-control-center">
                <span className="month-selected-title">
                  📅 เดือน{monthNamesThai[selectedMonth - 1]} {selectedYear}
                </span>
                <span className="month-tx-count-tag">
                  {transactions.length} รายการ
                </span>
              </div>

              <div className="month-control-right">
                <button
                  type="button"
                  onClick={async () => {
                    await fetchData();
                    try {
                      const res = await fetch('/api/sync', { method: 'POST' });
                      const d = await res.json();
                      if (d.success) {
                        alert(`☁️ ซิงค์สำรองข้อมูล ${d.count} รายการลง Google Sheets เรียบร้อยแล้ว!`);
                      }
                    } catch (e) {
                      console.error('Manual sync error:', e);
                    }
                  }}
                  className="calendar-nav-btn sync-btn"
                  title="ซิงค์ข้อมูลล่าสุดทั้งหมดลง Google Sheets ทันที"
                >
                  <span>☁️</span>
                  <span>ซิงค์ Google Sheets</span>
                </button>
              </div>
            </div>

            {/* Direct 12-Month Quick Selector Ribbon (1 Click jump to any month!) */}
            <div className="month-ribbon-track">
              {monthNamesThai.map((mName, idx) => {
                const mNum = idx + 1;
                const isSelected = selectedMonth === mNum;
                const isCurrent =
                  mNum === now.getMonth() + 1 && selectedYear === now.getFullYear();
                const shortNames = [
                  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
                ];
                return (
                  <button
                    key={mNum}
                    type="button"
                    onClick={() => setSelectedMonth(mNum)}
                    className={`month-ribbon-btn ${isSelected ? 'active' : ''} ${isCurrent ? 'is-today-month' : ''}`}
                    title={`เลือกเดือน ${mName}`}
                  >
                    <span>{shortNames[idx]}</span>
                    {isCurrent && <span className="current-month-indicator" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* QUANT HERO RADAR: EXPENSE WAVE & REALTIME LOGS (BLACK TERMINAL STYLE) */}
          <ExpenseWaveChart
            dailyMap={dailyMap}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            monthlyExpenses={monthlyExpenses}
            botLogs={botLogs}
          />

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={prevMonth} className="calendar-nav-btn" title="เดือนก่อนหน้า">◀ ก่อนหน้า</button>
                  <button
                    onClick={jumpToCurrentMonth}
                    className={`calendar-nav-btn ${isCurrentMonthActive ? 'current-active' : ''}`}
                    title="คลิกเดียวกลับมาเดือนปัจจุบัน (วันนี้)"
                  >
                    <span className="current-dot" />
                    <span>⚡ เดือนปัจจุบัน</span>
                  </button>
                  <button onClick={nextMonth} className="calendar-nav-btn" title="เดือนถัดไป">ถัดไป ▶</button>
                </div>
                <div className="calendar-month-title">
                  📅 {monthNamesThai[selectedMonth - 1]} {selectedYear}
                </div>
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
                          onClick={() => handleOpenEditTx(item)}
                          title="แก้ไขรายการนี้"
                          style={{
                            background: 'rgba(10, 132, 255, 0.15)',
                            border: '1px solid rgba(10, 132, 255, 0.4)',
                            color: '#0a84ff',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '600',
                          }}
                        >
                          ✏️ แก้ไข
                        </button>
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

          {/* All Transactions Table & Management (Quant Terminal Style) */}
          <section className="quant-card" style={{ marginBottom: '24px' }}>
            <div className="quant-card-header">
              <div className="quant-card-title">
                <span className="quant-dot cyan" />
                <span>TRANSACTION LEDGER & CASHFLOW AUDIT</span>
              </div>
              <div className="quant-card-tag">
                <span>{transactions.length} ENTRIES • REALTIME SQLITE</span>
              </div>
            </div>

            {transactions.length === 0 ? (
              <div className="empty-placeholder">ไม่มีข้อมูลธุรกรรมในระบบ ส่งข้อความผ่าน Telegram เพื่อเริ่มต้นบันทึก</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="quant-ledger-table">
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>CATEGORY</th>
                      <th>DESCRIPTION</th>
                      <th style={{ textAlign: 'right' }}>AMOUNT</th>
                      <th style={{ textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((item) => (
                      <tr key={item.id}>
                        <td className="quant-td-date">{item.date}</td>
                        <td>
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
                            <option value="INCOME">💵 INCOME</option>
                          </select>
                        </td>
                        <td className="quant-td-desc">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span>{item.category}</span>
                            {item.sub_category && item.sub_category !== 'ทั่วไป' && (
                              <span style={{
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                background: item.type === 'รายรับ' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                                color: item.type === 'รายรับ' ? '#6ee7b7' : '#94a3b8',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                border: item.type === 'รายรับ' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                              }}>
                                {item.sub_category}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="quant-td-amount" style={{ color: item.type === 'รายรับ' ? '#10b981' : undefined }}>
                          {item.type === 'รายรับ' ? '+' : ''}{formatCurrency(item.amount)} ฿
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              onClick={() => handleOpenEditTx(item)}
                              title="แก้ไขรายการนี้"
                              className="quant-btn-action edit"
                            >
                              EDIT
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              title="ลบรายการนี้"
                              className="quant-btn-action del"
                            >
                              DEL
                            </button>
                          </div>
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
              <div className="hero-sub">จากยอดหนี้ตั้งต้น {formatCurrency(debtsData.totalInitialDebt)} ฿ {debtsData.totalBorrowedDebt > 0 ? `(+กู้เพิ่ม ${formatCurrency(debtsData.totalBorrowedDebt)} ฿)` : ''}</div>
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
            <div className="drawdown-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#bf5af2', margin: 0 }}>
                  📉 ยอดติดลบจากพอร์ตการลงทุน (${formatCurrency(debtsData.drawdown.amountUsd)} USD)
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                  คำนวณมูลค่าความเสียหายเทียบเท่าเงินบาท สามารถปรับยอด USD และอัตราแลกเปลี่ยนได้
                </p>
              </div>

              <div className="rate-control" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>ยอดติดลบในพอร์ต:</span>
                  <input
                    type="number"
                    step="50"
                    className="rate-input"
                    style={{ width: '100px', textAlign: 'right' }}
                    value={usdInput}
                    onChange={(e) => handleUpdateDrawdownUsd(e.target.value)}
                  />
                  <span>$</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>อัตราแลกเปลี่ยน:</span>
                  <input
                    type="number"
                    step="0.05"
                    className="rate-input"
                    style={{ width: '80px', textAlign: 'right' }}
                    value={rateInput}
                    onChange={(e) => handleUpdateRate(e.target.value)}
                  />
                  <span>฿/$</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', marginTop: '16px' }}>
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

          {/* Debts Cards Grid */}
          <section style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📑</span>
                  <span>รายการหนี้สิน ({debtsData.debts.length} รายการ)</span>
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  ตัดลดยอดอัตโนมัติเมื่อมีค่าใช้จ่ายเข้าจาก Telegram หรือบันทึกในระบบ
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingDebt(null);
                  setDebtFormData({
                    name: '',
                    keywords: '',
                    initialAmount: '',
                    interestRate: '0',
                    note: '',
                  });
                  setShowDebtModal(true);
                }}
                style={{
                  background: '#30d158',
                  color: '#000',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(48, 209, 88, 0.25)',
                }}
              >
                <span>+</span>
                <span>เพิ่มหนี้สินใหม่</span>
              </button>
            </div>

            <div className="debts-grid">
              {debtsData.debts.map((debt) => (
                <div key={debt.id} className="glass-panel debt-card">
                  <div className="debt-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div className="debt-name-box" style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0 }}>{debt.name}</h3>
                        <span className="interest-badge">ดอกเบี้ย {debt.interestRate}%/ปี</span>
                      </div>
                      <span style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {debt.note || 'ไม่มีหมายเหตุ'}
                      </span>
                      {debt.keywords && (
                        <div style={{ fontSize: '11px', color: '#636e7b', marginTop: '4px' }}>
                          🔑 คำตรวจจับตัดยอด: <code style={{ color: '#64d2ff', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '4px' }}>{debt.keywords}</code>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => {
                          setEditingDebt(debt);
                          setDebtFormData({
                            name: debt.name,
                            keywords: debt.keywords,
                            initialAmount: String(debt.initialAmount),
                            interestRate: String(debt.interestRate),
                            note: debt.note || '',
                          });
                          setShowDebtModal(true);
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: '#aeaeb2',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                        title="แก้ไขหนี้สินนี้"
                      >
                        ✏️ แก้ไข
                      </button>
                      <button
                        onClick={() => handleDeleteDebt(debt.id, debt.name)}
                        style={{
                          background: 'rgba(255,69,58,0.1)',
                          border: '1px solid rgba(255,69,58,0.3)',
                          color: '#ff453a',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                        title="ลบหนี้สินนี้"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="debt-amounts-row">
                    <div className="amount-col">
                      <label>ยอดตั้งต้น</label>
                      <div className="val">{formatCurrency(debt.initialAmount)} ฿</div>
                    </div>
                    <div className="amount-col paid">
                      <label>ชำระแล้ว ({debt.paymentsCount} ครั้ง)</label>
                      <div className="val" style={{ color: '#30d158' }}>-{formatCurrency(debt.paidAmount)} ฿</div>
                    </div>
                    {debt.borrowedAmount > 0 && (
                      <div className="amount-col" style={{ color: '#fda4af' }}>
                        <label>กู้เพิ่ม ({debt.borrowingsCount || 1} ครั้ง)</label>
                        <div className="val" style={{ color: '#fda4af' }}>+{formatCurrency(debt.borrowedAmount)} ฿</div>
                      </div>
                    )}
                    <div className="amount-col rem">
                      <label>คงเหลือจริง</label>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{p.type === 'รายรับ' ? '⚠️' : '✅'}</span>
                            <span>[{p.date}] {p.category}</span>
                          </div>
                          <strong style={{ color: p.type === 'รายรับ' ? '#fda4af' : '#30d158' }}>
                            {p.type === 'รายรับ' ? `+กู้ ${formatCurrency(p.amount)} ฿` : `-${formatCurrency(p.amount)} ฿`}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* DEBT MODAL: ADD / EDIT DEBT */}
          {showDebtModal && (
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
                  maxWidth: '500px',
                  padding: '28px',
                  borderRadius: '20px',
                  background: '#1a1d26',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#fff', margin: 0 }}>
                    {editingDebt ? '⚙️ แก้ไขรายการหนี้สิน' : '✨ เพิ่มรายการหนี้สินใหม่'}
                  </h3>
                  <button
                    onClick={() => setShowDebtModal(false)}
                    style={{ background: 'transparent', border: 'none', color: '#8e8e93', fontSize: '1.2rem', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveDebt} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#aeaeb2', marginBottom: '6px' }}>
                      ชื่อหนี้สิน / แหล่งกู้ *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น บัตรเครดิต KBank, กยศ., ยืมเพื่อน"
                      value={debtFormData.name}
                      onChange={(e) => setDebtFormData({ ...debtFormData, name: e.target.value })}
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
                        ยอดหนี้ตั้งต้น (บาท) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="เช่น 15000"
                        value={debtFormData.initialAmount}
                        onChange={(e) => setDebtFormData({ ...debtFormData, initialAmount: e.target.value })}
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
                        อัตราดอกเบี้ย (% ต่อปี)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="เช่น 16 หรือ 0"
                        value={debtFormData.interestRate}
                        onChange={(e) => setDebtFormData({ ...debtFormData, interestRate: e.target.value })}
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
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#aeaeb2', marginBottom: '4px' }}>
                      🔑 คำตรวจจับตัดยอดอัตโนมัติ (Keywords)
                    </label>
                    <div style={{ fontSize: '0.78rem', color: '#636e7b', marginBottom: '6px' }}>
                      เมื่อบันทึกผ่าน Telegram ที่มีคำเหล่านี้ ระบบจะตัดลดยอดหนี้ก้อนนี้ให้อัตโนมัติ (คั่นด้วย <code>,</code>)
                    </div>
                    <input
                      type="text"
                      placeholder="เช่น kbank,เคแบงก์,กสิกร (เว้นว่างได้ ระบบจะใช้ชื่อหนี้แทน)"
                      value={debtFormData.keywords}
                      onChange={(e) => setDebtFormData({ ...debtFormData, keywords: e.target.value })}
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
                      หมายเหตุ / เงื่อนไขการผ่อน
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น ผ่อนเดือนละ 2,000 บาท ครบกำหนดวันที่ 25"
                      value={debtFormData.note}
                      onChange={(e) => setDebtFormData({ ...debtFormData, note: e.target.value })}
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

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setShowDebtModal(false)}
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
                        background: '#30d158',
                        border: 'none',
                        color: '#000',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                    >
                      {editingDebt ? 'บันทึกการแก้ไข' : 'บันทึกหนี้สินใหม่'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* TRADING TABS */}
      {activeTab === 'tracker' && <TradeTrackerTab />}
      {activeTab === 'playbook' && <PlaybookTab />}
      {activeTab === 'journal' && <JournalTab />}

      {/* SELF-DEVELOPMENT TABS */}
      {activeTab === 'reflections' && <DailyReflectionTab />}
      {activeTab === 'anchor' && <MemoryAnchorTab />}
      {activeTab === 'focus' && <FocusTab />}
      {activeTab === 'habits' && <DailyTrackerTab />}

      {/* Bot Audit & Activity Log (Only in Personal Finance mode) */}
      {appMode === 'finance' && (
        <section className="glass-panel audit-log-card">
          <div className="audit-log-header">
            <div className="audit-log-title">
              <span>🛡️</span>
              <span>Bot Audit Log (ประวัติข้อความจาก Telegram)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                ล่าสุด {botLogs.length} รายการ
              </span>
              <button
                type="button"
                onClick={() => setIsAuditLogCollapsed(!isAuditLogCollapsed)}
                style={{
                  background: 'rgba(0, 242, 254, 0.08)',
                  border: '1px solid rgba(0, 242, 254, 0.3)',
                  color: 'var(--cyan-neon, #00f2fe)',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                }}
              >
                {isAuditLogCollapsed ? '▶ เปิดดูประวัติ (Expand)' : '▼ ย่อประวัติ (Collapse)'}
              </button>
            </div>
          </div>

          {!isAuditLogCollapsed && (
            <>
              {botLogs.length === 0 ? (
                <div className="empty-placeholder">ยังไม่มีประวัติการส่งข้อมูลจาก Telegram</div>
              ) : (
                <div className="audit-log-list">
                  {botLogs.map((log) => {
                    let parsedItems = [];
                    try {
                      parsedItems = JSON.parse(log.parsed_data || '[]');
                    } catch (e) {}

                    const isCancelled = log.status === 'CANCELLED';

                    return (
                      <div
                        key={log.id}
                        className="audit-log-item"
                        style={{
                          opacity: isCancelled ? 0.45 : 1,
                          borderLeft: isCancelled ? '3px solid #ff4757' : '3px solid #00f2fe',
                        }}
                      >
                        <div className="log-item-top">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>Log #{log.id}</span>
                            {isCancelled ? (
                              <span style={{ color: '#ff6b81', background: 'rgba(255, 107, 129, 0.15)', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                                🚫 ยกเลิกแล้ว (CANCELLED)
                              </span>
                            ) : (
                              <span style={{ color: '#2ed573', background: 'rgba(46, 213, 115, 0.15)', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                                ✅ บันทึกสำเร็จ ({log.parsed_count} รายการ)
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span>{log.created_at}</span>
                            {!isCancelled && (
                              <button
                                type="button"
                                onClick={() => handleUndoLog(log.id)}
                                title="ลบและยกเลิกรายการในชุดนี้ทั้งหมด"
                                style={{
                                  background: 'rgba(255, 71, 87, 0.12)',
                                  border: '1px solid rgba(255, 71, 87, 0.4)',
                                  color: '#ff6b81',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                }}
                              >
                                🗑️ ลบชุดนี้
                              </button>
                            )}
                          </div>
                        </div>
                        <div
                          className="log-item-raw"
                          style={{ textDecoration: isCancelled ? 'line-through' : 'none' }}
                        >
                          "{log.raw_message}"
                        </div>
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
            </>
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

      {/* TRANSACTION EDIT MODAL (QUANT TERMINAL STYLE) */}
      {editingTx && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            backdropFilter: 'blur(10px)',
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingTx(null);
          }}
        >
          <div
            className="quant-card"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              borderRadius: '12px',
              background: '#0e1118',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.9)',
            }}
          >
            <div className="quant-card-header" style={{ marginBottom: '18px' }}>
              <div className="quant-card-title">
                <span className="quant-dot cyan" />
                <span>EDIT TRANSACTION RECORD #{editingTx.id}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  width: '26px',
                  height: '26px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono, monospace',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditTx} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.5px' }}>
                  DATE (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  value={txFormData.date}
                  onChange={(e) => setTxFormData({ ...txFormData, date: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: '#090a0f',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.5px' }}>
                  DESCRIPTION / ITEM NAME
                </label>
                <input
                  type="text"
                  value={txFormData.category}
                  onChange={(e) => setTxFormData({ ...txFormData, category: e.target.value })}
                  placeholder="เช่น ข้าวมันไก่, กาแฟ"
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: '#090a0f',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.5px' }}>
                  AMOUNT (THB)
                </label>
                <input
                  type="number"
                  step="any"
                  value={txFormData.amount}
                  onChange={(e) => setTxFormData({ ...txFormData, amount: e.target.value })}
                  placeholder="0.00"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: '#090a0f',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.5px' }}>
                  CATEGORY GROUP
                </label>
                <select
                  value={txFormData.category_group}
                  onChange={(e) => setTxFormData({ ...txFormData, category_group: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: '#090a0f',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                >
                  <option value="LIFE">🌿 LIFE (ชีวิตประจำวัน / อาหาร)</option>
                  <option value="EXTRAVAGANT">✨ EXTRAVAGANT (ฟุ่มเฟือย / บันเทิง)</option>
                  <option value="BILL">📄 BILL (บิล / หนี้สิน / คงที่)</option>
                  <option value="INVESTING">📈 INVESTING (การลงทุน / ออมเงิน)</option>
                  <option value="ETC">📦 ETC (เบ็ดเตล็ด)</option>
                  <option value="INCOME">💵 INCOME (รายรับ / เงินกู้ฉุกเฉิน)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    color: '#94a3b8',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    letterSpacing: '0.5px',
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '11px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    letterSpacing: '0.5px',
                  }}
                >
                  SAVE CHANGES ⚡
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
