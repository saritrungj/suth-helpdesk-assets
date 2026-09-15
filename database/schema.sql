-- ==============================================================================
-- Hospital IT Asset Management Database Schema
-- ==============================================================================

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

-- ------------------------------------------------------------------------------
-- 2. Main Tables
-- ------------------------------------------------------------------------------

CREATE TABLE contracts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contract_no VARCHAR(100) NOT NULL UNIQUE,
    fiscal_year_id INT,
    price_per_page DECIMAL(10,2),

    -- ช่วงที่สัญญาฉบับนี้ (และราคาของมัน) มีผลจริง — ADR-0019
    --
    -- ⚠️ effective_from IS NULL = "ยังไม่มีใครยืนยันช่วงที่มีผล" ไม่ใช่ "มีผลตลอดกาล"
    -- ราคาที่เก็บไว้เฉยๆ ไม่ใช่หลักฐานว่าราคานั้นมีผลกับเดือนไหนบ้าง ยอดพิมพ์ของ
    -- เดือนที่ไม่มีราคาซึ่งยืนยันแล้วครอบคลุม จะรายงานว่า "ยังยืนยันราคาไม่ได้"
    -- ไม่ใช่คิดเป็น 0 บาท (Q27) — ศูนย์บาทกับไม่รู้ราคาเป็นคนละเรื่อง และการ
    -- แทนที่ด้วยศูนย์ทำให้ยอดพิมพ์จริงหายออกจากงบเงียบๆ
    effective_from DATE DEFAULT NULL,
    effective_to DATE DEFAULT NULL,

    -- ใครยืนยันช่วงและราคานี้ จากเอกสารอะไร (Q26 ให้ยึดเอกสารที่ตรวจสอบได้)
    price_source VARCHAR(255) DEFAULT NULL,
    price_verified_by INT DEFAULT NULL,
    price_verified_at TIMESTAMP NULL DEFAULT NULL,

    FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_year(id),
    FOREIGN KEY (price_verified_by) REFERENCES users(id),

    CONSTRAINT chk_contracts_effective_order CHECK (
        effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from
    )
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
    price_override DECIMAL(10,2) DEFAULT NULL,
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

-- print_transactions ต้องมี UNIQUE KEY (device_id, month) เพราะ
-- backend/routes/print-transactions.js ทั้งตอนบันทึกทีละรายการ (POST /)
-- และบันทึกทีละหลายเครื่อง (POST /bulk) ใช้คำสั่ง
--   INSERT ... ON DUPLICATE KEY UPDATE pages = VALUES(pages)
-- ถ้าไม่มี UNIQUE KEY คู่นี้ คำสั่งข้างต้นจะไม่รู้ว่าแถวไหนซ้ำ และจะ INSERT
-- แถวใหม่ทุกครั้งที่กด "บันทึก" ซ้ำในเดือนเดิม ทำให้ยอดพิมพ์/ค่าใช้จ่ายถูกนับซ้ำ
-- (เดิมคีย์นี้อยู่แยกไว้ในไฟล์ migrations/migration_unique_print_transactions.sql
-- ตอนนี้รวมเข้ามาไว้ใน schema หลักเพื่อให้ setup ฐานข้อมูลใหม่ได้ครบในครั้งเดียว)
CREATE TABLE print_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT,
    month VARCHAR(7) NOT NULL,
    pages INT DEFAULT 0,

    FOREIGN KEY (device_id) REFERENCES devices(id),
    UNIQUE KEY uq_device_month (device_id, month),

    -- คอลัมน์นำของ uq_device_month คือ device_id คิวรี่ที่กรองด้วยช่วงเดือนอย่างเดียว
    -- (`WHERE month BETWEEN ? AND ?` ซึ่งเป็นรูปแบบของแทบทุกรายงาน) จึงใช้คีย์นั้น
    -- ไม่ได้เลยและต้องอ่านทั้งตาราง — ตารางนี้โตขึ้นทุกเดือนแบบไม่มีเพดาน
    KEY idx_print_transactions_month (month),

    -- เดือนเก็บเป็น ค.ศ. "YYYY-MM" เท่านั้น — รับ พ.ศ. เข้ามาได้ แต่ normalize ตั้งแต่ขาเข้า
    -- (backend/utils/month.js) ถ้าปล่อยให้เก็บทั้ง "2568-10" และ "2025-10" ปนกัน UNIQUE KEY
    -- ด้านบนจะกันยอดซ้ำของเดือนเดียวกันไม่ได้ และค่าใช้จ่ายจะถูกนับสองรอบ
    CONSTRAINT chk_print_transactions_month_ce CHECK (
        month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'
        AND CAST(SUBSTRING(month, 1, 4) AS UNSIGNED) BETWEEN 1900 AND 2399
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
    price_override DECIMAL(10,2) NULL,

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
-- ## ราคาที่ใช้คิดเงินของเดือนหนึ่ง มาจากช่วงที่มีผลจริง ไม่ใช่ค่าปัจจุบัน (ADR-0019)
--
-- ทุก view ด้านล่างหาราคาแบบเดียวกันสามขั้น
--
--   1. หา "ช่วงการคิดเงิน" ของเครื่องที่ครอบคลุมเดือนนั้น (device_contract_history)
--      ช่วงที่เริ่มทีหลังชนะเมื่อซ้อนกัน โดยมี id เป็นตัวตัดสินสุดท้าย — กฎเดียวกับ
--      device_location_history ดู ADR-0014
--   2. ช่วงนั้นมีราคาเฉพาะเครื่องไหม ถ้ามีใช้เลย
--   3. ถ้าไม่มี ใช้ราคาของสัญญาที่ช่วงนั้นระบุ **เฉพาะเมื่อช่วงที่สัญญามีผลครอบคลุม
--      เดือนนั้นด้วย** ไม่งั้นถือว่ายังยืนยันราคาไม่ได้
--
-- price_per_page เป็น NULL แปลว่า "ยังยืนยันราคาไม่ได้" ไม่ใช่ "ราคาศูนย์"
-- total_cost จึงเป็น NULL ตามไปด้วย และ SUM() จะข้ามแถวเหล่านั้น — ทุกจุดที่แสดง
-- ยอดรวมต้องบอกจำนวนรายการที่ยังยืนยันราคาไม่ได้ควบคู่ไปเสมอ (Q27) ไม่งั้นผู้อ่าน
-- จะเข้าใจว่ายอดที่เห็นคือค่าใช้จ่ายทั้งหมด
--
-- ⚠️ ROUND(..., 2) คร่อมค่าใช้จ่ายของแต่ละแถวเสมอ ห้ามถอด — จุดปัดเศษของทั้งระบบ
-- อยู่ที่ "ทีละรายการยอดพิมพ์" ดู packages/domain/money.cjs
-- ==============================================================================

CREATE OR REPLACE VIEW v_monthly_kpi AS
SELECT
    pt.device_id,
    d.serial_number,
    d.status AS device_status,
    pt.month,
    pt.pages AS pages_printed,

    (pt.pages * 0.98) AS net_pages,

    CASE
        WHEN dch.price_override IS NOT NULL THEN dch.price_override
        WHEN c.id IS NOT NULL
             AND c.price_verified_at IS NOT NULL
             AND c.effective_from IS NOT NULL
             AND pt.month >= DATE_FORMAT(c.effective_from, '%Y-%m')
             AND (c.effective_to IS NULL OR pt.month <= DATE_FORMAT(c.effective_to, '%Y-%m'))
        THEN c.price_per_page
        ELSE NULL
    END AS price_per_page,

    ROUND(
        (pt.pages * 0.98) *
        CASE
            WHEN dch.price_override IS NOT NULL THEN dch.price_override
            WHEN c.id IS NOT NULL
                 AND c.price_verified_at IS NOT NULL
                 AND c.effective_from IS NOT NULL
                 AND pt.month >= DATE_FORMAT(c.effective_from, '%Y-%m')
                 AND (c.effective_to IS NULL OR pt.month <= DATE_FORMAT(c.effective_to, '%Y-%m'))
            THEN c.price_per_page
            ELSE NULL
        END,
        2
    ) AS total_cost

FROM print_transactions pt

JOIN devices d
ON pt.device_id = d.id

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

LEFT JOIN contracts c
ON c.id = dch.contract_id;


CREATE OR REPLACE VIEW v_summary_by_building AS
SELECT

    b.name AS building_name,

    SUM(v.net_pages) AS total_net_pages,

    SUM(v.total_cost) AS total_building_cost,

    -- รายการที่ยังยืนยันราคาไม่ได้ในอาคารนี้ — ต้องแสดงคู่กับยอดเงินเสมอ (Q27)
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

JOIN devices d
ON v.device_id = d.id

LEFT JOIN contracts c
ON d.contract_id = c.id

LEFT JOIN fiscal_year fy
ON c.fiscal_year_id = fy.id

LEFT JOIN building b
ON d.building_id = b.id

LEFT JOIN floor f
ON d.floor_id = f.id

LEFT JOIN division divi
ON d.division_id = divi.id

LEFT JOIN department dept
ON d.department_id = dept.id

LEFT JOIN brand br
ON d.brand_id = br.id;


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
