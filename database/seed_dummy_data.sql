-- ==============================================================================
-- Hospital IT Asset Management
-- Dummy Data
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

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

ALTER TABLE print_transactions AUTO_INCREMENT = 1;
ALTER TABLE devices AUTO_INCREMENT = 1;
ALTER TABLE contracts AUTO_INCREMENT = 1;
ALTER TABLE department AUTO_INCREMENT = 1;
ALTER TABLE division AUTO_INCREMENT = 1;
ALTER TABLE floor AUTO_INCREMENT = 1;
ALTER TABLE building AUTO_INCREMENT = 1;
ALTER TABLE brand AUTO_INCREMENT = 1;
ALTER TABLE fiscal_year AUTO_INCREMENT = 1;

-- ==============================================================================
-- Fiscal Year
-- ==============================================================================

INSERT INTO fiscal_year (id, year, start_month, end_month, status) VALUES
(1,'2566','2022-10','2023-09','active'),
(2,'2567','2023-10','2024-09','active');

-- ==============================================================================
-- Brand
-- ==============================================================================

INSERT INTO brand (id,name,status) VALUES
(1,'HP','active'),
(2,'Canon','active'),
(3,'Epson','active'),
(4,'Brother','active');

-- ==============================================================================
-- Building
-- ==============================================================================

INSERT INTO building (id,name,status) VALUES
(1,'อาคารบริหาร','active'),
(2,'อาคารผู้ป่วยนอก (OPD)','active'),
(3,'อาคารฉุกเฉิน (ER)','active');

-- ==============================================================================
-- Floor
-- ==============================================================================

INSERT INTO floor (id,building_id,name,status) VALUES
(1,1,'ชั้น 1','active'),
(2,1,'ชั้น 2','active'),
(3,2,'ชั้น 1','active'),
(4,2,'ชั้น 2','active'),
(5,3,'ชั้น 1','active');

-- ==============================================================================
-- Division
-- ==============================================================================

INSERT INTO division (id,name,status) VALUES
(1,'ฝ่ายบริหารงานทั่วไป','active'),
(2,'ฝ่ายการแพทย์','active'),
(3,'ฝ่ายการพยาบาล','active');

-- ==============================================================================
-- Department
-- ==============================================================================

INSERT INTO department (id,division_id,name,status) VALUES
(1,1,'แผนกการเงินและบัญชี','active'),
(2,1,'แผนกทรัพยากรบุคคล','active'),
(3,2,'แผนกอายุรกรรม','active'),
(4,3,'แผนกศัลยกรรม','active'),
(5,2,'แผนกฉุกเฉิน','active');

-- ==============================================================================
-- Contracts
-- ==============================================================================

INSERT INTO contracts
(id,contract_no,fiscal_year_id,price_per_page)
VALUES
(1,'CONT-67-001',2,0.34),
(2,'CONT-66-009',1,0.40);

-- ==============================================================================
-- Devices
-- ==============================================================================

INSERT INTO devices
(
id,
serial_number,
brand_id,
model,
building_id,
floor_id,
division_id,
department_id,
contract_id,
price_override,
status
)
VALUES

(1,'SN-HP-001',1,'LaserJet Pro M404dn',1,2,1,1,1,NULL,'active'),

(2,'SN-CN-002',2,'imageCLASS LBP6030',1,1,1,2,1,NULL,'active'),

(3,'SN-EP-003',3,'EcoTank L3250',2,3,2,3,1,1.50,'active'),

(4,'SN-BR-004',4,'HL-L2370DN',2,4,3,4,1,NULL,'repair'),

(5,'SN-HP-005',1,'LaserJet Enterprise',3,5,2,5,2,NULL,'retired');

-- ==============================================================================
-- Print Transactions
-- ==============================================================================

INSERT INTO print_transactions
(device_id,month,pages)
VALUES

-- January
(1,'2025-01',5200),
(2,'2025-01',1500),
(3,'2025-01',800),
(4,'2025-01',3200),
(5,'2025-01',4100),

-- February
(1,'2025-02',4800),
(2,'2025-02',1200),
(3,'2025-02',950),
(4,'2025-02',500),
(5,'2025-02',3800),

-- March
(1,'2025-03',5500),
(2,'2025-03',1800),
(3,'2025-03',1100),
(4,'2025-03',0);

-- ==============================================================================
-- Reset AUTO_INCREMENT
-- ==============================================================================

ALTER TABLE fiscal_year AUTO_INCREMENT = 3;
ALTER TABLE brand AUTO_INCREMENT = 5;
ALTER TABLE building AUTO_INCREMENT = 4;
ALTER TABLE floor AUTO_INCREMENT = 6;
ALTER TABLE division AUTO_INCREMENT = 4;
ALTER TABLE department AUTO_INCREMENT = 6;
ALTER TABLE contracts AUTO_INCREMENT = 3;
ALTER TABLE devices AUTO_INCREMENT = 6;
ALTER TABLE print_transactions AUTO_INCREMENT = 15;


-- ==============================================================================
-- ประวัติการย้าย (device_location_history) — ตั้งต้นช่วง "ปัจจุบัน" ให้เครื่องที่ seed มา
-- ใช้เดือนแรกสุดที่มียอดพิมพ์ของเครื่องนั้นเป็นจุดเริ่ม เพื่อให้รายงานแยกตามฝ่าย/แผนก
-- ดึงข้อมูล seed เดือนย้อนหลังได้ครบ (ดูรายละเอียดที่ migrations/migration_add_device_location_history.sql)
-- ==============================================================================
INSERT INTO device_location_history
    (device_id, building_id, floor_id, location, division_id, department_id, effective_from, effective_to)
SELECT
    d.id,
    d.building_id,
    d.floor_id,
    d.location,
    d.division_id,
    d.department_id,
    COALESCE(
        (SELECT MIN(STR_TO_DATE(CONCAT(pt.month, '-01'), '%Y-%m-%d'))
         FROM print_transactions pt
         WHERE pt.device_id = d.id),
        CURDATE()
    ),
    NULL
FROM devices d;

