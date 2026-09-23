-- ==============================================================================
-- Hospital IT Asset Management Database Schema
-- ==============================================================================

-- ข้อความไทยในไฟล์นี้เป็น UTF-8 — บอก server ตรงๆ ไม่พึ่ง charset ของ client ที่โหลดไฟล์
-- client ของ image MySQL และ mysql บน Windows ใช้ latin1/cp874 เป็นค่าเริ่มต้น ถ้าไม่มีบรรทัดนี้
-- ชื่อไทยจะถูกเข้ารหัสซ้อนลงฐานโดยไม่ error (พบจริงตอนย้ายฐานบน Docker ไป MySQL 8.4, #130)
SET NAMES utf8mb4;

-- ------------------------------------------------------------------------------
-- 1. Master Data (Lookup Tables)
-- ------------------------------------------------------------------------------

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin','staff','viewer') DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fiscal_year (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year VARCHAR(10) NOT NULL UNIQUE,
    -- ช่วงเดือน "YYYY-MM" ที่ปีงบนี้ครอบคลุมจริง (ต.ค.-ก.ย. ตามปีงบราชการไทย)
    -- คำนวณและเก็บไว้ตอนสร้าง/แก้ไขปีงบ ดู backend/utils/fiscalYear.js
    start_month CHAR(7) NOT NULL,
    end_month CHAR(7) NOT NULL,
    status ENUM('active','inactive') DEFAULT 'active',

    -- ช่วงเดือนเก็บเป็น ค.ศ. เท่านั้น (ปี 1900-2399) ดู backend/utils/month.js
    -- และ database/migrations/migration_normalize_month_to_ce.sql
    CONSTRAINT chk_fiscal_year_start_month_ce CHECK (
        start_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'
        AND CAST(SUBSTRING(start_month, 1, 4) AS UNSIGNED) BETWEEN 1900 AND 2399
    ),
    CONSTRAINT chk_fiscal_year_end_month_ce CHECK (
        end_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'
        AND CAST(SUBSTRING(end_month, 1, 4) AS UNSIGNED) BETWEEN 1900 AND 2399
    )
);

CREATE TABLE brand (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    status ENUM('active','inactive') DEFAULT 'active'
);

CREATE TABLE building (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    status ENUM('active','inactive') DEFAULT 'active'
);

CREATE TABLE floor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    building_id INT,
    name VARCHAR(50) NOT NULL,
    status ENUM('active','inactive') DEFAULT 'active',
    FOREIGN KEY (building_id) REFERENCES building(id)
);

CREATE TABLE division (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    status ENUM('active','inactive') DEFAULT 'active'
);

CREATE TABLE department (
    id INT AUTO_INCREMENT PRIMARY KEY,
    division_id INT,
    name VARCHAR(255) NOT NULL,
    status ENUM('active','inactive') DEFAULT 'active',
    FOREIGN KEY (division_id) REFERENCES division(id)
);

-- ชื่อเรียกอื่นของข้อมูลหลัก (ADR-0025) — ชื่อที่ไฟล์ต่างชุดใช้เรียกยี่ห้อ อาคาร หรือฝ่าย
-- ตัวเดียวกัน ชื่อหนึ่งชี้ได้รายการเดียว การห้ามชนชื่อหลักอยู่ใน API (master-data/routes.js)
CREATE TABLE brand_alias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand_id INT NOT NULL,
    alias VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_brand_alias (alias),
    CONSTRAINT fk_brand_alias_brand FOREIGN KEY (brand_id) REFERENCES brand(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE building_alias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    building_id INT NOT NULL,
    alias VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_building_alias (alias),
    CONSTRAINT fk_building_alias_building FOREIGN KEY (building_id) REFERENCES building(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE division_alias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    division_id INT NOT NULL,
    alias VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_division_alias (alias),
    CONSTRAINT fk_division_alias_division FOREIGN KEY (division_id) REFERENCES division(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Main Tables
-- ------------------------------------------------------------------------------

-- สัญญาเช่าเครื่อง (ADR-0023) — เลขที่สัญญาไม่ซ้ำ และมีอายุสัญญาของตัวเอง
--
-- อายุสัญญา (effective_from–effective_to) คร่อมได้หลายปีงบ เช่น 36 งวดครอบปีงบ
-- 2569–2572 ปีงบที่สัญญาเกี่ยวข้องคำนวณจากช่วงนี้ ไม่ได้ผูกแยก ราคาอยู่ใน
-- contract_price_line และมีผลทันทีที่บันทึกตลอดอายุสัญญา (ADR-0021)
CREATE TABLE contracts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contract_no VARCHAR(100) NOT NULL UNIQUE,
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,

    -- ค่าเช่าคงที่ต่อเดือนและอัตรา VAT (%) — มีเฉพาะสัญญาที่ใบแจ้งหนี้เรียกเก็บ
    -- NULL = สัญญานี้ไม่มีรายการนั้น ดู v_contract_invoice
    monthly_rental DECIMAL(12,2) NULL,
    vat_rate DECIMAL(5,2) NULL,

    CONSTRAINT chk_contracts_term_order CHECK (effective_to >= effective_from),
    CONSTRAINT chk_contracts_rental CHECK (monthly_rental IS NULL OR monthly_rental >= 0),
    CONSTRAINT chk_contracts_vat CHECK (vat_rate IS NULL OR vat_rate BETWEEN 0 AND 100)
);

-- หมวดมิเตอร์ — ใบแจ้งหนี้คิดเงินและปัดเศษแยกทีละหมวด แม้สองหมวดราคาเท่ากัน
-- (ADR-0022) "ขาวดำ" คือหมวดทั่วไปของข้อมูลที่ย้ายมาจากรุ่นที่มีราคาเดียวต่อสัญญา
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

-- รายการราคาของสัญญา — ราคาต่อหน้าของหมวดมิเตอร์หนึ่งในสัญญาหนึ่ง
-- ⚠️ DECIMAL(10,4) ห้ามลดลง ราคาจริงคือ 0.365 บาท เก็บสองตำแหน่งจะกลายเป็น 0.37
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

CREATE TABLE devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(100) NOT NULL UNIQUE,
    brand_id INT,
    model VARCHAR(100),
    building_id INT,
    floor_id INT,
    location VARCHAR(255) DEFAULT NULL,
    division_id INT,
    department_id INT,
    contract_id INT,
    price_override DECIMAL(10,4) DEFAULT NULL,
    status ENUM('active','repair','retired') DEFAULT 'active',

    -- สถานะการติดตั้ง แยกจากสถานะการใช้งานด้านบน เพราะตอบคนละคำถาม (ADR-0018)
    --   status               ใช้งานอยู่ / ซ่อม / ปลดระวาง
    --   installation_status  ติดตั้งแล้ว / ยังไม่ได้ติดตั้ง
    --
    -- ⚠️ NULL = "ยังไม่ตรวจยืนยัน" ไม่ใช่ "ยังไม่ได้ติดตั้ง" และต้องไม่มี DEFAULT
    -- เครื่องที่ย้ายมาจากข้อมูลเดิมยังไม่มีใครตรวจ ระบบจึงยังไม่รู้คำตอบ การตั้ง
    -- DEFAULT เป็นค่าใดค่าหนึ่งคือการเดาแทนผู้ดูแล ซึ่ง Q14/Q19/Q21 ห้ามไว้ และ
    -- จะทำให้ความครบถ้วนของยอดผิดไปเงียบๆ ทั้งปี
    installation_status ENUM('installed','not_installed') DEFAULT NULL,

    -- เส้นแบ่งระหว่าง "รู้ว่าไม่ต้องกรอก" กับ "ไม่รู้ว่าต้องกรอกหรือเปล่า"
    --
    --   NULL   = ยืนยันครบทุกช่วงเวลา — เดือนที่ไม่มีช่วงความรับผิดชอบครอบคลุม
    --            แปลว่า "รู้แล้วว่าเครื่องนี้ไม่ต้องกรอกเดือนนั้น"
    --   วันที่ = ก่อนวันนี้ยังยืนยันไม่ได้ ระบบรายงานเดือนก่อนหน้าว่า "ยังยืนยันไม่ได้"
    --            ไม่ใช่ "ไม่ต้องกรอก" (ADR-0018 Q21)
    --
    -- ทำไมต้องมีคอลัมน์นี้แยกจาก device_service_period: ผู้ดูแลที่เดินไปดูเครื่อง
    -- ตอบได้ทันทีว่า "ตอนนี้ติดตั้งอยู่" แต่ตอบว่า "เริ่มเมื่อไหร่" ได้ต่อเมื่อมี
    -- เอกสาร ถ้าเก็บแค่ช่วง เดือนย้อนหลังจะไม่มีช่วงครอบคลุมแล้วถูกนับเป็น
    -- "ไม่ต้องกรอก" ซึ่งเป็นการสรุปแทนการบอกว่าไม่รู้
    --
    -- ค่าเริ่มต้นเป็น NULL เพราะเครื่องที่บันทึกผ่านระบบมีข้อมูลครบตั้งแต่แรกอยู่แล้ว
    -- เฉพาะเครื่องเดิมที่ตรวจได้แค่ปัจจุบันเท่านั้นที่ต้องใส่วันที่
    service_unverified_before DATE DEFAULT NULL,

    FOREIGN KEY (brand_id) REFERENCES brand(id),
    FOREIGN KEY (building_id) REFERENCES building(id),
    FOREIGN KEY (floor_id) REFERENCES floor(id),
    FOREIGN KEY (division_id) REFERENCES division(id),
    FOREIGN KEY (department_id) REFERENCES department(id),
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
);

-- มิเตอร์ของเครื่อง (ADR-0023) — เครื่องหนึ่งมีได้หลายมิเตอร์ เช่นเครื่อง A3 สีมีมิเตอร์
-- ขาวดำกับมิเตอร์สี ราคาของมิเตอร์ในงวดหนึ่งคือรายการราคาหมวดเดียวกันของสัญญาที่
-- คิดเงินเครื่องนั้นในงวดนั้น (device_contract_history)
CREATE TABLE device_meter (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    category_id INT NOT NULL,

    CONSTRAINT fk_device_meter_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    CONSTRAINT fk_device_meter_category FOREIGN KEY (category_id) REFERENCES meter_category(id),
    UNIQUE KEY uq_device_category (device_id, category_id)
);

-- ยอดพิมพ์ของมิเตอร์หนึ่งในงวดหนึ่ง
--
-- UNIQUE KEY (meter_id, month) คือคีย์ที่ INSERT ... ON DUPLICATE KEY UPDATE ทุกจุด
-- พึ่งอยู่ ถ้าไม่มี การกดบันทึกซ้ำในเดือนเดิมจะเพิ่มแถวใหม่และยอดถูกนับสองรอบ
--
-- device_id เก็บซ้ำกับของมิเตอร์ไว้ให้รายงานที่นับตามเครื่องไม่ต้อง join เพิ่ม
-- ทุกทางเขียนต้องใส่ให้ตรงกับ device_meter.device_id
--
-- meter_start / meter_end คือเลขมิเตอร์ต้นงวด/สิ้นงวดจากไฟล์ผู้ให้เช่า เก็บไว้ให้
-- ตรวจที่มาของ pages ได้ (pages = meter_end - meter_start) ยอดที่กรอกมือไม่มีค่าเหล่านี้
CREATE TABLE print_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT,
    meter_id INT NOT NULL,
    month VARCHAR(7) NOT NULL,
    meter_start INT UNSIGNED NULL,
    meter_end INT UNSIGNED NULL,
    pages INT DEFAULT 0,

    FOREIGN KEY (device_id) REFERENCES devices(id),
    CONSTRAINT fk_print_transactions_meter FOREIGN KEY (meter_id) REFERENCES device_meter(id),
    UNIQUE KEY uq_meter_month (meter_id, month),
    KEY idx_print_transactions_device (device_id),

    -- คิวรี่ที่กรองด้วยช่วงเดือนอย่างเดียว (รูปแบบของแทบทุกรายงาน) ใช้คีย์ข้างบน
    -- ไม่ได้ ตารางนี้โตขึ้นทุกเดือนแบบไม่มีเพดาน
    KEY idx_print_transactions_month (month),

    -- เดือนเก็บเป็น ค.ศ. "YYYY-MM" เท่านั้น — รับ พ.ศ. เข้ามาได้ แต่ normalize ตั้งแต่ขาเข้า
    -- ถ้าปล่อยให้เก็บทั้ง "2568-10" และ "2025-10" ปนกัน UNIQUE KEY ด้านบนจะกันยอดซ้ำ
    -- ของเดือนเดียวกันไม่ได้ และค่าใช้จ่ายจะถูกนับสองรอบ
    CONSTRAINT chk_print_transactions_month_ce CHECK (
        month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'
        AND CAST(SUBSTRING(month, 1, 4) AS UNSIGNED) BETWEEN 1900 AND 2399
    ),
    CONSTRAINT chk_print_transactions_meter_order CHECK (
        meter_start IS NULL OR meter_end IS NULL OR meter_end >= meter_start
    )
);

-- ประวัติการย้ายเครื่อง (อาคาร/ชั้น/ฝ่าย/แผนก) — ดูรายละเอียดเหตุผลที่
-- database/migrations/migration_add_device_location_history.sql (เดิมคีย์นี้อยู่แยกไว้ในไฟล์ migration นั้น
-- ตอนนี้รวมเข้ามาไว้ใน schema หลักเช่นเดียวกับ print_transactions ด้านบน เพื่อให้ setup ฐานข้อมูลใหม่ได้ครบในครั้งเดียว)
-- effective_to = NULL คือช่วงปัจจุบันที่เครื่องยังสังกัดอยู่
CREATE TABLE device_location_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,

    building_id INT NULL,
    floor_id INT NULL,
    location VARCHAR(255) NULL,
    division_id INT NULL,
    department_id INT NULL,

    effective_from DATE NOT NULL,
    effective_to DATE NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (building_id) REFERENCES building(id),
    FOREIGN KEY (floor_id) REFERENCES floor(id),
    FOREIGN KEY (division_id) REFERENCES division(id),
    FOREIGN KEY (department_id) REFERENCES department(id),

    INDEX idx_device_effective (device_id, effective_from, effective_to)
);

-- ช่วงเวลาที่เครื่อง "ติดตั้งแล้วและใช้งานอยู่" จึงต้องบันทึกยอดพิมพ์ของเดือนนั้น
-- (ADR-0018 ข้อ Q15 และ Q17) — ตารางนี้คือตัวส่วนของความครบถ้วนรายเดือน
--
-- ทำไมต้องเป็นตาราง ไม่ใช่คอลัมน์ installed_at/removed_at สองช่อง: เครื่องถูกถอด
-- ไปซ่อมแล้วนำกลับมาติดตั้งใหม่ได้หลายรอบ สองช่องเก็บได้แค่รอบล่าสุดแล้วประวัติ
-- รอบก่อนหายไป ทำให้เดือนเก่าที่เคยต้องกรอกกลายเป็นไม่ต้องกรอกย้อนหลัง ซึ่งคือ
-- บั๊กเดียวกับ issue #79 ในทิศทางกลับกัน
--
-- effective_to = NULL คือช่วงที่ยังรับผิดชอบอยู่ถึงปัจจุบัน
--
-- ⚠️ ปลายช่วงนับ "รวมเดือนนั้นด้วย" ต่างจาก device_location_history ที่ไม่รวม
-- เหตุผลอยู่ใน packages/domain/service-period.cjs — สองตารางตอบคนละคำถาม
--
-- ไม่มีการเติมข้อมูลย้อนหลังอัตโนมัติตอน migrate เครื่องเดิมทุกเครื่องเริ่มต้นที่
-- "ยังไม่ตรวจยืนยัน" จนกว่าผู้ดูแลจะยืนยันรายเครื่อง (Q14, Q21)
CREATE TABLE device_service_period (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,

    effective_from DATE NOT NULL,
    effective_to DATE NULL,

    note VARCHAR(255) NULL,

    -- ใครเป็นคนยืนยันและเมื่อไหร่ — ต้องตอบได้ว่าตัวเลขความครบถ้วนมาจากหลักฐานของใคร
    verified_by INT NULL,
    verified_at TIMESTAMP NULL DEFAULT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id),

    INDEX idx_device_service (device_id, effective_from, effective_to),

    -- ช่วงที่สิ้นสุดก่อนเริ่มคือข้อมูลที่เป็นไปไม่ได้ และจะทำให้เดือนนั้นหายไปจาก
    -- ตัวส่วนเงียบๆ แทนที่จะฟ้องตอนบันทึก
    CONSTRAINT chk_device_service_period_order CHECK (
        effective_to IS NULL OR effective_to >= effective_from
    )
);

-- ประวัติว่าเครื่องถูกคิดเงินภายใต้สัญญาฉบับไหนและราคาเฉพาะเครื่องเท่าไหร่ ในช่วงไหน
-- (ADR-0019) — มิเรอร์ของ devices.contract_id และ devices.price_override แบบเดียวกับ
-- ที่ device_location_history เป็นมิเรอร์ของคอลัมน์ที่ตั้ง
--
-- ทำไมต้องมี: devices.contract_id เป็น "ค่าปัจจุบัน" ที่ถูกใช้ตอบคำถามย้อนหลัง
-- ("เดือนมีนาคมเครื่องนี้คิดราคาเท่าไหร่") การย้ายเครื่องไปสัญญาของปีงบใหม่จึงเปลี่ยน
-- ยอดเงินของเดือนเก่าไปด้วยทันที ทั้งที่เดือนเก่าถูกคิดเงินตามสัญญาเดิมไปแล้วจริงๆ
-- (ดู issue #81 ซึ่งแก้ไม่ได้อย่างปลอดภัยถ้าไม่มีตารางนี้)
--
-- contract_id = NULL คือช่วงที่เครื่องไม่ได้ผูกสัญญา ซึ่งต่างจาก "ไม่มีข้อมูลช่วงนั้น"
-- — อย่างแรกคือรู้ว่าไม่มีสัญญา อย่างหลังคือยังไม่รู้
CREATE TABLE device_contract_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,

    contract_id INT NULL,
    price_override DECIMAL(10,4) NULL,

    effective_from DATE NOT NULL,
    effective_to DATE NULL,

    note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (contract_id) REFERENCES contracts(id),

    INDEX idx_device_contract (device_id, effective_from, effective_to),

    CONSTRAINT chk_device_contract_history_order CHECK (
        effective_to IS NULL OR effective_to >= effective_from
    )
);

-- ==============================================================================
-- Views
-- ==============================================================================
--
-- ## v_monthly_kpi — หนึ่งแถวต่อมิเตอร์ต่องวด และเป็นที่เดียวที่คิดเงิน
--
-- ราคา (ADR-0019, ADR-0021)
--   1. หา "ช่วงการคิดเงิน" ของเครื่องที่ครอบคลุมเดือนนั้น (device_contract_history)
--      ช่วงที่เริ่มทีหลังชนะเมื่อซ้อนกัน โดยมี id เป็นตัวตัดสินสุดท้าย (ADR-0014)
--   2. ช่วงนั้นมีราคาพิเศษเฉพาะเครื่องไหม ถ้ามีใช้กับมิเตอร์ขาวดำ — มิเตอร์สีใช้
--      ราคาของสัญญาเสมอ เพราะราคาพิเศษที่ตกลงกันเป็นราคาขาวดำ
--   3. ถ้าไม่มี ใช้รายการราคาหมวดเดียวกับมิเตอร์ของสัญญาที่ช่วงนั้นระบุ เฉพาะเมื่อ
--      เดือนนั้นอยู่ในอายุสัญญา ไม่งั้นเป็น NULL = หาราคาไม่ได้ (ไม่ใช่ศูนย์บาท)
--      ทางเขียนทุกทางปฏิเสธยอดที่หาราคาไม่ได้ NULL จึงเหลือเฉพาะข้อมูลเก่า
--
-- เงิน (ADR-0022) — ต้องเท่ากับใบแจ้งหนี้ของผู้ให้เช่าทุกสตางค์
--   ยอดตามใบแจ้งหนี้ของหนึ่งรายการราคาในหนึ่งงวด = ROUND(ราคา × Σ หน้าสุทธิ, 2)
--   แล้วแบ่งลงแต่ละมิเตอร์: ตัดส่วนของแต่ละแถวลงเป็นสตางค์ แล้วแจกสตางค์ที่เหลือ
--   ให้แถวที่เศษมากที่สุดก่อน (largest remainder, เศษเท่ากันใช้ meter_id)
--   ผลรวมของแถวใดๆ ในรายการราคาเดียวกันจึงเท่ายอดใบแจ้งหนี้พอดี ไม่ว่าจะรวมตาม
--   แผนก อาคาร หรือเครื่อง
--
-- ⚠️ ห้ามปัด total_cost ทีละแถวเอง และห้ามคำนวณเงินซ้ำนอก view นี้
-- ⚠️ partition ต้องมี month เสมอ ตัวกรองที่ optimizer ดันเข้าไปใน derived table
--    จึงเป็นได้แค่ตัวกรองตามคอลัมน์ของ partition ซึ่งไม่เปลี่ยนผล
-- ==============================================================================

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


CREATE OR REPLACE VIEW v_summary_by_building AS
SELECT

    b.name AS building_name,

    SUM(v.net_pages) AS total_net_pages,

    SUM(v.total_cost) AS total_building_cost,

    -- รายการที่หาราคาไม่ได้ในอาคารนี้ (ยอดเก่าก่อน ADR-0021) — ต้องแสดงคู่กับยอดเงินเสมอ
    SUM(CASE WHEN v.total_cost IS NULL THEN 1 ELSE 0 END) AS unpriced_readings

FROM v_monthly_kpi v

JOIN devices d
ON v.device_id = d.id

LEFT JOIN building b
ON d.building_id = b.id

GROUP BY b.name;


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


-- ==============================================================================
-- Prototype User
-- ==============================================================================

-- backend/routes/auth.js ใช้ bcrypt.compare(password, user.password) ตอน login
-- เดิม schema นี้ insert รหัสผ่านเป็น plaintext ทำให้ bcrypt.compare เทียบไม่ตรง
-- และ login ไม่ผ่านทุกครั้ง (แม้กรอกรหัสถูก) ด้านล่างนี้จึงเก็บเป็นค่า hash จาก bcrypt
-- (saltRounds = 10) แทน
--
-- รหัสผ่านจริงไม่เก็บไว้ใน repo — ขอจากผู้ดูแลระบบ
-- ติดตั้งใหม่ควรสร้างบัญชีเองแล้วตั้งรหัสใหม่ อย่าใช้ hash ตัวอย่างด้านล่างบนระบบจริง
INSERT IGNORE INTO users (username,password,role)
VALUES
('admin','$2b$10$yRofvUyNetzokkLKJAcqw.qRPIFUEdvi7eoqTkeSM4IQRKhZ7WsyC','admin'),
('user1','$2b$10$5RJWHc6Ky55Rxuyjyc/o5Op0z.o9RpKC/g5KPHK/tjPpKNBNh4yEu','viewer');
