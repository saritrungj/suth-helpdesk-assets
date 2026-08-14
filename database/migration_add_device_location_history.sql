-- ==============================================================================
-- ประวัติการย้ายเครื่อง (อาคาร/ชั้น/ฝ่าย/แผนก)
-- ==============================================================================
-- เดิม devices.building_id / floor_id / division_id / department_id เป็นแค่ "ค่าปัจจุบัน"
-- พอแก้ไขเครื่อง (ย้ายแผนก) ค่าจะถูกเขียนทับไปเลย ไม่เหลือร่องรอยว่าเคยอยู่ที่ไหนมาก่อน
-- และยอดพิมพ์/ค่าใช้จ่ายเดือนเก่าๆ (print_transactions) ก็จะถูกนับเป็นของแผนกใหม่ไปด้วย
-- ทั้งที่ตอนนั้นเครื่องยังไม่ได้ย้ายมา ทำให้รายงาน "ยอดพิมพ์แยกตามฝ่าย/แผนก" ผิดย้อนหลัง
--
-- ตารางนี้เก็บ "ช่วงเวลา" ที่เครื่องแต่ละตัวสังกัดอาคาร/ชั้น/ฝ่าย/แผนกไหนบ้าง
-- effective_to = NULL หมายถึงช่วงปัจจุบัน (ยังไม่ถูกย้ายไปไหนต่อ)
-- ตอนคำนวณรายงานรายเดือน จะเทียบวันที่ 1 ของเดือนนั้นกับช่วง effective_from/effective_to
-- เพื่อรู้ว่าเดือนนั้นเครื่องสังกัดฝ่าย/แผนกไหนอยู่จริง แทนที่จะใช้ department_id ปัจจุบันเหมารวมทุกเดือน
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

-- Backfill: สร้างช่วง "ปัจจุบัน" ให้ทุกเครื่องที่มีอยู่แล้วในระบบ โดยใช้ค่า
-- ตำแหน่ง/ฝ่าย/แผนกที่มีอยู่ตอนนี้เป็นจุดเริ่มต้น
-- effective_from ใช้เดือนแรกสุดที่เครื่องนั้นมียอดพิมพ์บันทึกไว้ (ถ้ามี) ไม่งั้นใช้วันนี้
-- เพื่อไม่ให้ยอดพิมพ์เก่าที่มีอยู่แล้วหลุดออกจากรายงาน (ย้อนกลับไปไม่มีประวัติให้ join ได้)
-- หมายเหตุ: backfill นี้ "เดา" ไม่ได้ว่าเครื่องเคยย้ายมาจากไหนจริงๆ ก่อนหน้านี้ — เก็บได้แค่
-- ตั้งแต่จุดนี้เป็นต้นไป การย้ายครั้งถัดไปหลังรันสคริปต์นี้เท่านั้นที่จะมีประวัติแม่นยำ
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
