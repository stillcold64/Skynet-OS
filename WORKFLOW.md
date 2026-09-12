# Workflow ภาพรวมของ Skynet OS

(ไฟล์นี้จะขยายเพิ่มเรื่อย ๆ ตอนเริ่มสร้างแต่ละส่วน)

## ส่วนประกอบหลัก
- **apps/webapp** — เว็บแอพส่วนตัวสำหรับบันทึกข้อมูลการเงิน (ค่าใช้จ่าย และการลงทุน) และ dashboard แสดงผล
  - **ที่เก็บข้อมูล (Data Storage):** เก็บข้อมูลแบบ Local SQLite ไว้ที่ `apps/webapp/data/skynet.db` (ตาราง `transactions`) ยังไม่เชื่อม Google Sheets หรือ Cloud Storage ใด ๆ โดยตรง ตามกฎ Data Isolation
- **ea** — Expert Advisor development + backtest engine สำหรับกลยุทธ์เทรด (เช่น Beta Cash Flow x GSR Engine, Beta Cash Flow x TRIX Engine)
- **ml** — Machine learning pipeline สำหรับ loop engineering และวิเคราะห์ผล backtest

## การไหลของข้อมูล (Data Flow)
- ผู้ใช้บันทึกธุรกรรมค่าใช้จ่าย/การลงทุนจริงผ่าน webapp → จัดเก็บลงใน SQLite (`apps/webapp/data/skynet.db`)
- EA backtest results → ส่งต่อเข้าสู่ ML pipeline → วิเคราะห์ผลและปรับปรุงกลยุทธ์ → แสดงผลบน webapp dashboard

## หมายเหตุ
ทุกครั้งที่จะแก้โค้ดส่วนที่กระทบมากกว่า 1 ส่วนประกอบ ให้ตรวจสอบกับผังนี้ก่อนเสมอ
ถ้าผังนี้ไม่ตรงกับโค้ดจริงแล้ว ให้อัปเดตไฟล์นี้ด้วยทุกครั้ง
