# Skynet OS ⚡

Monorepo ระบบปฏิบัติการส่วนบุคคลสำหรับการบริหารการเงินส่วนบุคคล (Financial Cockpit), บันทึกวินัยและกิจกรรมรายวัน (Daily Activity & Habit Tracker), แผนชีวิตและโรดแมป (Life Roadmap), การพัฒนา EA (Automated Trading), และ Machine Learning

**GitHub Repository:** `stillcold64/Skynet-OS`  
**Deployment / Local Host:** `http://localhost:3000` (Next.js 16 + SQLite)  
**Telegram Bot:** `@my_skynet_money_bot` (Node.js Polling Worker)

---

## 🧭 คำแนะนำสำหรับ AI Agent ทุกตัว (AI Agent Briefing)

เมื่อคุณเข้ามาทำงานในโปรเจกต์นี้ ให้อ่านไฟล์นี้และ `AGENTS.md` เป็นหลัก:
1. **Mandatory Git Auto-Backup:** ทุกครั้งที่มีการแก้โค้ดหรือเพิ่มฟีเจอร์แล้วทดสอบผ่าน **ต้องรัน `git add .`, `git commit`, และ `git push origin main` เสมอ** ห้ามทิ้งงานไว้ในเครื่องโดยไม่พุช
2. **Architecture Overview:**
   - **Backend / Database:** SQLite อยู่ที่ `apps/webapp/data/skynet.db` เข้าถึงผ่าน `better-sqlite3` ใน `apps/webapp/lib/db.js`
   - **Frontend:** Next.js 16 App Router อยู่ใน `apps/webapp/app/`
   - **Master Process Launcher:** `apps/webapp/scripts/launcher.js` รัน 3 โปรเซสพร้อมกัน:
     1. Next.js Web Server (`localhost:3000`)
     2. Telegram Polling Bot (`scripts/telegram_bot.js`)
     3. Auto-Tracker Daemon (`scripts/auto_tracker_daemon.js`)
   - **อิสระจาก IDE:** สามารถเริ่มระบบได้ทุกเมื่อโดยดับเบิลคลิก `Start_Skynet_OS.bat` บน Desktop (รันผ่าน `run_skynet_silent.vbs`)
3. **Core Modules & Tables:**
   - `transactions` & `debts`: บันทึกค่าใช้จ่าย/หนี้สิน พร้อมระบบซิงก์ Google Sheets Webhook อัตโนมัติ
   - `daily_tracker_activities` & `daily_time_logs`: บันทึกเวลาตามกิจกรรมและวินัยรายวัน มีระบบตรวจจับเกม (`dota2.exe`, `cs2.exe`, ฯลฯ) และโปรแกรมทำงาน (`capcut.exe`, ฯลฯ) พร้อมระบบตัดจบเมื่อหยุดใช้งานเกิน 15 นาที (Work Inactivity Guard)
   - `daily_reflections`: บันทึกทบทวนประจำวัน แบ่งเป็น 3 ส่วนชัดเจน:
     1. **แผนที่ตั้งเป้าไว้วันนี้ (Today's Plan)** — ดึงจากแผนที่วางไว้เมื่อวาน
     2. **ทำเสร็จแล้ววันนี้ (Finished Today)** — รายการที่ทำสำเร็จวันนี้ (`finish_text`)
     3. **แผนที่จะทำพรุ่งนี้ (Tomorrow's Plan)** — แผนที่เตรียมลุยต่อพรุ่งนี้ (`next_day_text`)
   - `focus_tasks` & `focus_logs`: 3 ภารกิจหลักประจำวัน (Top 3 Focus)
   - `roadmap_steps`: โรดแมปชีวิตและการเงิน แบ่งเป็น Phase 1, Phase 2, Phase 3
   - `project_vault`: คลังโปรเจกต์และไอเดียงาน

---

## 🚀 วิธีการรันระบบ (Running Skynet OS)

1. **เปิดผ่าน Desktop Shortcut (แนะนำที่สุด):**
   - ดับเบิลคลิก `Start_Skynet_OS.bat` บน Desktop
2. **รันผ่าน Command Line:**
   ```bash
   node apps/webapp/scripts/launcher.js
   ```
3. **Build Frontend:**
   ```bash
   npm --prefix apps/webapp run build
   ```

---

## 📂 โครงสร้างไดเรกทอรี (Directory Structure)

- `apps/webapp/` — Next.js Application, API Routes, Scripts, และ SQLite DB
  - `app/` — Next.js App Router (Components, Pages, API endpoints)
  - `lib/` — Data Access Layer & Business Logic (`db.js`, `tracker_db.js`, `reflections_db.js`, etc.)
  - `scripts/` — Daemons (`launcher.js`, `telegram_bot.js`, `auto_tracker_daemon.js`)
- `ea/` — MetaTrader 5 Expert Advisors, Forward Test setups, Presets
- `ml/` — Machine Learning models & data pipelines
- `AGENTS.md` — กฎเหล็กด้านความปลอดภัยและวินัยการแบ็กอัปสำหรับ AI
