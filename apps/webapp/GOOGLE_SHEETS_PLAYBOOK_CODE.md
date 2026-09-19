# ☁️ Google Apps Script Webhook Code สำหรับ Skynet OS Playbook

โค้ดนี้ใช้สำหรับอัปเดตบน **Google Apps Script** ที่เชื่อมกับ Google Sheet ของคุณ เพื่อให้รองรับการสำรองข้อมูล Playbook (Trade Setups, Plans & Master Thesis) ลงในแท็บ `Playbook` อัตโนมัติ

---

## วิธีนำไปติดตั้งใน Google Sheets

1. เปิด Google Sheet ที่คุณใช้เก็บข้อมูลธุรกรรมการเงินของ Skynet OS
2. ไปที่เมนูด้านบน: **ส่วนขยาย (Extensions)** > **Apps Script**
3. แทนที่ฟังก์ชัน `doPost(e)` หรือรวมโค้ดด้านล่างนี้เข้าไปใน Script เดิม
4. กด **บันทึก (Save)**
5. กด **ปรับใช้ (Deploy)** > **จัดการการปรับใช้ (Manage Deployments)** > กดรูปดินสอแก้ไข (Edit) > เลือกเวอร์ชัน **"ใหม่ (New version)"** > กด **ปรับใช้ (Deploy)**

---

## 📜 โค้ด Apps Script (JavaScript)

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ==========================================
    // CASE 1: ซิงค์ข้อมูล Playbook & Thesis
    // ==========================================
    if (data.action === "sync_playbook" || data.type === "PLAYBOOK") {
      var sheetName = "Playbook";
      var sheet = ss.getSheetByName(sheetName);
      
      // ถ้ายังไม่มีแท็บ Playbook ให้สร้างใหม่อัตโนมัติ
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        var header = [
          "ID", "วันที่", "ชื่อ Setup / แผน", "สัญลักษณ์", "ทิศทาง (L/S)", "สถานะ",
          "ราคาเข้า (Entry)", "Stop Loss", "Take Profit", "R:R แผน", "ความเสี่ยง ($)",
          "Thesis (สมมติฐานการเทรด)", "เงื่อนไขที่คอนเฟิร์ม (Checklist)", "ลิงก์ชาร์ต",
          "Realized R", "Post-Trade Review / ข้อคิด"
        ];
        sheet.appendRow(header);
        sheet.getRange(1, 1, 1, header.length).setBackground("#1a1d26").setFontColor("#f5f5f7").setFontWeight("bold");
        sheet.setFrozenRows(1);
      }

      // ล้างข้อมูลเก่า (ยกเว้น Header) แล้วเขียนข้อมูลใหม่ล่าสุดทั้งหมด
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, 16).clearContent();
      }

      var items = data.items || [];
      var rows = [];

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        rows.push([
          item.id || (i + 1),
          item.date || "",
          item.title || "",
          item.symbol || "-",
          item.direction || "LONG",
          item.status || "WATCHLIST",
          item.entry_price || "",
          item.sl_price || "",
          item.tp_price || "",
          item.rr_ratio || "",
          item.risk_usd || "",
          item.thesis || "",
          item.checklist || "",
          item.chart_url || "",
          item.realized_r || "",
          item.review_notes || ""
        ]);
      }

      if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, 16).setValues(rows);
      }

      // บันทึก Master Plan ลงใน Note ของเซลล์ A1 เพื่อเก็บสำรอง Strategy ไว้ด้วย
      if (data.strategy) {
        var strat = data.strategy;
        var note = "=== MASTER TRADING PLAN ===\n" +
                   "Title: " + strat.title + "\n\n" +
                   "Core Thesis:\n" + strat.core_thesis + "\n\n" +
                   "Entry Rules:\n" + strat.entry_rules + "\n\n" +
                   "Invalidation:\n" + strat.invalidation_rules + "\n\n" +
                   "Risk Rules:\n" + strat.risk_rules;
        sheet.getRange("A1").setNote(note);
      }

      return ContentService.createTextOutput(
        JSON.stringify({ success: true, count: rows.length, message: "Synced Playbook to Google Sheet successfully!" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // CASE 2: ซิงค์ธุรกรรมการเงินปกติ (Transactions)
    // ==========================================
    var txSheet = ss.getSheetByName("Transactions") || ss.getActiveSheet();
    var txItems = data.items || [];
    for (var j = 0; j < txItems.length; j++) {
      var tx = txItems[j];
      txSheet.appendRow([
        tx.date || new Date().toISOString().split("T")[0],
        tx.category_group || "ETC",
        tx.category || "",
        tx.amount || 0,
        tx.note || tx.raw_text || "",
        new Date().toISOString()
      ]);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, count: txItems.length })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
```
