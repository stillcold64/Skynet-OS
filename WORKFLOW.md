# Workflow ภาพรวมของ Skynet OS

## ส่วนประกอบหลัก
- **apps/webapp** — ระบบบันทึกการเงินส่วนบุคคลอัตโนมัติ (Telegram-First + iOS Frosted Glass UI)
  - **การทำงานหลัก:** รับข้อความภาษาธรรมชาติจาก Telegram (หรือหน้าเว็บ Simulator) วิเคราะห์วันที่ย้อนหลัง (เช่น วันที่ 1, วันที่ 2) แยกรายการ ยอดเงิน และจำแนกลง 5 หมวดหมู่หลักอัตโนมัติ
  - **5 หมวดหมู่อีโมจิ:**
    1. 🌿 `LIFE` — อาหาร, ใช้ชีวิตประจำวัน, กาแฟ, อาหารแมว, ยา, ข้าว, eat, food
    2. ✨ `EXTRAVAGANT` — ฟุ่มเฟือย, ไลฟ์สไตล์, ช้อปปิ้ง, คาเฟ่, Zaza, บันเทิง
    3. 📄 `BILL` — บิลคงที่, หนี้สิน (ธันเดอร์, paylater, easycash), wifi, ซ่อมเครื่องทำน้ำอุ่น, subscription (gpu+yt)
    4. 📈 `INVESTING` — การลงทุน, ออมเงิน, หุ้น, กองทุน, คริปโต, ทองคำ
    5. 📦 `ETC` — เบ็ดเตล็ด, อื่น ๆ
  - **การแสดงผล:** Financial Calendar Dashboard (ปฏิทินแสดงยอดเงินและไอคอนหมวดหมู่ประจำวัน), Top iOS Cards สรุป 5 หมวดหมู่, และ Bot Audit Log ตรวจสอบประวัติการบันทึก
  - **ที่เก็บข้อมูล:** SQLite Local ที่ `apps/webapp/data/skynet.db` (ตาราง `transactions`, `bot_logs`, `category_rules`)
  - **Telegram Bot Script:** `apps/webapp/scripts/telegram_bot.js` (รองรับ Long-Polling ในเครื่อง ไม่ต้องต่อ Webhook สาธารณะ)

- **ea** — Expert Advisor development + backtest engine สำหรับกลยุทธ์เทรด
- **ml** — Machine learning pipeline สำหรับ loop engineering และวิเคราะห์ผล backtest

## การไหลของข้อมูล (Data Flow)
- ผู้ใช้ส่งข้อความสไตล์ธรรมชาติเข้า Telegram → `parser.js` แยกวันที่และคีย์เวิร์ดเทียบเคียง → จัดหมวดหมู่ 5 กลุ่ม → บันทึกลง SQLite + บันทึก `bot_logs` → แสดงผลบนปฏิทินและ Dashboard แบบเรียลไทม์
