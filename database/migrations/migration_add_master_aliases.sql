-- รันหนึ่งครั้งสำหรับฐานข้อมูลเดิม — ชื่อเรียกอื่นของยี่ห้อ อาคาร และฝ่าย (ADR-0025)
--
-- ไฟล์จากผู้ให้เช่าและทะเบียนเดิมเรียกข้อมูลหลักตัวเดียวกันต่างกัน เช่น
-- "อาคารรัตนเวชพัฒน์" กับ "รัตนเวชพัฒน์ (RVP)" ตารางเหล่านี้เก็บชื่อที่ใช้ในไฟล์
-- ให้ชี้ไปที่ข้อมูลหลักตัวเดียว ตัวนำเข้าจึงไม่ต้องสร้างข้อมูลซ้ำหรือปฏิเสธแถว
--
-- ชื่อเรียกอื่นไม่ซ้ำทั้งตาราง (UNIQUE) — ชื่อหนึ่งชี้ได้รายการเดียว ส่วนการห้ามชนชื่อหลัก
-- API เป็นคนตรวจ เพราะอยู่คนละตาราง ลบข้อมูลหลักแล้วชื่อเรียกอื่นของมันหายตาม
--
-- ตารางเริ่มว่าง ไม่แตะแถวเดิมของตารางไหน charset/collation ตั้งชัดที่ตัวตาราง เพราะฐานเดิม
-- บางเครื่องมีค่าเริ่มต้นเป็น latin1 ซึ่งทำให้ชื่อไทยเก็บไม่ได้

-- ข้อความไทยในไฟล์นี้เป็น UTF-8 — บอก server ตรงๆ ไม่พึ่ง charset ของ client ที่โหลดไฟล์
-- client ของ image MySQL และ mysql บน Windows ใช้ latin1/cp874 เป็นค่าเริ่มต้น ถ้าไม่มีบรรทัดนี้
-- ชื่อไทยจะถูกเข้ารหัสซ้อนลงฐานโดยไม่ error (พบจริงตอนย้ายฐานบน Docker ไป MySQL 8.4, #130)
SET NAMES utf8mb4;

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
