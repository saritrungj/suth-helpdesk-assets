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
    status ENUM('active','inactive') DEFAULT 'active'
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
    FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_year(id)
);

CREATE TABLE devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(100) NOT NULL UNIQUE,
    brand_id INT,
    model VARCHAR(100),
    building_id INT,
    floor_id INT,
    division_id INT,
    department_id INT,
    contract_id INT,
    price_override DECIMAL(10,2) DEFAULT NULL,
    status ENUM('active','repair','retired') DEFAULT 'active',

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
-- (เดิมคีย์นี้อยู่แยกไว้ในไฟล์ migration_unique_print_transactions.sql
-- ตอนนี้รวมเข้ามาไว้ใน schema หลักเพื่อให้ setup ฐานข้อมูลใหม่ได้ครบในครั้งเดียว)
CREATE TABLE print_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT,
    month VARCHAR(7) NOT NULL,
    pages INT DEFAULT 0,

    FOREIGN KEY (device_id) REFERENCES devices(id),
    UNIQUE KEY uq_device_month (device_id, month)
);

-- ==============================================================================
-- Views
-- ==============================================================================

CREATE OR REPLACE VIEW v_monthly_kpi AS
SELECT

    pt.device_id,
    d.serial_number,
    d.status AS device_status,
    pt.month,
    pt.pages AS pages_printed,

    (pt.pages * 0.8) AS net_pages,

    (
        (pt.pages * 0.8) *
        COALESCE(
            d.price_override,
            c.price_per_page,
            0
        )
    ) AS total_cost

FROM print_transactions pt

JOIN devices d
ON pt.device_id = d.id

LEFT JOIN contracts c
ON d.contract_id = c.id;


CREATE OR REPLACE VIEW v_summary_by_building AS
SELECT

    b.name AS building_name,

    SUM(pt.pages * 0.8) AS total_net_pages,

    SUM(
        (pt.pages * 0.8) *
        COALESCE(
            d.price_override,
            c.price_per_page,
            0
        )
    ) AS total_building_cost

FROM print_transactions pt

JOIN devices d
ON pt.device_id = d.id

LEFT JOIN building b
ON d.building_id = b.id

LEFT JOIN contracts c
ON d.contract_id = c.id

GROUP BY b.name;


CREATE OR REPLACE VIEW v_compare_usage_costs AS
SELECT

    pt.month,

    fy.year AS fiscal_year,

    d.serial_number,

    d.status AS device_status,

    b.name AS building_name,

    f.name AS floor_name,

    divi.name AS division_name,

    dept.name AS department_name,

    br.name AS brand_name,

    (pt.pages * 0.8) AS net_pages,

    COALESCE(
        d.price_override,
        c.price_per_page,
        0
    ) AS cost_per_page,

    (
        (pt.pages * 0.8) *
        COALESCE(
            d.price_override,
            c.price_per_page,
            0
        )
    ) AS total_cost

FROM print_transactions pt

JOIN devices d
ON pt.device_id = d.id

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
-- เดิม schema นี้ insert รหัสผ่านเป็น plaintext ('admin123' / 'user123')
-- ทำให้ bcrypt.compare เทียบไม่ตรงและ login ไม่ผ่านทุกครั้ง (แม้กรอกรหัสถูก)
-- ด้านล่างนี้แก้เป็นค่า hash จาก bcrypt (saltRounds = 10 ตาม backend/hash.js)
-- ของรหัสผ่านเดิมแทน (admin/admin123, user1/user123)
INSERT IGNORE INTO users (username,password,role)
VALUES
('admin','$2b$10$yRofvUyNetzokkLKJAcqw.qRPIFUEdvi7eoqTkeSM4IQRKhZ7WsyC','admin'),
('user1','$2b$10$5RJWHc6Ky55Rxuyjyc/o5Op0z.o9RpKC/g5KPHK/tjPpKNBNh4yEu','viewer');