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

  // Today's Action & Routine Cockpit State
  const [focusTop3, setFocusTop3] = useState([]);
  const [focusStats, setFocusStats] = useState(null);
  const [trackerActive, setTrackerActive] = useState(null);
  const [trackerToday, setTrackerToday] = useState(null);
  const [todayLogs, setTodayLogs] = useState([]);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [isFocusToggling, setIsFocusToggling] = useState(false);

  // Reflection (Daily Logs & Plan) State: 3 distinct items
  const [todayReflection, setTodayReflection] = useState({ finish_text: '', next_day_text: '', luck_text: '' });
  const [yesterdayPlan, setYesterdayPlan] = useState('');
  const [yesterdayDate, setYesterdayDate] = useState('');
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [todayPlanInput, setTodayPlanInput] = useState('');
  const [finishInput, setFinishInput] = useState('');
  const [tomorrowPlanInput, setTomorrowPlanInput] = useState('');
  const [isSavingReflection, setIsSavingReflection] = useState(false);

  // Fetch Today's Actions (Focus + Daily Tracker + Daily Plan/Reflections)
  const fetchTodayActions = async () => {
    try {
      const [focusRes, trackerRes, reflectionRes] = await Promise.all([
        fetch('/api/focus'),
        fetch('/api/tracker'),
        fetch('/api/reflections'),
      ]);
      if (focusRes.ok) {
        const fData = await focusRes.json();
        setFocusTop3(fData.todayTop3 || []);
        setFocusStats(fData.stats || null);
      }
      if (trackerRes.ok) {
        const tData = await trackerRes.json();
        setTrackerActive(tData.activeSession || null);
        setTrackerToday(tData.todayStats || null);
        setTodayLogs(tData.todayLogs || []);
        if (tData.activeSession) {
          const start = new Date(tData.activeSession.start_time).getTime();
          setLiveElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
        } else {
          setLiveElapsed(0);
        }
      }
      if (reflectionRes.ok) {
        const rData = await reflectionRes.json();
        const tRef = rData.today || { finish_text: '', next_day_text: '', luck_text: '' };
        setTodayReflection(tRef);
        setFinishInput(tRef.finish_text || '');
        setTomorrowPlanInput(tRef.next_day_text || '');

        const yest = (rData.history || []).find((h) => h.date !== rData.selectedDate && h.next_day_text);
        if (yest) {
          setYesterdayPlan(yest.next_day_text);
          setYesterdayDate(yest.date);
          setTodayPlanInput(yest.next_day_text);
        } else {
          setYesterdayPlan('');
          setYesterdayDate('');
          setTodayPlanInput('');
        }
      }
    } catch (err) {
      console.error('Failed to load today actions:', err);
    }
  };

  // Save Reflection (Today's Plan, Finished List, and Tomorrow's Plan)
  const handleSaveReflection = async () => {
    try {
      setIsSavingReflection(true);
      // 1. Save Today's Finished List and Tomorrow's Plan
      await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finish_text: finishInput,
          next_day_text: tomorrowPlanInput,
        }),
      });

      // 2. If user edited today's target/plan and there's a yesterday record
      if (yesterdayDate && todayPlanInput !== yesterdayPlan) {
        await fetch('/api/reflections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: yesterdayDate,
            next_day_text: todayPlanInput,
          }),
        });
      }

      setIsEditingPlan(false);
      fetchTodayActions();
    } catch (e) {
      console.error('Error saving reflection:', e);
    } finally {
      setIsSavingReflection(false);
    }
  };

  // Toggle Focus Check-in
  const handleToggleFocus = async (task) => {
    if (isFocusToggling) return;
    setIsFocusToggling(true);
    const nextCompleted = !task.is_done_today;
    setFocusTop3((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, is_done_today: nextCompleted } : t))
    );
    try {
      await fetch('/api/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkin',
          taskId: task.id,
          status: nextCompleted ? 'COMPLETED' : 'TOGGLE',
        }),
      });
      fetchTodayActions();
    } catch (e) {
      console.error('Error toggling focus:', e);
      fetchTodayActions();
    } finally {
      setIsFocusToggling(false);
    }
  };

  // Punch Tracker Activity
  const handlePunchTracker = async (activityId) => {
    try {
      await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'punch', activityId }),
      });
      fetchTodayActions();
    } catch (e) {
      console.error('Error punching tracker:', e);
    }
  };

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
    fetchTodayActions();

    // Auto-poll tracker & today cockpit every 15 seconds so auto-detected apps/timers update live
    const pollInterval = setInterval(() => {
      fetchTodayActions();
    }, 15000);

    return () => clearInterval(pollInterval);
  }, []);

  // Real-time ticking clock for active tracker session
  useEffect(() => {
    if (!trackerActive) {
      setLiveElapsed(0);
      return;
    }
    const timer = setInterval(() => {
      const start = new Date(trackerActive.start_time).getTime();
      setLiveElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [trackerActive]);

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
  const waterExpense = transactions.filter((t) => (t.category || '').includes('ค่าน้ำประปา') || (t.category || '').includes('ค่าน้ำมัน')).reduce((sum, t) => sum + (t.amount || 0), 0) || 1525;
  const coffeeExpense = transactions.filter((t) => (t.category || '').includes('กาแฟ')).reduce((sum, t) => sum + (t.amount || 0), 0) || 655;
  const gasExpense = transactions.filter((t) => (t.category || '').toLowerCase().includes('gas') || (t.category || '').includes('แก๊ส')).reduce((sum, t) => sum + (t.amount || 0), 0) || 400;

  // Paylater specifics (First target)
  const paylater = debtsData?.debts?.find((d) => d.name.toLowerCase().includes('paylater')) || {
    initial_amount: 4568.17,
    remaining_amount: 2117.0,
  };
  const paylaterPaid = Math.max(0, (paylater.initial_amount || 4568) - (paylater.remaining_amount || 2117));
  const paylaterProgressPct = Math.min(100, Math.round((paylaterPaid / (paylater.initial_amount || 4568)) * 100)) || 54;

  const currentPhaseSteps = roadmapSteps.filter((s) => s.phase_num === selectedPhase);

  // Today's Focus & Routine Checklist calculations
  const focusCompletedCount = focusTop3.filter((t) => t.is_done_today).length;
  const coreDisciplines = [
    { id: 1, name: '💻 ทำงาน/วิจัย' },
    { id: 3, name: '🧠 พัฒนาตัวเอง' },
    { id: 4, name: '💪 ออกกำลังกาย' },
  ];
  const trackerBreakdownMap = {};
  (trackerToday?.breakdown || []).forEach((b) => {
    trackerBreakdownMap[b.activity_id] = b.totalMinutes;
  });
  if (trackerActive) {
    trackerBreakdownMap[trackerActive.activity_id] = (trackerBreakdownMap[trackerActive.activity_id] || 0) + 1;
  }
  const uncompletedDisciplines = coreDisciplines
    .filter((d) => !trackerBreakdownMap[d.id] || trackerBreakdownMap[d.id] <= 0)
    .map((d) => d.name);

  const formatTimerClock = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

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

      {/* 1.5 TODAY'S ACTION COCKPIT: TOP 3 FOCUS & DAILY ROUTINE TRACKER */}
      <section
        style={{
          background: 'linear-gradient(165deg, rgba(16, 22, 36, 0.95) 0%, rgba(9, 13, 21, 0.95) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '18px 20px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* Section Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🎯</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.3px' }}>
              วาระ & วินัยประจำวันนี้ (Today's Actions & Routine Checklist)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
              คลิกติ๊กเสร็จหรือสลับจับเวลาได้ทันทีจากหน้านี้
            </span>
          </div>
        </div>

        {/* 3 Sub-Cards: Left = Top 3 Focus, Middle = Daily Plan & Finished, Right = Daily Tracker */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
          
          {/* SUB-CARD 1: TOP 3 FOCUS */}
          <div
            style={{
              background: '#070a10',
              border: '1px solid rgba(255, 214, 10, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffd60a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔥</span> Top 3 Focus (ภารกิจ 3 ข้อประจำวัน)
              </span>
              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: focusCompletedCount === 3 ? '#30d158' : '#ffd60a', background: 'rgba(255, 214, 10, 0.1)', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                {focusCompletedCount}/3 สำเร็จแล้ว {focusCompletedCount === 3 && '🎉'}
              </span>
            </div>

            {/* Task list with interactive toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {focusTop3.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', padding: '12px 0' }}>
                  กำลังโหลดภารกิจ 3 ข้อ...
                </div>
              ) : (
                focusTop3.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleToggleFocus(task)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: task.is_done_today ? 'rgba(48, 209, 88, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: task.is_done_today ? '1px solid rgba(48, 209, 88, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
                      cursor: isFocusToggling ? 'wait' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!task.is_done_today}
                      readOnly
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#30d158' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: task.is_done_today ? '#94a3b8' : '#ffffff', textDecoration: task.is_done_today ? 'line-through' : 'none', flex: 1 }}>
                      {task.title}
                    </span>
                    {task.is_done_today ? (
                      <span style={{ fontSize: '10px', color: '#30d158', fontWeight: 700 }}>✓ ทำแล้ว</span>
                    ) : (
                      <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>⏳ ยังไม่ทำ</span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Incomplete note */}
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '6px' }}>
              <span>{focusCompletedCount === 3 ? '🎉 ยอดเยี่ยม! วันนี้ทำครบ 3 ข้อแล้ว' : `เหลืออีก ${Math.max(0, 3 - focusCompletedCount)} ข้อที่ต้องทำให้เสร็จวันนี้`}</span>
              <span style={{ color: '#00f2fe' }}>รักษาวินัยต่อเนื่อง 🔥</span>
            </div>
          </div>

          {/* SUB-CARD 2: DAILY PLAN & FINISHED (แผนวันนี้, ทำเสร็จแล้ว, และแผนพรุ่งนี้) */}
          <div
            style={{
              background: '#070a10',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📋</span> Daily Plan & Finished (แผน & สิ่งที่ทำเสร็จ)
              </span>
              <button
                onClick={() => setIsEditingPlan(!isEditingPlan)}
                style={{
                  background: isEditingPlan ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: isEditingPlan ? '#10b981' : '#8e8e93',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                {isEditingPlan ? 'ปิดการแก้ไข' : '✏️ แก้ไข/จดเพิ่ม'}
              </button>
            </div>

            {/* View or Edit mode */}
            {isEditingPlan ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    🎯 1. แผนที่ตั้งเป้าไว้วันนี้ (Today's Plan):
                  </label>
                  <textarea
                    rows={2}
                    value={todayPlanInput}
                    onChange={(e) => setTodayPlanInput(e.target.value)}
                    placeholder="เป้าหมายที่ตั้งใจจะทำวันนี้..."
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '11px',
                      padding: '6px 8px',
                      resize: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: '#34d399', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    ✅ 2. สิ่งที่ทำเสร็จแล้ววันนี้ (Finished Today):
                  </label>
                  <textarea
                    rows={2}
                    value={finishInput}
                    onChange={(e) => setFinishInput(e.target.value)}
                    placeholder="เช่น ตัดคลิปเสร็จ 1 ชิ้น, วิดพื้นครบ..."
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(52, 211, 153, 0.25)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '11px',
                      padding: '6px 8px',
                      resize: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    🚀 3. แผนที่จะทำพรุ่งนี้ (Tomorrow's Plan):
                  </label>
                  <textarea
                    rows={2}
                    value={tomorrowPlanInput}
                    onChange={(e) => setTomorrowPlanInput(e.target.value)}
                    placeholder="สิ่งที่จะลุยต่อในวันพรุ่งนี้..."
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '11px',
                      padding: '6px 8px',
                      resize: 'none',
                    }}
                  />
                </div>
                <button
                  onClick={handleSaveReflection}
                  disabled={isSavingReflection}
                  style={{
                    background: '#10b981',
                    color: '#000',
                    border: 'none',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: isSavingReflection ? 'wait' : 'pointer',
                    alignSelf: 'flex-end',
                  }}
                >
                  {isSavingReflection ? 'กำลังบันทึก...' : '💾 บันทึกแผน'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* 1. Today's Plan */}
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '7px 10px' }}>
                  <div style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>🎯</span> 1. แผนที่ตั้งเป้าไว้วันนี้ (Today's Plan):
                  </div>
                  <div style={{ fontSize: '11px', color: yesterdayPlan || todayPlanInput ? '#ffffff' : '#64748b', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                    {yesterdayPlan || todayPlanInput || 'ยังไม่ได้กำหนดแผนวันนี้ (กด ✏️ เพื่อจดเป้าหมาย)'}
                  </div>
                </div>

                {/* 2. Finished List Today */}
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '7px 10px' }}>
                  <div style={{ fontSize: '10px', color: '#34d399', fontWeight: 700, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>✅</span> 2. สิ่งที่ทำเสร็จแล้ววันนี้ (Finished Today):
                  </div>
                  <div style={{ fontSize: '11px', color: todayReflection.finish_text ? '#ffffff' : '#64748b', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                    {todayReflection.finish_text || 'ยังไม่มีรายการที่บันทึกว่าเสร็จ (กด ✏️ เพื่อจดความสำเร็จ)'}
                  </div>
                </div>

                {/* 3. Tomorrow's Plan */}
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '7px 10px' }}>
                  <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>🚀</span> 3. แผนที่จะทำพรุ่งนี้ (Tomorrow's Plan):
                  </div>
                  <div style={{ fontSize: '11px', color: todayReflection.next_day_text ? '#ffffff' : '#64748b', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                    {todayReflection.next_day_text || 'ยังไม่ได้วางแผนวันพรุ่งนี้ (กด ✏️ เพื่อวางเป้าหมายล่วงหน้า)'}
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '6px' }}>
              <span>บันทึกความคืบหน้าสะสม</span>
              <span style={{ color: '#10b981' }}>ซิงค์ Sheets เงียบ ๆ ☁️</span>
            </div>
          </div>

          {/* SUB-CARD 3: DAILY ACTIVITY TRACKER & TODAY'S TIME LOGS */}
          <div
            style={{
              background: '#070a10',
              border: trackerActive ? `1px solid ${trackerActive.color || '#64d2ff'}40` : '1px solid rgba(100, 210, 255, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#64d2ff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⏱️</span> Daily Tracker (กิจกรรม & ไทม์ไลน์วันนี้)
              </span>
              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8' }}>
                รวมวันนี้: <strong style={{ color: '#ffffff' }}>{trackerToday?.totalFormatted || '0 นาที'}</strong>
              </span>
            </div>

            {/* Current Active Status */}
            {trackerActive ? (
              <div
                style={{
                  background: `${trackerActive.color || '#64d2ff'}18`,
                  border: `1px solid ${trackerActive.color || '#64d2ff'}40`,
                  borderRadius: '8px',
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>{trackerActive.emoji || '⚡'}</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>
                      กำลังทำ: {trackerActive.activity_name}
                    </div>
                    <div style={{ fontSize: '10px', color: trackerActive.color || '#64d2ff' }}>
                      {trackerActive.note ? `${trackerActive.note} • ` : ''}เริ่มเมื่อ {new Date(trackerActive.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })} น.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>
                    {formatTimerClock(liveElapsed)}
                  </span>
                  <button
                    onClick={() => handlePunchTracker(trackerActive.activity_id)}
                    style={{
                      background: 'rgba(255, 69, 58, 0.15)',
                      border: '1px solid rgba(255, 69, 58, 0.4)',
                      color: '#ff453a',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ⏹️ หยุด
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px dashed rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  ⚪ ยังไม่ได้เริ่มกิจกรรม • คลิกปุ่มด้านล่างเพื่อเริ่มจับเวลาทันที
                </div>
              </div>
            )}

            {/* Quick Punch Activity Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {[
                { id: 1, name: 'ทำงาน', emoji: '💻', color: '#64d2ff' },
                { id: 2, name: 'เล่นเกม', emoji: '🎮', color: '#bf5af2' },
                { id: 3, name: 'พัฒนาตน', emoji: '🧠', color: '#ffd60a' },
                { id: 4, name: 'ออกกำลัง', emoji: '💪', color: '#30d158' },
                { id: 5, name: 'พักผ่อน', emoji: '😴', color: '#0a84ff' },
              ].map((act) => {
                const isActive = trackerActive && trackerActive.activity_id === act.id;
                return (
                  <button
                    key={act.id}
                    onClick={() => handlePunchTracker(act.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                      padding: '6px 4px',
                      borderRadius: '6px',
                      background: isActive ? `${act.color}30` : 'rgba(255, 255, 255, 0.04)',
                      border: isActive ? `1.5px solid ${act.color}` : '1px solid rgba(255, 255, 255, 0.06)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '14px' }}>{act.emoji}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{act.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Today's Chronological Time Logs (ไทม์ไลน์บันทึกเวลาจริงวันนี้) */}
            <div style={{ background: '#04060a', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>📜 ไทม์ไลน์ช่วงเวลาวันนี้:</span>
                <span style={{ color: '#64d2ff' }}>{todayLogs.length} รอบ</span>
              </div>
              
              {todayLogs.length === 0 ? (
                <div style={{ fontSize: '10.5px', color: '#64748b', textAlign: 'center', padding: '4px 0' }}>
                  ยังไม่มีประวัติการจับเวลาวันนี้
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '110px', overflowY: 'auto' }}>
                  {todayLogs.map((log) => {
                    const isOngoing = !log.end_time;
                    const formatTime = (iso) => {
                      if (!iso) return 'ปัจจุบัน';
                      try {
                        return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
                      } catch (e) {
                        return iso.slice(11, 16);
                      }
                    };
                    const durH = Math.floor(log.duration_minutes / 60);
                    const durM = log.duration_minutes % 60;
                    const durFormatted = isOngoing
                      ? `${Math.floor(liveElapsed / 60)} น.`
                      : durH > 0
                      ? `${durH} ชม. ${durM} น.`
                      : `${durM} น.`;

                    return (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          background: isOngoing ? 'rgba(48, 209, 88, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                          fontSize: '10.5px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{log.emoji || '⚡'}</span>
                          <span style={{ color: '#ffffff', fontWeight: 600 }}>{log.activity_name}</span>
                          {log.note && (
                            <span style={{ color: '#64748b', fontSize: '9.5px' }}>({log.note.replace('Auto-detected: ', '').replace('Auto-stopped: ', '')})</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'monospace' }}>
                          <span style={{ color: '#94a3b8' }}>
                            {formatTime(log.start_time)} - {formatTime(log.end_time)}
                          </span>
                          <span style={{ color: isOngoing ? '#30d158' : '#64d2ff', fontWeight: 700 }}>
                            {durFormatted}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Disciplines yet to do today (Uncompleted Activities Alert) */}
            <div style={{ fontSize: '10.5px', color: '#94a3b8', background: '#04060a', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                {uncompletedDisciplines.length > 0 ? (
                  <>⚠️ <strong style={{ color: '#f59e0b' }}>ยังไม่ได้ทำวันนี้:</strong> {uncompletedDisciplines.join(' • ')}</>
                ) : (
                  <>🎉 <strong style={{ color: '#30d158' }}>ยอดเยี่ยม:</strong> ทำครบทุกเสาหลักกิจกรรมวันนี้แล้ว!</>
                )}
              </span>
            </div>
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
