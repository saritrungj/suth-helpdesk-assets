-- =============================================================
-- Migration: เพิ่มช่วงเดือนเริ่ม/สิ้นสุดให้ตาราง fiscal_year
-- เหตุผล: เดิมตาราง fiscal_year เก็บแค่เลขปี พ.ศ. (คอลัมน์ year) เฉยๆ ไม่มีข้อมูลว่า
-- ปีงบนั้นครอบคลุมเดือนไหนบ้าง ทำให้ backend (เช่น GET /api/expense/:fiscal_year_id)
-- ดึงยอดพิมพ์/ค่าใช้จ่ายรายเดือนของอุปกรณ์มาทั้งหมดโดยไม่กรองตามปีงบเลย และฝั่ง frontend
-- ก็ต้องเดาเองว่าปีงบตรงกับ ม.ค.-ธ.ค. (ผิด) แทนที่จะเป็น ต.ค.-ก.ย. ตามปีงบราชการไทยจริง
-- ส่งผลให้ "Print Usage รายเดือน" และ "ค่าใช้จ่ายรายเดือน" ไม่ตรงตามปีงบที่เลือก
--
-- Migration นี้เพิ่มคอลัมน์ start_month / end_month (รูปแบบ "YYYY-MM") เป็น
-- single source of truth แทน แล้ว backfill ให้แถวเดิมทุกแถวตามกฎปีงบราชการไทย
-- (1 ต.ค. ของปี ค.ศ. ก่อนหน้า ถึง 30 ก.ย. ของปีที่ตรงกับปีงบ)
--
-- วิธีรัน (ตัวอย่าง):
--   mysql -u root -p your_database < database/migration_add_fiscal_year_range.sql
-- =============================================================

ALTER TABLE fiscal_year
  ADD COLUMN start_month CHAR(7) NULL AFTER year,
  ADD COLUMN end_month CHAR(7) NULL AFTER start_month;

-- backfill ปีงบที่มีอยู่เดิมทุกแถว: ปีงบ พ.ศ. Y = ต.ค. (ค.ศ. Y-543-1) ถึง ก.ย. (ค.ศ. Y-543)
UPDATE fiscal_year
SET
  start_month = CONCAT(CAST(year AS UNSIGNED) - 543 - 1, '-10'),
  end_month   = CONCAT(CAST(year AS UNSIGNED) - 543, '-09');

-- บังคับ NOT NULL หลังจาก backfill ครบทุกแถวแล้ว กันแถวใหม่ในอนาคตหลุดมาโดยไม่มีช่วงเดือน
ALTER TABLE fiscal_year
  MODIFY COLUMN start_month CHAR(7) NOT NULL,
  MODIFY COLUMN end_month CHAR(7) NOT NULL;
