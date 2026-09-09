// apps/api/src/dashboard/overview.js
//
// GET /api/dashboard/overview — คำขอเดียวที่ตอบทุกอย่างที่หน้าแรกต้องใช้
//
// ## ทำไมต้องมี endpoint นี้
//
// หน้าแรกเดิมยิงห้าคำขอพร้อมกัน (/stats, /highlights, /monthly-kpi,
// /summary-by-building, /print-transactions/summary) แล้วประกอบเองในเบราว์เซอร์
// ทุกคำขอต่างคนต่างเปิด connection ไปที่ MySQL และหน้าจะวาดไม่ครบจนกว่าคำขอที่ช้า
// ที่สุดจะกลับมา — บนเครื่องเก่าในโรงพยาบาลคือรอสองถึงสามวินาทีโดยเห็นโครงร่างเปล่า
//
// ## สิ่งที่ endpoint นี้ตอบและของเดิมตอบไม่ได้เลย
//
// **"มีอะไรที่ต้องทำไหม"** — คำถามแรกที่คนเปิดระบบมาถาม แดชบอร์ดเดิมตอบได้แค่
// "ตัวเลขตอนนี้เป็นเท่าไหร่" ซึ่งเป็นคำถามที่คนถามเป็นอันดับสอง หลักการออกแบบ
// แดชบอร์ดที่ใช้กันจริง (NN/g) บอกให้เอาสิ่งที่ต้องลงมือทำขึ้นก่อนตัวเลขเฉยๆ
//
// รายการเตือนที่ตอบกลับไปไม่ใช่แค่ "มีปัญหา" แต่บอกครบสามอย่างเสมอ: ปัญหาคืออะไร
// กระทบกี่รายการ และกดไปที่ไหนเพื่อแก้ — การเตือนที่ไม่บอกทางแก้จะถูกเพิกเฉยภายใน
// สองสัปดาห์
//
// ## ระดับความสำคัญ
//
//   critical  เงินกำลังคำนวณผิดอยู่ตอนนี้ (เครื่องพิมพ์อยู่แต่คิดเงินไม่ได้)
//   warning   งานที่ค้างและมีกำหนด (เดือนที่ยังกรอกไม่ครบ)
//   info      สิ่งที่ควรรู้แต่ไม่ด่วน (เครื่องที่ไม่มีใครใช้เลยทั้งปี)
//
// จำกัดไว้ไม่เกิน 6 รายการโดยตั้งใจ — แดชบอร์ดที่เตือนยี่สิบเรื่องคือแดชบอร์ดที่
// ไม่มีใครอ่านคำเตือนเลย

const express = require("express");
const router = express.Router();

const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const { validate } = require("../shared/validate");
const cache = require("../shared/cache");
const { notFound } = require("../shared/http-error");
const { effectiveLocationJoin } = require("../shared/effective-location-sql");
const { reportQuery } = require("./filters");
const { fiscalYearMonths, formatMonthTH, fromSatang, toSatang, sumSatang, computeCoverage } = require("@suth/domain");

/** เดือนปัจจุบัน "YYYY-MM" (ค.ศ.) — ใช้ตัดเดือนอนาคตออกจากงานที่ "ค้าง" */
function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
}

/** จำนวนรายการเตือนสูงสุดที่ส่งกลับไป */
const MAX_ATTENTION_ITEMS = 6;

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

router.get(
  "/overview",
  validate({ query: reportQuery }),
  asyncHandler(async (req, res) => {
    const { fiscal_year_id, building_name } = req.query;
    const selectedMonths = [...req.query.month].sort();

    // ---------- ขอบเขตของปีงบ ----------
    let range = null;
    if (fiscal_year_id) {
      const [[row]] = await db.query(
        "SELECT id, year, start_month, end_month FROM fiscal_year WHERE id = ?",
        [fiscal_year_id]
      );
      if (!row) throw notFound("ไม่พบปีงบประมาณนี้");
      range = row;
    }

    const fyMonths = range
      ? fiscalYearMonths({ startMonth: range.start_month, endMonth: range.end_month })
      : [];

    // ไม่ได้เลือกช่วงเวลามา = ดูทั้งปีงบ
    const months = selectedMonths.length ? selectedMonths : fyMonths;

    const buildingClause = building_name ? " AND b.name = ? " : "";
    const usageBuildingClause = building_name
      ? " AND CASE WHEN h.id IS NOT NULL THEN hb.name ELSE b.name END = ? "
      : "";
    const buildingParam = building_name ? [building_name] : [];
    const monthClause = months.length ? " AND v.month IN (?) " : "";
    const monthParam = months.length ? [months] : [];

    const [totals, series, statusRows, byDepartment, gaps, unbilled, idle] = await Promise.all([
      // ---------- 1) ยอดรวมของช่วงที่เลือก ----------
      db
        .query(
          `SELECT
             COALESCE(SUM(v.net_pages), 0) AS total_pages,
             COALESCE(SUM(v.total_cost), 0) AS total_cost,
             COUNT(DISTINCT v.device_id) AS reporting_devices,
             -- นับเฉพาะเครื่องที่ยังใช้งานอยู่ไว้ต่างหาก เพราะการ์ด "ความครบถ้วน"
             -- เทียบตัวเลขนี้กับจำนวนเครื่องที่ใช้งานอยู่ ถ้าใช้ reporting_devices
             -- ที่รวมเครื่องซ่อม/ปลดระวางด้วย จะได้ผลลัพธ์ที่เป็นไปไม่ได้อย่าง
             -- "19 จาก 18 เครื่อง" ซึ่งทำลายความน่าเชื่อถือของทั้งหน้าทันที
             --
             -- ยอดแผ่นและยอดเงินยังนับทุกเครื่องเหมือนเดิม — เครื่องที่ปลดระวาง
             -- ไปแล้วก็เคยพิมพ์จริงและเสียเงินจริงในเดือนก่อนหน้า
             COUNT(DISTINCT CASE WHEN d.status = 'active' THEN v.device_id END) AS reporting_active_devices
           FROM v_monthly_kpi v
           JOIN devices d ON v.device_id = d.id
           LEFT JOIN building b ON d.building_id = b.id
           ${effectiveLocationJoin({ deviceAlias: "d", monthExpression: "v.month", historyAlias: "h" })}
           LEFT JOIN building hb ON h.building_id = hb.id
           WHERE 1=1 ${monthClause} ${usageBuildingClause}`,
          [...monthParam, ...buildingParam]
        )
        .then(([rows]) => rows[0]),

      // ---------- 2) เส้นแนวโน้มรายเดือนตลอดปีงบ ----------
      // ดึงทั้งปีเสมอ ไม่ใช่แค่ช่วงที่เลือก — กราฟแนวโน้มที่แสดงเฉพาะช่วงที่กรอง
      // ไว้จะไม่มีบริบทให้เทียบเลย (เลือกเดือนเดียวแล้วได้กราฟจุดเดียว)
      range
        ? db
            .query(
              `SELECT
                 v.month,
                 SUM(v.net_pages) AS net_pages,
                 SUM(v.total_cost) AS total_cost,
                 COUNT(DISTINCT v.device_id) AS device_count
               FROM v_monthly_kpi v
               JOIN devices d ON v.device_id = d.id
               LEFT JOIN building b ON d.building_id = b.id
               ${effectiveLocationJoin({ deviceAlias: "d", monthExpression: "v.month", historyAlias: "h" })}
               LEFT JOIN building hb ON h.building_id = hb.id
               WHERE v.month BETWEEN ? AND ? ${usageBuildingClause}
               GROUP BY v.month
               ORDER BY v.month`,
              [range.start_month, range.end_month, ...buildingParam]
            )
            .then(([rows]) => rows)
        : Promise.resolve([]),

      // ---------- 3) จำนวนเครื่องแยกตามสถานะ ----------
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

      // ---------- 4) แผนกที่ใช้มากที่สุด ----------
      db
        .query(
          `SELECT
             CASE WHEN h.id IS NOT NULL THEN h.department_id ELSE d.department_id END AS department_id,
             dept.name AS department_name,
             divi.name AS division_name,
             SUM(v.net_pages) AS total_pages,
             SUM(v.total_cost) AS total_cost
           FROM v_monthly_kpi v
           JOIN devices d ON v.device_id = d.id
           ${effectiveLocationJoin({ deviceAlias: "d", monthExpression: "v.month", historyAlias: "h" })}
           JOIN department dept ON CASE WHEN h.id IS NOT NULL THEN h.department_id ELSE d.department_id END = dept.id
           LEFT JOIN division divi ON CASE WHEN h.id IS NOT NULL THEN h.division_id ELSE d.division_id END = divi.id
           LEFT JOIN building b ON d.building_id = b.id
           LEFT JOIN building hb ON h.building_id = hb.id
           WHERE 1=1 ${monthClause} ${usageBuildingClause}
           GROUP BY CASE WHEN h.id IS NOT NULL THEN h.department_id ELSE d.department_id END, dept.name, divi.name
           ORDER BY total_cost DESC
           LIMIT 8`,
          [...monthParam, ...buildingParam]
        )
        .then(([rows]) => rows),

      // ---------- 5) เดือนที่ยังกรอกไม่ครบ ----------
      // นับเฉพาะเครื่องที่ยังใช้งานอยู่ — เครื่องที่ปลดระวางหรือส่งซ่อมไม่มีมิเตอร์
      // ให้ไปอ่าน การนับรวมจะทำให้ความคืบหน้าไม่มีวันถึงครบ แล้วตัวเลขนั้นจะถูกเมิน
      //
      // ⚠️ ต้องมี ${buildingClause} เหมือนกับคิวรี่ที่นับ active_devices (ข้อ 3)
      // เป๊ะๆ — ตัวเศษกับตัวส่วนของ "ความครบถ้วน" ต้องมาจากขอบเขตเดียวกันเสมอ
      //
      // บั๊กที่เคยเกิด: คิวรี่นี้ไม่มีตัวกรองอาคาร แต่ข้อ 3 มี พอผู้ใช้เลือกอาคาร
      // ที่มีเครื่อง 3 เครื่อง ตัวส่วนกลายเป็น 3 ส่วนตัวเศษยังเป็นยอดรวมทุกอาคาร
      // (18) เงื่อนไข 18 < 3 เป็นเท็จ เดือนนั้นจึงถูกนับว่า "ครบแล้ว" ทั้งที่อาคาร
      // นั้นอาจยังไม่ได้กรอกสักเครื่องเดียว — เป็นการรายงานว่างานเสร็จทั้งที่ยังไม่ทำ
      range
        ? db
            .query(
              `SELECT pt.month, COUNT(*) AS filled
               FROM print_transactions pt
               JOIN devices d ON pt.device_id = d.id AND d.status = 'active'
               LEFT JOIN building b ON d.building_id = b.id
               WHERE pt.month BETWEEN ? AND ? ${buildingClause}
               GROUP BY pt.month`,
              [range.start_month, range.end_month, ...buildingParam]
            )
            .then(([rows]) => rows)
        : Promise.resolve([]),

      // ---------- 6) เครื่องที่พิมพ์อยู่แต่คิดเงินไม่ได้ ----------
      //
      // ราคาที่ใช้จริงคือ COALESCE(price_override, contract.price_per_page, 0)
      // เครื่องที่ไม่มีทั้งสองอย่างจะคิดเป็น 0 บาทเสมอ — ยอดพิมพ์ของมันหายไปจากงบ
      // เงียบๆ โดยไม่มีอะไรเตือน นี่คือบั๊กทางบัญชีที่ระบบไม่เคยบอกใคร
      //
      // ⚠️ ชื่อ alias ของ subquery ต้องไม่ใช่ "usage" — เป็นคำสงวนใน MariaDB
      // (ฐานข้อมูลที่ระบบนี้รันอยู่จริง) แม้ MySQL จะยอมรับก็ตาม
      db
        .query(
          `SELECT
             COUNT(*) AS device_count,
             COALESCE(SUM(pages_used.pages), 0) AS unbilled_pages
           FROM devices d
           LEFT JOIN contracts c ON d.contract_id = c.id
           LEFT JOIN building b ON d.building_id = b.id
           LEFT JOIN (
             SELECT device_id, SUM(pages) AS pages
             FROM print_transactions
             ${range ? "WHERE month BETWEEN ? AND ?" : ""}
             GROUP BY device_id
           ) pages_used ON pages_used.device_id = d.id
           WHERE d.status = 'active'
             AND d.price_override IS NULL
             AND (c.price_per_page IS NULL OR c.price_per_page = 0)
             AND COALESCE(pages_used.pages, 0) > 0
             ${buildingClause}`,
          [...(range ? [range.start_month, range.end_month] : []), ...buildingParam]
        )
        .then(([rows]) => rows[0]),

      // ---------- 7) เครื่องที่ไม่มีใครใช้เลยตลอดปีงบ ----------
      // ผู้ที่ควรรู้คือคนที่ต่อสัญญา — เครื่องที่เช่าไว้แล้วไม่มีใครใช้คือเงินที่จ่ายทิ้ง
      range
        ? db
            .query(
              `SELECT COUNT(*) AS device_count
               FROM devices d
               LEFT JOIN building b ON d.building_id = b.id
               WHERE d.status = 'active'
                 ${buildingClause}
                 AND NOT EXISTS (
                   SELECT 1 FROM print_transactions pt
                   WHERE pt.device_id = d.id
                     AND pt.month BETWEEN ? AND ?
                     AND pt.pages > 0
                 )`,
              [...buildingParam, range.start_month, range.end_month]
            )
            .then(([rows]) => rows[0])
        : Promise.resolve({ device_count: 0 }),
    ]);

    // ---------- ประกอบสถานะเครื่อง ----------
    const statusMap = new Map(statusRows.map((row) => [row.status, Number(row.count)]));
    const deviceStatus = ["active", "repair", "retired"].map((status) => ({
      status,
      count: statusMap.get(status) || 0,
    }));
    const activeDevices = statusMap.get("active") || 0;

    // ---------- ประกอบรายการที่ต้องลงมือทำ ----------
    const attention = [];

    // เดือนที่ยังกรอกไม่ครบ (ไม่นับเดือนอนาคต)
    const filledByMonth = new Map(gaps.map((row) => [row.month, Number(row.filled)]));
    const today = currentMonth();

    // เดือนปัจจุบันยังไม่จบ จึงยังไม่ถือว่า "ค้าง" — มิเตอร์ของเดือนนี้อ่านได้ก็ต่อ
    // เมื่อเดือนจบแล้ว การนับรวมเข้าไปทำให้ระบบขึ้นคำเตือนทุกวันตลอดทั้งเดือนสำหรับ
    // งานที่ยังไม่ถึงเวลาทำ ซึ่งเป็นวิธีที่เร็วที่สุดในการสอนให้ผู้ใช้เมินคำเตือน
    const { coverage, incompleteMonths } = computeCoverage({
      fyMonths,
      filledByMonth,
      activeDevices,
      today,
    });

    if (incompleteMonths.length && activeDevices > 0) {
      const oldest = incompleteMonths[0];
      const missing = activeDevices - (filledByMonth.get(oldest) || 0);

      attention.push({
        code: "missing_readings",
        severity: "warning",
        title:
          incompleteMonths.length === 1
            ? `ยังกรอกยอดพิมพ์ไม่ครบ 1 เดือน`
            : `ยังกรอกยอดพิมพ์ไม่ครบ ${incompleteMonths.length} เดือน`,
        detail: `เดือนที่ค้างนานที่สุดคือ${formatMonthTH(oldest, { long: true })} ขาดอีก ${missing} เครื่อง`,
        count: incompleteMonths.length,
        params: { month: oldest, missing_devices: missing },
        // ส่งเดือนที่ค้างไปด้วย เพื่อให้ปุ่มบนหน้าเว็บพาไปที่เดือนนั้นเลย
        // ไม่ใช่พาไปหน้าเปล่าแล้วให้ผู้ใช้ไล่หาเองว่าเดือนไหนขาด
        months: incompleteMonths,
        action: { label: "ไปกรอกยอดพิมพ์", to: "/print-transactions", query: { month: oldest, building: building_name || undefined, fill: "empty", fy: fiscal_year_id || undefined } },
      });
    }

    // เครื่องที่พิมพ์อยู่แต่ไม่มีราคา
    if (Number(unbilled?.device_count) > 0) {
      attention.push({
        code: "unbilled_devices",
        severity: "critical",
        title: `มี ${unbilled.device_count} เครื่องที่พิมพ์แล้วแต่คิดค่าใช้จ่ายไม่ได้`,
        detail: `รวม ${Number(unbilled.unbilled_pages).toLocaleString("th-TH")} แผ่นที่ไม่ได้ถูกนับเป็นค่าใช้จ่าย เพราะเครื่องไม่มีสัญญาและไม่มีราคาเฉพาะเครื่อง`,
        count: Number(unbilled.device_count),
        params: { pages: Number(unbilled.unbilled_pages) },
        action: { label: "ดูเครื่องที่ยังไม่มีสัญญา", to: "/assets", query: { unassigned: "1" } },
      });
    }

    // เครื่องที่ไม่มีใครใช้เลยทั้งปี
    if (Number(idle?.device_count) > 0 && range) {
      attention.push({
        code: "idle_devices",
        severity: "info",
        title: `มี ${idle.device_count} เครื่องที่ไม่มียอดพิมพ์เลยตลอดปีงบนี้`,
        detail: "อาจย้ายไปหน่วยงานที่ต้องใช้ หรือพิจารณาไม่ต่อสัญญาในปีถัดไป",
        count: Number(idle.device_count),
        action: { label: "ดูรายการเครื่อง", to: "/assets", query: { status: "active" } },
      });
    }

    attention.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    // ---------- เทียบกับช่วงก่อนหน้า ----------
    //
    // คำนวณจาก series ที่ดึงมาแล้ว ไม่ยิงคำสั่งเพิ่ม — ข้อมูลทั้งปีอยู่ในมือแล้ว
    // การถามฐานข้อมูลซ้ำเพื่อหาผลรวมของเดือนที่เรามีอยู่แล้วคือการเสียเวลาเปล่า
    const seriesByMonth = new Map(series.map((row) => [row.month, row]));

    const sumOf = (monthList) => ({
      pages: monthList.reduce((sum, m) => sum + Number(seriesByMonth.get(m)?.net_pages || 0), 0),
      cost_satang: sumSatang(monthList.map((m) => toSatang(seriesByMonth.get(m)?.total_cost || 0))),
    });

    let comparison = null;
    if (months.length && fyMonths.length) {
      const firstIndex = fyMonths.indexOf(months[0]);
      // ช่วงก่อนหน้าต้องยาวเท่ากันและต้องอยู่ในปีงบเดียวกัน — ถ้าช่วงที่เลือกเริ่ม
      // ตั้งแต่เดือนแรกของปีงบ ก็ไม่มีช่วงก่อนหน้าให้เทียบภายในปีนั้น จึงคืน null
      // แทนการเทียบข้ามปีงบซึ่งเป็นการเทียบคนละสัญญาและคนละราคา
      if (firstIndex >= months.length) {
        const previousMonths = fyMonths.slice(firstIndex - months.length, firstIndex);
        const current = sumOf(months);
        const previous = sumOf(previousMonths);

        comparison = {
          previous_months: previousMonths,
          previous_pages: previous.pages,
          previous_cost: fromSatang(previous.cost_satang),
          pages_change_percent:
            previous.pages > 0 ? ((current.pages - previous.pages) / previous.pages) * 100 : null,
          cost_change_percent:
            previous.cost_satang > 0
              ? ((current.cost_satang - previous.cost_satang) / previous.cost_satang) * 100
              : null,
        };
      }
    }

    cache.operationalData(res);
    res.json({
      fiscal_year: range ? { id: range.id, year: range.year, months: fyMonths } : null,
      selected_months: months,

      totals: {
        total_pages: Number(totals.total_pages),
        total_cost: Number(totals.total_cost),
        reporting_devices: Number(totals.reporting_devices),
        reporting_active_devices: Number(totals.reporting_active_devices),
        active_devices: activeDevices,
        total_devices: deviceStatus.reduce((sum, row) => sum + row.count, 0),
      },

      coverage,

      comparison,

      // เส้นแนวโน้มของทั้งปีงบ — การ์ด KPI ใช้ทำเส้นจิ๋ว และกราฟใหญ่ใช้ชุดเดียวกันนี้
      // ไม่ต้องยิงคำขอแยก (ดู ADR-0009 — หลักการเดียวกัน คนละชั้น)
      series: series.map((row) => ({
        month: row.month,
        net_pages: Number(row.net_pages),
        total_cost: Number(row.total_cost),
        device_count: Number(row.device_count),
      })),

      device_status: deviceStatus,
      top_departments: byDepartment,

      attention: attention.slice(0, MAX_ATTENTION_ITEMS),
    });
  })
);

module.exports = router;
module.exports.computeCoverage = computeCoverage;
