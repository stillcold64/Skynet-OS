'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [transactions, setTransactions] = useState([]);
  const [totalExpense, setTotalExpense] = useState(0);
  const [totalInvestment, setTotalInvestment] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [type, setType] = useState('ค่าใช้จ่าย');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/transactions');
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setTotalExpense(data.totalExpense || 0);
        setTotalInvestment(data.totalInvestment || 0);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!category.trim() || !amount || isNaN(Number(amount))) return;

    try {
      setSubmitting(true);
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          type,
          category: category.trim(),
          amount: parseFloat(amount),
          note: note.trim() || null,
        }),
      });

      if (res.ok) {
        setCategory('');
        setAmount('');
        setNote('');
        await fetchTransactions();
      } else {
        const err = await res.json();
        alert('เกิดข้อผิดพลาด: ' + (err.error || 'บันทึกไม่สำเร็จ'));
      }
    } catch (err) {
      console.error('Submit error:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  return (
    <main>
      <header>
        <h1>⚡ Skynet OS — บันทึกค่าใช้จ่ายและการลงทุน</h1>
        <p>ระบบบันทึกธุรกรรมการเงินและพอร์ตการลงทุนส่วนบุคคล (Local SQLite)</p>
      </header>

      {/* Summary Totals */}
      <div className="summary-cards">
        <div className="card expense">
          <div className="label">🔴 ยอดรวมค่าใช้จ่าย</div>
          <div className="value">{formatCurrency(totalExpense)} ฿</div>
        </div>
        <div className="card investment">
          <div className="label">🟢 ยอดรวมการลงทุน</div>
          <div className="value">{formatCurrency(totalInvestment)} ฿</div>
        </div>
      </div>

      {/* Form */}
      <section className="form-card">
        <h2>➕ เพิ่มรายการใหม่</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>วันที่</label>
              <input
                type="date"
                required
                className="form-control"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>ประเภท</label>
              <select
                className="form-control"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="ค่าใช้จ่าย">ค่าใช้จ่าย</option>
                <option value="การลงทุน">การลงทุน</option>
              </select>
            </div>

            <div className="form-group">
              <label>หมวดหมู่</label>
              <input
                type="text"
                required
                placeholder="เช่น อาหาร, หุ้นกู้, BTC"
                className="form-control"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>จำนวนเงิน (บาท)</label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                placeholder="0.00"
                className="form-control"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>หมายเหตุ (ไม่บังคับ)</label>
              <input
                type="text"
                placeholder="รายละเอียดเพิ่มเติม..."
                className="form-control"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-submit" disabled={submitting}>
              {submitting ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
            </button>
          </div>
        </form>
      </section>

      {/* Transactions Table */}
      <section className="table-card">
        <div className="table-header-box">
          <h2>📋 รายการทั้งหมด ({transactions.length} รายการ)</h2>
        </div>

        <div className="table-responsive">
          {loading ? (
            <div className="empty-state">กำลังโหลดข้อมูล...</div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">ยังไม่มีรายการบันทึก เริ่มต้นเพิ่มรายการด้านบนได้เลย</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ประเภท</th>
                  <th>หมวดหมู่</th>
                  <th style={{ textAlign: 'right' }}>จำนวนเงิน</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date}</td>
                    <td>
                      <span
                        className={`badge ${
                          item.type === 'ค่าใช้จ่าย' ? 'badge-expense' : 'badge-investment'
                        }`}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td>{item.category}</td>
                    <td
                      style={{ textAlign: 'right' }}
                      className={`amount ${
                        item.type === 'ค่าใช้จ่าย' ? 'amount-expense' : 'amount-investment'
                      }`}
                    >
                      {formatCurrency(item.amount)} ฿
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{item.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
