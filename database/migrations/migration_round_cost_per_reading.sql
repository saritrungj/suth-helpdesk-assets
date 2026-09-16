-- ==============================================================================
-- ปัดเศษค่าใช้จ่ายทีละรายการ ให้ตรงกับกฎใน packages/domain/money.cjs
-- ==============================================================================
-- ปัญหาที่แก้: ระบบมี "จุดปัดเศษ" สองจุดที่ให้ผลไม่ตรงกัน
--
--   หน้าค่าใช้จ่าย   ปัดเป็นสตางค์ทีละรายการ แล้วบวกจำนวนเต็ม (money.cjs)
--   แดชบอร์ด/รายงาน  ให้ SQL รวมค่าที่ยังไม่ปัด แล้วค่อยแปลงตอนท้ายครั้งเดียว
--
-- ทั้งสองทางแม่นยำในตัวเอง แต่ให้ผลต่างกันได้ระดับเศษสตางค์เมื่อรวมหลายร้อยรายการ
-- ตรวจพบจริงด้วยชุดเทสที่ต่อฐานข้อมูล: ยอดรวมของ monthly-kpi กับ summary-by-building
-- ต่างกัน 2 สตางค์บนข้อมูลชุดเดียวกัน
--
-- ตัวเลขพวกนี้คืองบประมาณโรงพยาบาลที่ต้องตรวจสอบย้อนหลังได้ ความคลาดเคลื่อนระดับ
-- เศษสตางค์จึงรับไม่ได้ แม้จะไม่กระทบการตัดสินใจก็ตาม เพราะมันทำลายความเชื่อถือของ
-- ตัวเลขทั้งชุด — และคนที่กระทบข้อมือกับเครื่องคิดเลขจะได้คนละคำตอบกับหน้าจอ
--
-- วิธีแก้: ให้ view ปัดเป็นสตางค์ "ทีละรายการ" เหมือนกัน แล้วการรวมทุกระดับจึงเป็น
-- การบวกจำนวนที่ปัดแล้ว ตรงกับวิธีที่คนตรวจสอบคำนวณมือ (คิดทีละบรรทัดแล้วบวก)
--
-- ROUND() ของ MySQL/MariaDB บน DECIMAL ปัดครึ่งขึ้นเหมือน money.cjs และ 0.98 กับ
-- price_per_page เป็น DECIMAL ทั้งคู่ การคำนวณจึงเป็นทศนิยมตรึงตำแหน่ง ไม่ใช่ float
-- ผลของ ROUND(pages * 0.98 * price, 2) จึงเท่ากับ costSatang() ทุกกรณี
--
-- ยอด "จำนวนหน้าสุทธิ" ไม่ต้องปัด เพราะ pages * 0.98 มีทศนิยมไม่เกินสองตำแหน่ง
-- อยู่แล้วและเป็นจำนวนหน้า ไม่ใช่จำนวนเงิน
--
-- รันครั้งเดียวกับฐานข้อมูลที่มีอยู่แล้ว หลังสำรองข้อมูลตามปกติ ไม่แตะข้อมูลดิบ
-- แตะเฉพาะ view จึงย้อนกลับได้ด้วยการรัน view ชุดเดิม
-- ==============================================================================

CREATE OR REPLACE VIEW v_monthly_kpi AS
SELECT
    pt.device_id,
    d.serial_number,
    d.status AS device_status,
    pt.month,
    pt.pages AS pages_printed,
    (pt.pages * 0.98) AS net_pages,
    ROUND((pt.pages * 0.98) * COALESCE(d.price_override, c.price_per_page, 0), 2) AS total_cost
FROM print_transactions pt
JOIN devices d ON pt.device_id = d.id
LEFT JOIN contracts c ON d.contract_id = c.id;

CREATE OR REPLACE VIEW v_summary_by_building AS
SELECT
    b.name AS building_name,
    SUM(pt.pages * 0.98) AS total_net_pages,
    SUM(ROUND((pt.pages * 0.98) * COALESCE(d.price_override, c.price_per_page, 0), 2)) AS total_building_cost
FROM print_transactions pt
JOIN devices d ON pt.device_id = d.id
LEFT JOIN building b ON d.building_id = b.id
LEFT JOIN contracts c ON d.contract_id = c.id
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
    (pt.pages * 0.98) AS net_pages,
    COALESCE(d.price_override, c.price_per_page, 0) AS cost_per_page,
    ROUND((pt.pages * 0.98) * COALESCE(d.price_override, c.price_per_page, 0), 2) AS total_cost
FROM print_transactions pt
JOIN devices d ON pt.device_id = d.id
LEFT JOIN contracts c ON d.contract_id = c.id
LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
LEFT JOIN building b ON d.building_id = b.id
LEFT JOIN floor f ON d.floor_id = f.id
LEFT JOIN division divi ON d.division_id = divi.id
LEFT JOIN department dept ON d.department_id = dept.id
LEFT JOIN brand br ON d.brand_id = br.id;
