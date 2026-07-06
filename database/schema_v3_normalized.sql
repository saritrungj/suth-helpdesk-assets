-- ==============================================================================
-- 🚀 โค้ด Schema v3 (Database Normalization) - รองรับฟีเจอร์ Compare ข้อมูลข้ามมิติ
-- ปรับแก้จาก Schema v2 เดิม เพื่อแยกตาราง Master Data และอัปเดตตารางหลัก
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Master Data (Lookup Tables)
-- ------------------------------------------------------------------------------
CREATE TABLE fiscal_year (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year VARCHAR(10) NOT NULL UNIQUE
);

CREATE TABLE brand (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE building (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE floor (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE division (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE DEFAULT 'ยังไม่ระบุฝ่าย'
);

CREATE TABLE department (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

-- ------------------------------------------------------------------------------
-- 2. Main Tables
-- ------------------------------------------------------------------------------
-- ตารางสัญญา (ดึงข้อมูลปีงบประมาณออกมาเป็น fiscal_year_id)
CREATE TABLE contracts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contract_no VARCHAR(100) NOT NULL UNIQUE,  
    fiscal_year_id INT,
    price_per_page DECIMAL(10, 2),
    FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_year(id)
);

-- ตารางอุปกรณ์ (เปลี่ยนจาก printers เป็น devices และผูก Foreign Key จาก Master Data)
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
    price_override DECIMAL(10, 2) DEFAULT NULL,
    status ENUM('active', 'repair', 'retired') DEFAULT 'active',
    FOREIGN KEY (brand_id) REFERENCES brand(id),
    FOREIGN KEY (building_id) REFERENCES building(id),
    FOREIGN KEY (floor_id) REFERENCES floor(id),
    FOREIGN KEY (division_id) REFERENCES division(id),
    FOREIGN KEY (department_id) REFERENCES department(id),
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
);

-- ตารางยอดการพิมพ์รายเดือน (เปลี่ยนเป็นใช้ device_id)
CREATE TABLE print_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT,
    month VARCHAR(7) NOT NULL,
    pages INT DEFAULT 0,
    snapshot_price DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- ==============================================================================
-- 📊 Views สำหรับ Dashboard (อัปเดตตาม Schema ใหม่)
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
    ((pt.pages * 0.8) * pt.snapshot_price) AS total_cost
FROM print_transactions pt
JOIN devices d ON pt.device_id = d.id
JOIN contracts c ON d.contract_id = c.id;

-- View: v_summary_by_building (สรุปการใช้งานรายตึก)
CREATE OR REPLACE VIEW v_summary_by_building AS
SELECT 
    b.name AS building_name,
    SUM(pt.pages * 0.8) AS total_net_pages,
    SUM((pt.pages * 0.8) * pt.snapshot_price) AS total_building_cost
FROM devices d
JOIN building b ON d.building_id = b.id
JOIN print_transactions pt ON d.id = pt.device_id
GROUP BY b.name;

-- View: v_compare_usage_costs (สำหรับฟีเจอร์ Compare - ดึงยอดสุทธิและราคาต่อแผ่น)
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
    pt.snapshot_price AS cost_per_page,
    ((pt.pages * 0.8) * pt.snapshot_price) AS total_cost
FROM print_transactions pt
JOIN devices d ON pt.device_id = d.id
JOIN contracts c ON d.contract_id = c.id
LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
LEFT JOIN building b ON d.building_id = b.id
LEFT JOIN floor f ON d.floor_id = f.id
LEFT JOIN division divi ON d.division_id = divi.id
LEFT JOIN department dept ON d.department_id = dept.id
LEFT JOIN brand br ON d.brand_id = br.id;

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