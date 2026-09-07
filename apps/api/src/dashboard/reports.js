// apps/api/src/dashboard/reports.js
//
// รายงานรวมที่หลายหน้าใช้ร่วมกัน — ยอดรายเดือน สรุปตามอาคาร ตารางเปรียบเทียบ
// ค่าใช้จ่ายรายเครื่อง และข้อมูลเสริมของแดชบอร์ด
//
// ทุกเส้นทางในไฟล์นี้อ่านอย่างเดียว รับตัวกรองชุดเดียวกัน (?month= &building_name=)
// ผ่าน reportQuery/reportFilters ใน ./filters.js — เดิมแต่ละเส้นทางเขียนตรรกะการ
// ต่อ WHERE เองซ้ำกันหกรอบและกรองเดือนไม่เหมือนกัน

const express = require("express");
const router = express.Router();

const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const { validate } = require("../shared/validate");
const cache = require("../shared/cache");
const { reportQuery, reportFilters, joinClauses, sortDirection } = require("./filters");

const withFilters = validate({ query: reportQuery });

// ============================================================
// GET /api/dashboard/monthly-kpi
// ยอดพิมพ์และค่าใช้จ่ายรายเดือนรายเครื่อง — ข้อมูลดิบที่กราฟแนวโน้ม เส้นจิ๋วบน
// การ์ด KPI และรายชื่อเดือนของตัวเลือกช่วงเวลา ใช้ร่วมกันทั้งหมด (ดู ADR-0009)
// ============================================================
router.get(
  "/monthly-kpi",
  withFilters,
  asyncHandler(async (req, res) => {
    const { clauses, params } = reportFilters(req.query, { month: "m.month", building: "b.name" });

    const [rows] = await db.query(
      `SELECT m.*, b.name AS building_name
       FROM v_monthly_kpi m
       LEFT JOIN devices d ON m.device_id = d.id
       LEFT JOIN building b ON d.building_id = b.id
       ${joinClauses(clauses)}
       ORDER BY m.month ASC`,
      params
    );

    cache.operationalData(res);
    res.json(rows);
  })
);

// ============================================================
// GET /api/dashboard/summary-by-building
// ============================================================
router.get(
  "/summary-by-building",
  withFilters,
  asyncHandler(async (req, res) => {
    const { clauses, params } = reportFilters(req.query, { month: "v.month", building: "b.name" });

    const [rows] = await db.query(
      `SELECT
         b.name AS building_name,
         COUNT(DISTINCT v.device_id) AS device_count,
         SUM(v.net_pages) AS total_net_pages,
         SUM(v.total_cost) AS total_building_cost
       FROM v_monthly_kpi v
       LEFT JOIN devices d ON v.device_id = d.id
       LEFT JOIN building b ON d.building_id = b.id
       ${joinClauses(clauses)}
       GROUP BY b.name
       ORDER BY total_building_cost DESC`,
      params
    );

    cache.operationalData(res);
    res.json(rows);
  })
);

// ============================================================
// GET /api/dashboard/compare
// ตารางเปรียบเทียบระดับรายการ — ทุกมิติของทุกเครื่องในทุกเดือน
// ============================================================
router.get(
  "/compare",
  withFilters,
  asyncHandler(async (req, res) => {
    const { clauses, params } = reportFilters(req.query, { month: "month", building: "building_name" });

    const [rows] = await db.query(
      `SELECT * FROM v_compare_usage_costs ${joinClauses(clauses)} ORDER BY month ASC`,
      params
    );

    cache.operationalData(res);
    res.json(rows);
  })
);

// ============================================================
// GET /api/dashboard/stats
// การ์ดตัวเลขสรุปด้านบนของแดชบอร์ด
//
// สามคำสั่งนี้ยิงพร้อมกันด้วย Promise.all ไม่ใช่ทีละตัวตามลำดับ — ไม่มีตัวไหน
// ต้องรอผลของตัวก่อนหน้า การรอเรียงกันคือการเสียเวลาไปเปล่าๆ เท่ากับผลรวมของ
// ทั้งสามแทนที่จะเป็นตัวที่ช้าที่สุดตัวเดียว
// ============================================================
router.get(
  "/stats",
  withFilters,
  asyncHandler(async (req, res) => {
    const deviceFilter = reportFilters(req.query, { building: "b.name" });
    const usageFilter = reportFilters(req.query, { month: "pt.month", building: "b.name" });

    const [[[devices]], [[contracts]], [[usage]]] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) AS total_devices,
           SUM(d.status = 'active') AS active_devices,
           SUM(d.contract_id IS NULL) AS devices_without_contract
         FROM devices d
         LEFT JOIN building b ON d.building_id = b.id
         ${joinClauses(deviceFilter.clauses)}`,
        deviceFilter.params
      ),

      db.query("SELECT COUNT(*) AS total_contracts FROM contracts"),

      db.query(
        `SELECT
           COUNT(pt.id) AS total_transactions,
           COALESCE(SUM(pt.pages), 0) AS total_pages
         FROM print_transactions pt
         LEFT JOIN devices d ON pt.device_id = d.id
         LEFT JOIN building b ON d.building_id = b.id
         ${joinClauses(usageFilter.clauses)}`,
        usageFilter.params
      ),
    ]);

    cache.operationalData(res);
    res.json({
      total_devices: Number(devices.total_devices),
      active_devices: Number(devices.active_devices),
      devices_without_contract: Number(devices.devices_without_contract),
      total_contracts: Number(contracts.total_contracts),
      total_transactions: Number(usage.total_transactions),
      total_pages: Number(usage.total_pages),
    });
  })
);

// ============================================================
// GET /api/dashboard/expense
// ค่าใช้จ่ายรายเครื่อง — เรียงจากแพงสุด
// ============================================================
router.get(
  "/expense",
  withFilters,
  asyncHandler(async (req, res) => {
    const { clauses, params } = reportFilters(req.query, { month: "v.month", building: "b.name" });

    const [rows] = await db.query(
      `SELECT
         v.device_id,
         d.serial_number,
         d.model,
         b.name AS building_name,
         dep.name AS department_name,
         SUM(v.net_pages) AS total_pages,
         SUM(v.total_cost) AS total_cost
       FROM v_monthly_kpi v
       LEFT JOIN devices d ON v.device_id = d.id
       LEFT JOIN building b ON d.building_id = b.id
       LEFT JOIN department dep ON d.department_id = dep.id
       ${joinClauses(clauses)}
       GROUP BY v.device_id, d.serial_number, d.model, b.name, dep.name
       ORDER BY total_cost DESC`,
      params
    );

    cache.operationalData(res);
    res.json(rows);
  })
);

// ============================================================
// GET /api/dashboard/highlights
//
// ข้อมูลเสริมของแดชบอร์ด: จำนวนเครื่องแยกตามสถานะ, 5 อันดับแผนก/เครื่อง,
// และสรุปการใช้งานแยกตามสัญญา
//
// ?department_order=asc / ?device_order=asc พลิกเป็น "น้อยที่สุดก่อน" ซึ่งตอบ
// คำถามคนละข้อกับ "มากที่สุดก่อน" — เครื่องที่แทบไม่ถูกใช้เลยคือเครื่องที่ควร
// ย้ายไปที่อื่นหรือคืนสัญญา ไม่ใช่แค่ข้อมูลประกอบ
// ============================================================
router.get(
  "/highlights",
  withFilters,
  asyncHandler(async (req, res) => {
    const { month, building_name } = req.query;
    const buildingClause = building_name ? " AND b.name = ? " : "";
    const buildingParam = building_name ? [building_name] : [];

    // เงื่อนไขเดือนต้องอยู่ใน ON ของ LEFT JOIN ไม่ใช่ WHERE — ไม่งั้น LEFT JOIN
    // จะกลายเป็น INNER JOIN โดยปริยาย แล้วเครื่องที่ไม่มียอดพิมพ์ในเดือนที่เลือก
    // จะหลุดออกจากอันดับ "ใช้น้อยที่สุด" ไปเงียบๆ ทั้งที่มันคือคำตอบของคำถามนั้น
    const monthJoin = month.length ? " AND v.month IN (?) " : "";
    const monthParam = month.length ? [month] : [];

    const [statusRows, topDepartments, topDevices, contracts] = await Promise.all([
      db
        .query(
          `SELECT d.status, COUNT(*) AS count
           FROM devices d
           LEFT JOIN building b ON d.building_id = b.id
           WHERE 1=1 ${buildingClause}
           GROUP BY d.status`,
          buildingParam
        )
        .then(([rows]) => rows),

      db
        .query(
          `SELECT
             d.department_id,
             dept.name AS department_name,
             divi.name AS division_name,
             SUM(v.net_pages) AS total_pages,
             SUM(v.total_cost) AS total_cost
           FROM v_monthly_kpi v
           JOIN devices d ON v.device_id = d.id
           LEFT JOIN department dept ON d.department_id = dept.id
           LEFT JOIN division divi ON dept.division_id = divi.id
           LEFT JOIN building b ON d.building_id = b.id
           WHERE 1=1 ${month.length ? " AND v.month IN (?) " : ""} ${buildingClause}
           GROUP BY d.department_id, dept.name, divi.name
           ORDER BY total_cost ${sortDirection(req.query.department_order)}
           LIMIT 5`,
          [...monthParam, ...buildingParam]
        )
        .then(([rows]) => rows),

      db
        .query(
          `SELECT
             d.id AS device_id,
             d.serial_number,
             d.model,
             d.status,
             b.name AS building_name,
             dept.name AS department_name,
             COALESCE(SUM(v.net_pages), 0) AS total_pages,
             COALESCE(SUM(v.total_cost), 0) AS total_cost
           FROM devices d
           LEFT JOIN building b ON d.building_id = b.id
           LEFT JOIN department dept ON d.department_id = dept.id
           LEFT JOIN v_monthly_kpi v ON v.device_id = d.id ${monthJoin}
           WHERE 1=1 ${buildingClause}
           GROUP BY d.id, d.serial_number, d.model, d.status, b.name, dept.name
           ORDER BY total_pages ${sortDirection(req.query.device_order)}
           LIMIT 5`,
          [...monthParam, ...buildingParam]
        )
        .then(([rows]) => rows),

      db
        .query(
          `SELECT
             c.id,
             c.contract_no,
             fy.year AS fiscal_year,
             c.price_per_page,
             COUNT(DISTINCT d.id) AS device_count,
             COALESCE(SUM(v.net_pages), 0) AS total_pages,
             COALESCE(SUM(v.total_cost), 0) AS total_cost
           FROM contracts c
           LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
           LEFT JOIN devices d ON d.contract_id = c.id
           LEFT JOIN building b ON d.building_id = b.id
           LEFT JOIN v_monthly_kpi v ON v.device_id = d.id ${monthJoin}
           WHERE 1=1 ${buildingClause}
           GROUP BY c.id, c.contract_no, fy.year, c.price_per_page
           ORDER BY total_cost DESC`,
          [...monthParam, ...buildingParam]
        )
        .then(([rows]) => rows),
    ]);

    // เติมสถานะที่ไม่มีข้อมูลให้เป็น 0 เสมอ เพื่อให้กราฟแท่งซ้อนฝั่งเว็บมีครบทุก
    // ช่องทุกครั้ง ไม่ต้องเช็ค undefined และไม่มีสีหายไปกลางแท่ง
    const statusMap = new Map(statusRows.map((row) => [row.status, Number(row.count)]));
    const device_status = ["active", "repair", "retired"].map((status) => ({
      status,
      count: statusMap.get(status) || 0,
    }));

    cache.operationalData(res);
    res.json({ device_status, top_departments: topDepartments, top_devices: topDevices, contracts });
  })
);

module.exports = router;
