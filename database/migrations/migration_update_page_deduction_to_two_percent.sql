-- 2% page deduction for existing databases
--
-- The raw value in print_transactions is unchanged. These views expose the
-- billable value used by reports and costs, so replacing them is sufficient.
-- Run once against an existing database after taking the normal backup.

CREATE OR REPLACE VIEW v_monthly_kpi AS
SELECT
    pt.device_id,
    d.serial_number,
    d.status AS device_status,
    pt.month,
    pt.pages AS pages_printed,
    (pt.pages * 0.98) AS net_pages,
    ((pt.pages * 0.98) * COALESCE(d.price_override, c.price_per_page, 0)) AS total_cost
FROM print_transactions pt
JOIN devices d ON pt.device_id = d.id
LEFT JOIN contracts c ON d.contract_id = c.id;

CREATE OR REPLACE VIEW v_summary_by_building AS
SELECT
    b.name AS building_name,
    SUM(pt.pages * 0.98) AS total_net_pages,
    SUM((pt.pages * 0.98) * COALESCE(d.price_override, c.price_per_page, 0)) AS total_building_cost
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
    ((pt.pages * 0.98) * COALESCE(d.price_override, c.price_per_page, 0)) AS total_cost
FROM print_transactions pt
JOIN devices d ON pt.device_id = d.id
LEFT JOIN contracts c ON d.contract_id = c.id
LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
LEFT JOIN building b ON d.building_id = b.id
LEFT JOIN floor f ON d.floor_id = f.id
LEFT JOIN division divi ON d.division_id = divi.id
LEFT JOIN department dept ON d.department_id = dept.id
LEFT JOIN brand br ON d.brand_id = br.id;
