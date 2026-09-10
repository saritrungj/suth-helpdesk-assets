-- =============================================================
-- Migration: บังคับให้คอลัมน์ "เดือน" เก็บเป็น ค.ศ. อย่างเดียว
--
-- เหตุผล: ระบบตกลงกันไว้ตั้งแต่แรกว่า print_transactions.month เก็บเป็น "YYYY-MM"
-- แบบ ค.ศ. (backend/utils/fiscalYear.js แปลงปีงบ พ.ศ. เป็นช่วงเดือน ค.ศ. และ
-- importController.js แปลงหัวคอลัมน์ "meter 9/67" เป็น ค.ศ. ให้แล้ว) แต่ข้อมูลที่ถูก
-- ยัดเข้าฐานข้อมูลตรงๆ ผ่าน phpMyAdmin หรือ SQL มือ เป็น พ.ศ. เช่น "2568-10"
--
-- ผลคือ query ที่กรองด้วยช่วงปีงบจริง ("2025-10" ถึง "2026-09") หาไม่เจอสักแถว
-- หน้าค่าใช้จ่ายและยอดพิมพ์รายเดือนจึงว่างเปล่าทั้งที่มีข้อมูลอยู่ในตาราง
--
-- ทำไมไม่เก็บทั้งสองแบบปนกัน: "2568-10" กับ "2025-10" คือเดือนเดียวกันแต่เป็นคนละ string
-- ทำให้ UNIQUE KEY (device_id, month) กันข้อมูลซ้ำไม่ได้ ยอดพิมพ์เดือนเดียวกันจะถูกนับสองรอบ
-- และค่าใช้จ่ายบานโดยไม่มีอะไรเตือน — จึงรับเข้าได้ทั้งสองแบบ (backend/utils/month.js
-- normalize ให้ตั้งแต่ขาเข้า) แต่ในฐานข้อมูลเก็บเป็น ค.ศ. แบบเดียว
--
-- วิธีรัน:
--   mysql -u root -p your_database < database/migrations/migration_normalize_month_to_ce.sql
--
-- migration นี้จะ "หยุดและไม่แก้อะไรเลย" ถ้าพบว่าเครื่องเดียวกันมีทั้งแถว พ.ศ. และแถว ค.ศ.
-- ของเดือนเดียวกัน เพราะกรณีนั้นต้องให้คนตัดสินว่ายอดไหนถูก ไม่ควรให้ script เดาเอง
-- =============================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS normalize_month_to_ce$$

CREATE PROCEDURE normalize_month_to_ce()
BEGIN
  DECLARE collisions INT DEFAULT 0;

  -- ------------------------------------------------------------------
  -- 1) ตรวจก่อนว่ามีเครื่องไหนมีทั้งแถว พ.ศ. และแถว ค.ศ. ของเดือนเดียวกันหรือเปล่า
  --    ถ้ามี แปลว่ามียอดของเดือนเดียวกันถูกบันทึกไว้สองครั้งด้วยรูปแบบต่างกัน
  --    ต้องให้คนดูเองว่ายอดไหนถูก — script หยุดตรงนี้ ไม่แตะข้อมูล
  -- ------------------------------------------------------------------
  SELECT COUNT(*) INTO collisions
  FROM print_transactions be
  JOIN print_transactions ce
    ON ce.device_id = be.device_id
   AND ce.month = CONCAT(
         CAST(SUBSTRING(be.month, 1, 4) AS UNSIGNED) - 543,
         SUBSTRING(be.month, 5)
       )
  WHERE CAST(SUBSTRING(be.month, 1, 4) AS UNSIGNED) >= 2400;

  IF collisions > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'พบยอดพิมพ์เดือนเดียวกันถูกบันทึกไว้ทั้งแบบ พ.ศ. และ ค.ศ. — ต้องรวม/ลบให้เหลือแถวเดียวก่อน แล้วค่อยรัน migration นี้ใหม่';
  END IF;

  -- ------------------------------------------------------------------
  -- 2) แปลงแถวที่เป็น พ.ศ. ให้เป็น ค.ศ. (ปี >= 2400 ถือเป็น พ.ศ.)
  --    ตรงกับเส้นแบ่ง BE_YEAR_THRESHOLD ใน backend/utils/month.js
  -- ------------------------------------------------------------------
  UPDATE print_transactions
  SET month = CONCAT(
        CAST(SUBSTRING(month, 1, 4) AS UNSIGNED) - 543,
        SUBSTRING(month, 5)
      )
  WHERE CAST(SUBSTRING(month, 1, 4) AS UNSIGNED) >= 2400;

  -- ------------------------------------------------------------------
  -- 3) ตาราง fiscal_year ก็เก็บช่วงเดือนเป็น ค.ศ. เหมือนกัน — เผื่อฐานข้อมูลไหน
  --    เคยถูกกรอกเป็น พ.ศ. ไว้ ก็แปลงให้ตรงกันด้วย
  -- ------------------------------------------------------------------
  UPDATE fiscal_year
  SET start_month = CONCAT(
        CAST(SUBSTRING(start_month, 1, 4) AS UNSIGNED) - 543,
        SUBSTRING(start_month, 5)
      )
  WHERE CAST(SUBSTRING(start_month, 1, 4) AS UNSIGNED) >= 2400;

  UPDATE fiscal_year
  SET end_month = CONCAT(
        CAST(SUBSTRING(end_month, 1, 4) AS UNSIGNED) - 543,
        SUBSTRING(end_month, 5)
      )
  WHERE CAST(SUBSTRING(end_month, 1, 4) AS UNSIGNED) >= 2400;
END$$

DELIMITER ;

CALL normalize_month_to_ce();

DROP PROCEDURE normalize_month_to_ce;

-- ------------------------------------------------------------------
-- 4) กันไม่ให้ พ.ศ. หลุดเข้ามาอีก ไม่ว่าจะเข้ามาทางไหน (API, phpMyAdmin, SQL มือ)
--    รูปแบบที่ยอมรับ: "YYYY-MM" เดือนเติม 0 สองหลัก และปี ค.ศ. อยู่ระหว่าง 1900-2399
--    ("2568-10" จะติดที่เงื่อนไขช่วงปี ส่วน "2025-7" ติดที่เงื่อนไขรูปแบบ)
-- ------------------------------------------------------------------
ALTER TABLE print_transactions
  ADD CONSTRAINT chk_print_transactions_month_ce
  CHECK (
    month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'
    AND CAST(SUBSTRING(month, 1, 4) AS UNSIGNED) BETWEEN 1900 AND 2399
  );

ALTER TABLE fiscal_year
  ADD CONSTRAINT chk_fiscal_year_start_month_ce
  CHECK (
    start_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'
    AND CAST(SUBSTRING(start_month, 1, 4) AS UNSIGNED) BETWEEN 1900 AND 2399
  );

ALTER TABLE fiscal_year
  ADD CONSTRAINT chk_fiscal_year_end_month_ce
  CHECK (
    end_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'
    AND CAST(SUBSTRING(end_month, 1, 4) AS UNSIGNED) BETWEEN 1900 AND 2399
  );
