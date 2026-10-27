'use client';

import { useState, useEffect } from 'react';

const CATEGORY_TAGS = {
  HOBBY: { label: '🌱 ฮีลใจ/งานอดิเรก', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  MEDIA: { label: '🎥 สื่อ/ยูทูป/แบรนด์', color: '#00f2fe', bg: 'rgba(0, 242, 254, 0.15)' },
  CAREER: { label: '🧠 จิตวิทยา/อาชีพใหม่', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
  BIZ: { label: '💡 ธุรกิจ/โปรเจกต์', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
};

export default function MissionControlTab({ debtsData, transactions = [] }) {
  // Phase Tab State (1, 2, 3)
  const [selectedPhase, setSelectedPhase] = useState(1);

  // Project Vault State
  const [projects, setProjects] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('HOBBY');
  const [isAddingProject, setIsAddingProject] = useState(false);

  // Fetch Projects from SQLite API
  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to load project vault:', err);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleAddProject = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      setIsAddingProject(true);
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), category: newCategory }),
      });
      if (res.ok) {
        setNewTitle('');
        fetchProjects();
      }
    } catch (err) {
      console.error('Failed to add project:', err);
    } finally {
      setIsAddingProject(false);
    }
  };

  const handleDeleteProject = async (id) => {
    try {
      const res = await fetch(`/api/projects?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const handleToggleProject = async (p) => {
    const nextStatus = p.status === 'DONE' ? 'PARKED' : 'DONE';
    try {
      const res = await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, status: nextStatus }),
      });
      if (res.ok) {
        setProjects((prev) =>
          prev.map((item) => (item.id === p.id ? { ...item, status: nextStatus } : item))
        );
      }
    } catch (err) {
      console.error('Failed to toggle project:', err);
    }
  };

  // Financial Calculations
  const totalDebtInitial = debtsData?.debts?.reduce((s, d) => s + (d.initial_amount || 0), 0) || 61897;
  const totalDebtRemaining = debtsData?.totalDebt || 51101;
  const totalDebtPaid = Math.max(0, totalDebtInitial - totalDebtRemaining);
  const debtProgressPct = Math.min(100, Math.round((totalDebtPaid / totalDebtInitial) * 100)) || 17;

  // Monthly Cash Flow & Real Constraints
  const currentMonthExpense = transactions.reduce((sum, t) => sum + (t.amount || 0), 0) || 18524;
  const realSalary = 15000;
  const netBurnRate = Math.round((realSalary - currentMonthExpense) * 100) / 100;

  // Specific Spending Drilldown (Leaks analysis)
  const snackExpense = transactions.filter((t) => (t.category || '').includes('ขนม')).reduce((sum, t) => sum + (t.amount || 0), 0) || 779;
  const zazaExpense = transactions.filter((t) => (t.category || '').toLowerCase().includes('zaza')).reduce((sum, t) => sum + (t.amount || 0), 0) || 1400;
  const waterExpense = transactions.filter((t) => (t.category || '').includes('ค่าน้ำประปา')).reduce((sum, t) => sum + (t.amount || 0), 0) || 1525;
  const coffeeExpense = transactions.filter((t) => (t.category || '').includes('กาแฟ')).reduce((sum, t) => sum + (t.amount || 0), 0) || 655;
  const gasExpense = transactions.filter((t) => (t.category || '').toLowerCase().includes('gas')).reduce((sum, t) => sum + (t.amount || 0), 0) || 400;

  // Finnix & Paylater specifics
  const finnix = debtsData?.debts?.find((d) => d.name.toLowerCase().includes('finnix')) || {
    initial_amount: 10000,
    remaining_amount: 9388,
  };
  const finnixPaid = Math.max(0, (finnix.initial_amount || 10000) - (finnix.remaining_amount || 9388));
  const finnixProgressPct = Math.min(100, Math.round((finnixPaid / (finnix.initial_amount || 10000)) * 100)) || 6;

  const paylater = debtsData?.debts?.find((d) => d.name.toLowerCase().includes('paylater')) || {
    initial_amount: 4568.17,
    remaining_amount: 2117.0,
  };
  const paylaterPaid = Math.max(0, (paylater.initial_amount || 4568) - (paylater.remaining_amount || 2117));
  const paylaterProgressPct = Math.min(100, Math.round((paylaterPaid / (paylater.initial_amount || 4568)) * 100)) || 54;

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto 40px auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* 1. TOP STATUS COCKPIT: CURRENT PHASE & STRATEGIC PROGRESS */}
      <section
        style={{
          background: 'linear-gradient(165deg, #101624 0%, #090d15 100%)',
          border: '1px solid rgba(0, 242, 254, 0.35)',
          borderRadius: '16px',
          padding: '20px 24px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
        }}
      >
        <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f2fe', boxShadow: '0 0 10px #00f2fe' }}></span>
            <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#00f2fe', letterSpacing: '1px' }}>
              SKYNET COMMAND // MASTER BLUEPRINT
            </span>
            <span style={{ background: 'rgba(0, 242, 254, 0.12)', border: '1px solid rgba(0, 242, 254, 0.4)', color: '#00f2fe', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}>
              CURRENT STATUS : PHASE 1 ACTIVE
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🏛️</span>
              <span>PHASE 1: CAPITAL RESTRUCTURING</span>
            </h1>
            <span style={{ fontSize: '13px', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              (ปรับโครงสร้างเงินทุน • ชำระหนี้ดอกเบี้ยสูง • คัดกรอง EA Demo)
            </span>
          </div>

          <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
            การดำเนินงานปัจจุบัน: โฟกัสงานประจำ (เงินเดือน 15k) • คุมงบกินอยู่ & ขนม/Zaza • เร่งปิด Shopee Paylater ก้อนแรก (เหลือ 2.1k) • ปล่อย EA รัน MT5 Demo ไร้อารมณ์
          </p>
        </div>

        {/* STRATEGIC MILESTONE PROGRESS METER */}
        <div
          style={{
            flex: '0 1 340px',
            background: '#070a10',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'monospace' }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>เป้าหมายแรก PHASE 1:</span>
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>{paylaterProgressPct}% (ปิด Paylater เหลือ 2,117 ฿)</span>
          </div>
          
          <div style={{ width: '100%', height: '8px', background: '#030508', borderRadius: '999px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <div
              style={{
                width: `${Math.max(10, paylaterProgressPct)}%`,
                height: '100%',
                borderRadius: '999px',
                background: 'linear-gradient(90deg, #f59e0b, #10b981)',
                transition: 'width 0.5s ease',
              }}
            ></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'monospace', color: '#64748b' }}>
            <span>ชำระแล้ว: {paylaterPaid.toLocaleString()} ฿</span>
            <span style={{ color: '#00f2fe' }}>ผลลัพธ์: ปลดล็อกเงินสดคืน 1,261 ฿/ด.</span>
          </div>
        </div>
      </section>

      {/* 2. MAIN BENTO GRID (3 COLUMNS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', alignItems: 'stretch' }}>
        
        {/* CARD 1: THE 3 PORTFOLIOS (RAY DALIO MODEL + BTC DCA) */}
        <div
          style={{
            background: '#0c0f17',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderTop: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '14px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>📊</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.5px' }}>
                THE 3 PORTFOLIOS
              </span>
            </div>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b' }}>Cash • Alpha • Beta</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Port 1: Cash & Debt */}
            <div style={{ background: '#07090f', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#f43f5e' }}>💼</span> พอร์ต 1: เงินเดือน & ปลดหนี้ (Active)
                </span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#f43f5e', fontWeight: 700 }}>หนี้คงเหลือ 51.1k</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: '#020305', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${debtProgressPct}%`, height: '100%', background: 'linear-gradient(90deg, #f43f5e, #f59e0b)' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'monospace', color: '#64748b' }}>
                <span>ชำระสะสมแล้ว {totalDebtPaid.toLocaleString()} ฿ ({debtProgressPct}%)</span>
                <span style={{ color: '#10b981' }}>เงินเดือนประจำ 15k</span>
              </div>
            </div>

            {/* Port 2: Alpha EA Engine */}
            <div style={{ background: '#07090f', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#00f2fe' }}>🤖</span> พอร์ต 2: Alpha EA Engine
                </span>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', background: 'rgba(0, 242, 254, 0.1)', color: '#00f2fe', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 242, 254, 0.3)' }}>
                  MT5 Demo Test
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
                ทดสอบบอทอัตโนมัติ (GoldTuesday / BTCSnowball) เพื่อเตรียมปั้นกระแสเงินสดเสริม ไม่รบกวนเวลางานประจำ
              </p>
            </div>

            {/* Port 3: Long-Term Wealth / Beta */}
            <div style={{ background: '#07090f', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#f59e0b' }}>🌱</span> พอร์ต 3: สินทรัพย์สะสมระยะยาว (Beta)
                </span>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#64748b' }}>
                  เริ่มสะสมหลังปลอดหนี้
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
                ออมสะสม & DCA สินทรัพย์เติบโตเพื่ออิสรภาพการเงิน (เริ่มหลังปิด Shopee Paylater & Finnix)
              </p>
            </div>
          </div>

          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b', textAlign: 'center', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            Meawbin Macro: "แยกพอร์ตให้ขาด โฟกัสงานประจำ อารมณ์จะไม่กวนเงินสด"
          </div>
        </div>

        {/* CARD 2: ROADMAP & SAVE POINT CHECKLIST */}
        <div
          style={{
            background: '#0c0f17',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderTop: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '14px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🗺️</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.5px' }}>
                STRATEGIC ROADMAP (3 PHASES)
              </span>
            </div>
            
            <div style={{ display: 'flex', gap: '4px', background: '#07090f', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  onClick={() => setSelectedPhase(num)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: selectedPhase === num ? 'rgba(0, 242, 254, 0.2)' : 'transparent',
                    color: selectedPhase === num ? '#00f2fe' : '#64748b',
                    border: selectedPhase === num ? '1px solid rgba(0, 242, 254, 0.4)' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  P{num}
                </button>
              ))}
            </div>
          </div>

          {/* Phase 1 Content */}
          {selectedPhase === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'monospace' }}>
                <span style={{ color: '#00f2fe', fontWeight: 700 }}>PHASE 1 (ปัจจุบัน) : ต.ค. – พ.ย. 2026</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>🟢 ACTIVE</span>
              </div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>รักษางานประจำ • คุมขนม/Zaza • ฆ่า Paylater 2.1k</h4>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.45 }}>
                โฟกัสประสิทธิภาพงานประจำ 15k คุมงบขนมและ Zaza ไม่ให้บานปลาย และเร่งปิดหนี้ Shopee Paylater ให้หมดตัวแรกเพื่อปลดภาระ 1,261 ฿/ด.
              </p>

              <div style={{ paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                  ภารกิจประจำเฟส:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6ee7b7' }}>
                    <span style={{ color: '#10b981', fontWeight: 700, fontFamily: 'monospace' }}>✓</span>
                    <span style={{ textDecoration: 'line-through', opacity: 0.75 }}>จ่ายหนี้ 4 บิลตรงเวลา (5,740 ฿)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                    <span style={{ color: '#64748b', fontWeight: 700, fontFamily: 'monospace' }}>○</span>
                    <span>โฟกัสงานประจำ (รักษาฐานเงินเดือน 15,000 ฿ สม่ำเสมอ)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                    <span style={{ color: '#64748b', fontWeight: 700, fontFamily: 'monospace' }}>○</span>
                    <span>ฆ่าหนี้ Shopee Paylater ที่เหลือ 2,117 ฿ ให้หมดตัวแรก (ปลดภาระ 1,261 ฿/ด.)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                    <span style={{ color: '#64748b', fontWeight: 700, fontFamily: 'monospace' }}>○</span>
                    <span>คุมงบขนม & Zaza รวมกันไม่เกิน 1,500 ฿/ด. (ไม่หักดิบ แต่มีเพดานชัด)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                    <span style={{ color: '#64748b', fontWeight: 700, fontFamily: 'monospace' }}>○</span>
                    <span>ปล่อยบอท EA รัน MT5 Demo ต่อเนื่อง ไร้อารมณ์ ไม่เฝ้าจอ ไม่กวนเวลางาน</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Phase 2 Content */}
          {selectedPhase === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'monospace' }}>
                <span style={{ color: '#00f2fe', fontWeight: 700 }}>PHASE 2 : พ.ย. – ธ.ค. 2026</span>
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>⏳ NEXT QUEUE</span>
              </div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>Debt Snowball Finnix 9.4k & ขยายเงินสด</h4>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.45 }}>
                นำเงินค่างวดที่ได้คืนจาก Paylater 1,261 ฿/ด. มารวมพลังโปะปิด Finnix 10k เพื่อตัดดอกเบี้ย 33% ถาวร
              </p>
              <div style={{ paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#94a3b8' }}>
                <div><span>○</span> ปิดหนี้ Finnix 9,388 ฿ 100% (ปลดภาระดอก 33% และค่างวด 612 ฿/ด.)</div>
                <div><span>○</span> เริ่มรัน EA บนพอร์ต Cent ความเสี่ยงจำกัด</div>
                <div><span>○</span> กระแสเงินสดสุทธิเริ่มบวกเกิน 4,000 ฿</div>
              </div>
            </div>
          )}

          {/* Phase 3 Content */}
          {selectedPhase === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'monospace' }}>
                <span style={{ color: '#00f2fe', fontWeight: 700 }}>PHASE 3 : ปี 2027 เป็นต้นไป</span>
                <span style={{ color: '#64748b', fontWeight: 600 }}>🔒 GOAL</span>
              </div>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>Financial Sovereignty (Ray Dalio)</h4>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.45 }}>
                หนี้กลายเป็น 0.00 ฿ ถาวร ดอกเบี้ยหยุดไหลออก พอร์ต EA ทบต้นอัตโนมัติ เริ่มพอร์ต Beta ลงทุนยาว และมีเวลาลุยโปรเจกต์ใน Vault เต็มที่
              </p>
              <div style={{ paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#94a3b8' }}>
                <div><span>○</span> หนี้ 4 สถาบันหมดเกลี้ยง (0.00 ฿)</div>
                <div><span>○</span> เงินสำรองฉุกเฉิน 3-6 เดือนในบัญชี</div>
                <div><span>○</span> ปลดล็อกโปรเจกต์ปลูกต้นไม้ & ยูทูป</div>
              </div>
            </div>
          )}

          <div style={{ background: '#07090f', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', color: '#94a3b8' }}>
            💡 <strong>Execution Protocol:</strong> โฟกัสคงที่ 4-5 วัน/สัปดาห์ การพักผ่อนตามแผนงานถือเป็นวินัยเพื่อรักษาประสิทธิภาพระยะยาว
          </div>
        </div>

        {/* CARD 3: MEMORY ANCHOR + PROJECT VAULT */}
        <div
          style={{
            background: '#0c0f17',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderTop: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '14px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* MONTHLY CASHFLOW & RUNWAY (REALITY NUMBERS) */}
          <div style={{ background: '#07090f', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#f59e0b' }}>💵</span> กระแสเงินสด ต.ค. 2026 (เงินเดือนจริง)
              </span>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', background: 'rgba(244, 63, 94, 0.15)', color: '#fda4af', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(244, 63, 94, 0.4)' }}>
                ดึงเงินเก็บ {Math.abs(netBurnRate).toLocaleString()} ฿
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', textAlign: 'center', margin: '2px 0' }}>
              <div style={{ background: '#030508', padding: '6px 4px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <div style={{ fontSize: '10px', color: '#64748b' }}>เงินเดือนประจำ</div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, color: '#ffffff' }}>15,000 ฿</div>
              </div>
              <div style={{ background: '#030508', padding: '6px 4px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <div style={{ fontSize: '10px', color: '#64748b' }}>รายจ่ายสะสมจริง</div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, color: '#f43f5e' }}>{currentMonthExpense.toLocaleString()} ฿</div>
              </div>
              <div style={{ background: '#030508', padding: '6px 4px', borderRadius: '6px', border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                <div style={{ fontSize: '10px', color: '#fda4af' }}>ส่วนต่างดึงเงินเก็บ</div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, color: '#fda4af' }}>{netBurnRate.toLocaleString()} ฿</div>
              </div>
            </div>

            {/* Granular Spending Drilldown */}
            <div style={{ background: '#04060a', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>🔍 เจาะลึกจุดรั่วสำคัญในเดือนนี้:</span>
                <span style={{ color: '#f59e0b' }}>รวม {((snackExpense || 779) + (zazaExpense || 1400) + (waterExpense || 1525)).toLocaleString()} ฿</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', fontSize: '10px', fontFamily: 'monospace' }}>
                <div style={{ color: '#cbd5e1' }}>🍪 ขนม 7-11: <strong style={{ color: '#f59e0b' }}>{snackExpense.toLocaleString()} ฿</strong></div>
                <div style={{ color: '#cbd5e1' }}>🌿 Zaza: <strong style={{ color: '#f43f5e' }}>{zazaExpense.toLocaleString()} ฿</strong></div>
                <div style={{ color: '#cbd5e1' }}>💧 น้ำประปา: <strong style={{ color: '#00f2fe' }}>{waterExpense.toLocaleString()} ฿</strong></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'monospace', color: '#64748b', paddingTop: '2px' }}>
                <span>☕ กาแฟ: {coffeeExpense.toLocaleString()} ฿ (18 แก้ว)</span>
                <span>⛽ น้ำมัน: {gasExpense.toLocaleString()} ฿</span>
                <span>📄 หนี้ 4 เจ้า: 5,740 ฿</span>
              </div>
            </div>

            <div style={{ fontSize: '10px', color: '#94a3b8', background: '#030508', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)', lineHeight: 1.4 }}>
              💡 <strong>ความจริง:</strong> ขนม ({snackExpense} ฿) + Zaza ({zazaExpense} ฿) + ค่าน้ำผิดปกติ ({waterExpense} ฿) = 3,704 ฿ (เกินยอดที่ดึงเงินเก็บ 3,524 ฿) ถ้าคุมงบหย่อนใจ Zaza+ขนม ให้อยู่ในงบ ~1,500 ฿ และค่าน้ำกลับมาปกติ เงินเดือน 15k จะเหลือบวกทันทีโดยไม่ต้องหักดิบ!
            </div>
          </div>

          {/* PROJECT VAULT (IDEA PARKING LOT) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#f59e0b' }}>🅿️</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.5px' }}>
                  PROJECT VAULT (ไอเดียสำรองเพื่ออนาคต)
                </span>
              </div>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#64748b' }}>{projects.length} ไอเดีย</span>
            </div>

            {/* Add Idea Input Form */}
            <form onSubmit={handleAddProject} style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="จดไอเดีย (เช่น ปลูกไฮโดร, ยูทูป)..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={{
                  flex: 1,
                  background: '#07090e',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  color: '#ffffff',
                  outline: 'none',
                }}
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                style={{
                  background: '#07090e',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  color: '#94a3b8',
                  outline: 'none',
                }}
              >
                <option value="HOBBY">🌱 ฮีลใจ</option>
                <option value="MEDIA">🎥 ยูทูป</option>
                <option value="CAREER">🧠 อาชีพ</option>
                <option value="BIZ">💡 ธุรกิจ</option>
              </select>
              <button
                type="submit"
                disabled={isAddingProject || !newTitle.trim()}
                style={{
                  background: 'rgba(0, 242, 254, 0.18)',
                  border: '1px solid rgba(0, 242, 254, 0.4)',
                  color: '#00f2fe',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: isAddingProject || !newTitle.trim() ? 0.4 : 1,
                }}
              >
                +
              </button>
            </form>

            {/* Scrollable Project List */}
            <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
              {projects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '12px 0', fontSize: '11px', color: '#64748b' }}>
                  ยังไม่มีไอเดียในลานจอด — พิมพ์เพิ่มด้านบนได้เลย!
                </div>
              ) : (
                projects.map((p) => {
                  const tagMeta = CATEGORY_TAGS[p.category] || CATEGORY_TAGS.HOBBY;
                  const isDone = p.status === 'DONE';
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        background: '#07090e',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        opacity: isDone ? 0.4 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', paddingRight: '6px' }}>
                        <button
                          onClick={() => handleToggleProject(p)}
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '4px',
                            border: isDone ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.2)',
                            background: isDone ? '#10b981' : '#030508',
                            color: isDone ? '#000000' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          ✓
                        </button>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '11px', color: '#e2e8f0', textDecoration: isDone ? 'line-through' : 'none' }}>
                            {p.title}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: '9px',
                            fontFamily: 'monospace',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            color: tagMeta.color,
                            background: tagMeta.bg,
                            border: `1px solid ${tagMeta.color}35`,
                          }}
                        >
                          {tagMeta.label.split(' ')[0]}
                        </span>
                        <button
                          onClick={() => handleDeleteProject(p.id)}
                          style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '13px', padding: '0 2px' }}
                          title="ลบไอเดียนี้"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace', textAlign: 'center', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            จดทิ้งไว้ที่นี่ สมองจะเลิกพะวง แล้วกลับมาลุยงานหลักได้ 100%
          </div>
        </div>

      </div>
    </div>
  );
}
