-- ==============================================================================
-- 🧪 สคริปต์จำลองข้อมูล (Dummy Data) สำหรับการนำเสนอ Prototype
-- รันไฟล์นี้หลังจากรัน schema_normalized.sql เรียบร้อยแล้ว
-- ==============================================================================

-- 1. ล้างข้อมูลเก่า (ถ้ามี) เพื่อเริ่มใหม่ (ปิดการเช็ค Foreign Key ชั่วคราว)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE print_transactions;
TRUNCATE TABLE devices;
TRUNCATE TABLE contracts;
TRUNCATE TABLE department;
TRUNCATE TABLE division;
TRUNCATE TABLE floor;
TRUNCATE TABLE building;
TRUNCATE TABLE brand;
TRUNCATE TABLE fiscal_year;
SET FOREIGN_KEY_CHECKS = 1;

-- 2. เติมข้อมูล Master Data (สติกเกอร์ป้ายชื่อ)
INSERT INTO fiscal_year (id, year) VALUES 
(1, '2566'), (2, '2567');

INSERT INTO brand (id, name) VALUES 
(1, 'HP'), (2, 'Canon'), (3, 'Epson'), (4, 'Brother');

INSERT INTO building (id, name) VALUES 
(1, 'อาคารบริหาร'), (2, 'อาคารผู้ป่วยนอก (OPD)'), (3, 'อาคารฉุกเฉิน (ER)');

-- ชั้น (ผูกกับตึก)
INSERT INTO floor (id, building_id, name) VALUES 
(1, 1, 'ชั้น 1'), (2, 1, 'ชั้น 2'), (3, 2, 'ชั้น 1'), (4, 2, 'ชั้น 2');

INSERT INTO division (id, name) VALUES 
(1, 'ฝ่ายบริหารงานทั่วไป'), (2, 'ฝ่ายการแพทย์'), (3, 'ฝ่ายการพยาบาล');

-- แผนก (ผูกกับฝ่าย)
INSERT INTO department (id, division_id, name) VALUES 
(1, 1, 'แผนกการเงินและบัญชี'), (2, 1, 'แผนกทรัพยากรบุคคล'), 
(3, 2, 'แผนกอายุรกรรม'), (4, 3, 'แผนกศัลยกรรม'), (5, 2, 'แผนกฉุกเฉิน');

-- 3. เติมข้อมูลสัญญา (ราคาเหมาจ่าย)
INSERT INTO contracts (id, contract_no, fiscal_year_id, price_per_page) VALUES 
(1, 'CONT-67-001', 2, 0.34), -- สัญญาปี 67 แผ่นละ 0.34 บาท
(2, 'CONT-66-009', 1, 0.40); -- สัญญาปี 66 แผ่นละ 0.40 บาท

-- 4. เติมข้อมูลเครื่องปริ้นเตอร์ (ของเล่น)
-- ผูก ID ให้ตรงกับ Master Data ด้านบน
INSERT INTO devices (id, serial_number, brand_id, model, building_id, floor_id, division_id, department_id, contract_id, price_override, status) VALUES 
(1, 'SN-HP-001', 1, 'LaserJet Pro M404dn', 1, 2, 1, 1, 1, NULL, 'active'),        -- แผนกการเงิน ใช้ราคาตามสัญญา (0.34)
(2, 'SN-CN-002', 2, 'imageCLASS LBP6030', 1, 1, 1, 2, 1, NULL, 'active'),       -- แผนก HR ใช้ราคาตามสัญญา (0.34)
(3, 'SN-EP-003', 3, 'EcoTank L3250', 2, 3, 2, 3, 1, 1.50, 'active'),            -- แผนกอายุรกรรม เป็นปริ้นสี (ราคาพิเศษ 1.50)
(4, 'SN-BR-004', 4, 'HL-L2370DN', 2, 4, 3, 4, 1, NULL, 'repair'),               -- แผนกศัลยกรรม (เครื่องส่งซ่อม)
(5, 'SN-HP-005', 1, 'LaserJet Enterprise', 3, 1, 2, 5, 2, NULL, 'retired');     -- แผนกฉุกเฉิน (เครื่องรุ่นเก่า แทงจำหน่ายแล้ว)

-- 5. เติมข้อมูลยอดการพิมพ์ (ใบเสร็จ/บิลค่าขนม)
-- จำลองยอด 3 เดือน: มกราคม (2025-01), กุมภาพันธ์ (2025-02), มีนาคม (2025-03)
INSERT INTO print_transactions (device_id, month, pages) VALUES 
-- เดือน มกราคม
(1, '2025-01', 5200),
(2, '2025-01', 1500),
(3, '2025-01', 800),
(4, '2025-01', 3200),
(5, '2025-01', 4100),

-- เดือน กุมภาพันธ์ (เดือนนี้สมมติว่าเครื่อง 4 พัง ส่งซ่อม ยอดปริ้นเลยน้อยลง)
(1, '2025-02', 4800),
(2, '2025-02', 1200),
(3, '2025-02', 950),
(4, '2025-02', 500),
(5, '2025-02', 3800),

-- เดือน มีนาคม (เครื่อง 5 แทงจำหน่ายไปแล้ว เลยไม่มียอดปริ้นในเดือนนี้)
(1, '2025-03', 5500),
(2, '2025-03', 1800),
(3, '2025-03', 1100),
(4, '2025-03', 0);
