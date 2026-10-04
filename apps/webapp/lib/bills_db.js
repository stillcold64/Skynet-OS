import db from './db.js';

export function getAllRecurringBills() {
  return db
    .prepare(`SELECT * FROM recurring_bills WHERE is_active = 1 ORDER BY due_day ASC, id ASC`)
    .all();
}

export function getMonthlyFixedCostsStatus(yearMonth = null) {
  const ym =
    yearMonth ||
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()).slice(0, 7);

  const bills = getAllRecurringBills();

  // Fetch all transactions in this month that could be bills
  const txs = db
    .prepare(
      `SELECT * FROM transactions WHERE date LIKE ? AND (category_group = 'BILL' OR category LIKE '%bill%') ORDER BY date ASC`
    )
    .all(`${ym}%`);

  const paid = [];
  const unpaid = [];

  for (const bill of bills) {
    const kws = bill.keywords.split(',').map((k) => k.trim().toLowerCase());

    // Find matching transaction
    const matchedTx = txs.find((t) => {
      const cat = (t.category || '').toLowerCase();
      const raw = (t.raw_text || '').toLowerCase();

      // Guard against false positive: 'ค่าน้ำประปา' matching 'ประปาบ้านยาย'
      if (bill.name === 'ค่าน้ำประปา' && (cat.includes('ยาย') || raw.includes('ยาย'))) return false;
      if (bill.name === 'ค่าไฟ' && (cat.includes('ยาย') || raw.includes('ยาย'))) return false;

      return kws.some((kw) => cat.includes(kw) || raw.includes(kw));
    });

    if (matchedTx) {
      paid.push({
        bill,
        tx: matchedTx,
        actualAmount: matchedTx.amount,
        paidDate: matchedTx.date,
        name: bill.name,
      });
    } else {
      unpaid.push({
        bill,
        name: bill.name,
        estimated_amount: bill.estimated_amount,
        due_day: bill.due_day,
      });
    }
  }

  const totalPaid = paid.reduce((sum, p) => sum + p.actualAmount, 0);
  const totalRemaining = unpaid.reduce((sum, u) => sum + u.estimated_amount, 0);
  const totalEstimated = bills.reduce((sum, b) => sum + b.estimated_amount, 0);
  const allCount = bills.length;
  const completionPct = allCount > 0 ? Math.round((paid.length / allCount) * 100) : 0;

  return {
    yearMonth: ym,
    allCount,
    paid,
    unpaid,
    totalPaid,
    totalRemaining,
    totalEstimated,
    completionPct,
  };
}

export function formatFixedCostsAlert(status) {
  if (status.unpaid.length === 0) {
    return `\n🎉 <b>สุดยอดมาก! Fixed Cost เดือนนี้ (${status.yearMonth}) จ่ายครบ 100% แล้วทุกรายการ</b> (รวม ${status.totalPaid.toLocaleString()} ฿)\n`;
  }

  let text = `\n💡 <b>สถานะ Fixed Cost เดือนนี้ (${status.yearMonth}):</b>\n`;
  text += `✅ จ่ายแล้ว: ${status.paid.length}/${status.allCount} รายการ (${status.totalPaid.toLocaleString()} ฿)\n`;
  text += `⏳ <b>ยังค้างจ่ายอีก ${status.unpaid.length} รายการ (~${status.totalRemaining.toLocaleString()} ฿):</b>\n`;

  status.unpaid.forEach((u) => {
    text += `  • ${u.name}: ~${u.estimated_amount.toLocaleString()} ฿ (กำหนด ~วันที่ ${u.due_day})\n`;
  });

  text += `👉 <b>ยอดที่ต้องเตรียมไว้จ่ายเพิ่ม: ~${status.totalRemaining.toLocaleString()} บาท</b>\n`;
  return text;
}

export function formatFullFixedCostsReport(status) {
  const [y, m] = status.yearMonth.split('-');
  const monthNames = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ];
  const thaiMonth = monthNames[parseInt(m, 10) - 1] || m;
  const thaiYear = parseInt(y, 10) + 543;

  let text = `📋 <b>สรุป Fixed Cost & บิลคงที่ ประจำเดือน ${thaiMonth} ${thaiYear}</b>\n`;
  text += `🎯 ความคืบหน้า: จ่ายแล้ว ${status.paid.length}/${status.allCount} รายการ (<b>${status.completionPct}%</b>)\n\n`;

  if (status.paid.length > 0) {
    text += `✅ <b>จ่ายแล้ว (${status.paid.length} รายการ | รวม ${status.totalPaid.toLocaleString()} ฿):</b>\n`;
    status.paid.forEach((p) => {
      text += `  • [${p.paidDate}] ${p.name}: ${p.actualAmount.toLocaleString()} ฿\n`;
    });
    text += `\n`;
  }

  if (status.unpaid.length > 0) {
    text += `⏳ <b>ยังไม่ได้จ่าย (${status.unpaid.length} รายการ | รวม ~${status.totalRemaining.toLocaleString()} ฿):</b>\n`;
    status.unpaid.forEach((u) => {
      text += `  • ${u.name}: ~${u.estimated_amount.toLocaleString()} ฿ <i>(กำหนด ~วันที่ ${u.due_day})</i>\n`;
    });
    text += `\n💰 <b>ยอดเงินที่ต้องเตรียมไว้สำรอง: ~${status.totalRemaining.toLocaleString()} บาท</b>\n`;
  } else {
    text += `🎉 <b>เยี่ยมมาก! ปิดยอด Fixed Cost เดือนนี้ครบ 100% แล้วทุกบิล</b>\n`;
  }

  return text;
}
