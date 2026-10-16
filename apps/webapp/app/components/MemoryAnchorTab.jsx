'use client';

import { useState, useEffect } from 'react';

export default function MemoryAnchorTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnchor = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/anchor');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load memory anchor:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnchor();
  }, []);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px 0 40px 0' }}>
      {/* Top Banner */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(26, 29, 38, 0.85) 0%, rgba(18, 20, 29, 0.95) 100%)',
          border: '1px solid rgba(218, 143, 255, 0.25)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '28px' }}>⚓</span>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>
              Memory Anchor (สติ & สัญญาใจแห่งความจริง)
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#a0aec0', lineHeight: '1.5' }}>
            กระจกสะท้อนความจริง & สมองส่วนหน้าที่ไม่ลืม • บันทึกไว้เพื่อเตือนสติตัวเองในวันที่ Dopamine Crash หรือเริ่มดื้อดึง
          </p>
        </div>

        <button
          onClick={fetchAnchor}
          disabled={loading}
          style={{
            padding: '10px 18px',
            borderRadius: '10px',
            background: 'rgba(218, 143, 255, 0.15)',
            border: '1px solid rgba(218, 143, 255, 0.35)',
            color: '#da8fff',
            fontSize: '13px',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <span>🔄</span>
          <span>{loading ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล'}</span>
        </button>
      </div>

      {/* CORE RULE #1 HERO CARD: DELAYED GRATIFICATION */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(48, 209, 88, 0.12) 0%, rgba(16, 25, 20, 0.85) 100%)',
          border: '1px solid rgba(48, 209, 88, 0.35)',
          boxShadow: '0 8px 24px rgba(48, 209, 88, 0.1)',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <span style={{ fontSize: '24px' }}>⚡</span>
          <span style={{ fontSize: '16px', fontWeight: '800', color: '#30d158', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            โฟกัสอันดับหนึ่งในชีวิตตอนนี้ (The One Core Rule)
          </span>
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', marginBottom: '10px', lineHeight: '1.4' }}>
          กฎการแลกเปลี่ยน: Delayed Gratification (รางวัลที่ต้องแลกมา)
        </h2>

        <div
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            background: 'rgba(0, 0, 0, 0.45)',
            border: '1px solid rgba(48, 209, 88, 0.25)',
            fontSize: '16px',
            fontWeight: '700',
            color: '#70ef9a',
            marginBottom: '14px',
            lineHeight: '1.6',
          }}
        >
          "หน้าที่ / งานประจำ (ตัดต่อ) / ออกกำลังกาย (วิดพื้น) ต้องเสร็จก่อน ➡️ ค่อยเล่น Dota 2 หรือใช้กัญชาเป็นรางวัล"
        </div>

        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.8' }}>
          <li>
            <strong style={{ color: '#ff453a' }}>ห้ามทำสลับลำดับเด็ดขาด:</strong> ห้ามเล่นเกมหรือใช้กัญชาก่อนทำงาน เพราะถ้าสมองได้ Dopamine สบายๆ ไปแล้ว จะเข้าสู่ภาวะแผ่วและหมดแรงทันที
          </li>
          <li>
            <strong>ไม่ต้องสร้างเควสต์ให้ยุ่งยาก:</strong> โฟกัสแค่วินัยภายในตัวเอง "ทำหน้าที่ให้สมบูรณ์ก่อน แล้วค่อยเสพความสุขอย่างสบายใจ 100% โดยไม่ต้องรู้สึกผิด"
          </li>
        </ul>
      </div>

      {/* 2-COLUMN GRID: BRAIN REALITY & 4 LOCKED DECISIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {/* Column 1: Brain & Psychology */}
        <div
          className="glass-panel"
          style={{
            padding: '22px',
            borderRadius: '16px',
            background: 'rgba(26, 29, 38, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '20px' }}>🧠</span>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#64d2ff', margin: 0 }}>
              ตัวตน & ความจริงของสมอง
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px', lineHeight: '1.6', color: '#cbd5e1' }}>
            <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ fontWeight: '700', color: '#ffd60a', marginBottom: '4px' }}>🔥 ฉลาด แต่ "ดื้อดึง" (Knows everything, does nothing)</div>
              เข้าใจโครงสร้างระบบไว แต่เวลามีอารมณ์หรือ Dopamine ตก จะหาข้ออ้างเข้าข้างตัวเองเก่งมาก
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ fontWeight: '700', color: '#ff7597', marginBottom: '4px' }}>✂️ ฆ่า "อารมณ์ศิลปิน" ทิ้ง</div>
              เคยชินกับการตัดต่อวิดีโอที่ใช้ "ฟีล/อารมณ์" นำทาง แต่การเป็นเทรดเดอร์มืออาชีพต้อง Cold, Mechanical และอดทนกับความน่าเบื่อได้
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ fontWeight: '700', color: '#bf5af2', marginBottom: '4px' }}>🎮 วงจร Dota 2 & กัญชา</div>
              สมองชอบ Instant Feedback ของ Dota แต่กัญชาทำให้แรงยับยั้งชั่งใจลดลง จึงต้องใช้สองสิ่งนี้เป็น "รางวัลหลังทำงานเสร็จ" เท่านั้น
            </div>
          </div>
        </div>

        {/* Column 2: 4 Locked Guardrails */}
        <div
          className="glass-panel"
          style={{
            padding: '22px',
            borderRadius: '16px',
            background: 'rgba(26, 29, 38, 0.75)',
            border: '1px solid rgba(255, 69, 58, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '20px' }}>🔒</span>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#ff453a', margin: 0 }}>
              4 กฎเหล็กที่ล็อกไว้แล้ว (ห้ามฝ่าฝืน)
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
            <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255, 69, 58, 0.08)', border: '1px solid rgba(255, 69, 58, 0.2)' }}>
              <div style={{ fontWeight: '800', color: '#ff453a', marginBottom: '2px' }}>1. 🛑 งดเทรดมือด้วยเงินจริง 100%</div>
              <div style={{ color: '#cbd5e1', fontSize: '12px' }}>ทั้งพอร์ตส่วนตัวและพอร์ตสอบ ในช่วงที่จิตใจและสารเคมียังแกว่ง ห้ามใช้การเทรดระบายความคันมือ</div>
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255, 69, 58, 0.08)', border: '1px solid rgba(255, 69, 58, 0.2)' }}>
              <div style={{ fontWeight: '800', color: '#ff453a', marginBottom: '2px' }}>2. 🛑 ห้ามกู้ Finnix 10,000 บาทเพิ่ม</div>
              <div style={{ color: '#cbd5e1', fontSize: '12px' }}>ดอกเบี้ย 33% คือยาพิษทางการเงิน การไม่กู้เพิ่มคือการตัดสินใจที่ดีที่สุดแล้ว</div>
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255, 69, 58, 0.08)', border: '1px solid rgba(255, 69, 58, 0.2)' }}>
              <div style={{ fontWeight: '800', color: '#ff453a', marginBottom: '2px' }}>3. 🛑 แช่แข็งเงินสด 3,000 บาท</div>
              <div style={{ color: '#cbd5e1', fontSize: '12px' }}>ห้ามเอาไปซื้อพอร์ตสอบหรือเติมพอร์ต ให้เก็บไว้จ่าย Fixed Cost / บิล / หนี้สินประจำเดือน</div>
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255, 69, 58, 0.08)', border: '1px solid rgba(255, 69, 58, 0.2)' }}>
              <div style={{ fontWeight: '800', color: '#ff453a', marginBottom: '2px' }}>4. 🛑 EA ปล่อยรัน Forward Test อัตโนมัติ</div>
              <div style={{ color: '#cbd5e1', fontSize: '12px' }}>ให้ระบบสถิติทำงานบน Demo ไปตามเวลา ห้ามใช้อารมณ์เข้าไปแทรกแซง</div>
            </div>
          </div>
        </div>
      </div>

      {/* TIMELINE / REFLECTION LOG */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '16px',
          background: 'rgba(26, 29, 38, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '20px' }}>📜</span>
          <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#da8fff', margin: 0 }}>
            ประวัติการดึงสติ & เผชิญหน้าความจริง (Truth Reflection Log)
          </h3>
        </div>

        <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(0, 0, 0, 0.3)', borderLeft: '4px solid #da8fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: '800', color: '#fff', fontSize: '14px' }}>
              📍 16 ตุลาคม 2026 — ปลดล็อกวงจรคันมือ & เผชิญหน้าความจริง
            </span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>บันทึกโดย Antigravity Co-Pilot</span>
          </div>

          <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <strong>สิ่งที่เกิดขึ้น:</strong> นั่งทับมือมา 2 อาทิตย์ เล่น Dota 2 พอเห็นราคาทองคำเด้ง 4,080 ไป 4,200 เกิด FOMO อย่างรุนแรง อยากกลับไปเทรดมือ DCA Snowball หรือเอาเงิน 3,000 ไปซื้อพอร์ตสอบ
            </div>
            <div>
              <strong>ความจริงที่ค้นพบ:</strong> เกิดจาก Dopamine Crash + เจ็บใจที่ทายถูกแต่ไม่ได้ตังค์ + กำลังหาความชอบธรรมให้ตัวเองได้กดเทรด
            </div>
            <div style={{ color: '#30d158', fontWeight: '600' }}>
              <strong>มติร่วมกัน:</strong> ล็อกงดเทรดมือ 100% สัญญาว่าจะใช้ชีวิตด้วยกฎ "ทำงาน/ออกกำลังกายให้เสร็จก่อน ค่อยเล่นเกมเป็นรางวัล" และให้ AI เป็นกระจกสะท้อนเมื่อเริ่มพูดไม่เหมือนเดิม
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
