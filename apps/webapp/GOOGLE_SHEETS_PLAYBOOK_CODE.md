# ☁️ Google Apps Script Webhook Code สำหรับ Skynet OS Playbook Setups

โค้ดนี้ใช้สำหรับติดตั้งบน **Google Apps Script** ที่เชื่อมกับ Google Sheet ของคุณ เพื่อให้รองรับการสำรองข้อมูล **Playbook Setups Library (คลังพิมพ์เขียวและกฎเซ็ตอัพท่าเทรด)** ลงในแท็บ `Playbook_Setups` โดยอัตโนมัติ

---

## วิธีนำไปติดตั้งใน Google Sheets

1. เปิด Google Sheet ที่คุณใช้เก็บข้อมูลของ Skynet OS
2. ไปที่เมนูด้านบน: **ส่วนขยาย (Extensions)** > **Apps Script**
3. แทนที่หรือเพิ่มฟังก์ชัน `doPost(e)` ด้านล่างนี้ลงในไฟล์ Script
4. กด **บันทึก (Save)**
5. กด **ปรับใช้ (Deploy)** > **จัดการการปรับใช้ (Manage Deployments)** > กดรูปดินสอแก้ไข (Edit) > เลือกเวอร์ชัน **"ใหม่ (New version)"** > กด **ปรับใช้ (Deploy)**

---

## 📜 โค้ด Apps Script (JavaScript)

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ========================================================
    // CASE 1: ซิงค์คลัง Playbook Setups Library (พิมพ์เขียวท่าเทรด)
    // ========================================================
    if (data.action === "sync_playbook_setups" || data.type === "PLAYBOOK_SETUPS") {
      var sheetName = "Playbook_Setups";
      var sheet = ss.getSheetByName(sheetName);
      
      // ถ้ายังไม่มีแท็บ Playbook_Setups ให้สร้างใหม่อัตโนมัติ
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        var header = [
          "ID", "รหัส Setup (Code)", "ชื่อเซ็ตอัพ (Title)", "เกรด (Grade)", "ทิศทาง",
          "Timeframe", "Session", "เป้าหมาย R:R", "Core Thesis & Edge (สมมติฐาน)",
          "Entry Checklist (กฎการเข้า)", "Stop Loss & Invalidation", "Exit Strategy (เป้าหมาย)",
          "Risk Rules (การคุมความเสี่ยง)", "ข้อควรระวัง (Do's & Don'ts)", "ลิงก์รูปชาร์ตพิมพ์เขียว", "อัปเดตล่าสุด"
        ];
        sheet.appendRow(header);
        sheet.getRange(1, 1, 1, header.length).setBackground("#1a1d26").setFontColor("#f5f5f7").setFontWeight("bold");
        sheet.setFrozenRows(1);
      }

      // ล้างข้อมูลเดิม แล้วเขียนชุดข้อมูลพิมพ์เขียวทั้งหมดลงไปใหม่
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, 16).clearContent();
      }

      var setups = data.setups || data.items || [];
      var rows = [];

      for (var i = 0; i < setups.length; i++) {
        var s = setups[i];
        rows.push([
          s.id || (i + 1),
          s.code || "",
          s.title || "",
          s.grade || "A+",
          s.direction || "BOTH",
          s.timeframe || "-",
          s.session || "-",
          s.target_rr || 3.0,
          s.thesis || "",
          s.entry_rules || "",
          s.invalidation_rules || "",
          s.exit_rules || "",
          s.risk_rules || "",
          s.mistakes_to_avoid || "",
          s.chart_blueprint_url || "",
          s.updated_at || new Date().toISOString()
        ]);
      }

      if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, 16).setValues(rows);
      }

      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          count: rows.length,
          message: "Synced Playbook Setups Library (" + rows.length + " setups) successfully!"
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ========================================================
    // CASE 2: ซิงค์บันทึกอารมณ์ Trade Journal (Auto-Sync หลายไม้ต่อวัน)
    // ========================================================
    if (data.action === "sync_journal" || data.type === "TRADE_JOURNAL") {
      var jSheetName = "Trade_Journal";
      var jSheet = ss.getSheetByName(jSheetName);
      if (!jSheet) {
        jSheet = ss.insertSheet(jSheetName);
        var jHeader = ["ID", "วันที่", "เวลา", "รอบ/ไม้ที่", "อารมณ์หลัก", "ระดับวินัย (ดาว)", "บันทึกความรู้สึก (Notes)", "บทเรียนเตือนสติ (Reflection)", "เวลาอัปเดต"];
        jSheet.appendRow(jHeader);
        jSheet.getRange(1, 1, 1, jHeader.length).setBackground("#1a1d26").setFontColor("#64d2ff").setFontWeight("bold");
        jSheet.setFrozenRows(1);
      }

      var entry = data.entry || {};
      var entryId = entry.id;
      var foundRow = -1;
      var dataRange = jSheet.getDataRange().getValues();

      if (entryId) {
        for (var r = 1; r < dataRange.length; r++) {
          if (dataRange[r][0] == entryId) {
            foundRow = r + 1;
            break;
          }
        }
      }

      var rowValues = [
        entry.id || "",
        entry.date || new Date().toISOString().split("T")[0],
        entry.time || "",
        entry.session || "ทั่วไป",
        entry.mood || "CALM",
        entry.discipline_score || 5,
        entry.notes || "",
        entry.reflection || "",
        new Date().toISOString()
      ];

      if (foundRow > 0) {
        jSheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        jSheet.appendRow(rowValues);
      }

      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: "Auto-synced Trade Journal successfully!" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ========================================================
    // CASE 3: ซิงค์บันทึกไม้เทรด Trade Tracker (Auto-Sync)
    // ========================================================
    if (data.action === "sync_tracker" || data.type === "TRADE_TRACKER") {
      var tSheetName = "Trade_Tracker";
      var tSheet = ss.getSheetByName(tSheetName);
      if (!tSheet) {
        tSheet = ss.insertSheet(tSheetName);
        var tHeader = [
          "ID", "วันที่", "เวลา", "สินทรัพย์ (Symbol)", "ทิศทาง (Direction)",
          "Setup Code", "ชื่อ Setup", "ผลลัพธ์ (Outcome)", "บันทึกหน้างาน (Notes)",
          "ลิงก์รูปชาร์ต", "เวลาอัปเดต"
        ];
        tSheet.appendRow(tHeader);
        tSheet.getRange(1, 1, 1, tHeader.length).setBackground("#1a1d26").setFontColor("#30d158").setFontWeight("bold");
        tSheet.setFrozenRows(1);
      }

      var trade = data.trade || {};
      var tradeId = trade.id;
      var foundRow = -1;
      var dataRange = tSheet.getDataRange().getValues();

      for (var r = 1; r < dataRange.length; r++) {
        if (dataRange[r][0] == tradeId) {
          foundRow = r + 1;
          break;
        }
      }

      var rowValues = [
        trade.id || "",
        trade.date || new Date().toISOString().split("T")[0],
        trade.time || "",
        trade.symbol || "BTC",
        trade.direction || "LONG",
        trade.playbook_code || "SETUP-01",
        trade.playbook_title || "",
        trade.outcome || "RUNNING",
        trade.notes || "",
        trade.chart_url || "",
        new Date().toISOString()
      ];

      if (foundRow > 0) {
        tSheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        tSheet.appendRow(rowValues);
      }

      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: "Auto-synced Trade Tracker successfully!" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ========================================================
    // CASE 4: ซิงค์ธุรกรรมการเงิน (Transactions)
    // ========================================================
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
