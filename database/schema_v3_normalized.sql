-- ==============================================================================
-- 🚀 โค้ด Schema v3 (Database Normalization) - รองรับฟีเจอร์ Compare ข้อมูลข้ามมิติ
-- ปรับปรุงล่าสุด:
--   1. ยกเลิก snapshot_price ใน print_transactions → คิดราคาจากสัญญา (หรือ price_override ของเครื่อง) ณ เวลา query
--   2. Master Data ทุกตารางมี is_active (ปุ่มปิด/เปิดการใช้งาน) — ปิดแล้วข้อมูลเก่ายังอยู่ แต่ไม่ให้เลือกใช้ใหม่
--   3. floor ผูกกับ building (ชั้นสังกัดตึก), department ผูกกับ division (แผนกสังกัดฝ่าย)
--      → devices เก็บแค่ floor_id / department_id แล้ว derive ตึก/ฝ่ายจากความสัมพันธ์ (กันข้อมูลขัดแย้งกันเอง)
--   4. เพิ่ม UNIQUE(device_id, month) กันบันทึกยอดพิมพ์เดือนเดิมซ้ำ
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Master Data (Lookup Tables) — ทุกตารางมี is_active สำหรับปิด/เปิด
-- ------------------------------------------------------------------------------
CREATE TABLE fiscal_year (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year VARCHAR(10) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE brand (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE building (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1
);

-- ชั้นผูกกับตึก: ชื่อชั้นซ้ำกันได้ข้ามตึก แต่ห้ามซ้ำในตึกเดียวกัน
CREATE TABLE floor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    building_id INT NOT NULL,
    name VARCHAR(50) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uq_floor_per_building (building_id, name),
    FOREIGN KEY (building_id) REFERENCES building(id)
);

CREATE TABLE division (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    is_active TINYINT(1) NOT NULL DEFAULT 1
);

-- แผนกผูกกับฝ่าย: ชื่อแผนกซ้ำกันได้ข้ามฝ่าย แต่ห้ามซ้ำในฝ่ายเดียวกัน
CREATE TABLE department (
    id INT AUTO_INCREMENT PRIMARY KEY,
    division_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uq_department_per_division (division_id, name),
    FOREIGN KEY (division_id) REFERENCES division(id)
);

-- ------------------------------------------------------------------------------
-- 2. Main Tables
-- ------------------------------------------------------------------------------
-- ตารางสัญญา (ราคาต่อแผ่นอ้างอิงจากที่นี่ — ไม่มี snapshot อีกต่อไป)
CREATE TABLE contracts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contract_no VARCHAR(100) NOT NULL UNIQUE,
    fiscal_year_id INT,
    price_per_page DECIMAL(10, 2),
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_year(id)
);

-- ตารางอุปกรณ์
-- หมายเหตุ: ไม่เก็บ building_id / division_id ตรงๆ แล้ว
--   ตึกได้จาก floor → building, ฝ่ายได้จาก department → division
CREATE TABLE devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(100) NOT NULL UNIQUE,
    brand_id INT,
    model VARCHAR(100),
    floor_id INT,
    department_id INT,
    contract_id INT,
    price_override DECIMAL(10, 2) DEFAULT NULL, -- ถ้ากำหนด จะใช้แทนราคาในสัญญา
    status ENUM('active', 'repair', 'retired') DEFAULT 'active',
    deleted_at TIMESTAMP NULL DEFAULT NULL, -- soft delete
    FOREIGN KEY (brand_id) REFERENCES brand(id),
    FOREIGN KEY (floor_id) REFERENCES floor(id),
    FOREIGN KEY (department_id) REFERENCES department(id),
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
);

-- ตารางยอดการพิมพ์รายเดือน (ยกเลิก snapshot_price — ราคาคำนวณจากสัญญา/override ตอน query)
CREATE TABLE print_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    month VARCHAR(7) NOT NULL, -- รูปแบบ YYYY-MM
    pages INT DEFAULT 0,
    UNIQUE KEY uq_device_month (device_id, month),
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- ==============================================================================
-- 📊 Views สำหรับ Dashboard (คิดราคาจาก COALESCE(price_override, price_per_page))
-- ==============================================================================

-- View: v_monthly_kpi (ยอดสุทธิ, ต้นทุน, KPI ต่อเครื่อง)
CREATE OR REPLACE VIEW v_monthly_kpi AS
SELECT
    pt.device_id,
    d.serial_number,
    d.status AS device_status,
    pt.month,
    pt.pages AS pages_printed,
    (pt.pages * 0.8) AS net_pages,
    COALESCE(d.price_override, c.price_per_page) AS cost_per_page,
    ((pt.pages * 0.8) * COALESCE(d.price_override, c.price_per_page)) AS total_cost
FROM print_transactions pt
JOIN devices d ON pt.device_id = d.id
LEFT JOIN contracts c ON d.contract_id = c.id
WHERE d.deleted_at IS NULL;

-- View: v_summary_by_building (สรุปการใช้งานรายตึก — ตึกมาจาก floor → building)
CREATE OR REPLACE VIEW v_summary_by_building AS
SELECT
    b.name AS building_name,
    SUM(pt.pages * 0.8) AS total_net_pages,
    SUM((pt.pages * 0.8) * COALESCE(d.price_override, c.price_per_page)) AS total_building_cost
FROM devices d
JOIN floor f ON d.floor_id = f.id
JOIN building b ON f.building_id = b.id
JOIN print_transactions pt ON d.id = pt.device_id
LEFT JOIN contracts c ON d.contract_id = c.id
WHERE d.deleted_at IS NULL
GROUP BY b.name;

-- View: v_compare_usage_costs (สำหรับฟีเจอร์ Compare - ยอดสุทธิและราคาต่อแผ่น)
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
    COALESCE(d.price_override, c.price_per_page) AS cost_per_page,
    ((pt.pages * 0.8) * COALESCE(d.price_override, c.price_per_page)) AS total_cost
FROM print_transactions pt
JOIN devices d ON pt.device_id = d.id
LEFT JOIN contracts c ON d.contract_id = c.id
LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
LEFT JOIN floor f ON d.floor_id = f.id
LEFT JOIN building b ON f.building_id = b.id
LEFT JOIN department dept ON d.department_id = dept.id
LEFT JOIN division divi ON dept.division_id = divi.id
LEFT JOIN brand br ON d.brand_id = br.id
WHERE d.deleted_at IS NULL;

-- ==============================================================================
-- 👤 Users Table (For Prototype Authentication)
-- ==============================================================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL, -- Plaintext for prototype as requested
    role ENUM('admin', 'user') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert dummy data for presentation
INSERT IGNORE INTO users (username, password, role) VALUES
('admin', 'admin123', 'admin'),
('user1', 'user123', 'user');
