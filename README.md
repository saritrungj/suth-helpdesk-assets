# Fix: Print Usage / ค่าใช้จ่ายรายเดือน ไม่ตรงตามปีงบ

## สาเหตุ (root cause)

1. **`backend/routes/expense.js`** — endpoint `GET /api/expense/:fiscal_year_id`
   ดึงยอดพิมพ์รายเดือน (`print_transactions`) โดย filter แค่ `device_id`
   ไม่มีการกรองช่วงเดือนตามปีงบเลย ทำให้เครื่องที่มีประวัติข้ามปีงบ (เช่น ย้าย
   สัญญา) จะโชว์ยอดพิมพ์/ค่าใช้จ่ายของ**ทุกปีงบ**ปนกันมา ไม่ว่าจะเลือกปีงบไหน

2. **ตาราง `fiscal_year`** ไม่เคยมีคอลัมน์บอกว่าปีงบครอบคลุมเดือนไหนบ้าง —
   ฝั่ง frontend (`frontend/src/store/fiscalYear.js`) เลย "เดา" เอาเองว่าปีงบ
   ตรงกับปีปฏิทิน (ม.ค.–ธ.ค.) ทั้งที่ปีงบราชการไทยจริงคือ **1 ต.ค. – 30 ก.ย.**
   (คร่อม 2 ปีปฏิทิน) ทำให้ตัวเลือกเดือนใน Dashboard / หน้าบันทึกยอดพิมพ์ผิด
   ตั้งแต่ต้นทาง แม้ backend จะกรองถูกก็ตาม

## แนวทางแก้

- เพิ่มคอลัมน์ `start_month` / `end_month` (รูปแบบ `"YYYY-MM"`) ในตาราง
  `fiscal_year` เป็น single source of truth ของช่วงเดือน — คำนวณอัตโนมัติจาก
  เลขปีงบ พ.ศ. ด้วยกฎ ต.ค.–ก.ย. (`backend/utils/fiscalYear.js`)
- แก้ query ทุกจุดที่เคยดึงยอดพิมพ์ตาม "ปี" ให้กรองด้วยช่วงเดือนจริงของปีงบแทน
- แก้ frontend ให้สร้างรายการเดือน (MonthPicker, ตารางกรอกยอดพิมพ์ 12 เดือน,
  ตัวกรอง Dashboard) จากช่วง ต.ค.–ก.ย. จริง แทนการวนลูป ม.ค.–ธ.ค. ปีเดียว

## ไฟล์ที่แก้/เพิ่ม

**ใหม่**
- `backend/utils/fiscalYear.js` — ฟังก์ชัน `getFiscalYearRange(beYear)` คำนวณ
  ช่วงเดือน ต.ค.–ก.ย. จากปีงบ พ.ศ.
- `database/migration_add_fiscal_year_range.sql` — เพิ่มคอลัมน์ `start_month`
  / `end_month` ในตาราง `fiscal_year` + backfill ปีงบเดิมทุกแถว

**แก้ไข**
- `database/schema.sql` — เพิ่มคอลัมน์ให้ schema สำหรับติดตั้งใหม่
- `backend/routes/master-data.js` — POST/PUT `/fiscal-years` คำนวณ/บันทึก
  `start_month`, `end_month` ให้อัตโนมัติ
- `backend/routes/expense.js` — **จุดแก้บั๊กหลัก**: กรอง `print_transactions`
  ด้วย `pt.month BETWEEN start_month AND end_month`
- `backend/routes/print-transactions.js` — endpoint `/summary` และ
  `/by-device/:deviceId` เปลี่ยนจากรับ `?year=YYYY` (แล้ว `LIKE 'YYYY-%'`)
  เป็นรับ `?fiscal_year_id=ID` แล้วกรองด้วยช่วงเดือนจริง
- `frontend/src/store/fiscalYear.js` — เอา `activeGregorianYear` (ที่เดือนผิด)
  ออก แทนด้วย `activeFiscalYearRange` + `fiscalYearMonths()`
- `frontend/src/components/MonthPicker.vue` — dropdown เดือนไล่ตามปีงบจริง
  (ต.ค. ปีก่อนหน้า → ก.ย. ปีที่ตรงกับปีงบ)
- `frontend/src/components/DashboardFilter.vue` — กรองเดือนที่มีข้อมูลด้วยช่วง
  ปีงบจริงแทนการเทียบ prefix ปีเดียว
- `frontend/src/views/PrintTransactions.vue` — หน้าบันทึกยอดพิมพ์/สรุปสถานะ
  กรอกครบ ใช้ `fiscal_year_id` + ช่วงเดือนจริงแทนปีปฏิทิน

## วิธีติดตั้ง (deploy)

1. รัน migration บน DB จริงก่อน:
   ```
   mysql -u root -p your_database < database/migration_add_fiscal_year_range.sql
   ```
2. Deploy โค้ด backend (routes ที่แก้ + `utils/fiscalYear.js` ใหม่)
3. Deploy โค้ด frontend (build ใหม่)
4. ตรวจสอบว่าปีงบเดิมทุกตัวมี `start_month` / `end_month` ถูกต้องหลัง backfill
   เช่น ปีงบ 2569 ควรได้ `2025-10` ถึง `2026-09`

## วิธีนำไฟล์เหล่านี้ไปวางในโปรเจกต์

โครงสร้างในซิปนี้ตรงกับ path เดิมในโปรเจกต์เป๊ะ ๆ (เช่น
`backend/routes/expense.js`) — คัดลอกทับไฟล์เดิมในโปรเจกต์ได้เลย (ยกเว้น
ไฟล์ migration ที่ต้องรันแยกกับ DB ตามข้อ 1 ด้านบน)
