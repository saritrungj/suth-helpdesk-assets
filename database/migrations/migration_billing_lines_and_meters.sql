-- ==============================================================================
-- รายการราคา มิเตอร์ อายุสัญญา และยอดเงินที่ตรงใบแจ้งหนี้
-- ==============================================================================
-- ที่มา: ADR-0021, ADR-0022, ADR-0023 และ issue #128
--
-- ## ปัญหาที่แก้
--
-- ใบแจ้งหนี้จริงของสัญญา SUTH192/2568 ขัดกับแบบจำลองเดิมทุกข้อ
--
--   - ราคาต่อหน้า 0.365 บาท แต่คอลัมน์ราคาเก็บสองตำแหน่ง จึงกลายเป็น 0.37 เงียบๆ
--   - สัญญาเดียวมีหลายราคาตามหมวด (A4 เลเซอร์ A4 มัลติฟังก์ชัน A3 ขาวดำ A3 สี)
--     และเครื่อง A3 สีมีมิเตอร์ขาวดำกับมิเตอร์สีแยกกัน ส่วนเดิมมีราคาเดียวต่อสัญญา
--     และยอดเดียวต่อเครื่องต่อเดือน
--   - สัญญามี 36 งวดครอบหลายปีงบ ส่วนเดิมผูกสัญญากับปีงบเดียว
--   - ใบแจ้งหนี้ปัดเงินทีละรายการราคาต่องวด ส่วนเดิมปัดทีละเครื่อง ยอดจึงต่างกัน
--     ไม่กี่สตางค์ทุกงวด
--   - ราคาของสัญญามีผลเฉพาะหลังมีคนกด "ยืนยัน" ซึ่งทำให้หน้าภาพรวมขึ้น "รอราคา"
--
-- ## สิ่งที่ migration นี้ทำ
--
--   1. หมวดมิเตอร์ และรายการราคาของสัญญา — ราคาเดิมของสัญญาย้ายไปเป็นรายการราคา
--      หมวด "ขาวดำ" ราคาเดิมทุกสตางค์
--   2. อายุสัญญาเป็นข้อมูลบังคับ — สัญญาที่ยังไม่มีช่วงได้ช่วง 1 ต.ค.–30 ก.ย. ของ
--      ปีงบที่ผูกอยู่ (ค่าที่หน้ายืนยันราคาเดิมเสนอให้อยู่แล้ว) แล้วถอดการผูกปีงบ
--      และคอลัมน์การยืนยันราคาออก
--   3. ราคาเก็บสี่ตำแหน่งทุกคอลัมน์
--   4. มิเตอร์ของเครื่อง — ทุกเครื่องได้มิเตอร์ขาวดำหนึ่งตัว ยอดพิมพ์เดิมทุกแถว
--      ย้ายไปผูกกับมิเตอร์นั้น และเก็บเลขมิเตอร์ต้นงวด/สิ้นงวดได้
--   5. เครื่องที่ผูกสัญญาแต่ไม่มีประวัติการคิดเงินเลย ได้ช่วงการคิดเงินตั้งแต่วันเริ่ม
--      ของสัญญานั้น และเครื่องที่ประวัติแรกเริ่มหลังวันเริ่มสัญญาแต่มียอดก่อนหน้านั้น
--      ได้ช่วงที่ขาดเติมจนถึงวันก่อนประวัติแรก (ADR-0021: ราคาของสัญญามีผลตลอดอายุสัญญา)
--   6. view คิดเงินระดับรายการราคาต่องวด แล้วกระจายเศษสตางค์ลงมิเตอร์ (ADR-0022)
--      และ view ยอดตามใบแจ้งหนี้รายสัญญา รวมค่าเช่าคงที่และ VAT ของสัญญาที่มี
--
-- จำนวนหน้าดิบไม่ถูกแตะเลย
--
-- ## ⚠️ หยุดก่อนเริ่มถ้าอายุสัญญาเดิมเดาไม่ได้
--
-- ขั้นที่ 0 ตรวจก่อนแตะอะไร แล้วหยุดทั้งไฟล์ถ้าพบสัญญาที่
--
--   - มีวันเริ่มแต่ไม่มีวันสิ้นสุด (หรือกลับกัน) — แบบเดิมถือว่าช่วงที่ขาดคือ "ไม่มีกำหนด"
--     ถ้าเติมด้วยขอบปีงบ สัญญาจะถูกตัดสั้นลงเงียบๆ แล้วยอดหลังจากนั้นหาราคาไม่ได้
--   - ไม่มีทั้งช่วงที่มีผลและปีงบ — ระบบไม่มีทางรู้อายุสัญญา
--
-- ให้กรอกวันเริ่มและวันสิ้นสุดของสัญญาเหล่านั้นตามเอกสารสัญญาก่อน แล้วรันใหม่
-- — ดู docs/how-to/run-migrations.md
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. หยุดก่อนแตะข้อมูลถ้าอายุสัญญาเดิมเดาไม่ได้ (SIGNAL ใช้ได้เฉพาะใน procedure)
-- ------------------------------------------------------------------------------
DELIMITER $$

DROP PROCEDURE IF EXISTS billing_lines_precheck$$

CREATE PROCEDURE billing_lines_precheck()
BEGIN
  DECLARE open_ended INT DEFAULT 0;
  DECLARE unknown_term INT DEFAULT 0;

  SELECT COUNT(*) INTO open_ended FROM contracts
  WHERE (effective_from IS NULL) <> (effective_to IS NULL);

  SELECT COUNT(*) INTO unknown_term FROM contracts
  WHERE (effective_from IS NULL OR effective_to IS NULL) AND fiscal_year_id IS NULL;

  IF open_ended > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'พบสัญญาที่มีวันเริ่มหรือวันสิ้นสุดเพียงค่าเดียว — กรอกทั้งสองค่าตามเอกสารสัญญาก่อน แล้วรัน migration นี้ใหม่';
  END IF;
  IF unknown_term > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'พบสัญญาที่ไม่มีทั้งช่วงที่มีผลและปีงบ — กรอกวันเริ่มและวันสิ้นสุดก่อน แล้วรัน migration นี้ใหม่';
  END IF;
END$$

DELIMITER ;

CALL billing_lines_precheck();
DROP PROCEDURE billing_lines_precheck;

-- ------------------------------------------------------------------------------
-- 1. หมวดมิเตอร์ และรายการราคาของสัญญา
-- ------------------------------------------------------------------------------
CREATE TABLE meter_category (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_color TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO meter_category (code, name, is_color, sort_order) VALUES
    ('bw', 'ขาวดำ', 0, 10),
    ('a4-laser-bw', 'A4 เลเซอร์ ขาวดำ', 0, 20),
    ('a4-mfp-bw', 'A4 มัลติฟังก์ชัน ขาวดำ', 0, 30),
    ('a3-bw', 'A3 ขาวดำ', 0, 40),
    ('a3-color', 'A3 สี', 1, 50);

CREATE TABLE contract_price_line (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contract_id INT NOT NULL,
    category_id INT NOT NULL,
    price_per_page DECIMAL(10,4) NOT NULL,

    CONSTRAINT fk_price_line_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
    CONSTRAINT fk_price_line_category FOREIGN KEY (category_id) REFERENCES meter_category(id),
    UNIQUE KEY uq_contract_category (contract_id, category_id),
    CONSTRAINT chk_price_line_price CHECK (price_per_page >= 0)
);

INSERT INTO contract_price_line (contract_id, category_id, price_per_page)
SELECT c.id, mc.id, c.price_per_page
FROM contracts c
JOIN meter_category mc ON mc.code = 'bw'
WHERE c.price_per_page IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. อายุสัญญาเป็นข้อมูลบังคับ และถอดการผูกปีงบกับการยืนยันราคา
-- ------------------------------------------------------------------------------
UPDATE contracts c
JOIN fiscal_year fy ON fy.id = c.fiscal_year_id
SET c.effective_from = COALESCE(c.effective_from, STR_TO_DATE(CONCAT(fy.start_month, '-01'), '%Y-%m-%d')),
    c.effective_to = COALESCE(c.effective_to, LAST_DAY(STR_TO_DATE(CONCAT(fy.end_month, '-01'), '%Y-%m-%d')))
WHERE c.effective_from IS NULL OR c.effective_to IS NULL;

-- foreign key ของ schema.sql ไม่มีชื่อ (ได้ชื่ออัตโนมัติ) ส่วนของ migration รุ่นก่อน
-- ตั้งชื่อไว้ จึงหาชื่อจริงจาก information_schema แทนการเดา
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contracts'
              AND COLUMN_NAME = 'fiscal_year_id' AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1);
SET @sql := IF(@fk IS NULL, 'DO 0', CONCAT('ALTER TABLE contracts DROP FOREIGN KEY `', @fk, '`'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contracts'
              AND COLUMN_NAME = 'price_verified_by' AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1);
SET @sql := IF(@fk IS NULL, 'DO 0', CONCAT('ALTER TABLE contracts DROP FOREIGN KEY `', @fk, '`'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE contracts
    DROP CONSTRAINT chk_contracts_effective_order,
    DROP COLUMN fiscal_year_id,
    DROP COLUMN price_per_page,
    DROP COLUMN price_source,
    DROP COLUMN price_verified_by,
    DROP COLUMN price_verified_at,
    MODIFY effective_from DATE NOT NULL,
    MODIFY effective_to DATE NOT NULL,
    ADD COLUMN monthly_rental DECIMAL(12,2) NULL,
    ADD COLUMN vat_rate DECIMAL(5,2) NULL,
    ADD CONSTRAINT chk_contracts_term_order CHECK (effective_to >= effective_from),
    ADD CONSTRAINT chk_contracts_rental CHECK (monthly_rental IS NULL OR monthly_rental >= 0),
    ADD CONSTRAINT chk_contracts_vat CHECK (vat_rate IS NULL OR vat_rate BETWEEN 0 AND 100);

-- ------------------------------------------------------------------------------
-- 3. ราคาเก็บสี่ตำแหน่ง
-- ------------------------------------------------------------------------------
ALTER TABLE devices MODIFY price_override DECIMAL(10,4) DEFAULT NULL;
ALTER TABLE device_contract_history MODIFY price_override DECIMAL(10,4) NULL;

-- ------------------------------------------------------------------------------
-- 4. มิเตอร์ของเครื่อง และยอดพิมพ์รายมิเตอร์
-- ------------------------------------------------------------------------------
CREATE TABLE device_meter (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    category_id INT NOT NULL,

    CONSTRAINT fk_device_meter_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    CONSTRAINT fk_device_meter_category FOREIGN KEY (category_id) REFERENCES meter_category(id),
    UNIQUE KEY uq_device_category (device_id, category_id)
);

INSERT INTO device_meter (device_id, category_id)
SELECT d.id, mc.id
FROM devices d
JOIN meter_category mc ON mc.code = 'bw';

ALTER TABLE print_transactions
    ADD COLUMN meter_id INT NULL AFTER device_id,
    ADD COLUMN meter_start INT UNSIGNED NULL AFTER month,
    ADD COLUMN meter_end INT UNSIGNED NULL AFTER meter_start,
    -- index ของ device_id ต้องมาก่อนถอด uq_device_month เพราะ foreign key ของ
    -- device_id ใช้คีย์นั้นอยู่ ถอดก่อนจะถูกปฏิเสธ
    ADD KEY idx_print_transactions_device (device_id);

UPDATE print_transactions pt
JOIN device_meter dm ON dm.device_id = pt.device_id
SET pt.meter_id = dm.id;

ALTER TABLE print_transactions
    MODIFY meter_id INT NOT NULL,
    ADD CONSTRAINT fk_print_transactions_meter FOREIGN KEY (meter_id) REFERENCES device_meter(id),
    ADD UNIQUE KEY uq_meter_month (meter_id, month),
    DROP INDEX uq_device_month,
    ADD CONSTRAINT chk_print_transactions_meter_order CHECK (
        meter_start IS NULL OR meter_end IS NULL OR meter_end >= meter_start
    );

-- ------------------------------------------------------------------------------
-- 5. ช่วงการคิดเงินของเครื่องที่ผูกสัญญา แต่ไม่มีประวัติ หรือประวัติเริ่มหลังยอดแรก
-- ------------------------------------------------------------------------------
INSERT INTO device_contract_history (device_id, contract_id, price_override, effective_from, effective_to, note)
SELECT d.id, d.contract_id, d.price_override, c.effective_from, NULL, 'ตั้งต้นจากอายุสัญญา (ADR-0021)'
FROM devices d
JOIN contracts c ON c.id = d.contract_id
WHERE NOT EXISTS (SELECT 1 FROM device_contract_history h WHERE h.device_id = d.id);

-- เครื่องที่มีประวัติแล้ว แต่ประวัติแรกเริ่มหลังวันเริ่มสัญญาปัจจุบัน และมียอดของเดือนก่อนหน้านั้น
-- (เช่น ขึ้นทะเบียน 15 มี.ค. แต่มียอด ต.ค.–ก.พ.) — แบบเดิมการกดยืนยันราคาเติมช่วงนี้ให้
-- เมื่อขั้นยืนยันถูกถอด ถ้าไม่เติมที่นี่ ยอดเดือนเหล่านั้นจะหาราคาไม่ได้ถาวร
INSERT INTO device_contract_history (device_id, contract_id, price_override, effective_from, effective_to, note)
SELECT d.id, d.contract_id, d.price_override, c.effective_from,
       DATE_SUB(first_period.first_from, INTERVAL 1 DAY), 'เติมช่วงก่อนประวัติแรกจากอายุสัญญา (ADR-0021)'
FROM devices d
JOIN contracts c ON c.id = d.contract_id
JOIN (
    SELECT device_id, MIN(effective_from) AS first_from
    FROM device_contract_history
    GROUP BY device_id
) first_period ON first_period.device_id = d.id
WHERE first_period.first_from > c.effective_from
  AND EXISTS (
      SELECT 1 FROM print_transactions pt
      WHERE pt.device_id = d.id
        AND pt.month >= DATE_FORMAT(c.effective_from, '%Y-%m')
        AND pt.month < DATE_FORMAT(first_period.first_from, '%Y-%m')
  );

-- ------------------------------------------------------------------------------
-- 6. view
-- ------------------------------------------------------------------------------
-- นิยามเดียวกับ database/schema.sql ทุกตัวอักษร เหตุผลของแต่ละขั้นอยู่ที่นั่น
CREATE OR REPLACE VIEW v_monthly_kpi AS
SELECT
    p.reading_id,
    p.device_id,
    p.serial_number,
    p.device_status,
    p.meter_id,
    p.meter_category_id,
    p.meter_category,
    p.is_color,
    p.month,
    p.meter_start,
    p.meter_end,
    p.pages_printed,
    p.net_pages,
    p.billing_contract_id,
    p.price_per_page,
    CASE
        WHEN p.price_per_page IS NULL THEN NULL
        ELSE CAST((
            p.cents_floor
            + CASE
                WHEN ROW_NUMBER() OVER (
                    PARTITION BY p.month, p.billing_contract_key, p.meter_category_id, p.price_per_page
                    ORDER BY p.cents_remainder DESC, p.meter_id
                ) <= ROUND(SUM(p.exact_cost) OVER (
                        PARTITION BY p.month, p.billing_contract_key, p.meter_category_id, p.price_per_page
                     ), 2) * 100
                     - SUM(p.cents_floor) OVER (
                        PARTITION BY p.month, p.billing_contract_key, p.meter_category_id, p.price_per_page
                     )
                THEN 1 ELSE 0
              END
        ) / 100 AS DECIMAL(14,2))
    END AS total_cost
FROM (
    SELECT
        b.*,
        b.net_pages * b.price_per_page AS exact_cost,
        FLOOR(b.net_pages * b.price_per_page * 100) AS cents_floor,
        b.net_pages * b.price_per_page * 100 - FLOOR(b.net_pages * b.price_per_page * 100) AS cents_remainder
    FROM (
        SELECT
            pt.id AS reading_id,
            pt.device_id,
            d.serial_number,
            d.status AS device_status,
            pt.meter_id,
            dm.category_id AS meter_category_id,
            mc.name AS meter_category,
            mc.is_color,
            pt.month,
            pt.meter_start,
            pt.meter_end,
            pt.pages AS pages_printed,
            (pt.pages * 0.98) AS net_pages,
            dch.contract_id AS billing_contract_id,
            COALESCE(dch.contract_id, 0) AS billing_contract_key,
            CASE
                WHEN dch.price_override IS NOT NULL AND mc.is_color = 0 THEN dch.price_override
                -- งวดนับเป็นเดือนที่งวดสิ้นสุด (ADR-0023) สัญญาที่เริ่มกลางเดือนจึงเริ่มคิดเงินเดือนถัดไป
                -- เช่น เริ่ม 24 ก.พ. งวดแรกคือ 24 ก.พ.–23 มี.ค. = เดือน มี.ค.
                WHEN c.id IS NOT NULL
                     AND pt.month >= DATE_FORMAT(c.effective_from + INTERVAL (DAY(c.effective_from) > 1) MONTH, '%Y-%m')
                     AND pt.month <= DATE_FORMAT(c.effective_to, '%Y-%m')
                THEN cpl.price_per_page
                ELSE NULL
            END AS price_per_page
        FROM print_transactions pt
        JOIN devices d ON d.id = pt.device_id
        JOIN device_meter dm ON dm.id = pt.meter_id
        JOIN meter_category mc ON mc.id = dm.category_id
        LEFT JOIN device_contract_history dch
        ON dch.id = (
            SELECT h.id
            FROM device_contract_history h
            WHERE h.device_id = pt.device_id
              AND pt.month >= DATE_FORMAT(h.effective_from, '%Y-%m')
              AND (h.effective_to IS NULL OR pt.month <= DATE_FORMAT(h.effective_to, '%Y-%m'))
            ORDER BY h.effective_from DESC, h.id DESC
            LIMIT 1
        )
        LEFT JOIN contracts c ON c.id = dch.contract_id
        LEFT JOIN contract_price_line cpl ON cpl.contract_id = c.id AND cpl.category_id = dm.category_id
    ) b
) p;

CREATE OR REPLACE VIEW v_compare_usage_costs AS
SELECT
    v.month,
    fy.year AS fiscal_year,
    v.serial_number,
    v.device_status,
    b.name AS building_name,
    f.name AS floor_name,
    divi.name AS division_name,
    dept.name AS department_name,
    br.name AS brand_name,
    v.net_pages,
    v.price_per_page AS cost_per_page,
    v.total_cost
FROM v_monthly_kpi v
JOIN devices d ON v.device_id = d.id
LEFT JOIN fiscal_year fy ON v.month BETWEEN fy.start_month AND fy.end_month
LEFT JOIN building b ON d.building_id = b.id
LEFT JOIN floor f ON d.floor_id = f.id
LEFT JOIN division divi ON d.division_id = divi.id
LEFT JOIN department dept ON d.department_id = dept.id
LEFT JOIN brand br ON d.brand_id = br.id;

-- ยอดตามใบแจ้งหนี้รายสัญญารายงวด (ADR-0023 ส่วนค่าเช่าและ VAT)
-- สัญญาที่มีค่าเช่าคงที่มีแถวทุกเดือนในอายุสัญญา แม้เดือนนั้นไม่มียอดพิมพ์
CREATE OR REPLACE VIEW v_contract_invoice AS
WITH RECURSIVE contract_months AS (
    SELECT id AS contract_id,
           -- งวดแรกคือเดือนที่งวดแรกสิ้นสุด — สัญญาที่เริ่มกลางเดือนเริ่มเก็บค่าเช่าเดือนถัดไป
           STR_TO_DATE(DATE_FORMAT(effective_from + INTERVAL (DAY(effective_from) > 1) MONTH, '%Y-%m-01'), '%Y-%m-%d') AS month_date,
           effective_to
    FROM contracts
    WHERE COALESCE(monthly_rental, 0) > 0
    UNION ALL
    SELECT contract_id, DATE_ADD(month_date, INTERVAL 1 MONTH), effective_to
    FROM contract_months
    WHERE DATE_ADD(month_date, INTERVAL 1 MONTH) <= effective_to
),
usage_totals AS (
    SELECT billing_contract_id AS contract_id, month,
           COALESCE(SUM(total_cost), 0) AS print_cost,
           SUM(total_cost IS NULL) AS unpriced_readings
    FROM v_monthly_kpi
    WHERE billing_contract_id IS NOT NULL
    GROUP BY billing_contract_id, month
),
invoice_months AS (
    SELECT contract_id, month FROM usage_totals
    UNION
    SELECT contract_id, DATE_FORMAT(month_date, '%Y-%m') AS month FROM contract_months
)
SELECT im.contract_id, im.month,
       COALESCE(u.print_cost, 0) AS print_cost,
       COALESCE(c.monthly_rental, 0) AS rental,
       COALESCE(u.print_cost, 0) + COALESCE(c.monthly_rental, 0) AS subtotal,
       ROUND((COALESCE(u.print_cost, 0) + COALESCE(c.monthly_rental, 0)) * COALESCE(c.vat_rate, 0) / 100, 2) AS vat,
       COALESCE(u.print_cost, 0) + COALESCE(c.monthly_rental, 0)
         + ROUND((COALESCE(u.print_cost, 0) + COALESCE(c.monthly_rental, 0)) * COALESCE(c.vat_rate, 0) / 100, 2) AS invoice_total,
       COALESCE(u.unpriced_readings, 0) AS unpriced_readings
FROM invoice_months im
JOIN contracts c ON c.id = im.contract_id
LEFT JOIN usage_totals u ON u.contract_id = im.contract_id AND u.month = im.month;
