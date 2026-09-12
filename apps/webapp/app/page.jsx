'use client';

import { useState, useEffect } from 'react';

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

  // Tab state: 'calendar' | 'debts'
  const [activeTab, setActiveTab] = useState('calendar');

  // Data states
  const [transactions, setTransactions] = useState([]);
  const [groupTotals, setGroupTotals] = useState({ LIFE: 0, EXTRAVAGANT: 0, BILL: 0, INVESTING: 0, ETC: 0 });
  const [dailyMap, setDailyMap] = useState({});
  const [botLogs, setBotLogs] = useState([]);
  const [debtsData, setDebtsData] = useState(null);
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

  // Monthly Calculations
  const monthlyExpenses = (groupTotals.LIFE || 0) + (groupTotals.EXTRAVAGANT || 0) + (groupTotals.BILL || 0) + (groupTotals.ETC || 0);
  const monthlyInvestment = groupTotals.INVESTING || 0;
  const activeDaysCount = Object.keys(dailyMap).filter((d) => dailyMap[d] && dailyMap[d].total > 0).length;
  const dailyAverageActive = activeDaysCount > 0 ? monthlyExpenses / activeDaysCount : 0;
  const dailyAverageMonth = daysInMonth > 0 ? monthlyExpenses / daysInMonth : 0;

  return (
    <main>
      {/* iOS Header */}
      <header className="glass-panel ios-header">
        <div className="brand">
          <div className="brand-icon">⚡</div>
          <div>
            <h1>Skynet OS</h1>
            <p>ระบบแดชบอร์ดแสดงผลการเงิน (รับข้อมูลอัตโนมัติจาก Telegram @my_skynet_money_bot)</p>
          </div>
        </div>

        <div className="status-badge">
          <div className="pulse-dot" />
          <span>Telegram Sync Live</span>
        </div>
      </header>

      {/* iOS Segmented Navigation Tabs */}
      <div className="ios-segmented-control">
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
      </div>

      {/* TAB 1: CALENDAR & EXPENSES */}
      {activeTab === 'calendar' && (
        <>
          {/* Monthly Overview Hero Cards (ผลรวมและค่าเฉลี่ยรายเดือน) */}
          <section className="monthly-hero-grid">
            <div className="glass-panel monthly-hero-card total">
              <div className="hero-label">
                <span>💳</span>
                <span>ยอดรวมค่าใช้จ่ายประจำเดือน</span>
              </div>
              <div className="hero-value">{formatCurrency(monthlyExpenses)} ฿</div>
              <div className="hero-sub">รวม 4 หมวด (LIFE, EXTRAVAGANT, BILL, ETC)</div>
            </div>

            <div className="glass-panel monthly-hero-card average">
              <div className="hero-label">
                <span>📊</span>
                <span>ค่าเฉลี่ยค่าใช้จ่ายต่อวัน</span>
              </div>
              <div className="hero-value">{formatCurrency(dailyAverageActive)} ฿ <span style={{ fontSize: '18px', fontWeight: '500' }}>/ วัน</span></div>
              <div className="hero-sub">คำนวณจากวันที่บันทึก ({activeDaysCount} วัน) • เฉลี่ยทั้งเดือน {daysInMonth} วัน: {formatCurrency(dailyAverageMonth)} ฿/วัน</div>
            </div>

            <div className="glass-panel monthly-hero-card invest">
              <div className="hero-label">
                <span>📈</span>
                <span>ยอดเงินลงทุนประจำเดือน</span>
              </div>
              <div className="hero-value">{formatCurrency(monthlyInvestment)} ฿</div>
              <div className="hero-sub">หมวด INVESTING (หุ้น, คริปโต, กองทุน, ออม)</div>
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
                        <span className={`item-group-pill ${item.category_group}`}>
                          {CATEGORY_META[item.category_group]?.emoji} {item.category_group}
                        </span>
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
                          <span className={`item-group-pill ${item.category_group}`}>
                            {CATEGORY_META[item.category_group]?.emoji} {item.category_group}
                          </span>
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

      {/* Bot Audit & Activity Log */}
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
    </main>
  );
}
