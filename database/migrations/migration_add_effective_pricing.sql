-- ==============================================================================
-- ราคาตามช่วงที่มีผลจริง และประวัติว่าเครื่องคิดเงินภายใต้สัญญาไหน
-- ==============================================================================
-- ที่มา: ADR-0019 และ issue #81
--
-- ## ปัญหาที่แก้
--
-- ราคาที่ใช้คิดเงินมาจาก `COALESCE(devices.price_override, contracts.price_per_page, 0)`
-- ซึ่งทั้งสองค่าเป็น "ค่าปัจจุบัน" แต่ถูกใช้ตอบคำถามย้อนหลังว่าเดือนมีนาคมคิดราคา
-- เท่าไหร่ ผลคือ
--
--   - แก้ราคาในสัญญาวันนี้ → ยอดเงินของทุกเดือนย้อนหลังเปลี่ยนตามทันที
--   - ย้ายเครื่องไปสัญญาของปีงบใหม่ → เดือนเก่าถูกคิดด้วยราคาใหม่ทั้งที่จ่ายไป
--     ตามสัญญาเดิมแล้ว (นี่คือเหตุผลที่ issue #81 ยังแก้ไม่ได้อย่างปลอดภัย)
--   - เครื่องที่ไม่มีสัญญาและไม่มีราคาเฉพาะเครื่อง ถูกคิดเป็น 0 บาท ยอดพิมพ์จริง
--     ของมันจึงหายออกจากงบเงียบๆ โดยไม่มีอะไรเตือน
--
-- ## ⚠️ migration นี้ไม่เติมข้อมูลย้อนหลังให้เลยสักแถว
--
-- ADR-0019 Q26 ระบุว่าราคาที่เก็บไว้เฉยๆ ไม่ใช่หลักฐานว่าราคานั้นมีผลกับเดือนไหน
-- ต้องยึดเอกสารสัญญาหรือเอกสารเปลี่ยนราคาที่ตรวจสอบได้ ระบบจึงเดาช่วงที่มีผลแทน
-- ผู้ดูแลไม่ได้
--
-- **หลังรัน migration นี้ ทุกสัญญาจะยังไม่ถูกยืนยัน และรายงานทุกหน้าจะแสดงค่าใช้จ่าย
-- ว่า "ยังยืนยันราคาไม่ได้" จนกว่าผู้ดูแลจะเปิดหน้าสัญญาแล้วกดยืนยันช่วงที่มีผล
-- ทีละฉบับ** ระบบจะเสนอช่วง 1 ต.ค.–30 ก.ย. ของปีงบที่สัญญาผูกอยู่ให้เป็นค่าตั้งต้น
-- (ซึ่งเป็นสิ่งที่เอกสารสัญญาระบุไว้อยู่แล้ว) แต่ยังต้องมีคนกดรับรอง
--
-- ตอนกดยืนยัน ระบบจะสร้างช่วงการคิดเงินให้เครื่องทุกเครื่องที่ผูกกับสัญญานั้น
-- ครอบคลุมช่วงของสัญญา ยอดเงินย้อนหลังจึงกลับมาครบทันทีที่ยืนยันครบทุกฉบับ
--
-- ยอดพิมพ์ดิบไม่ถูกแตะเลย migration นี้เพิ่มคอลัมน์ ตาราง และเปลี่ยน view เท่านั้น
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ช่วงที่สัญญาและราคามีผล
-- ------------------------------------------------------------------------------
-- effective_from IS NULL = ยังไม่มีใครยืนยัน ไม่ใช่ "มีผลตลอดกาล"
ALTER TABLE contracts
    ADD COLUMN effective_from DATE DEFAULT NULL AFTER price_per_page,
    ADD COLUMN effective_to DATE DEFAULT NULL AFTER effective_from,
    ADD COLUMN price_source VARCHAR(255) DEFAULT NULL AFTER effective_to,
    ADD COLUMN price_verified_by INT DEFAULT NULL AFTER price_source,
    ADD COLUMN price_verified_at TIMESTAMP NULL DEFAULT NULL AFTER price_verified_by,
    ADD CONSTRAINT fk_contracts_price_verified_by FOREIGN KEY (price_verified_by) REFERENCES users(id),
    ADD CONSTRAINT chk_contracts_effective_order CHECK (
        effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from
    );

-- ------------------------------------------------------------------------------
-- 2. ประวัติการคิดเงินของแต่ละเครื่อง
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 3. view ทุกตัวหาราคาจากช่วงที่มีผล ไม่ใช่ค่าปัจจุบัน
-- ------------------------------------------------------------------------------
-- price_per_page เป็น NULL แปลว่า "ยังยืนยันราคาไม่ได้" ไม่ใช่ "ราคาศูนย์"
-- total_cost จึงเป็น NULL ตามไปด้วยและ SUM() ข้ามแถวนั้น — ทุกจุดที่แสดงยอดรวม
-- ต้องบอกจำนวนรายการที่ยังยืนยันราคาไม่ได้ควบคู่เสมอ (Q27)

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
JOIN devices d ON pt.device_id = d.id
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
LEFT JOIN contracts c ON c.id = dch.contract_id;

CREATE OR REPLACE VIEW v_summary_by_building AS
SELECT
    b.name AS building_name,
    SUM(v.net_pages) AS total_net_pages,
    SUM(v.total_cost) AS total_building_cost,
    SUM(CASE WHEN v.total_cost IS NULL THEN 1 ELSE 0 END) AS unpriced_readings
FROM v_monthly_kpi v
JOIN devices d ON v.device_id = d.id
LEFT JOIN building b ON d.building_id = b.id
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
LEFT JOIN contracts c ON d.contract_id = c.id
LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
LEFT JOIN building b ON d.building_id = b.id
LEFT JOIN floor f ON d.floor_id = f.id
LEFT JOIN division divi ON d.division_id = divi.id
LEFT JOIN department dept ON d.department_id = dept.id
LEFT JOIN brand br ON d.brand_id = br.id;
