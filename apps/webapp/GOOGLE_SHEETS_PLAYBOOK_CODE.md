# ☁️ Google Apps Script Webhook Code สำหรับ Skynet OS (แยก 5 หมวดหมู่อัตโนมัติ)

สคริปต์นี้เป็นระบบ **Smart Multi-Tab Router** ติดตั้งบน Google Sheets เพื่อแยกบันทึกข้อมูลออกเป็น **5 แท็บหมวดหมู่อย่างเป็นระเบียบ 100%** ไม่ปะปนกันเด็ดขาด:

| แท็บใน Google Sheets | ข้อมูลที่จัดเก็บ | แหล่งที่มา |
| :--- | :--- | :--- |
| **💰_การเงิน_รายจ่าย** | กาแฟ, ข้าว, บิล, ค่าน้ำมัน, ช้อปปิ้ง | Telegram Bot (@my_skynet_money_bot) |
| **⚡_บันทึกไม้เทรด** | บันทึกการเทรดรายไม้ (Symbol, Long/Short, Setup, Outcome Win/Loss) | Skynet OS — Trade Tracker |
| **🎯_พิมพ์เขียว_Playbook** | คลังเซ็ตอัพท่าเทรด, สมมติฐาน (Thesis), กฎเข้า/ออก, Do's & Don'ts | Skynet OS — Playbook & Thesis |
| **🧠_ปฏิทินอารมณ์_สติ** | บันทึกอารมณ์รายวัน/รายไม้ (FOMO, CALM, คะแนนวินัย, ข้อคิดเตือนสติ) | Skynet OS — Emotion Journal |
| **🔥_เป้าหมาย_รูทีน_Heatmap** | เช็คอิน Top 3 Focus, ตอบ 'โอเค' บอท, Streak, ประวัติความสม่ำเสมอ | Telegram Bot & Web Heatmap |

---

## 🚀 วิธีติดตั้ง / อัปเดตใน Google Sheets (ทำเพียง 1 นาที)

1. เปิด Google Sheets ของคุณ
2. ไปที่เมนูด้านบน: **ส่วนขยาย (Extensions)** > **Apps Script**
3. ลบโค้ดเดิมทั้งหมดในหน้าต่าง แล้ว **คัดลอกโค้ด JavaScript ด้านล่างนี้ไปวางแทนที่ทั้งหมด**
4. กด **บันทึก (Save / รูปแผ่นดิสก์)** 💾
5. กดปุ่มสีน้ำเงินด้านบนขวา: **ปรับใช้ (Deploy)** > **จัดการการปรับใช้ (Manage Deployments)**
6. กดรูปดินสอ **แก้ไข (Edit)** ที่การปรับใช้เดิม
7. ในช่องเวอร์ชัน ให้เลือก **"ใหม่ (New version)"** *(สำคัญมาก เพื่อให้ Google อัปเดตโค้ดล่าสุด)*
8. กด **ปรับใช้ (Deploy)** เป็นอันเสร็จสิ้น!

*(หมายเหตุ: หากคุณต้องการล้างแถวแปลกปลอมที่เคยปนอยู่ในชีตรายจ่ายออก ให้เลือกฟังก์ชัน `cleanUpJunkFromTransactions` ที่แถบเครื่องมือด้านบนแล้วกดปุ่ม "เรียกใช้ (Run)" ระบบจะลบแถวที่ไม่มีจำนวนเงินออกให้อัตโนมัติ)*

---

## 📜 โค้ด Apps Script (JavaScript) ทั้งหมด

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // =========================================================================
    // 📂 หมวดที่ 1: 🎯 พิมพ์เขียว_Playbook (Playbook Setups Library)
    // =========================================================================
    if (data.action === "sync_playbook_setups" || data.type === "PLAYBOOK_SETUPS") {
      var sheetName = "🎯_พิมพ์เขียว_Playbook";
      var sheet = ss.getSheetByName(sheetName) || ss.getSheetByName("Playbook_Setups");
      
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        var header = [
          "ID", "รหัส Setup (Code)", "ชื่อเซ็ตอัพ (Title)", "เกรด (Grade)", "ทิศทาง",
          "Timeframe", "Session", "เป้าหมาย R:R", "Core Thesis & Edge (สมมติฐาน)",
          "Entry Checklist (กฎการเข้า)", "Stop Loss & Invalidation", "Exit Strategy (เป้าหมาย)",
          "Risk Rules (การคุมความเสี่ยง)", "ข้อควรระวัง (Do's & Don'ts)", "ลิงก์รูปชาร์ตพิมพ์เขียว", "อัปเดตล่าสุด"
        ];
        sheet.appendRow(header);
        sheet.getRange(1, 1, 1, header.length).setBackground("#1a1d26").setFontColor("#da8fff").setFontWeight("bold");
        sheet.setFrozenRows(1);
      }

      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, 16).clearContent();
      }

      var setups = data.setups || [];
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
          message: "บันทึกลงแท็บ '🎯_พิมพ์เขียว_Playbook' สำเร็จ (" + rows.length + " setups)"
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // 📂 หมวดที่ 2: ⚡ บันทึกไม้เทรด (Trade Tracker)
    // =========================================================================
    if (data.action === "sync_tracker" || data.type === "TRADE_TRACKER") {
      var tSheetName = "⚡_บันทึกไม้เทรด";
      var tSheet = ss.getSheetByName(tSheetName) || ss.getSheetByName("Trade_Tracker");
      
      if (!tSheet) {
        tSheet = ss.insertSheet(tSheetName);
        var tHeader = [
          "ID", "วันที่", "เวลา", "คู่เหรียญ / สินทรัพย์", "ทิศทาง (Direction)",
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

      if (tradeId) {
        for (var r = 1; r < dataRange.length; r++) {
          if (dataRange[r][0] == tradeId) {
            foundRow = r + 1;
            break;
          }
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
        JSON.stringify({
          success: true,
          message: "บันทึกลงแท็บ '⚡_บันทึกไม้เทรด' สำเร็จ!"
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // 📂 หมวดที่ 3: 🧠 ปฏิทินอารมณ์_สติ (Trade Journal)
    // =========================================================================
    if (data.action === "sync_journal" || data.type === "TRADE_JOURNAL") {
      var jSheetName = "🧠_ปฏิทินอารมณ์_สติ";
      var jSheet = ss.getSheetByName(jSheetName) || ss.getSheetByName("Trade_Journal");
      
      if (!jSheet) {
        jSheet = ss.insertSheet(jSheetName);
        var jHeader = [
          "ID", "วันที่", "เวลา", "รอบ / ไม้ที่", "อารมณ์หลัก",
          "ระดับวินัย (ดาว)", "บันทึกความรู้สึกในใจ (Notes)", "บทเรียนเตือนสติ (Reflection)", "เวลาอัปเดต"
        ];
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
        JSON.stringify({
          success: true,
          message: "บันทึกลงแท็บ '🧠_ปฏิทินอารมณ์_สติ' สำเร็จ!"
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // 📂 หมวดที่ 5: 🔥 เป้าหมาย & รูทีน Heatmap (Focus Tasks & Consistency Heatmap)
    // =========================================================================
    if (data.action === "sync_focus_heatmap" || data.type === "FOCUS_HEATMAP") {
      var fSheetName = "🔥_เป้าหมาย_รูทีน_Heatmap";
      var fSheet = ss.getSheetByName(fSheetName) || ss.getSheetByName("Focus_Heatmap");

      if (!fSheet) {
        fSheet = ss.insertSheet(fSheetName);
        var fHeader = [
          "วันที่", "ภารกิจ (Task Title)", "อันดับ (Rank)", "สถานะ", "ช่องทางบันทึก",
          "เวลาแจ้งเตือน", "Streak ปัจจุบัน (วัน)", "บันทึก / Note", "วันเวลาที่อัปเดต"
        ];
        fSheet.appendRow(fHeader);
        fSheet.getRange(1, 1, 1, fHeader.length).setBackground("#1a1d26").setFontColor("#ff453a").setFontWeight("bold");
        fSheet.setFrozenRows(1);
      }

      var c = data.checkin || {};
      fSheet.appendRow([
        c.date || new Date().toISOString().split("T")[0],
        c.taskTitle || "Focus Task",
        c.rank || "-",
        c.status || "COMPLETED",
        c.channel || "TELEGRAM",
        c.reminderTime || "-",
        c.streak || 1,
        c.note || "",
        new Date().toISOString()
      ]);

      return ContentService.createTextOutput(
        JSON.stringify({
          success: true,
          sheet: fSheetName,
          message: "บันทึกลงแท็บ '🔥_เป้าหมาย_รูทีน_Heatmap' สำเร็จ"
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // 📂 หมวดที่ 4: 💰 การเงิน_รายจ่าย (Personal Finance Transactions)
    // =========================================================================
    var txSheetName = "💰_การเงิน_รายจ่าย";
    var txSheet = ss.getSheetByName(txSheetName) || ss.getSheetByName("Transactions");
    
    if (!txSheet) {
      var sheets = ss.getSheets();
      if (sheets.length > 0 && (sheets[0].getName() === "Sheet1" || sheets[0].getName() === "แผ่น1")) {
        txSheet = sheets[0];
        txSheet.setName(txSheetName);
      } else {
        txSheet = ss.insertSheet(txSheetName);
      }
      
      if (txSheet.getLastRow() === 0) {
        var txHeader = ["วันที่", "หมวดหมู่หลัก", "หมวดหมู่ย่อย / รายการ", "จำนวนเงิน (฿)", "ข้อความต้นฉบับ", "วันเวลาที่บันทึก"];
        txSheet.appendRow(txHeader);
        txSheet.getRange(1, 1, 1, txHeader.length).setBackground("#1a1d26").setFontColor("#ffd60a").setFontWeight("bold");
        txSheet.setFrozenRows(1);
      }
    }

    var txItems = data.items || [];
    var savedCount = 0;
    for (var j = 0; j < txItems.length; j++) {
      var tx = txItems[j];
      // ป้องกันเด็ดขาด: บันทึกเฉพาะรายการที่มีจำนวนเงิน หรือมีหมวดหมู่ค่าใช้จ่าย
      if (tx.amount !== undefined && tx.amount !== null && !isNaN(Number(tx.amount))) {
        txSheet.appendRow([
          tx.date || new Date().toISOString().split("T")[0],
          tx.category_group || "ETC",
          tx.category || "",
          Number(tx.amount),
          tx.raw_text || tx.note || "",
          new Date().toISOString()
        ]);
        savedCount++;
      }
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        sheet: txSheetName,
        count: savedCount,
        message: "บันทึกลงแท็บ '💰_การเงิน_รายจ่าย' สำเร็จ (" + savedCount + " รายการ)"
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ฟังก์ชันเสริม: กดเพื่อลบแถวแปลกปลอม (เช่น Playbook Backup) ที่เคยหลุดไปในแท็บรายจ่าย
function cleanUpJunkFromTransactions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("💰_การเงิน_รายจ่าย") || ss.getSheetByName("Transactions") || ss.getSheets()[0];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var rowsToDelete = [];

  for (var i = values.length - 1; i >= 0; i--) {
    var amount = values[i][3];
    var rawText = String(values[i][4] || "");
    // แถวที่ไม่มีจำนวนเงิน หรือมีคำว่า Playbook ให้ลบออก
    if (amount === "" || isNaN(Number(amount)) || rawText.indexOf("Playbook") !== -1) {
      rowsToDelete.push(i + 2); // 1-indexed header offset
    }
  }

  for (var k = 0; k < rowsToDelete.length; k++) {
    sheet.deleteRow(rowsToDelete[k]);
  }

  Logger.log("ลบแถวแปลกปลอมออกไปทั้งหมด: " + rowsToDelete.length + " แถว");
}
```
