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

  // Roadmap State (Loaded from SQLite)
  const [roadmapSteps, setRoadmapSteps] = useState([]);
  const [isLoadingRoadmap, setIsLoadingRoadmap] = useState(false);
  const [editingStepId, setEditingStepId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCondition, setEditCondition] = useState('');
  const [isAddingStep, setIsAddingStep] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepCondition, setNewStepCondition] = useState('');

  // Project Vault State
  const [projects, setProjects] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('HOBBY');
  const [isAddingProject, setIsAddingProject] = useState(false);

  // Fetch Roadmap from API
  const fetchRoadmap = async () => {
    try {
      setIsLoadingRoadmap(true);
      const res = await fetch('/api/roadmap');
      if (res.ok) {
        const data = await res.json();
        setRoadmapSteps(data.steps || []);
      }
    } catch (err) {
      console.error('Failed to load roadmap:', err);
    } finally {
      setIsLoadingRoadmap(false);
    }
  };

  // Fetch Projects from API
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
    fetchRoadmap();
    fetchProjects();
  }, []);

  // Roadmap Actions
  const handleToggleStep = async (step) => {
    const nextStatus = step.status === 'DONE' ? 'IN_PROGRESS' : 'DONE';
    try {
      const res = await fetch('/api/roadmap', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: step.id, status: nextStatus }),
      });
      if (res.ok) {
        setRoadmapSteps((prev) =>
          prev.map((s) => (s.id === step.id ? { ...s, status: nextStatus } : s))
        );
      }
    } catch (err) {
      console.error('Failed to toggle step:', err);
    }
  };

  const handleStartEditStep = (step) => {
    setEditingStepId(step.id);
    setEditTitle(step.title);
    setEditCondition(step.condition_text || '');
  };

  const handleSaveEditStep = async (id) => {
    try {
      const res = await fetch('/api/roadmap', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          title: editTitle,
          condition_text: editCondition,
        }),
      });
      if (res.ok) {
        setEditingStepId(null);
        fetchRoadmap();
      }
    } catch (err) {
      console.error('Failed to save step:', err);
    }
  };

  const handleDeleteStep = async (id) => {
    if (!window.confirm('ยืนยันการลบเป้าหมายนี้หรือไม่?')) return;
    try {
      const res = await fetch(`/api/roadmap?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRoadmapSteps((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete step:', err);
    }
  };

  const handleAddStep = async (e) => {
    e.preventDefault();
    if (!newStepTitle.trim()) return;
    try {
      const res = await fetch('/api/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase_num: selectedPhase,
          title: newStepTitle.trim(),
          condition_text: newStepCondition.trim(),
        }),
      });
      if (res.ok) {
        setNewStepTitle('');
        setNewStepCondition('');
        setIsAddingStep(false);
        fetchRoadmap();
      }
    } catch (err) {
      console.error('Failed to add step:', err);
    }
  };

  // Project Vault Actions
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

  // Monthly Cash Flow
  const currentMonthExpense = transactions.reduce((sum, t) => sum + (t.amount || 0), 0) || 18524;
  const realSalary = 15000;
  const netBurnRate = Math.round((realSalary - currentMonthExpense) * 100) / 100;

  // Specific Spending Drilldown (Leaks analysis)
  const snackExpense = transactions.filter((t) => (t.category || '').includes('ขนม')).reduce((sum, t) => sum + (t.amount || 0), 0) || 779;
  const zazaExpense = transactions.filter((t) => (t.category || '').toLowerCase().includes('zaza')).reduce((sum, t) => sum + (t.amount || 0), 0) || 1400;
  const waterExpense = transactions.filter((t) => (t.category || '').includes('ค่าน้ำประปา')).reduce((sum, t) => sum + (t.amount || 0), 0) || 1525;
  const coffeeExpense = transactions.filter((t) => (t.category || '').includes('กาแฟ')).reduce((sum, t) => sum + (t.amount || 0), 0) || 655;
  const gasExpense = transactions.filter((t) => (t.category || '').toLowerCase().includes('gas')).reduce((sum, t) => sum + (t.amount || 0), 0) || 400;

  // Paylater specifics (First target)
  const paylater = debtsData?.debts?.find((d) => d.name.toLowerCase().includes('paylater')) || {
    initial_amount: 4568.17,
    remaining_amount: 2117.0,
  };
  const paylaterPaid = Math.max(0, (paylater.initial_amount || 4568) - (paylater.remaining_amount || 2117));
  const paylaterProgressPct = Math.min(100, Math.round((paylaterPaid / (paylater.initial_amount || 4568)) * 100)) || 54;

  const currentPhaseSteps = roadmapSteps.filter((s) => s.phase_num === selectedPhase);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto 40px auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* 1. TOP STATUS COCKPIT: CURRENT SAVE POINT & MEMORY ANCHOR PINNED */}
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
        <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f2fe', boxShadow: '0 0 10px #00f2fe' }}></span>
            <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#00f2fe', letterSpacing: '1px' }}>
              MASTER BLUEPRINT // สถานะและแผนงาน
            </span>
            <span style={{ background: 'rgba(0, 242, 254, 0.12)', border: '1px solid rgba(0, 242, 254, 0.4)', color: '#00f2fe', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}>
              📍 จุดเซฟ : กำลังฆ่าหนี้ก้อนแรก (Shopee Paylater)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🧭</span>
              <span>ภาพรวมแผนชีวิต & Roadmap การเงิน</span>
            </h1>
            <span style={{ fontSize: '12px', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              เงินเดือน 15k • หนี้คงเหลือ 51.1k
            </span>
          </div>

          {/* PINNED MEMORY ANCHOR RULES */}
          <div style={{ background: '#070a10', border: '1px solid rgba(0, 242, 254, 0.25)', borderRadius: '10px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
            <div style={{ color: '#00f2fe', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <span>⚓</span> <span>MEMORY ANCHOR (สติ & สัญญาใจเตือนตัวเอง):</span>
            </div>
            <div style={{ color: '#fda4af', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🛑</span> 1. งดเทรดมือด้วยเงินจริง 100% (ป้องกัน Dopamine พัง ห้ามเอาเงินเดือนไปเสี่ยง)
            </div>
            <div style={{ color: '#fcd34d', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🛑</span> 2. คุมงบหย่อนใจ (ขนม + Zaza) รวมกันไม่เกิน 1,500 ฿/ด. (ไม่หักดิบ แต่หยุดการดึงเงินเก็บ)
            </div>
            <div style={{ color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🎯</span> 3. ล็อกเป้าปิด Shopee Paylater (เหลือ 2,117 ฿) จบแล้วค่างวดได้คืน +1,261 ฿/ด. ค่อยสโนว์บอลก้อนถัดไป!
            </div>
          </div>
        </div>

        {/* CURRENT SAVE POINT PROGRESS METER */}
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
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>เป้าหมายจุดเซฟนี้:</span>
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
            <span>ชำระสะสมแล้ว: {paylaterPaid.toLocaleString()} ฿</span>
            <span style={{ color: '#00f2fe' }}>ปลดล็อกคืนกระเป๋า: 1,261 ฿/ด.</span>
          </div>
        </div>
      </section>

      {/* 2. MAIN BENTO GRID (3 COLUMNS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', alignItems: 'stretch' }}>
        
        {/* CARD 1: THE 3 MACRO PILLARS (CASH, ALPHA, BETA WITH SUB-PORTS) */}
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
                โครงสร้าง 3 พอร์ตหลัก (CASH • ALPHA • BETA)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* 1. CASH PILLAR */}
            <div style={{ background: '#07090f', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#f43f5e' }}>💼</span> 1. CASH (ความอยู่รอด & ล้างหนี้)
                </span>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#f43f5e', fontWeight: 700 }}>หนี้คงเหลือ 51.1k</span>
              </div>
              
              <div style={{ width: '100%', height: '6px', background: '#020305', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${debtProgressPct}%`, height: '100%', background: 'linear-gradient(90deg, #f43f5e, #f59e0b)' }}></div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>• เงินเดือนประจำ 15k: เลี้ยงชีพ & คุมบิล</span>
                  <span style={{ color: '#10b981' }}>ชำระสะสม {totalDebtPaid.toLocaleString()} ฿</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>• หนี้ 4 เจ้า: ชำระตรงเวลา</span>
                  <span style={{ color: '#fbbf24' }}>เป้าแรก: Paylater 2.1k</span>
                </div>
              </div>
            </div>

            {/* 2. ALPHA PILLAR */}
            <div style={{ background: '#07090f', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#00f2fe' }}>🤖</span> 2. ALPHA (เครื่องยนต์อัตโนมัติ)
                </span>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', background: 'rgba(0, 242, 254, 0.1)', color: '#00f2fe', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 242, 254, 0.3)' }}>
                  MT5 Demo Test
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8' }}>
                <div>• <strong>EA บอทเทรด:</strong> รัน Demo ทุน 0 ฿ (GoldTuesday / BTCSnowball)</div>
                <div>• <strong>Cent Account ($20 ~ 700 ฿):</strong> สเต็ปถัดไปหลังปลดหนี้</div>
                <div style={{ color: '#64748b' }}>• <strong>เทรดมือ:</strong> Paper / Demo บน Playbook เท่านั้น (ห้ามเงินจริง)</div>
              </div>
            </div>

            {/* 3. BETA PILLAR */}
            <div style={{ background: '#07090f', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#f59e0b' }}>🌱</span> 3. BETA (ความมั่งคั่งระยะยาว)
                </span>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#64748b' }}>
                  เริ่มหลังปลอดหนี้
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8' }}>
                <div>• <strong>DCA Bitcoin / Crypto Spot:</strong> เริ่มสะสมเมื่อปลอดหนี้ Shopee & Finnix</div>
                <div>• <strong>เงินสำรองฉุกเฉิน:</strong> ตั้งเป้า 3 เดือนในบัญชี (~36k ฿)</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b', textAlign: 'center', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            Ray Dalio Principle: "แยกพอร์ตให้ขาด อารมณ์จะไม่กวนเงินสด"
          </div>
        </div>

        {/* CARD 2: INTERACTIVE & EDITABLE ROADMAP (REAL ROADMAP LADDER) */}
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
                ROADMAP เป้าหมาย (แก้ไขได้)
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
                  เฟส {num}
                </button>
              ))}
            </div>
          </div>

          {/* Phase Header Info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'monospace' }}>
            <span style={{ color: '#00f2fe', fontWeight: 700 }}>
              {selectedPhase === 1 && 'PHASE 1 (ปัจจุบัน): ความอยู่รอด & ฆ่าหนี้ Paylater'}
              {selectedPhase === 2 && 'PHASE 2 (ถัดไป): สโนว์บอลปิด Finnix 9.4k & ขยายเงินสด'}
              {selectedPhase === 3 && 'PHASE 3 (เป้าหมาย): ปลอดหนี้ 100% & สร้างพอร์ตมั่งคั่ง'}
            </span>
            <span style={{ color: selectedPhase === 1 ? '#10b981' : '#64748b', fontWeight: 600 }}>
              {selectedPhase === 1 ? '🟢 ACTIVE' : selectedPhase === 2 ? '⏳ NEXT' : '🔒 GOAL'}
            </span>
          </div>

          {/* Roadmap Steps List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
            {isLoadingRoadmap ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '12px' }}>กำลังโหลด Roadmap...</div>
            ) : currentPhaseSteps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '12px' }}>ยังไม่มีเป้าหมายในเฟสนี้ กดปุ่มด้านล่างเพื่อเพิ่ม</div>
            ) : (
              currentPhaseSteps.map((step) => {
                const isEditing = editingStepId === step.id;
                const isDone = step.status === 'DONE';

                if (isEditing) {
                  return (
                    <div key={step.id} style={{ background: '#070a10', border: '1px solid #00f2fe', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="ชื่อเป้าหมาย..."
                        style={{ background: '#020305', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '6px 8px', fontSize: '11px', color: '#fff', outline: 'none' }}
                      />
                      <input
                        type="text"
                        value={editCondition}
                        onChange={(e) => setEditCondition(e.target.value)}
                        placeholder="เงื่อนไขปลดล็อกขั้นถัดไป..."
                        style={{ background: '#020305', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '6px 8px', fontSize: '11px', color: '#94a3b8', outline: 'none' }}
                      />
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                        <button
                          onClick={() => setEditingStepId(null)}
                          style={{ background: 'transparent', border: '1px solid #64748b', color: '#64748b', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', cursor: 'pointer' }}
                        >
                          ยกเลิก
                        </button>
                        <button
                          onClick={() => handleSaveEditStep(step.id)}
                          style={{ background: 'rgba(0, 242, 254, 0.2)', border: '1px solid #00f2fe', color: '#00f2fe', padding: '3px 10px', borderRadius: '6px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                        >
                          บันทึก
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={step.id}
                    style={{
                      background: isDone ? 'rgba(16, 185, 129, 0.05)' : '#070a10',
                      border: `1px solid ${isDone ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
                      borderRadius: '10px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1 }}>
                        <button
                          onClick={() => handleToggleStep(step)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: isDone ? '#10b981' : '#64748b',
                            cursor: 'pointer',
                            fontSize: '14px',
                            padding: 0,
                            lineHeight: 1,
                            marginTop: '1px',
                          }}
                          title="คลิกเพื่อเปลี่ยนสถานะ"
                        >
                          {isDone ? '✅' : '⏳'}
                        </button>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: isDone ? '#94a3b8' : '#ffffff', textDecoration: isDone ? 'line-through' : 'none' }}>
                            {step.title}
                          </span>
                          {step.condition_text && (
                            <span style={{ fontSize: '10px', color: '#00f2fe', fontFamily: 'monospace' }}>
                              ↳ เงื่อนไขผ่าน: {step.condition_text}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => handleStartEditStep(step)}
                          style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '11px', padding: '2px 4px' }}
                          title="แก้ไขข้อความ"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteStep(step.id)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '2px 4px' }}
                          title="ลบ"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Step Form / Button */}
          {isAddingStep ? (
            <form onSubmit={handleAddStep} style={{ background: '#070a10', border: '1px solid rgba(0, 242, 254, 0.4)', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#00f2fe' }}>+ เพิ่มเป้าหมายใหม่ในเฟส {selectedPhase}</div>
              <input
                type="text"
                placeholder="เช่น เก็บเงินให้ถึง 10k หรือ ปิดหนี้ก้อนนี้..."
                value={newStepTitle}
                onChange={(e) => setNewStepTitle(e.target.value)}
                style={{ background: '#020305', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '6px 8px', fontSize: '11px', color: '#fff', outline: 'none' }}
              />
              <input
                type="text"
                placeholder="เงื่อนไขปลดล็อก (เช่น ถึงเท่านี้แล้วค่อยไปทำสเต็ป 2)..."
                value={newStepCondition}
                onChange={(e) => setNewStepCondition(e.target.value)}
                style={{ background: '#020305', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '6px 8px', fontSize: '11px', color: '#94a3b8', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddingStep(false)}
                  style={{ background: 'transparent', border: '1px solid #64748b', color: '#64748b', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', cursor: 'pointer' }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={!newStepTitle.trim()}
                  style={{ background: 'rgba(0, 242, 254, 0.2)', border: '1px solid #00f2fe', color: '#00f2fe', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                >
                  + บันทึกเป้าหมาย
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAddingStep(true)}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px dashed rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '8px',
                fontSize: '11px',
                color: '#94a3b8',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              + เพิ่มเป้าหมายใหม่ในเฟส {selectedPhase}
            </button>
          )}

          <div style={{ background: '#07090f', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '8px 10px', fontSize: '10px', color: '#94a3b8' }}>
            💡 <strong>กฎการปลดล็อก:</strong> ทำเป้าหมายของเฟสปัจจุบันให้ครบก่อน แล้วค่อยก้าวไปเฟสถัดไป จะไม่หลงทาง!
          </div>
        </div>

        {/* CARD 3: CASH FLOW REALITY & PROJECT VAULT */}
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
          {/* MONTHLY CASHFLOW & LEAK DRILLDOWN */}
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
                <span>☕ กาแฟ: {coffeeExpense.toLocaleString()} ฿</span>
                <span>⛽ น้ำมัน: {gasExpense.toLocaleString()} ฿</span>
                <span>📄 หนี้ 4 เจ้า: 5,740 ฿</span>
              </div>
            </div>

            <div style={{ fontSize: '10px', color: '#94a3b8', background: '#030508', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)', lineHeight: 1.4 }}>
              💡 <strong>ความจริง:</strong> ขนม ({snackExpense} ฿) + Zaza ({zazaExpense} ฿) + ค่าน้ำผิดปกติ ({waterExpense} ฿) = 3,704 ฿ ถ้าคุมงบหย่อนใจ Zaza+ขนม ให้อยู่ในงบ ~1,500 ฿ และค่าน้ำกลับมาปกติ เงินเดือน 15k จะเหลือบวกทันทีโดยไม่ต้องหักดิบ!
            </div>
          </div>

          {/* PROJECT VAULT (IDEA PARKING LOT) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#f59e0b' }}>🅿️</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.5px' }}>
                  PROJECT VAULT (ที่จอดไอเดียที่อยากทำ)
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
                  opacity: isAddingProject || !newTitle.trim() ? 0.5 : 1,
                }}
              >
                +
              </button>
            </form>

            {/* Ideas List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
              {projects.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', padding: '10px' }}>
                  ยังไม่มีไอเดียที่จอดไว้ — มีอะไรแวบเข้ามาในหัวพิมพ์จดไว้ได้เลย
                </div>
              ) : (
                projects.map((p) => {
                  const tag = CATEGORY_TAGS[p.category] || CATEGORY_TAGS.HOBBY;
                  const isDone = p.status === 'DONE';
                  return (
                    <div
                      key={p.id}
                      style={{
                        background: isDone ? 'rgba(255, 255, 255, 0.02)' : '#07090e',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                        <button
                          onClick={() => handleToggleProject(p)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: 0,
                            lineHeight: 1,
                          }}
                          title={isDone ? 'ไอเดียนี้เริ่มทำแล้ว' : 'จอดรอไว้'}
                        >
                          {isDone ? '✅' : '🅿️'}
                        </button>
                        <span
                          style={{
                            fontSize: '11px',
                            color: isDone ? '#64748b' : '#ffffff',
                            textDecoration: isDone ? 'line-through' : 'none',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {p.title}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: tag.bg,
                            color: tag.color,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {tag.label.split(' ')[0]}
                        </span>
                        <button
                          onClick={() => handleDeleteProject(p.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            fontSize: '12px',
                            cursor: 'pointer',
                            padding: '0 2px',
                            lineHeight: 1,
                          }}
                          title="ลบไอเดีย"
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
        </div>
      </div>
    </div>
  );
}
