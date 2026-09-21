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

DELETE FROM device_contract_history;
DELETE FROM device_service_period;
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

ALTER TABLE device_contract_history AUTO_INCREMENT = 1;
ALTER TABLE device_service_period AUTO_INCREMENT = 1;
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

-- ฝ่ายที่สองมีไว้ให้เครื่อง 31/32 ย้ายเข้า (#104) — ตัวกรองฝ่ายของรายงานต้องแยกยอด
-- ก่อนและหลังย้ายได้จริง ซึ่งพิสูจน์ไม่ได้ถ้าทั้งระบบมีฝ่ายเดียว
INSERT INTO division (id, name, status) VALUES
(1, 'ฝ่ายการพยาบาล', 'active'),
(2, 'ฝ่ายเภสัชกรรม', 'active');

-- แผนกหนึ่งชื่อยาวจงใจ (แผนกจริงที่ทำให้เจอบั๊ก 2.5.8 และ 1.4.12 ใน #48 มีความยาว
-- ระดับนี้) อีกแผนกชื่อสั้นไว้เทียบ — เพื่อให้เห็นว่าปัญหาเกิดกับชื่อยาวเท่านั้น
INSERT INTO department (id, division_id, name, status) VALUES
(1, 1, 'หน่วยบริการผู้ป่วยนอกและประสานงานการรักษาต่อเนื่องกลุ่มงานเวชศาสตร์ฟื้นฟูและกายภาพบำบัดผู้ป่วยเรื้อรัง', 'active'),
(2, 1, 'ฝ่ายบริหาร', 'active'),
(3, 2, 'งานคลังยา', 'active');

-- สัญญาสองฉบับพร้อมอายุและรายการราคา (ADR-0021/0023)
INSERT INTO contracts
(id, contract_no, effective_from, effective_to)
VALUES
(1, CONCAT('SUTH-CI-', @fy_be_year),
 STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'),
 LAST_DAY(STR_TO_DATE(CONCAT(@fy_end_month, '-01'), '%Y-%m-%d'))),
(2, CONCAT('SUTH-CI-ALT-', @fy_be_year),
 STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'),
 LAST_DAY(STR_TO_DATE(CONCAT(@fy_end_month, '-01'), '%Y-%m-%d')));

INSERT INTO contract_price_line (contract_id, category_id, price_per_page)
SELECT 1, id, 0.4500 FROM meter_category WHERE code = 'bw'
UNION ALL
SELECT 2, id, 0.5000 FROM meter_category WHERE code = 'bw';

-- ------------------------------------------------------------------------------
-- Devices — device_id 3 คือเครื่องที่ย้ายแล้ว สังกัดแผนกชื่อยาว เพื่อชนสองเคส
-- ร้ายพร้อมกัน (ตรงกับที่ฐาน QA48 เจอจริง — ดู docs/reference/accessibility.md)
-- ------------------------------------------------------------------------------

-- installation_status: เครื่อง 1-4 ตรวจยืนยันแล้ว ส่วนเครื่อง 6 จงใจปล่อยเป็น NULL
-- = "ยังไม่ตรวจยืนยัน" เพื่อให้ชุด db ตรวจเส้นทาง "ความครบถ้วนยังยืนยันไม่ได้" ได้จริง
-- ถ้าทุกเครื่องตรวจครบ เส้นทางนั้นจะไม่เคยถูกเรียกใน CI เลยแม้แต่ครั้งเดียว
INSERT INTO devices
(id, serial_number, brand_id, model, building_id, floor_id, location, division_id, department_id, contract_id, price_override, status, installation_status, service_unverified_before)
VALUES
(1, 'CI-SN-001', 1, 'Office 400', 1, 1, 'เคาน์เตอร์พยาบาล', 1, 2, 1, NULL, 'active', 'installed', NULL),
(2, 'CI-SN-002', 1, 'Office 400', 1, 1, 'ห้องตรวจ 3', 1, 2, 1, NULL, 'active', 'installed', NULL),
-- ย้ายจากอาคารผู้ป่วยนอก (ชั้น 2) ไปอาคารใหม่ (ชั้น 1) แล้ว — building_id/floor_id
-- ปัจจุบันต้องตรงกับ interval ล่าสุดใน device_location_history ด้านล่าง
(3, 'CI-SN-003', 2, 'Office 400', 2, 2, 'เคาน์เตอร์ประสานงาน', 1, 1, 1, NULL, 'active', 'installed', NULL),
(4, 'CI-SN-004', 2, 'Office 400', 1, 1, 'ห้องเวชระเบียน', 1, 1, 1, NULL, 'repair', 'installed', NULL),
(5, 'CI-SN-005', 1, 'Office 400', 1, 1, 'คลังพัสดุ', 1, 2, 1, NULL, 'retired', 'installed', NULL),
(6, 'CI-SN-006', 1, 'Office 400', 2, 2, 'ห้องพักเจ้าหน้าที่', 1, 2, 1, NULL, 'active', NULL, NULL);

-- ------------------------------------------------------------------------------
-- ช่วงความรับผิดชอบ (ADR-0018) — ตัวส่วนของความครบถ้วนรายเดือน
-- ------------------------------------------------------------------------------
-- เครื่อง 1-3 รับผิดชอบมาตั้งแต่ต้นปีงบ ส่วนเครื่อง 4 กับ 5 ปิดช่วงไปแล้ว (ส่งซ่อม
-- และปลดระวาง) ยอดเดือนเก่าของทั้งคู่ยังอยู่ครบและยังคิดเงินตามปกติ
--
-- เครื่อง 6 ไม่มีช่วงเลยเพราะยังไม่มีใครตรวจ — ตั้งใจให้เป็นแบบนั้น ไม่ใช่ข้อมูลตกหล่น
INSERT INTO device_service_period
(device_id, effective_from, effective_to, verified_by, verified_at)
VALUES
(1, STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'), NULL, NULL, CURRENT_TIMESTAMP),
(2, STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'), NULL, NULL, CURRENT_TIMESTAMP),
(3, STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'), NULL, NULL, CURRENT_TIMESTAMP),
(4, STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'), DATE_SUB(@today, INTERVAL 1 MONTH), NULL, CURRENT_TIMESTAMP),
(5, STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'), DATE_SUB(@today, INTERVAL 3 MONTH), NULL, CURRENT_TIMESTAMP);

-- interval เก่า (ปิดแล้ว) + interval ปัจจุบัน (effective_to = NULL) ของ device 3
-- effective_from ยึดจากวันที่รันจริงเช่นกัน ไม่ตรึงวันที่ตายตัว
INSERT INTO device_location_history
(device_id, building_id, floor_id, location, division_id, department_id, effective_from, effective_to)
VALUES
(3, 1, 1, 'เคาน์เตอร์พยาบาล', 1, 1, DATE_SUB(@today, INTERVAL 6 MONTH), DATE_SUB(@today, INTERVAL 2 MONTH)),
(3, 2, 2, 'เคาน์เตอร์ประสานงาน', 1, 1, DATE_SUB(@today, INTERVAL 2 MONTH), NULL);

-- ------------------------------------------------------------------------------
-- เครื่องเติมจำนวน เพื่อให้ตารางยาวพอที่การแบ่งหน้าจะทำงานจริง
-- ------------------------------------------------------------------------------
-- ชุด db มีเทสที่ตรวจว่าตารางเต็มจอใช้พื้นที่ที่เหลือจริง และแถบล่างถูกตรึงไว้
-- ด้านล่าง ซึ่งพิสูจน์อะไรไม่ได้เลยถ้าตารางมีไม่กี่แถว (เทสรอข้อความ "แสดง 1–20
-- จาก …" ที่จะขึ้นก็ต่อเมื่อมีเกิน 20 แถว)
--
-- เดิม seed นี้มี 5 เครื่อง เทสสองข้อนั้นจึงล้มทุกครั้งที่รันกับ seed ของตัวเอง
-- ไม่ใช่เพราะโค้ดผิด แต่เพราะข้อมูลไม่ถึงเกณฑ์ที่เทสตั้งไว้
--
-- เครื่องกลุ่มนี้อยู่อาคารผู้ป่วยนอกและตรวจยืนยันแล้วทั้งหมด ทำให้ขอบเขต
-- "อาคารผู้ป่วยนอก" ยืนยันความครบถ้วนได้เต็มที่ ขณะที่ขอบเขตทั้งระบบยังยืนยัน
-- ไม่ได้เพราะเครื่อง 6 ที่อาคารใหม่ — ชุด db จึงเดินผ่านทั้งสองเส้นทางในการรันเดียว
INSERT INTO devices
(id, serial_number, brand_id, model, building_id, floor_id, location, division_id, department_id, contract_id, price_override, status, installation_status, service_unverified_before)
SELECT
  seq.n,
  CONCAT('CI-SN-', LPAD(seq.n, 3, '0')),
  1 + MOD(seq.n, 2),
  'Office 400',
  1, 1,
  CONCAT('จุดบริการ ', seq.n),
  1,
  1 + MOD(seq.n, 2),
  IF(seq.n = 30, 2, 1),
  NULL,
  'active',
  'installed',
  NULL
FROM (
  WITH RECURSIVE counter AS (SELECT 7 AS n UNION ALL SELECT n + 1 FROM counter WHERE n < 30)
  SELECT n FROM counter
) seq;

INSERT INTO device_meter (device_id, category_id)
SELECT d.id, mc.id FROM devices d CROSS JOIN meter_category mc WHERE mc.code = 'bw';

INSERT INTO device_service_period (device_id, effective_from, effective_to, verified_by, verified_at)
SELECT d.id, STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'), NULL, NULL, CURRENT_TIMESTAMP
FROM devices d WHERE d.id >= 7;

-- ------------------------------------------------------------------------------
-- ยอดพิมพ์ — สองเดือนล่าสุด ให้แดชบอร์ด/รายงาน/เปรียบเทียบมีข้อมูลจริงให้ตรวจ
-- ------------------------------------------------------------------------------

INSERT INTO print_transactions (device_id, meter_id, month, pages) VALUES
(1, (SELECT id FROM device_meter WHERE device_id = 1), @month_prev, 1200),
(1, (SELECT id FROM device_meter WHERE device_id = 1), @month_this, 1450),
(2, (SELECT id FROM device_meter WHERE device_id = 2), @month_prev, 800),
(2, (SELECT id FROM device_meter WHERE device_id = 2), @month_this, 950),
(3, (SELECT id FROM device_meter WHERE device_id = 3), @month_prev, 300),
(3, (SELECT id FROM device_meter WHERE device_id = 3), @month_this, 420);

-- เครื่องเติมจำนวนมียอดด้วย ไม่งั้นรายงานตามเครื่องจะมีแถวว่างยาวเหยียดซึ่งไม่
-- เหมือนข้อมูลจริง และตารางที่กรองเฉพาะเครื่องที่มียอดจะกลับไปสั้นเหมือนเดิม
INSERT INTO print_transactions (device_id, meter_id, month, pages)
SELECT d.id, dm.id, @month_prev, 200 + (d.id * 13) FROM devices d JOIN device_meter dm ON dm.device_id = d.id WHERE d.id >= 7;

INSERT INTO print_transactions (device_id, meter_id, month, pages)
SELECT d.id, dm.id, @month_this, 250 + (d.id * 11) FROM devices d JOIN device_meter dm ON dm.device_id = d.id WHERE d.id >= 7;

-- ------------------------------------------------------------------------------
-- เครื่องที่ยอดต้องอยู่กับหน่วยงานของเดือนนั้น (#104, ADR-0014)
-- ------------------------------------------------------------------------------
-- 31: ย้ายจากฝ่ายการพยาบาล (อาคารผู้ป่วยนอก) ไปฝ่ายเภสัชกรรม (อาคารใหม่) วันแรก
--     ของเดือนนี้ — ยอดเดือนก่อนเป็นของฝ่ายเดิม ยอดเดือนนี้เป็นของฝ่ายใหม่ กรองด้วย
--     ฝ่ายเดิมต้องยังเห็นยอดเดือนก่อน ทั้งที่ทะเบียนวันนี้บอกว่าอยู่ฝ่ายใหม่แล้ว
-- 32: ประวัติซ้อนกันแบบข้อมูลเก่า — ช่วงฝ่ายเดิมไม่เคยถูกปิด แล้วมีช่วงใหม่เริ่มเดือน
--     ก่อน ช่วงที่เริ่มทีหลังต้องชนะ และยอดต้องไม่ถูกนับให้ทั้งสองฝ่าย
--
-- ทางเขียนของ API สร้างประวัติซ้อนไม่ได้ (ปิดช่วงเดิมก่อนเปิดใหม่เสมอ) เคสนี้จึงต้อง
-- มาจาก seed ไม่ใช่จากเทสที่ย้ายเครื่องผ่าน API
--
-- อยู่หลังเครื่องเติมจำนวนโดยตั้งใจ — คำสั่งของกลุ่มนั้นเลือก `id >= 7` จากตาราง
-- devices ถ้าเครื่อง 31/32 มีอยู่ก่อนจะได้ช่วงรับผิดชอบและยอดซ้ำ
INSERT INTO devices
(id, serial_number, brand_id, model, building_id, floor_id, location, division_id, department_id, contract_id, price_override, status, installation_status, service_unverified_before)
VALUES
(31, 'CI-SN-031', 1, 'Office 400', 2, 2, 'ห้องจ่ายยา', 2, 3, 1, NULL, 'active', 'installed', NULL),
(32, 'CI-SN-032', 1, 'Office 400', 2, 2, 'ห้องเก็บยา', 2, 3, 1, NULL, 'active', 'installed', NULL);

INSERT INTO device_meter (device_id, category_id)
SELECT d.id, mc.id FROM devices d CROSS JOIN meter_category mc WHERE d.id IN (31, 32) AND mc.code = 'bw';

INSERT INTO device_service_period (device_id, effective_from, effective_to, verified_by, verified_at) VALUES
(31, STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'), NULL, NULL, CURRENT_TIMESTAMP),
(32, STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'), NULL, NULL, CURRENT_TIMESTAMP);

INSERT INTO device_location_history
(device_id, building_id, floor_id, location, division_id, department_id, effective_from, effective_to)
VALUES
(31, 1, 1, 'เคาน์เตอร์ยาผู้ป่วยนอก', 1, 2,
 STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'), STR_TO_DATE(CONCAT(@month_this, '-01'), '%Y-%m-%d')),
(31, 2, 2, 'ห้องจ่ายยา', 2, 3, STR_TO_DATE(CONCAT(@month_this, '-01'), '%Y-%m-%d'), NULL),
(32, 1, 1, 'เคาน์เตอร์ยาผู้ป่วยนอก', 1, 2, STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'), NULL),
(32, 2, 2, 'ห้องเก็บยา', 2, 3, STR_TO_DATE(CONCAT(@month_prev, '-01'), '%Y-%m-%d'), NULL);

INSERT INTO print_transactions (device_id, meter_id, month, pages) VALUES
(31, (SELECT id FROM device_meter WHERE device_id = 31), @month_prev, 610),
(31, (SELECT id FROM device_meter WHERE device_id = 31), @month_this, 340),
(32, (SELECT id FROM device_meter WHERE device_id = 32), @month_prev, 500),
(32, (SELECT id FROM device_meter WHERE device_id = 32), @month_this, 270);

-- ------------------------------------------------------------------------------
-- ช่วงการคิดเงินของแต่ละเครื่อง (ADR-0019) — ตัวที่บอกว่าเดือนไหนใช้ราคาของสัญญาไหน
-- ------------------------------------------------------------------------------
-- สร้างให้ทุกเครื่องที่ผูกสัญญา ครอบคลุมช่วงของสัญญาฉบับนั้น เหมือนกับที่ระบบสร้าง
-- ให้ตอนผู้ดูแลกดยืนยันช่วงที่สัญญามีผล
--
-- เครื่องที่ 30 อยู่สัญญาฉบับที่ยังไม่ยืนยัน มีช่วงการคิดเงินก็จริง แต่หาราคาไม่ได้
-- เพราะสัญญายังไม่ถูกรับรอง — ต่างจาก "ไม่มีช่วงเลย" ซึ่งแปลว่าไม่รู้ว่าอยู่สัญญาไหน
INSERT INTO device_contract_history
(device_id, contract_id, price_override, effective_from, effective_to, note)
SELECT
  d.id,
  d.contract_id,
  d.price_override,
  STR_TO_DATE(CONCAT(@fy_start_month, '-01'), '%Y-%m-%d'),
  LAST_DAY(STR_TO_DATE(CONCAT(@fy_end_month, '-01'), '%Y-%m-%d')),
  'ช่วงตั้งต้นของชุดทดสอบ'
FROM devices d
WHERE d.contract_id IS NOT NULL;
