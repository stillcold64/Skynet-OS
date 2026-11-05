'use client';

import { useEffect, useState } from 'react';

const money = (value) => `${Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿`;

export default function BetaPortfolioDashboard() {
  const [dashboard, setDashboard] = useState({ summary: {}, accounts: [] });
  const [selected, setSelected] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setError('');
    try {
      const res = await fetch('/api/beta-portfolios', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดแดชบอร์ดไม่สำเร็จ');
      setDashboard(data);
      if (selected) {
        const nextSelected = data.accounts.find((account) => account.id === selected.id);
        if (nextSelected) setSelected(nextSelected);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (account) => {
    setSelected(account);
    setDetailLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/beta-portfolios?id=${account.id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดรายละเอียดพอร์ตไม่สำเร็จ');
      setSelected(data.portfolio);
      setEvents(data.events || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await fetch('/api/beta-portfolios', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) return;
        setDashboard(data);
        if (selected?.id) {
          const detailRes = await fetch(`/api/beta-portfolios?id=${selected.id}`, { cache: 'no-store' });
          const detail = await detailRes.json();
          if (detailRes.ok) {
            setSelected(detail.portfolio);
            setEvents(detail.events || []);
          }
        }
      } catch {
        // Keep the last successfully loaded snapshot visible during transient network errors.
      }
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [selected?.id]);

  const panel = { background: '#0c0f17', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 16 };
  const statCard = { background: '#07090f', border: '1px solid rgba(255,255,255,.07)', borderRadius: 9, padding: 13 };

  return (
    <main style={{ display: 'grid', gap: 14, color: '#e2e8f0' }}>
      <section style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: 17 }}>🌱 BETA PORTFOLIOS</div>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>เพิ่มรายการโดยพิมพ์ใน Telegram เท่านั้น • แยกบัญชีตามเลขพอร์ต</div>
          </div>
          <button type="button" onClick={loadDashboard} style={{ background: '#101522', border: '1px solid rgba(255,255,255,.14)', color: '#cbd5e1', borderRadius: 7, padding: '7px 10px', cursor: 'pointer' }}>↻ รีเฟรช</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 9, marginTop: 14 }}>
          <div style={statCard}><div style={{ color: '#94a3b8', fontSize: 11 }}>จำนวนพอร์ต</div><div style={{ color: '#fbbf24', fontSize: 20, fontWeight: 800, marginTop: 4 }}>{dashboard.summary.accountCount || 0}</div></div>
          <div style={statCard}><div style={{ color: '#94a3b8', fontSize: 11 }}>เติมเข้าสะสม</div><div style={{ color: '#34d399', fontSize: 18, fontWeight: 800, marginTop: 4 }}>{money(dashboard.summary.totalDeposited)}</div></div>
          <div style={statCard}><div style={{ color: '#94a3b8', fontSize: 11 }}>ถอนออกสะสม</div><div style={{ color: '#fda4af', fontSize: 18, fontWeight: 800, marginTop: 4 }}>{money(dashboard.summary.totalWithdrawn)}</div></div>
          <div style={statCard}><div style={{ color: '#94a3b8', fontSize: 11 }}>เงินต้นสุทธิ</div><div style={{ color: '#fbbf24', fontSize: 18, fontWeight: 800, marginTop: 4 }}>{money(dashboard.summary.netContributed)}</div></div>
          <div style={statCard}><div style={{ color: '#94a3b8', fontSize: 11 }}>มูลค่าปัจจุบัน</div><div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, marginTop: 8 }}>ยังไม่มีข้อมูลตลาด</div><div style={{ color: '#64748b', fontSize: 10, marginTop: 3 }}>รอขั้นเชื่อม Myfxbook</div></div>
        </div>
      </section>

      {error && <div role="alert" style={{ ...panel, color: '#fda4af', fontSize: 12 }}>{error}</div>}

      {selected ? (
        <section style={panel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" onClick={() => { setSelected(null); setEvents([]); }} style={{ background: '#101522', border: '1px solid rgba(255,255,255,.14)', color: '#cbd5e1', borderRadius: 7, padding: '7px 10px', cursor: 'pointer' }}>← พอร์ตทั้งหมด</button>
            <div style={{ fontWeight: 800, color: '#fbbf24' }}>{selected.display_name} <span style={{ color: '#64748b', fontSize: 11 }}>({selected.portfolio_code})</span></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 9, marginBottom: 13 }}>
            <div style={statCard}><div style={{ color: '#94a3b8', fontSize: 11 }}>เติมเข้าสะสม</div><div style={{ color: '#34d399', fontWeight: 800, marginTop: 5 }}>{money(selected.totalDeposited)}</div></div>
            <div style={statCard}><div style={{ color: '#94a3b8', fontSize: 11 }}>ถอนออกสะสม</div><div style={{ color: '#fda4af', fontWeight: 800, marginTop: 5 }}>{money(selected.totalWithdrawn)}</div></div>
            <div style={statCard}><div style={{ color: '#94a3b8', fontSize: 11 }}>เงินต้นสุทธิ</div><div style={{ color: '#fbbf24', fontWeight: 800, marginTop: 5 }}>{money(selected.netContributed)}</div></div>
            <div style={statCard}><div style={{ color: '#94a3b8', fontSize: 11 }}>มูลค่าปัจจุบัน</div><div style={{ color: '#64748b', fontSize: 12, marginTop: 7 }}>รอข้อมูล Myfxbook</div></div>
          </div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>ประวัติรายการพอร์ต {selected.display_name}</div>
          {detailLoading ? <div style={{ color: '#94a3b8', fontSize: 12 }}>กำลังโหลดรายละเอียด…</div> : events.length === 0 ? <div style={{ color: '#64748b', fontSize: 12 }}>ยังไม่มีรายการ</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 840, borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr style={{ color: '#94a3b8', textAlign: 'left' }}>{['Event ID', 'วันที่', 'รายการ', 'จำนวน', 'สถานะ', 'Google Sheets', 'Telegram message ID', 'ข้อความต้นฉบับ'].map((heading) => <th key={heading} style={{ padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>{heading}</th>)}</tr></thead>
                <tbody>{events.map((event) => <tr key={event.id} style={{ opacity: event.status === 'CANCELLED' ? .55 : 1 }}>
                  <td style={{ padding: '8px 6px', color: '#64748b' }}>{event.id}</td>
                  <td style={{ padding: '8px 6px' }}>{event.event_date}</td>
                  <td style={{ padding: '8px 6px', color: event.direction === 'DEPOSIT' ? '#34d399' : '#fda4af' }}>{event.direction}</td>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{money(event.amount)}</td>
                  <td style={{ padding: '8px 6px' }}>{event.status}</td>
                  <td style={{ padding: '8px 6px' }}>{event.sheet_sync_status}{event.sheet_sync_error ? `: ${event.sheet_sync_error}` : ''}</td>
                  <td style={{ padding: '8px 6px' }}>{event.telegram_msg_id || '—'}</td>
                  <td style={{ padding: '8px 6px', maxWidth: 280, overflowWrap: 'anywhere' }}>{event.raw_text}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section style={panel}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>บัญชี Beta</div>
          {loading ? <div style={{ color: '#94a3b8', fontSize: 12 }}>กำลังโหลด…</div> : dashboard.accounts.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.7 }}>ยังไม่มีพอร์ตในระบบ เมื่อพิมพ์ใน Telegram เช่น <code>เติมเงินพอร์ตเบต้า 2 1500</code> ระบบจะสร้าง Beta 2 และบันทึกรายการให้อัตโนมัติ</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 9 }}>
              {dashboard.accounts.map((account) => (
                <button key={account.id} type="button" onClick={() => openDetail(account)} style={{ textAlign: 'left', background: '#07090f', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, padding: 13, color: '#e2e8f0', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><strong style={{ color: '#fbbf24' }}>{account.display_name}</strong><span style={{ color: '#64748b', fontSize: 10 }}>{account.portfolio_code}</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10, fontSize: 11 }}>
                    <span style={{ color: '#94a3b8' }}>เงินต้นสุทธิ</span><strong>{money(account.netContributed)}</strong>
                    <span style={{ color: '#94a3b8' }}>มูลค่าปัจจุบัน</span><strong style={{ color: '#64748b' }}>รอ Myfxbook</strong>
                  </div>
                  <div style={{ color: '#00f2fe', fontSize: 10, marginTop: 10 }}>ดูประวัติ {account.activeEventCount} รายการ →</div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <div style={{ color: '#64748b', fontSize: 10, padding: '0 3px' }}>ระบบแสดงเฉพาะยอดเติม/ถอนที่บันทึกได้ ยังไม่ตีความเงินต้นสุทธิว่าเป็นมูลค่าตลาด</div>
    </main>
  );
}
