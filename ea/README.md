# 📈 Skynet OS - EA & Preset Auto-Backup Guide

ระบบสำรองข้อมูลและป้องกันการสูญหายของโค้ด EA (Forward Test) และไฟล์ค่า Optimization Presets (.set)

## 📁 โครงสร้างโฟลเดอร์

- `ea/forward_test/` : บันทึกโค้ด EA (.mq5 / .ex5) ตัวที่กำลังนำไปรัน Forward Test บนพอร์ตจริง/เดโม่
- `ea/presets/`      : บันทึกไฟล์ `.set` ที่ผ่านการ Backtest / Optimization ได้ค่าที่ดีที่สุด
- `ea/mql5/`         : Source code หลักของ EA
- `ea/python/`       : โมเดลวิเคราะห์ Alpha / Backtest ด้วย Python
- `ea/scripts/`      : สคริปต์ซิงค์ข้อมูลอัตโนมัติ

## ⚡ วิธีใช้งาน (1-Click Auto Backup)

### วิธีที่ 1: ดับเบิ้ลคลิกบน Desktop
- ดับเบิ้ลคลิกไฟล์ `Backup_EA_Presets.bat` บนหน้า Desktop ของคุณ
- สคริปต์จะค้นหาและดึงไฟล์ `.set` ล่าสุดจาก MT5 Strategy Tester / Presets และโค้ด EA เข้ามาเก็บในโปรเจกต์ และสั่ง `git commit + git push` ขึ้น GitHub ให้ทันที

### วิธีที่ 2: สั่งผ่าน Antigravity
- เพียงพิมพ์บอกว่า "แบคอัพค่า EA ให้หน่อย" หรือ "เซฟ preset ล่าสุดให้หน่อย"
