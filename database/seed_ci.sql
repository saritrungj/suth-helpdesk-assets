-- ==============================================================================
-- database/seed_ci.sql
--
-- ข้อมูลของชั้น CI ที่ต้องมีฐานข้อมูลจริง (#63) — รันหลัง schema.sql บนฐานที่
-- สร้างใหม่ทุกครั้ง (MySQL service container ของ workflow) ไม่ใช่ฐานพัฒนา
--
-- ตั้งใจใส่เคสร้ายที่ database/seed_dummy_data.sql ไม่มี เพราะรอบ #48 เจอบั๊ก
-- a11y สองตัวได้ก็เพราะฐาน QA บังเอิญมีชื่อแผนกยาวและเครื่องที่ถูกย้าย — ถ้า seed
-- ของ CI มีแต่ข้อมูลสวย CI จะตรวจไม่เจอสิ่งเหล่านี้อีกเลย (ดู
-- docs/reference/accessibility.md หัวข้อ "สิ่งที่ฐานข้อมูล QA แยกจับได้เพิ่ม")
--
-- ปีงบและเดือนคำนวณจากวันที่รันจริงด้วย CURDATE() ไม่ตรึงวันที่ตายตัว — ห้าม
-- เขียนปี/เดือนเป็นตัวเลขคงที่ที่ไหนในไฟล์นี้ ไม่งั้น seed จะ "หมดอายุ" ทันทีที่
-- ข้ามปีงบ (ดู packages/domain/fiscal-year.cjs ซึ่งเป็น source of truth ของสูตรนี้
-- ที่นี่ต้องคำนวณให้ตรงกันเป๊ะๆ ด้วยมือ เพราะเรียก .cjs จาก SQL ตรงๆ ไม่ได้)
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM device_location_history;
DELETE FROM print_transactions;
DELETE FROM devices;
DELETE FROM contracts;
DELETE FROM department;
DELETE FROM division;
DELETE FROM floor;
DELETE FROM building;
DELETE FROM brand;
DELETE FROM fiscal_year;

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE device_location_history AUTO_INCREMENT = 1;
ALTER TABLE print_transactions AUTO_INCREMENT = 1;
ALTER TABLE devices AUTO_INCREMENT = 1;
ALTER TABLE contracts AUTO_INCREMENT = 1;
ALTER TABLE department AUTO_INCREMENT = 1;
ALTER TABLE division AUTO_INCREMENT = 1;
ALTER TABLE floor AUTO_INCREMENT = 1;
ALTER TABLE building AUTO_INCREMENT = 1;
ALTER TABLE brand AUTO_INCREMENT = 1;
ALTER TABLE fiscal_year AUTO_INCREMENT = 1;

-- ------------------------------------------------------------------------------
-- ปีงบปัจจุบัน คำนวณจากวันที่รัน — สูตรเดียวกับ packages/domain/fiscal-year.cjs
--
-- ปีงบไทยเริ่ม 1 ต.ค. ของปี ค.ศ. ก่อนหน้า ถึง 30 ก.ย. ของปีที่ตรงกับปีงบ ดังนั้น
-- ถ้าวันนี้อยู่เดือน ต.ค.-ธ.ค. ปีงบที่ "ครอบคลุมวันนี้" จะสิ้นสุดปีหน้า (ค.ศ.)
-- ไม่ใช่ปีนี้ — ตัวแปร @fy_ce_end ด้านล่างคือปี ค.ศ. ที่ปีงบสิ้นสุด (BE_OFFSET = 543)
-- ------------------------------------------------------------------------------

SET @today       = CURDATE();
SET @ce_year     = YEAR(@today);
SET @ce_month    = MONTH(@today);
SET @fy_ce_end   = IF(@ce_month >= 10, @ce_year + 1, @ce_year);
SET @fy_ce_start = @fy_ce_end - 1;
SET @fy_be_year  = CAST(@fy_ce_end + 543 AS CHAR);
SET @fy_start_month = CONCAT(@fy_ce_start, '-10');
SET @fy_end_month   = CONCAT(LPAD(@fy_ce_end, 4, '0'), '-09');

-- เดือนที่มียอดพิมพ์: เดือนนี้กับเดือนก่อนหน้า ตามวันที่รันจริง — ปกติทั้งคู่อยู่ใน
-- ปีงบเดียวกัน ยกเว้นช่วงข้ามปีงบพอดี (รันวันที่ 1 ต.ค.) ซึ่งเดือนก่อนหน้าจะตกปีงบ
-- ก่อน เป็นเคสขอบที่ยอมรับได้ ไม่ใช่บั๊กของ seed นี้
SET @month_this = DATE_FORMAT(@today, '%Y-%m');
SET @month_prev = DATE_FORMAT(DATE_SUB(@today, INTERVAL 1 MONTH), '%Y-%m');

INSERT INTO fiscal_year (id, year, start_month, end_month, status) VALUES
(1, @fy_be_year, @fy_start_month, @fy_end_month, 'active');

-- ------------------------------------------------------------------------------
-- Master data
-- ------------------------------------------------------------------------------

INSERT INTO brand (id, name, status) VALUES
(1, 'SUTH Printer', 'active'),
(2, 'CI Test Brand', 'active');

INSERT INTO building (id, name, status) VALUES
(1, 'อาคารผู้ป่วยนอก', 'active'),
(2, 'อาคารใหม่', 'active');

INSERT INTO floor (id, building_id, name, status) VALUES
(1, 1, 'ชั้น 2', 'active'),
(2, 2, 'ชั้น 1', 'active');

INSERT INTO division (id, name, status) VALUES
(1, 'ฝ่ายการพยาบาล', 'active');

-- แผนกหนึ่งชื่อยาวจงใจ (แผนกจริงที่ทำให้เจอบั๊ก 2.5.8 และ 1.4.12 ใน #48 มีความยาว
-- ระดับนี้) อีกแผนกชื่อสั้นไว้เทียบ — เพื่อให้เห็นว่าปัญหาเกิดกับชื่อยาวเท่านั้น
INSERT INTO department (id, division_id, name, status) VALUES
(1, 1, 'หน่วยบริการผู้ป่วยนอกและประสานงานการรักษาต่อเนื่องกลุ่มงานเวชศาสตร์ฟื้นฟูและกายภาพบำบัดผู้ป่วยเรื้อรัง', 'active'),
(2, 1, 'ฝ่ายบริหาร', 'active');

INSERT INTO contracts (id, contract_no, fiscal_year_id, price_per_page) VALUES
(1, CONCAT('SUTH-CI-', @fy_be_year), 1, 0.45);

-- ------------------------------------------------------------------------------
-- Devices — device_id 3 คือเครื่องที่ย้ายแล้ว สังกัดแผนกชื่อยาว เพื่อชนสองเคส
-- ร้ายพร้อมกัน (ตรงกับที่ฐาน QA48 เจอจริง — ดู docs/reference/accessibility.md)
-- ------------------------------------------------------------------------------

INSERT INTO devices
(id, serial_number, brand_id, model, building_id, floor_id, location, division_id, department_id, contract_id, price_override, status)
VALUES
(1, 'CI-SN-001', 1, 'Office 400', 1, 1, 'เคาน์เตอร์พยาบาล', 1, 2, 1, NULL, 'active'),
(2, 'CI-SN-002', 1, 'Office 400', 1, 1, 'ห้องตรวจ 3', 1, 2, 1, NULL, 'active'),
-- ย้ายจากอาคารผู้ป่วยนอก (ชั้น 2) ไปอาคารใหม่ (ชั้น 1) แล้ว — building_id/floor_id
-- ปัจจุบันต้องตรงกับ interval ล่าสุดใน device_location_history ด้านล่าง
(3, 'CI-SN-003', 2, 'Office 400', 2, 2, 'เคาน์เตอร์ประสานงาน', 1, 1, 1, NULL, 'active'),
(4, 'CI-SN-004', 2, 'Office 400', 1, 1, 'ห้องเวชระเบียน', 1, 1, 1, NULL, 'repair'),
(5, 'CI-SN-005', 1, 'Office 400', 1, 1, 'คลังพัสดุ', 1, 2, 1, NULL, 'retired');

-- interval เก่า (ปิดแล้ว) + interval ปัจจุบัน (effective_to = NULL) ของ device 3
-- effective_from ยึดจากวันที่รันจริงเช่นกัน ไม่ตรึงวันที่ตายตัว
INSERT INTO device_location_history
(device_id, building_id, floor_id, location, division_id, department_id, effective_from, effective_to)
VALUES
(3, 1, 1, 'เคาน์เตอร์พยาบาล', 1, 1, DATE_SUB(@today, INTERVAL 6 MONTH), DATE_SUB(@today, INTERVAL 2 MONTH)),
(3, 2, 2, 'เคาน์เตอร์ประสานงาน', 1, 1, DATE_SUB(@today, INTERVAL 2 MONTH), NULL);

-- ------------------------------------------------------------------------------
-- ยอดพิมพ์ — สองเดือนล่าสุด ให้แดชบอร์ด/รายงาน/เปรียบเทียบมีข้อมูลจริงให้ตรวจ
-- ------------------------------------------------------------------------------

INSERT INTO print_transactions (device_id, month, pages) VALUES
(1, @month_prev, 1200),
(1, @month_this, 1450),
(2, @month_prev, 800),
(2, @month_this, 950),
(3, @month_prev, 300),
(3, @month_this, 420);
