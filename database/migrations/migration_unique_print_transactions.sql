-- =============================================================
-- Migration: ป้องกันข้อมูลยอดพิมพ์ซ้ำ (device_id + month ต้องไม่ซ้ำ)
-- เหตุผล: เดิม route POST /print-transactions ใช้ INSERT ธรรมดา
-- ทำให้ทุกครั้งที่กด "บันทึก" ซ้ำในเดือนเดิม ระบบจะเพิ่มแถวใหม่
-- แทนที่จะอัปเดตของเดิม ส่งผลให้ยอดพิมพ์/ค่าใช้จ่ายในรายงานถูกนับซ้ำ
--
-- วิธีรัน (ตัวอย่าง):
--   mysql -u root -p your_database < database/migrations/migration_unique_print_transactions.sql
-- =============================================================

-- ถ้ามีข้อมูลซ้ำอยู่ก่อนแล้ว ให้รวมยอดหน้าของแถวที่ซ้ำกันไว้ในแถวที่ id น้อยที่สุดก่อน
-- แล้วค่อยลบแถวที่เหลือทิ้ง (กันพลาดเวลาใส่ UNIQUE KEY)
CREATE TEMPORARY TABLE tmp_dedup AS
SELECT device_id, month, MIN(id) AS keep_id, SUM(pages) AS total_pages
FROM print_transactions
GROUP BY device_id, month
HAVING COUNT(*) > 1;

UPDATE print_transactions pt
JOIN tmp_dedup t
  ON pt.id = t.keep_id
SET pt.pages = t.total_pages;

DELETE pt FROM print_transactions pt
JOIN tmp_dedup t
  ON pt.device_id = t.device_id
  AND pt.month = t.month
  AND pt.id <> t.keep_id;

DROP TEMPORARY TABLE tmp_dedup;

-- เพิ่ม UNIQUE KEY กันไม่ให้เกิดแถวซ้ำอีกในอนาคต
ALTER TABLE print_transactions
  ADD UNIQUE KEY uq_device_month (device_id, month);