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
const { effectiveContractJoin, effectiveContractId } = require("../shared/effective-contract-sql");
const { readCoverageScope } = require("../shared/coverage-scope");
const { reportQuery } = require("./filters");
const {
  fiscalYearMonths,
  formatMonthTH,
  fromSatang,
  toSatang,
  sumSatang,
  computeCoverage,
  currentMonth,
} = require("@suth/domain");

/** จำนวนรายการเตือนสูงสุดที่ส่งกลับไป */
const MAX_ATTENTION_ITEMS = 6;

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

const readingsAndPages = ({ readings, pages }) =>
  `${readings.toLocaleString("th-TH")} รายการ รวม ${pages.toLocaleString("th-TH")} แผ่น`;

/**
 * สาเหตุที่ยอดพิมพ์หาราคาไม่ได้ แยกตามหน้าที่แก้ได้จริง (#96)
 *
 * `cause` คือค่าที่คิวรี่ใช้จัดกลุ่มและเป็นคำนำหน้าชื่อคอลัมน์ผลรวม ส่วน `code`
 * คงค่าที่หน้าเว็บใช้แปลภาษาอยู่ ลำดับในรายการนี้คือลำดับบนลิ้นชักแจ้งเตือน
 */
const UNPRICED_CAUSES = [
  // ทางเขียนทุกทางปฏิเสธยอดที่หาราคาไม่ได้แล้ว (ADR-0021) กลุ่มเหล่านี้จึงเหลือเฉพาะ
  // ข้อมูลเก่าที่เข้ามาก่อนกฎนั้น และแสดงในลิ้นชักแจ้งเตือนของผู้ดูแลเท่านั้น
  {
    // สัญญาที่คิดเงินเดือนนั้นมีอยู่ แต่เดือนนั้นอยู่นอกอายุสัญญา
    cause: "outside_term",
    code: "unpriced_outside_term",
    severity: "critical",
    title: (count) => `มี ${count} เครื่องที่มียอดพิมพ์นอกอายุสัญญา`,
    detail: (group) => `${readingsAndPages(group)} ยังไม่ถูกนับในยอดเงิน — ตรวจวันเริ่ม/สิ้นสุดของสัญญา`,
    action: { label: "ไปตรวจอายุสัญญา", to: "/admin/contracts" },
  },
  {
    // สัญญาครอบคลุมเดือนนั้น แต่ไม่มีราคาของหมวดมิเตอร์นั้น
    cause: "missing_price_line",
    code: "unpriced_missing_price_line",
    severity: "critical",
    title: (count) => `มี ${count} เครื่องที่สัญญาไม่มีราคาของหมวดมิเตอร์`,
    detail: (group) => `${readingsAndPages(group)} ยังไม่ถูกนับในยอดเงิน — เพิ่มรายการราคาในสัญญา หรือแก้หมวดมิเตอร์ของเครื่อง`,
    action: { label: "ไปตรวจรายการราคาของสัญญา", to: "/admin/contracts" },
  },
  {
    cause: "unassigned",
    code: "unassigned_unbilled_devices",
    severity: "critical",
    title: (count) => `มี ${count} เครื่องที่ยังไม่ได้ผูกสัญญา`,
    detail: (group) => `${readingsAndPages(group)} ยังไม่ถูกนับในยอดเงิน`,
    action: { label: "ไปผูกสัญญาให้เครื่อง", to: "/assets", query: { unassigned: "true" } },
    opensFirstDevice: true,
  },
  {
    // ประวัติบอกว่าเดือนนั้นไม่มีสัญญา ทั้งที่ตอนนี้เครื่องผูกสัญญาของปีงบนั้นอยู่
    cause: "contract_history",
    code: "unpriced_contract_history",
    severity: "critical",
    title: (count) => `มี ${count} เครื่องที่ประวัติสัญญาไม่ครอบคลุมยอดพิมพ์`,
    detail: (group) => `${readingsAndPages(group)} ต้องตรวจวันที่เริ่มคิดเงินของเครื่อง`,
    action: { label: "ไปตรวจประวัติสัญญาของเครื่อง", to: "/assets" },
    opensFirstDevice: true,
  },
];

/**
 * เปิดฟอร์มของเครื่องแรกที่ต้องแก้ พร้อมวันที่เริ่มคิดเงินที่แนะนำ
 *
 * การพาไปแค่หน้าทะเบียนทำให้ผู้ใช้กดแล้วไม่รู้ว่าต้องทำอะไรต่อ งานค้างจึงดูเหมือน
 * "กดแล้วไม่หาย" (#96) บันทึกเสร็จแล้วแดชบอร์ดจะชี้เครื่องถัดไปเอง ส่วนวันที่เป็น
 * เพียงค่าแนะนำ ผู้ใช้ยังต้องตรวจกับเอกสารก่อนบันทึก
 *
 * @param {string|null} firstTarget "YYYY-MM|<device id เติมศูนย์>" — SQL เลือกคู่นี้จาก
 *   แถวเดียวกัน ห้ามหา MIN(device_id) กับ MIN(month) แยกกัน เพราะวันที่ของเครื่องอื่น
 *   อาจถูกเอาไปเสนอให้เครื่องที่เปิดอยู่
 */
function withFirstDevice(action, firstTarget) {
  const [firstMonth, paddedDeviceId] = String(firstTarget || "").split("|");
  const firstDeviceId = Number(paddedDeviceId) || null;
  if (!firstDeviceId) return action;

  return {
    ...action,
    query: {
      ...action.query,
      edit: String(firstDeviceId),
      ...(firstMonth ? { billing_from: `${firstMonth}-01` } : {}),
    },
  };
}

/** เครื่องและเดือนแรกของสาเหตุหนึ่ง สำหรับ withFirstDevice — ค่าคงที่ในโค้ดเท่านั้น */
function firstTargetColumn(cause) {
  return `MIN(CASE
               WHEN cause = '${cause}'
               THEN CONCAT(month, '|', LPAD(device_id, 20, '0'))
             END) AS ${cause}_first_target`;
}

/** จำนวนเครื่อง รายการ และแผ่นของยอดที่หาราคาไม่ได้ด้วยสาเหตุเดียว — ค่าคงที่ในโค้ดเท่านั้น */
function unpricedCauseColumns(cause) {
  return `COUNT(DISTINCT CASE WHEN cause = '${cause}' THEN device_id END) AS ${cause}_device_count,
             SUM(CASE WHEN cause = '${cause}' THEN 1 ELSE 0 END) AS ${cause}_readings,
             COALESCE(SUM(CASE WHEN cause = '${cause}' THEN pages_printed ELSE 0 END), 0) AS ${cause}_pages`;
}

/** แยกงานที่แก้คนละหน้าออกจากกัน เพื่อให้ทุกลิงก์พาไปถึงจุดที่ลงมือแก้ได้จริง (#96) */
function buildUnbilledAttention(unbilled) {
  return UNPRICED_CAUSES.flatMap((spec) => {
    const count = Number(unbilled?.[`${spec.cause}_device_count`]) || 0;
    if (count === 0) return [];

    const group = {
      readings: Number(unbilled[`${spec.cause}_readings`]),
      pages: Number(unbilled[`${spec.cause}_pages`]),
    };
    return [{
      code: spec.code,
      severity: spec.severity,
      title: spec.title(count),
      detail: spec.detail(group),
      count,
      params: group,
      action: spec.opensFirstDevice
        ? withFirstDevice(spec.action, unbilled[`${spec.cause}_first_target`])
        : spec.action,
    }];
  });
}

router.get(
  "/overview",
  validate({ query: reportQuery }),
  asyncHandler(async (req, res) => {
    const { fiscal_year_id, building_name, contract_id } = req.query;
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
    const contractClause = contract_id ? " AND d.contract_id = ? " : "";
    const contractParam = contract_id ? [contract_id] : [];
    const monthClause = months.length ? " AND v.month IN (?) " : "";
    const monthParam = months.length ? [months] : [];

    const [totals, series, statusRows, byDepartment, coverageScope, unbilled, idle, noLocation] = await Promise.all([
      // ---------- 1) ยอดรวมของช่วงที่เลือก ----------
      db
        .query(
          `SELECT
             COALESCE(SUM(v.net_pages), 0) AS total_pages,
             -- SUM() ข้ามแถวที่ราคายังยืนยันไม่ได้ ยอดนี้จึงเป็น "ยอดที่ยืนยันแล้ว"
             -- ไม่ใช่ค่าใช้จ่ายทั้งหมด — ต้องส่ง unpriced_readings ไปคู่กันเสมอ
             -- ไม่งั้นหน้าจอจะนำเสนอยอดบางส่วนเป็นข้อสรุป (ADR-0019 Q27)
             COALESCE(SUM(v.total_cost), 0) AS total_cost,
             SUM(CASE WHEN v.total_cost IS NULL THEN 1 ELSE 0 END) AS unpriced_readings,
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
           WHERE 1=1 ${monthClause} ${usageBuildingClause} ${contractClause}`,
          [...monthParam, ...buildingParam, ...contractParam]
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
                 SUM(CASE WHEN v.total_cost IS NULL THEN 1 ELSE 0 END) AS unpriced_readings,
                 COUNT(DISTINCT v.device_id) AS device_count
               FROM v_monthly_kpi v
               JOIN devices d ON v.device_id = d.id
               LEFT JOIN building b ON d.building_id = b.id
               ${effectiveLocationJoin({ deviceAlias: "d", monthExpression: "v.month", historyAlias: "h" })}
               LEFT JOIN building hb ON h.building_id = hb.id
               WHERE v.month BETWEEN ? AND ? ${usageBuildingClause} ${contractClause}
               GROUP BY v.month
               ORDER BY v.month`,
              [range.start_month, range.end_month, ...buildingParam, ...contractParam]
            )
            .then(([rows]) => rows)
        : Promise.resolve([]),

      // ---------- 3) จำนวนเครื่องแยกตามสถานะ ----------
      db
        .query(
          `SELECT d.status, COUNT(*) AS count
           FROM devices d
           LEFT JOIN building b ON d.building_id = b.id
           WHERE 1=1 ${buildingClause} ${contractClause}
           GROUP BY d.status`,
          [...buildingParam, ...contractParam]
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
           WHERE 1=1 ${monthClause} ${usageBuildingClause} ${contractClause}
           GROUP BY CASE WHEN h.id IS NOT NULL THEN h.department_id ELSE d.department_id END, dept.name, divi.name
           ORDER BY total_cost DESC
           LIMIT 8`,
          [...monthParam, ...buildingParam, ...contractParam]
        )
        .then(([rows]) => rows),

      // ---------- 5) ความครบถ้วนของยอด ----------
      // ตัวเศษ ตัวส่วน และจำนวนเครื่องที่ยังไม่ตรวจยืนยัน ออกมาจากฟังก์ชันเดียว
      // เพื่อให้กรองด้วยขอบเขตชุดเดียวกันโดยไม่มีทางหลุด — เหตุผลเต็มอยู่ใน
      // shared/coverage-scope.js
      //
      // ตัวส่วนคือ "เครื่องที่ต้องกรอกในเดือนนั้น" ตามช่วงความรับผิดชอบจริง
      // ไม่ใช่จำนวนเครื่องที่ใช้งานอยู่ ณ ตอนนี้ ซึ่งเคยทำให้การเพิ่มเครื่องใหม่
      // กลางปีทำให้เดือนเก่าที่กรอกครบแล้วกลายเป็นค้างย้อนหลัง (issue #79)
      range
        ? readCoverageScope({
            months: fyMonths,
            startMonth: range.start_month,
            endMonth: range.end_month,
            buildingName: building_name,
            contractId: contract_id,
          })
        : Promise.resolve(null),

      // ---------- 6) ยอดพิมพ์ที่ยังหาราคาที่มีผลไม่ได้ ----------
      //
      // เดิมคำถามคือ "เครื่องไหนไม่มีราคาเลย" ซึ่งตอบได้จากค่าปัจจุบันของเครื่อง
      // และสัญญา ตอนนี้ราคาผูกกับช่วงเวลาที่มีผลจริง (ADR-0019) คำถามที่ถูกจึงเป็น
      // "ยอดของเดือนไหนที่หาราคาไม่ได้" ซึ่งครอบคลุมกรณีที่คำถามเดิมมองไม่เห็น เช่น
      // เครื่องที่มีสัญญาแต่ช่วงของสัญญาไม่ครอบคลุมเดือนนั้น (issue #81) และสัญญา
      // ที่ยังไม่มีใครยืนยันช่วงที่มีผล
      //
      // ⚠️ ชื่อ alias ของ subquery ต้องไม่ใช่ "usage" — เป็นคำสงวนใน MariaDB
      // (ฐานข้อมูลที่ระบบนี้รันอยู่จริง) แม้ MySQL จะยอมรับก็ตาม
      db
        .query(
          `WITH unpriced_scope AS (
             SELECT
               v.device_id,
               v.month,
               v.pages_printed,
               d.contract_id AS current_contract_id,
               dch.id AS history_id,
               ${effectiveContractId({ historyAlias: "dch", deviceAlias: "d" })} AS effective_contract_id
             FROM v_monthly_kpi v
             JOIN devices d ON d.id = v.device_id
             ${effectiveContractJoin({ deviceIdExpression: "v.device_id", monthExpression: "v.month", historyAlias: "dch" })}
             LEFT JOIN building b ON d.building_id = b.id
             WHERE v.total_cost IS NULL
               ${range ? "AND v.month BETWEEN ? AND ?" : ""}
               ${buildingClause} ${contractClause}
           ),
           -- แยกตามหน้าที่แก้ได้จริง (UNPRICED_CAUSES) ด้วยกติกาเดียวกับ v_monthly_kpi
           unpriced_cause AS (
             SELECT
               s.device_id,
               s.month,
               s.pages_printed,
               CASE
                 WHEN s.history_id IS NULL AND s.current_contract_id IS NULL THEN 'unassigned'
                 WHEN s.history_id IS NULL OR s.effective_contract_id IS NULL THEN 'contract_history'
                 WHEN s.month < DATE_FORMAT(ec.effective_from + INTERVAL (DAY(ec.effective_from) > 1) MONTH, '%Y-%m')
                   OR s.month > DATE_FORMAT(ec.effective_to, '%Y-%m') THEN 'outside_term'
                 ELSE 'missing_price_line'
               END AS cause
             FROM unpriced_scope s
             LEFT JOIN contracts ec ON ec.id = s.effective_contract_id
           )
           SELECT
             ${UNPRICED_CAUSES.map(({ cause }) => unpricedCauseColumns(cause)).join(",\n             ")},
             ${UNPRICED_CAUSES.filter((spec) => spec.opensFirstDevice)
               .map(({ cause }) => firstTargetColumn(cause))
               .join(",\n             ")}
           FROM unpriced_cause`,
          [...(range ? [range.start_month, range.end_month] : []), ...buildingParam, ...contractParam]
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
                 ${buildingClause} ${contractClause}
                 AND NOT EXISTS (
                   SELECT 1 FROM print_transactions pt
                   WHERE pt.device_id = d.id
                     AND pt.month BETWEEN ? AND ?
                     AND pt.pages > 0
                 )`,
              [...buildingParam, ...contractParam, range.start_month, range.end_month]
            )
            .then(([rows]) => rows[0])
        : Promise.resolve({ device_count: 0 }),

      // ---------- 8) เครื่องที่ยังไม่รู้ว่าอยู่ฝ่าย/อาคารไหน ----------
      // รายงานมิเตอร์ของผู้ให้เช่าบางฉบับไม่มีคอลัมน์ฝ่ายกับอาคาร เครื่องที่ลงจากไฟล์นั้นจึงว่าง
      // แล้วค่าใช้จ่ายทั้งก้อนไปกองที่ "ไม่ระบุฝ่าย" บนหน้ารายงาน — ต้องบอกว่าแก้ที่ไหน ไม่ใช่ปล่อยเงียบ
      db
        .query(
          `SELECT COUNT(*) AS device_count,
                  SUM(d.division_id IS NULL) AS no_division,
                  SUM(d.building_id IS NULL) AS no_building
           FROM devices d
           LEFT JOIN building b ON d.building_id = b.id
           WHERE d.status = 'active' AND (d.division_id IS NULL OR d.building_id IS NULL)
             ${buildingClause} ${contractClause}`,
          [...buildingParam, ...contractParam]
        )
        .then(([rows]) => rows[0]),
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

    const today = currentMonth();

    // เดือนปัจจุบันยังไม่จบ จึงยังไม่ถือว่า "ค้าง" — มิเตอร์ของเดือนนี้อ่านได้ก็ต่อ
    // เมื่อเดือนจบแล้ว การนับรวมเข้าไปทำให้ระบบขึ้นคำเตือนทุกวันตลอดทั้งเดือนสำหรับ
    // งานที่ยังไม่ถึงเวลาทำ ซึ่งเป็นวิธีที่เร็วที่สุดในการสอนให้ผู้ใช้เมินคำเตือน
    const { coverage, incompleteMonths } = computeCoverage({
      fyMonths,
      filledByMonth: coverageScope?.filledByMonth ?? new Map(),
      requiredByMonth: coverageScope?.requiredByMonth ?? new Map(),
      unverifiedByMonth: coverageScope?.unverifiedByMonth ?? new Map(),
      unreviewedDevices: coverageScope?.unreviewedDevices ?? 0,
      today,
    });

    // เครื่องที่ยังไม่มีใครตรวจยืนยันสถานะการติดตั้ง
    //
    // ต้องมาก่อนงานค้างรายเดือนเสมอ เพราะตราบใดที่ยังตรวจไม่ครบ ตัวเลขงานค้างยัง
    // ยืนยันไม่ได้ (ดู coverage.cjs) การไล่กรอกยอดก่อนตรวจจึงเป็นการทำงานบนตัวเลข
    // ที่ยังไม่รู้ว่าถูกหรือไม่ — งานที่ถูกลำดับคือไปตรวจยืนยันให้ครบก่อน
    if (coverage.unreviewed_devices > 0) {
      attention.push({
        code: "unverified_installation",
        severity: "warning",
        title: `มี ${coverage.unreviewed_devices} เครื่องที่ยังไม่ได้ตรวจยืนยันสถานะการติดตั้ง`,
        detail:
          "ยืนยันความครบถ้วนของยอดพิมพ์ไม่ได้จนกว่าจะตรวจครบ ระบบไม่เดาให้ว่าเครื่องเหล่านี้ติดตั้งแล้วหรือยัง",
        count: coverage.unreviewed_devices,
        action: { label: "ไปตรวจยืนยันการติดตั้ง", to: "/admin/installation-review" },
      });
    }

    if (incompleteMonths.length) {
      const oldest = incompleteMonths[0];
      // อ่านจากผลของ computeCoverage ไม่คำนวณซ้ำเอง — ตัวเลข "ขาดอีกกี่เครื่อง"
      // ที่ขึ้นบนคำเตือนต้องเป็นตัวเดียวกับที่ขึ้นในตารางความครบถ้วนเสมอ
      const missing = coverage.months.find((m) => m.month === oldest)?.missing_devices ?? 0;

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
        action: { label: "ไปกรอกจำนวนพิมพ์", to: "/print-transactions", query: { month: oldest, building: building_name || undefined, fill: "empty", fy: fiscal_year_id || undefined } },
      });
    }

    // เครื่องที่พิมพ์อยู่แต่ไม่มีราคา — แยกตามหน้าที่แก้ได้จริง (#96)
    attention.push(...buildUnbilledAttention(unbilled));

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

    if (Number(noLocation?.device_count) > 0) {
      const count = Number(noLocation.device_count);
      attention.push({
        code: "missing_location",
        severity: "warning",
        title: `มี ${count} เครื่องที่ยังไม่ระบุฝ่ายหรืออาคาร`,
        detail:
          "ค่าใช้จ่ายของเครื่องกลุ่มนี้ไปรวมอยู่ที่ \"ไม่ระบุฝ่าย\" ในรายงาน — นำเข้ารายงานสถานะเครื่องของผู้ให้เช่า (มีคอลัมน์ฝ่าย อาคาร) ระบบจะเติมเฉพาะช่องที่ว่าง หรือแก้ทีละเครื่องที่ทะเบียนเครื่อง",
        count,
        params: { no_division: Number(noLocation.no_division) || 0, no_building: Number(noLocation.no_building) || 0 },
        action: { label: "ดูเครื่องที่ยังไม่ระบุ", to: "/assets", query: { missing: "location", status: "active" } },
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
        // จำนวนยอดพิมพ์ที่ยังหาราคาที่มีผลไม่ได้ — total_cost ด้านบนไม่ได้รวมรายการ
        // เหล่านี้ หน้าจอต้องบอกทั้งสองอย่างคู่กัน (Q27)
        unpriced_readings: Number(totals.unpriced_readings) || 0,
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
        // เดือนที่ทุกรายการหาราคาไม่ได้ (ยอดเก่าก่อน ADR-0021) ต้องเป็น null ไม่ใช่ 0 —
        // จุดที่ค่าเป็นศูนย์บนกราฟแปลว่า "เดือนนั้นไม่มีค่าใช้จ่าย" ซึ่งคนละเรื่องกับ
        // "ไม่รู้ว่าเท่าไหร่"
        total_cost: row.total_cost === null ? null : Number(row.total_cost),
        unpriced_readings: Number(row.unpriced_readings) || 0,
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
module.exports.buildUnbilledAttention = buildUnbilledAttention;
