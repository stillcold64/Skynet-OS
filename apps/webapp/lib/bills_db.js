import db from './db.js';

export function getAllRecurringBills() {
  return db
    .prepare(`SELECT * FROM recurring_bills WHERE is_active = 1 ORDER BY due_day ASC, id ASC`)
    .all();
}

export function getPreviousMonthStr(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  let prevY = y;
  let prevM = m - 1;
  if (prevM === 0) {
    prevM = 12;
    prevY -= 1;
  }
  return `${prevY}-${String(prevM).padStart(2, '0')}`;
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

      if (cat === bill.name.toLowerCase() || cat.includes(bill.name.toLowerCase())) return true;
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

  const totalPaid = Math.round(paid.reduce((sum, p) => sum + p.actualAmount, 0) * 100) / 100;
  const totalRemaining = Math.round(unpaid.reduce((sum, u) => sum + u.estimated_amount, 0) * 100) / 100;
  const totalEstimated = Math.round(bills.reduce((sum, b) => sum + b.estimated_amount, 0) * 100) / 100;
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

export function getFixedCostsComparison(curStatus) {
  try {
    const prevYm = getPreviousMonthStr(curStatus.yearMonth);
    const prevStatus = getMonthlyFixedCostsStatus(prevYm);
    const diff = Math.round((curStatus.totalPaid - prevStatus.totalPaid) * 100) / 100;
    const pct = prevStatus.totalPaid > 0 ? Math.round((Math.abs(diff) / prevStatus.totalPaid) * 100) : 0;

    // Find significant differences per item (>= 50 THB)
    const significantChanges = [];
    for (const c of curStatus.paid) {
      const pr = prevStatus.paid.find((p) => p.name === c.name);
      if (pr) {
        const itemDiff = Math.round((c.actualAmount - pr.actualAmount) * 100) / 100;
        if (Math.abs(itemDiff) >= 50) {
          significantChanges.push({ name: c.name, diff: itemDiff, cur: c.actualAmount, prev: pr.actualAmount });
        }
      } else if (c.actualAmount >= 100) {
        significantChanges.push({ name: c.name, diff: c.actualAmount, cur: c.actualAmount, prev: 0 });
      }
    }

    return {
      prevMonth: prevYm,
      prevTotalPaid: prevStatus.totalPaid,
      diff,
      pct,
      significantChanges,
    };
  } catch (e) {
    console.error('Error comparing fixed costs:', e);
    return null;
  }
}

export function formatFixedCostsAlert(status) {
  const comp = getFixedCostsComparison(status);
  let compText = '';
  if (comp && comp.prevTotalPaid > 0) {
    if (comp.diff > 0) {
      compText = `\n📊 <b>เทียบเดือนก่อน:</b> 📈 เพิ่มขึ้น +${comp.diff.toLocaleString()} ฿ (+${comp.pct}%) <i>(เดือนก่อน ${comp.prevTotalPaid.toLocaleString()} ฿)</i>`;
    } else if (comp.diff < 0) {
      compText = `\n📊 <b>เทียบเดือนก่อน:</b> 📉 ลดลง -${Math.abs(comp.diff).toLocaleString()} ฿ (-${comp.pct}%) <i>(เดือนก่อน ${comp.prevTotalPaid.toLocaleString()} ฿)</i>`;
    } else {
      compText = `\n📊 <b>เทียบเดือนก่อน:</b> ⚖️ เท่ากับเดือนก่อน (${comp.prevTotalPaid.toLocaleString()} ฿)`;
    }

    if (comp.significantChanges.length > 0) {
      const notes = comp.significantChanges.slice(0, 2).map((ch) => {
        const sign = ch.diff > 0 ? '+' : '';
        return `${ch.name} (${sign}${Math.round(ch.diff).toLocaleString()} ฿)`;
      });
      compText += `\n   <i>↳ ส่วนต่างหลัก: ${notes.join(', ')}</i>`;
    }
  }

  if (status.unpaid.length === 0) {
    let text = `\n🎉 <b>Fixed Cost เดือนนี้จ่ายครบ 100% แล้วทุกบิล!</b>\n`;
    text += `💰 รวมยอดจ่ายจริง: <b>${status.totalPaid.toLocaleString()} ฿</b> (${status.paid.length} รายการ)${compText}\n\n`;
    text += `📋 <b>รายการบิลประจำเดือนที่จ่ายแล้ว:</b>\n`;
    status.paid.forEach((p) => {
      text += `  • ${p.name}: ${p.actualAmount.toLocaleString()} ฿\n`;
    });
    return text;
  }

  let text = `\n💡 <b>สถานะ Fixed Cost ประจำเดือน</b> (จ่ายแล้ว ${status.paid.length}/${status.allCount} รายการ | รวม ${status.totalPaid.toLocaleString()} ฿)${compText}\n`;
  text += `⏳ <b>ค้างอีก ${status.unpaid.length} รายการ (~${status.totalRemaining.toLocaleString()} ฿):</b>\n`;

  status.unpaid.forEach((u) => {
    text += `  • ${u.name}: ~${u.estimated_amount.toLocaleString()} ฿ (กำหนดวันที่ ${u.due_day})\n`;
  });

  if (status.paid.length > 0) {
    text += `\n✅ <i>จ่ายแล้ว: ${status.paid.map((p) => `${p.name} ${p.actualAmount.toLocaleString()}฿`).join(', ')}</i>\n`;
  }

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

  const comp = getFixedCostsComparison(status);
  let compText = '';
  if (comp && comp.prevTotalPaid > 0) {
    if (comp.diff > 0) {
      compText = `\n📊 <b>เทียบกับเดือนก่อน:</b> 📈 เพิ่มขึ้น +${comp.diff.toLocaleString()} ฿ (+${comp.pct}%) <i>(เดือนก่อน ${comp.prevTotalPaid.toLocaleString()} ฿)</i>`;
    } else if (comp.diff < 0) {
      compText = `\n📊 <b>เทียบกับเดือนก่อน:</b> 📉 ลดลง -${Math.abs(comp.diff).toLocaleString()} ฿ (-${comp.pct}%) <i>(เดือนก่อน ${comp.prevTotalPaid.toLocaleString()} ฿)</i>`;
    } else {
      compText = `\n📊 <b>เทียบกับเดือนก่อน:</b> ⚖️ เท่ากับเดือนก่อนพอดี (${comp.prevTotalPaid.toLocaleString()} ฿)`;
    }

    if (comp.significantChanges.length > 0) {
      const notes = comp.significantChanges.map((ch) => {
        const sign = ch.diff > 0 ? '+' : '';
        return `${ch.name} (${sign}${Math.round(ch.diff).toLocaleString()} ฿)`;
      });
      compText += `\n   <i>↳ ส่วนต่างหลัก: ${notes.join(', ')}</i>`;
    }
  }

  let text = `📋 <b>สรุป Fixed Cost & บิลคงที่ ประจำเดือน ${thaiMonth} ${thaiYear}</b>\n`;
  text += `🎯 ความคืบหน้า: จ่ายแล้ว ${status.paid.length}/${status.allCount} รายการ (<b>${status.completionPct}%</b>)\n`;
  text += `💰 รวมยอดจ่ายสะสม: <b>${status.totalPaid.toLocaleString()} ฿</b>${compText}\n\n`;

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
    text += `🎉 <b>ยอดเยี่ยมมาก! ปิดยอด Fixed Cost เดือนนี้ครบ 100% แล้วทุกบิล</b>\n`;
  }

  return text;
}
