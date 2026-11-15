'use client';

import { useEffect, useState } from 'react';

const formatMoney = (val) => `${Number(val || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`;

export default function BetaPortfolioDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPillar, setSelectedPillar] = useState('ALL'); // 'ALL' | 'ALPHA' | 'BETA' | 'CASH'
  const [formPillar, setFormPillar] = useState('BETA');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDate, setDepositDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [depositNote, setDepositNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadData = async () => {
    try {
      const res = await fetch('/api/portfolios-cockpit', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json.success) {
        setData(json);
      }
    } catch (e) {
      console.error('Failed to load portfolio cockpit:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickDeposit = async (e) => {
    e.preventDefault();
    if (!depositAmount || Number(depositAmount) <= 0) {
      setErrorMsg('กรุณากรอกจำนวนเงินให้ถูกต้อง');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/portfolios-cockpit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quick_deposit',
          pillar_code: formPillar,
          amount: Number(depositAmount),
          date: depositDate,
          note: depositNote,
        }),
      });
      const resJson = await res.json();
      if (res.ok && resJson.success) {
        setSuccessMsg(`✅ บันทึกยอดเติมเข้าพอร์ต ${formPillar} สำเร็จ (${Number(depositAmount).toLocaleString()} ฿)`);
        setDepositAmount('');
        setDepositNote('');
        loadData();
      } else {
        setErrorMsg(resJson.error || 'เกิดข้อผิดพลาดในการบันทึก');
      }
    } catch (err) {
      setErrorMsg(err.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const panelStyle = {
    background: '#0c0f17',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    padding: '20px',
  };

  const statCard = (color, bg) => ({
    background: bg || 'rgba(255, 255, 255, 0.02)',
    border: `1px solid ${color ? `${color}35` : 'rgba(255, 255, 255, 0.07)'}`,
    borderRadius: '12px',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  });

  const pillars = data?.pillars || [
    { pillar_code: 'ALPHA', title: 'พอร์ต Alpha', badge: 'EA & Engine ล่าผลตอบแทน', emoji: '🤖', color: '#00f2fe' },
    { pillar_code: 'BETA', title: 'พอร์ต Beta (Grid Buy - BTC & XAU)', badge: 'Grid / Snowball กระแสเงินสด', emoji: '🌱', color: '#f59e0b' },
    { pillar_code: 'CASH', title: 'พอร์ตแคช / พอร์ตสะสม (DCA ระยะยาว)', badge: 'DCA คริปโต & เงินสำรองฉุกเฉิน', emoji: '💼', color: '#10b981' },
  ];

  const stats = data?.stats || {
    ALPHA: { totalAllTime: 0, totalThisMonth: 0, countThisMonth: 0 },
    BETA: { totalAllTime: 0, totalThisMonth: 0, countThisMonth: 0 },
    CASH: { totalAllTime: 0, totalThisMonth: 0, countThisMonth: 0 },
  };

  const totalThisMonthAll = (stats.ALPHA.totalThisMonth || 0) + (stats.BETA.totalThisMonth || 0) + (stats.CASH.totalThisMonth || 0);
  const totalAllTimeAll = (stats.ALPHA.totalAllTime || 0) + (stats.BETA.totalAllTime || 0) + (stats.CASH.totalAllTime || 0);

  // Filtered transactions
  const allTxs = data?.allTransactions || [];
  const displayTxs = allTxs.filter((tx) => {
    if (selectedPillar === 'ALL') return true;
    const text = `${tx.category || ''} ${tx.sub_category || ''} ${tx.raw_text || ''}`.toLowerCase();
    if (selectedPillar === 'ALPHA') return text.includes('alpha') || text.includes('ea') || text.includes('cent') || text.includes('mt5');
    if (selectedPillar === 'BETA') return text.includes('beta') || text.includes('grid') || text.includes('snowball') || (text.includes('gold') && !text.includes('dca'));
    if (selectedPillar === 'CASH') return !text.includes('alpha') && !text.includes('ea') && !text.includes('cent') && !text.includes('beta') && !text.includes('grid');
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', color: '#e2e8f0' }}>
      
      {/* 1. Header & Overview Banner */}
      <section style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>🏛️</span>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                ศูนย์บริหารจัดการ 3 พอร์ตหลัก (Alpha • Beta • Cash DCA)
              </h2>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              เชื่อมโยงยอดเงินเติมจริงจาก Telegram Bot + ระบบรายรับ-รายจ่าย • แยกพอร์ตให้ขาด อารมณ์จะไม่กวนเงินสด
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#cbd5e1',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ↻ รีเฟรชข้อมูล
          </button>
        </div>

        {/* Global Overview Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '16px' }}>
          <div style={statCard('#10b981', 'rgba(16, 185, 129, 0.05)')}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>💰 ยอดเติมเดือนนี้รวม (3 พอร์ต)</span>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#10b981' }}>{formatMoney(totalThisMonthAll)}</span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>อัปเดตจากบันทึกในบอทเดือน 11/2026</span>
          </div>

          <div style={statCard('#00f2fe', 'rgba(0, 242, 254, 0.05)')}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>📈 เงินสะสมในพอร์ตตลอดชีพ</span>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#00f2fe' }}>{formatMoney(totalAllTimeAll)}</span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>รวมเงินต้นทั้งหมดที่ส่งเข้าพอร์ต</span>
          </div>

          <div style={statCard('#f59e0b', 'rgba(245, 158, 11, 0.05)')}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>🔗 สถานะการเชื่อมต่อบอท</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>
              Auto-Link พร้อมทำงาน ⚡
            </span>
            <span style={{ fontSize: '10px', color: '#64748b' }}>พิมพ์ "ลงทุน 1000" หรือ "DCA 500" เข้าพอร์ตทันที</span>
          </div>
        </div>
      </section>

      {/* 2. Three Pillars Detailed Cards */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        
        {/* PILLAR 1: ALPHA */}
        <div style={{ ...panelStyle, borderTop: '3px solid #00f2fe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🤖</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#00f2fe' }}>พอร์ต Alpha</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>EA บอทเทรด & Cent Account ล่าผลตอบแทน</div>
            </div>
            <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(0, 242, 254, 0.15)', color: '#00f2fe', fontWeight: 700 }}>
              MT5 Demo / Engine
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '14px 0' }}>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>เติมเข้าเดือนนี้</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#00f2fe', marginTop: '2px' }}>
                {formatMoney(stats.ALPHA.totalThisMonth)}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>สะสมตลอดกาล</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                {formatMoney(stats.ALPHA.totalAllTime)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(0, 242, 254, 0.05)', padding: '8px 10px', borderRadius: '6px', borderLeft: '2px solid #00f2fe' }}>
            🎯 <strong>เป้าหมาย:</strong> GoldTuesday / BTCSnowball บน Demo ทุน 0฿ ขยับไป Cent Account 700฿ เมื่อปลดหนี้
          </div>
        </div>

        {/* PILLAR 2: BETA */}
        <div style={{ ...panelStyle, borderTop: '3px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🌱</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#f59e0b' }}>พอร์ต Beta (Grid Buy)</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Grid Buy - BTC & XAU สะสมกระแสเงินสด</div>
            </div>
            <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 700 }}>
              BTC & GOLD Grid
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '14px 0' }}>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>เติมเข้าเดือนนี้</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
                {formatMoney(stats.BETA.totalThisMonth)}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>สะสมตลอดกาล</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                {formatMoney(stats.BETA.totalAllTime)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(245, 158, 11, 0.05)', padding: '8px 10px', borderRadius: '6px', borderLeft: '2px solid #f59e0b' }}>
            🎯 <strong>เป้าหมาย:</strong> ช้อนซื้อรอบ Buy Side SNB Gold & BTC เน้นอยู่รอด ปลอดภัย ไม่ Overtrade
          </div>
        </div>

        {/* PILLAR 3: CASH / DCA */}
        <div style={{ ...panelStyle, borderTop: '3px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>💼</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#10b981' }}>พอร์ตแคช / DCA ระยะยาว</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>DCA คริปโต & กองทุนสำรองเลี้ยงชีพ</div>
            </div>
            <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 700 }}>
              DCA 1,000-1,500฿/ด.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '14px 0' }}>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>เติมเข้าเดือนนี้</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                {formatMoney(stats.CASH.totalThisMonth)}
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', color: '#64748b' }}>สะสมตลอดกาล</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                {formatMoney(stats.CASH.totalAllTime)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(16, 185, 129, 0.05)', padding: '8px 10px', borderRadius: '6px', borderLeft: '2px solid #10b981' }}>
            🎯 <strong>เป้าหมาย:</strong> DCA สะสมรายเดือน เช่น Dca Spxc, BTC Spot และเงินสำรองฉุกเฉิน 3 เดือน
          </div>
        </div>

      </section>

      {/* 3. Quick Deposit / Entry Form */}
      <section style={panelStyle}>
        <div style={{ fontWeight: 800, fontSize: '15px', color: '#ffffff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>➕</span> บันทึกเติมเงินเข้าพอร์ต (Quick Deposit) หรือพิมพ์ในบอท Telegram เช่น <code>ลงทุน 1000</code>
        </div>

        <form onSubmit={handleQuickDeposit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>เลือกพอร์ตเป้าหมาย</label>
            <select
              value={formPillar}
              onChange={(e) => setFormPillar(e.target.value)}
              style={{
                width: '100%',
                background: '#07090f',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '8px 10px',
                color: '#ffffff',
                fontSize: '12px',
                outline: 'none',
              }}
            >
              <option value="ALPHA">🤖 พอร์ต Alpha (EA & Cent Account)</option>
              <option value="BETA">🌱 พอร์ต Beta (Grid Buy - BTC & XAU)</option>
              <option value="CASH">💼 พอร์ตแคช / พอร์ตสะสม (DCA ระยะยาว)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>จำนวนเงิน (บาท)</label>
            <input
              type="number"
              step="any"
              placeholder="เช่น 1000 หรือ 500"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              style={{
                width: '100%',
                background: '#07090f',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '8px 10px',
                color: '#ffffff',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>วันที่บันทึก</label>
            <input
              type="date"
              value={depositDate}
              onChange={(e) => setDepositDate(e.target.value)}
              style={{
                width: '100%',
                background: '#07090f',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '8px 10px',
                color: '#ffffff',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>หมายเหตุ (ไม่บังคับ)</label>
            <input
              type="text"
              placeholder="เช่น DCA ประจำงวด, เติมพอร์ต EA"
              value={depositNote}
              onChange={(e) => setDepositNote(e.target.value)}
              style={{
                width: '100%',
                background: '#07090f',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '8px 10px',
                color: '#ffffff',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isSubmitting ? 'wait' : 'pointer',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            }}
          >
            {isSubmitting ? 'กำลังบันทึก...' : '💾 บันทึกเงินเข้าพอร์ต'}
          </button>
        </form>

        {errorMsg && <div style={{ marginTop: '10px', color: '#f43f5e', fontSize: '12px' }}>⚠️ {errorMsg}</div>}
        {successMsg && <div style={{ marginTop: '10px', color: '#10b981', fontSize: '12px' }}>{successMsg}</div>}
      </section>

      {/* 4. Linked Transactions & Audit Table */}
      <section style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
              📋 รายการเงินเข้า/ออกพอร์ตที่เชื่อมโยงกับระบบ (Transactions Feed)
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              รวมข้อมูลจากการพิมพ์ในบอท Telegram (`ลงทุน`, `DCA`, `พอร์ต`) และบันทึกตรง
            </div>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'ทั้งหมด' },
              { id: 'ALPHA', label: '🤖 Alpha' },
              { id: 'BETA', label: '🌱 Beta' },
              { id: 'CASH', label: '💼 Cash DCA' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedPillar(tab.id)}
                style={{
                  background: selectedPillar === tab.id ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${selectedPillar === tab.id ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                  color: selectedPillar === tab.id ? '#ffffff' : '#94a3b8',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {displayTxs.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            ยังไม่มีรายการเงินลงทุนในหมวดนี้ • ลองพิมพ์ <code>ลงทุน 1000</code> หรือ <code>Dca Spxc 500</code> ในบอท Telegram ได้เลยครับ!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 8px' }}>วันที่</th>
                  <th style={{ padding: '10px 8px' }}>พอร์ตเป้าหมาย</th>
                  <th style={{ padding: '10px 8px' }}>หมวดหมู่ / รายการ</th>
                  <th style={{ padding: '10px 8px' }}>ข้อความต้นฉบับในบอท</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>จำนวนเงิน (บาท)</th>
                  <th style={{ padding: '10px 8px' }}>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {displayTxs.map((tx) => {
                  const text = `${tx.category || ''} ${tx.sub_category || ''} ${tx.raw_text || ''}`.toLowerCase();
                  let pBadge = { name: 'Cash DCA', color: '#10b981', emoji: '💼' };
                  if (text.includes('alpha') || text.includes('ea') || text.includes('cent') || text.includes('mt5')) {
                    pBadge = { name: 'Alpha', color: '#00f2fe', emoji: '🤖' };
                  } else if (text.includes('beta') || text.includes('grid') || text.includes('snowball') || (text.includes('gold') && !text.includes('dca'))) {
                    pBadge = { name: 'Beta', color: '#f59e0b', emoji: '🌱' };
                  }

                  return (
                    <tr
                      key={tx.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        background: 'transparent',
                      }}
                    >
                      <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{tx.date}</td>
                      <td style={{ padding: '10px 8px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: `${pBadge.color}15`,
                            color: pBadge.color,
                            border: `1px solid ${pBadge.color}35`,
                          }}
                        >
                          {pBadge.emoji} {pBadge.name}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', fontWeight: 600, color: '#ffffff' }}>{tx.category}</td>
                      <td style={{ padding: '10px 8px', color: '#cbd5e1', fontFamily: 'monospace', fontSize: '11px' }}>
                        {tx.raw_text || '-'}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#34d399', fontSize: '13px' }}>
                        +{Number(tx.amount).toLocaleString()} ฿
                      </td>
                      <td style={{ padding: '10px 8px', color: '#64748b', fontSize: '11px' }}>{tx.note || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
