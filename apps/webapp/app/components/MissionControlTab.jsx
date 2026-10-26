'use client';

import { useState, useEffect } from 'react';

const CATEGORY_TAGS = {
  HOBBY: { label: '🌱 ฮีลใจ/งานอดิเรก', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  MEDIA: { label: '🎥 สื่อ/ยูทูป/แบรนด์', color: '#00f2fe', bg: 'rgba(0, 242, 254, 0.12)' },
  CAREER: { label: '🧠 จิตวิทยา/อาชีพใหม่', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)' },
  BIZ: { label: '💡 ธุรกิจ/โปรเจกต์', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
};

export default function MissionControlTab({ debtsData, transactions = [] }) {
  // Phase Tab State (1, 2, 3)
  const [selectedPhase, setSelectedPhase] = useState(1);

  // Project Vault State
  const [projects, setProjects] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('HOBBY');
  const [isAddingProject, setIsAddingProject] = useState(false);

  // BTC DCA State simulation
  const [btcDcaChecked, setBtcDcaChecked] = useState(false);

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
  const totalDebtRemaining = debtsData?.totalDebt || 56157;
  const totalDebtPaid = Math.max(0, totalDebtInitial - totalDebtRemaining);
  const debtProgressPct = Math.min(100, Math.round((totalDebtPaid / totalDebtInitial) * 100)) || 9;

  // Finnix specific
  const finnix = debtsData?.debts?.find((d) => d.name.toLowerCase().includes('finnix')) || {
    initial_amount: 10000,
    remaining_amount: 9388,
  };
  const finnixPaid = Math.max(0, (finnix.initial_amount || 10000) - (finnix.remaining_amount || 9388));
  const finnixProgressPct = Math.min(100, Math.round((finnixPaid / (finnix.initial_amount || 10000)) * 100));

  return (
    <div className="mission-control-container space-y-4">
      {/* 1. TOP STATUS COCKPIT: CURRENT SAVE POINT & CLASS */}
      <section className="mc-card mc-header-banner p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="mc-pulse-dot"></span>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-400">
                SKYNET COMMAND // MASTER BLUEPRINT
              </span>
              <span className="mc-pill cyan font-mono text-[11px]">
                SAVE POINT : LVL 1.2 ACTIVE
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2.5">
              <span>🛡️ CLASS 1: THE DEBT SLAYER</span>
              <span className="text-xs font-mono font-normal text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                ผู้สังหารหนี้ & คัดเลือก EA
              </span>
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              สเตจปัจจุบัน: คุมเงินกินอยู่ด้วยงานคลิป • โปะหนี้ Finnix ก้อนแรก • ทดสอบ EA ใน MT5 Demo • ดับความโลภด้วย BTC DCA 1,500 ฿/ด.
            </p>
          </div>

          {/* LEVEL UP PROGRESS METER (RPG INFOGRAPHIC) */}
          <div className="p-3.5 rounded-xl bg-[#0d121c] border border-slate-800/90 min-w-[280px]">
            <div className="flex justify-between items-center text-xs font-mono mb-1.5">
              <span className="text-slate-400 font-bold">เงื่อนไขปลดล็อก CLASS 2:</span>
              <span className="text-amber-400 font-bold">{finnixProgressPct}% (ปิด Finnix 10k)</span>
            </div>
            <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800 mb-2">
              <div
                className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(5, finnixProgressPct)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>จ่ายแล้ว: {finnixPaid.toLocaleString()} ฿</span>
              <span className="text-cyan-400">รางวัล: ปลดล็อกพอร์ต Cent รัน EA 612 ฿/ด. 🔓</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. MAIN BENTO GRID (4 CORNERSTONES) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        
        {/* LEFT: THE 3 PORTFOLIOS (RAY DALIO MODEL + BTC DCA) (4 COLS) */}
        <div className="lg:col-span-4 mc-card p-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400">📊</span>
              <span className="font-bold text-xs font-mono text-white tracking-wider uppercase">
                The 3 Portfolios (Ray Dalio)
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Cash = Alpha + Beta</span>
          </div>

          <div className="space-y-2.5">
            {/* Port 1: Cash & Debt */}
            <div className="p-3 rounded-xl bg-[#0d121c] border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="text-rose-400">🛡️</span> พอร์ต 1: เงินสดกินอยู่ & ปลดหนี้
                </span>
                <span className="text-[11px] font-mono text-rose-400 font-bold">หนี้รวม 56k</span>
              </div>
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full"
                  style={{ width: `${debtProgressPct}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>จ่ายสะสม {totalDebtPaid.toLocaleString()} ฿ ({debtProgressPct}%)</span>
                <span className="text-emerald-400">คลิป 30k เลี้ยงระบบ</span>
              </div>
            </div>

            {/* Port 2: Alpha EA Engine */}
            <div className="p-3 rounded-xl bg-[#0d121c] border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="text-cyan-400">🤖</span> พอร์ต 2: EA Cashflow (Alpha)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                  MT5 Demo
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                รันอัลกอริทึม 100% (GoldTuesday / BTCSnowball) หาเงินเสริมรายเดือน ไร้อารมณ์
              </p>
            </div>

            {/* Port 3: BTC DCA Pressure Valve (NEW!) */}
            <div className="p-3 rounded-xl bg-[#0d121c] border border-amber-500/30 space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="text-amber-400">🪙</span> พอร์ต 3: BTC DCA (ระงับกิเลส)
                </span>
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-600/40">
                  งบ 1,500 ฿/ด.
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">เงื่อนไข: TRIX &gt; 0</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> BUY ZONE ACTIVE
                </span>
              </div>
              <div className="text-[10px] text-slate-400 bg-slate-950 p-2 rounded-lg border border-slate-800 leading-tight">
                💡 <strong>กฎเหล็ก:</strong> ซื้อ Spot เก็บยาวเท่านั้น ห้ามแตะ Futures/Margin ดับความ FOMO แบบมีกรอบคุมความเสี่ยง!
              </div>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-500 text-center pt-1 border-t border-slate-800/60">
            Meawbin Principle: "แยกพอร์ตให้ขาด อารมณ์จะไม่กวนเงินสด"
          </div>
        </div>

        {/* CENTER: ROADMAP & SAVE POINT CHECKLIST (4 COLS) */}
        <div className="lg:col-span-4 mc-card p-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400">🗺️</span>
              <span className="font-bold text-xs font-mono text-white tracking-wider uppercase">
                Anti-Breaker Roadmap
              </span>
            </div>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setSelectedPhase(1)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
                  selectedPhase === 1
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                P1
              </button>
              <button
                onClick={() => setSelectedPhase(2)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                  selectedPhase === 2
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                P2
              </button>
              <button
                onClick={() => setSelectedPhase(3)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                  selectedPhase === 3
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                P3
              </button>
            </div>
          </div>

          {/* Dynamic Phase Content */}
          {selectedPhase === 1 && (
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-cyan-400 font-bold">PHASE 1 (ปัจจุบัน) : ต.ค. – พ.ย. 2026</span>
                <span className="text-emerald-400">🟢 ACTIVE</span>
              </div>
              <h4 className="text-sm font-bold text-white">ปูฐานเงินสด & คัดเลือก EA (Demo)</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                ทำคลิปผลิตเงินสดสม่ำเสมอ คุมรายจ่ายกินอยู่ ~220 ฿/วัน จ่ายหนี้ตรงเวลา และโยน EA เข้า MT5 Demo เพื่อดูสถิติจริงโดยไม่เสียเงิน
              </p>
              <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                <div className="text-[10px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                  ภารกิจประจำเฟส:
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <span className="text-emerald-400 font-bold font-mono">✓</span>
                    <span className="line-through opacity-70">จ่ายหนี้ 4 บิลตรงเวลา (5,740 ฿)</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-slate-500 font-bold font-mono">○</span>
                    <span>ทำคลิปต่อเนื่อง 5-7 ชิ้น/สัปดาห์</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-slate-500 font-bold font-mono">○</span>
                    <span>เปิด MT5 Demo รัน BTCSnowball หรือ Gold 1 กราฟ</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-slate-500 font-bold font-mono">○</span>
                    <span>DCA BTC งบ 1,500 ฿ เมื่อ TRIX &gt; 0</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedPhase === 2 && (
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-cyan-400 font-bold">PHASE 2 : พ.ย. – ธ.ค. 2026</span>
                <span className="text-amber-400">⏳ NEXT QUEUE</span>
              </div>
              <h4 className="text-sm font-bold text-white">Debt Snowball & Micro Pilot</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                นำเงินส่วนเกินจากงานคลิป มาเร่งปิด Finnix 10k และนำเงินค่างวดที่ได้คืน 612 ฿/ด. ไปเปิดพอร์ต Cent ($20) รัน EA จริงตัวแรก
              </p>
              <div className="space-y-1.5 pt-1 border-t border-slate-800/80 text-xs text-slate-400">
                <div className="flex items-center gap-2"><span>○</span> ปิดหนี้ Finnix 10,000 ฿ 100%</div>
                <div className="flex items-center gap-2"><span>○</span> เริ่มรัน EA บนพอร์ต Cent ความเสี่ยงจำกัด</div>
                <div className="flex items-center gap-2"><span>○</span> กระแสเงินสดสุทธิเริ่มบวกเกิน 5,000 ฿</div>
              </div>
            </div>
          )}

          {selectedPhase === 3 && (
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-cyan-400 font-bold">PHASE 3 : ปี 2027 เป็นต้นไป</span>
                <span className="text-slate-400">🔒 GOAL</span>
              </div>
              <h4 className="text-sm font-bold text-white">Financial Sovereignty (Ray Dalio)</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                หนี้กลายเป็น 0.00 ฿ ถาวร ดอกเบี้ยหยุดไหลออก พอร์ต EA ทบต้นอัตโนมัติ เริ่มพอร์ต Beta ลงทุนยาว และมีเวลาลุยโปรเจกต์ใน Vault เต็มที่
              </p>
              <div className="space-y-1.5 pt-1 border-t border-slate-800/80 text-xs text-slate-400">
                <div className="flex items-center gap-2"><span>○</span> หนี้ 4 สถาบันหมดเกลี้ยง (0.00 ฿)</div>
                <div className="flex items-center gap-2"><span>○</span> เงินสำรองฉุกเฉิน 3-6 เดือนในบัญชี</div>
                <div className="flex items-center gap-2"><span>○</span> ปลดล็อกโปรเจกต์ปลูกต้นไม้ & ยูทูป</div>
              </div>
            </div>
          )}

          <div className="p-2 rounded-lg bg-[#0d121c] border border-slate-800 text-[10px] text-slate-400 font-mono">
            💡 <strong>กฎไม่แหก:</strong> ตั้งเป้า 4-5 วัน/สัปดาห์ วันไหนล้า = วันพักตามแผน ไม่ใช่แหกแผน!
          </div>
        </div>

        {/* RIGHT: MEMORY ANCHOR + PROJECT VAULT (4 COLS) */}
        <div className="lg:col-span-4 mc-card p-4 flex flex-col justify-between space-y-3">
          
          {/* ANCHOR: TRUTH MIRROR (FOMO DEFENDER) */}
          <div className="p-3 rounded-xl bg-[#0d121c] border border-cyan-500/30 space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="text-cyan-400">⚓</span> Memory Anchor (กระจกเตือนสติ)
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300">
                LOCKED RULES
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-slate-300 font-mono">
              <div className="flex items-center gap-1.5 text-rose-300">
                <span>🛑</span> งดเทรดมือ 100% (ป้องกัน Dopamine พัง)
              </div>
              <div className="flex items-center gap-1.5 text-amber-300">
                <span>🛑</span> ห้ามกดกู้ Finnix 10k เพิ่มเด็ดขาด
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300">
                <span>✅</span> BTC ซื้อได้แค่งบ 1,500 ฿/ด. (Spot Only)
              </div>
            </div>
            <div className="text-[10px] text-slate-400 bg-slate-950 p-1.5 rounded border border-slate-800/80">
              <em>"16 ต.ค. FOMO ทอง / 26 ต.ค. FOMO BTC — รู้ทันสมองแล้ว ไม่หลงกลอีก!"</em>
            </div>
          </div>

          {/* PROJECT VAULT (IDEA PARKING LOT) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400">🅿️</span>
                <span className="text-xs font-bold text-white font-mono uppercase">
                  Project Vault (ลานจอดไอเดีย)
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">{projects.length} ไอเดีย</span>
            </div>

            {/* Add Idea Input Form */}
            <form onSubmit={handleAddProject} className="flex gap-1.5">
              <input
                type="text"
                placeholder="จดไอเดียใหม่ (เช่น ปลูกไฮโดร, ยูทูป)..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
              >
                <option value="HOBBY">🌱 ฮีลใจ</option>
                <option value="MEDIA">🎥 ยูทูป</option>
                <option value="CAREER">🧠 อาชีพ</option>
                <option value="BIZ">💡 ธุรกิจ</option>
              </select>
              <button
                type="submit"
                disabled={isAddingProject || !newTitle.trim()}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-bold hover:bg-cyan-500/30 transition-all disabled:opacity-40"
              >
                +
              </button>
            </form>

            {/* Projects Scrollable List */}
            <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1">
              {projects.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-500">
                  ยังไม่มีไอเดียในลานจอด — พิมพ์เพิ่มด้านบนได้เลย!
                </div>
              ) : (
                projects.map((p) => {
                  const tagMeta = CATEGORY_TAGS[p.category] || CATEGORY_TAGS.HOBBY;
                  const isDone = p.status === 'DONE';
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2 rounded-lg bg-[#0d121c] border border-slate-800/80 transition-all ${
                        isDone ? 'opacity-40' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden pr-2">
                        <button
                          onClick={() => handleToggleProject(p)}
                          className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-mono ${
                            isDone
                              ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                              : 'border-slate-700 bg-slate-900 text-transparent'
                          }`}
                        >
                          ✓
                        </button>
                        <div className="truncate">
                          <div className={`text-xs text-slate-200 truncate ${isDone ? 'line-through' : ''}`}>
                            {p.title}
                          </div>
                          {p.note && <div className="text-[10px] text-slate-500 truncate">{p.note}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
                          style={{ color: tagMeta.color, borderColor: `${tagMeta.color}40`, background: tagMeta.bg }}
                        >
                          {tagMeta.label.split(' ')[0]}
                        </span>
                        <button
                          onClick={() => handleDeleteProject(p.id)}
                          className="text-slate-600 hover:text-rose-400 text-xs px-1"
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

          <div className="text-[10px] text-slate-500 font-mono text-center pt-1 border-t border-slate-800/60">
            จดทิ้งไว้ที่นี่ สมองจะเลิกพะวง แล้วกลับมาลุยงานหลักได้ 100%
          </div>
        </div>

      </div>
    </div>
  );
}
