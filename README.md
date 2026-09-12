# Skynet OS

โปรเจคส่วนตัวสำหรับบันทึกข้อมูลการเทรด ค่าใช้จ่าย การลงทุน พัฒนา EA และทำ machine learning เพื่อวิเคราะห์/ปรับกลยุทธ์

**สำหรับ AI agent ทุกตัวที่ทำงานในโปรเจคนี้:**
กรุณาอ่าน `.agents/rules/safety.md` ให้ครบก่อนเริ่มงานใด ๆ และอ่าน `MISTAKES.md` ก่อนแก้บั๊กหรือทำงานที่มีความเสี่ยงทุกครั้ง

## โครงสร้างโปรเจค (Monorepo)
- `apps/webapp` — Next.js Web Application สำหรับบันทึกค่าใช้จ่ายและการลงทุน (SQLite Local)
- `ea` — Expert Advisor & Backtest Engine
- `ml` — Machine Learning Pipeline
