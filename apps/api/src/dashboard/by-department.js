// apps/api/src/dashboard/by-department.js
//
// มุมมองแบบผังองค์กร: ฝ่าย → แผนก → เครื่อง → ยอดพิมพ์รายเดือน
// พร้อมเทียบช่วงที่เลือกกับ "ช่วงก่อนหน้าที่ยาวเท่ากัน"
//
// รายงานนี้ตอบคำถามว่า "แผนกไหนใช้เพิ่มขึ้น/ลดลง" ซึ่งเป็นคำถามที่ผู้บริหารถาม
// จริงเวลาต้องคุมงบ — ไม่ใช่แค่ "แผนกไหนใช้เยอะ"
//
// ## จุดที่เคยพังและเหตุผลที่โค้ดหน้าตาแบบนี้
//
// 1. **เคยเป็น N+1 หนัก** — เดิมวน query ทีละฝ่าย → แผนก → เครื่อง → เดือน
//    ตอนนี้ใช้ 3 คำสั่งคงที่ไม่ว่าจะมีกี่เครื่อง แล้วจัดกลุ่มฝั่ง JS
//
// 2. **เงื่อนไขช่วงเดือนต้องอยู่ใน ON ไม่ใช่ WHERE** — ไม่งั้น LEFT JOIN กลายเป็น
//    INNER JOIN โดยปริยาย แล้วเครื่องที่ไม่มียอดในช่วงนั้นจะหายไปจากรายงานทั้งเครื่อง
//    ทั้งที่ "เครื่องที่ไม่มีใครใช้" คือข้อมูลที่มีค่าที่สุดอย่างหนึ่งของรายงานนี้
//
// 3. **แผนกที่ยึดตามประวัติ ไม่ใช่แผนกปัจจุบัน** — เครื่องที่ย้ายแผนกกลางปีงบ
//    ยอดพิมพ์ของเดือนเก่าต้องยังค้างอยู่กับแผนกเดิมที่รับผิดชอบตอนนั้น ไม่งั้น
//    แผนกใหม่จะถูกคิดเงินย้อนหลังทั้งปีสำหรับเครื่องที่เพิ่งได้รับมาเดือนที่แล้ว
//
// 4. **เทียบระดับ "เดือน" ล้วนๆ** — v.month คือ 'YYYY-MM' ไม่มีวันที่ ห้ามเทียบกับ
//    effective_from/to แบบวันที่จริง เพราะการย้ายกลางเดือน (วันที่ 20) จะทำให้เดือน
//    นั้นไม่ตรงเงื่อนไขช่วงไหนเลย ยอดทั้งเดือนหายไปจากรายงาน

const express = require("express");
const router = express.Router();

const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const { validate } = require("../shared/validate");
const cache = require("../shared/cache");
const { notFound } = require("../shared/http-error");
const { reportQuery } = require("./filters");
const { toSatang, fromSatang, sumSatang } = require("@suth/domain");

/** เดือนก่อนหน้าเดือนที่ให้มา — "2025-01" → "2024-12" */
function previousMonthOf(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * ช่วงก่อนหน้าที่มีจำนวนเดือน "เท่ากัน" กับช่วงที่เลือก
 *
 * ถ้าผู้ใช้เลือกทั้งไตรมาส (3 เดือน) ต้องเทียบกับ 3 เดือนก่อนหน้า ไม่ใช่เดือนเดียว
 * — การเทียบไตรมาสกับเดือนเดียวทำให้ทุกแผนกดูเหมือนใช้เพิ่มขึ้นสามเท่าเสมอ
 */
function previousPeriodMonths(sortedMonths) {
  const result = [];
  let cursor = sortedMonths[0];

  for (let i = 0; i < sortedMonths.length; i++) {
    cursor = previousMonthOf(cursor);
    result.unshift(cursor);
  }

  return result;
}

/**
 * เปอร์เซ็นต์การเปลี่ยนแปลง
 * @returns {number|null} null = คำนวณไม่ได้ (ไม่มีข้อมูลช่วงก่อนให้เทียบ)
 */
function changePercent(current, previous, hasPrevious) {
  if (!hasPrevious) return null;
  // จาก 0 ไปเป็นมากกว่า 0 ไม่ใช่ "เพิ่มขึ้นอนันต์เปอร์เซ็นต์" แต่คือ "ของใหม่"
  // การคืน null ตรงนี้ทำให้ฝั่งเว็บแสดงป้าย "ใหม่" แทนตัวเลขที่ไร้ความหมาย
  if (previous === 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

router.get(
  "/by-department",
  validate({ query: reportQuery }),
  asyncHandler(async (req, res) => {
    const { fiscal_year_id } = req.query;

    const currentMonths = [...req.query.month].sort();
    const previousMonths = currentMonths.length ? previousPeriodMonths(currentMonths) : [];
    const currentSet = new Set(currentMonths);
    const previousSet = new Set(previousMonths);

    // จำกัดตามปีงบที่เลือก ให้ยอดรวมตรงกับหน้า "ค่าใช้จ่ายแยกตามสัญญา" —
    // ไม่ส่ง fiscal_year_id มา = รวมทุกเดือนที่มีในระบบ (พฤติกรรมเดิม)
    let fiscalYear = null;
    if (fiscal_year_id) {
      const [[row]] = await db.query("SELECT start_month, end_month FROM fiscal_year WHERE id = ?", [
        fiscal_year_id,
      ]);
      if (!row) throw notFound("ไม่พบปีงบประมาณนี้");
      fiscalYear = row;
    }

    const [[divisions], [departments], [rows]] = await Promise.all([
      db.query("SELECT id, name FROM division ORDER BY name"),
      db.query("SELECT id, name, division_id FROM department ORDER BY name"),
      db.query(
        `SELECT
           d.id AS device_id,
           d.serial_number,
           d.model,
           d.status,
           b.name AS brand_name,
           v.month,
           v.net_pages,
           v.total_cost,
           COALESCE(h.department_id, d.department_id) AS effective_department_id
         FROM devices d
         LEFT JOIN brand b ON d.brand_id = b.id
         LEFT JOIN v_monthly_kpi v
           ON v.device_id = d.id
           ${fiscalYear ? "AND v.month BETWEEN ? AND ?" : ""}
         LEFT JOIN device_location_history h
           ON h.device_id = d.id
           AND v.month IS NOT NULL
           AND v.month >= DATE_FORMAT(h.effective_from, '%Y-%m')
           AND (h.effective_to IS NULL OR v.month < DATE_FORMAT(h.effective_to, '%Y-%m'))
         ORDER BY effective_department_id, d.serial_number, v.month`,
        fiscalYear ? [fiscalYear.start_month, fiscalYear.end_month] : []
      ),
    ]);

    // ---------- จัดกลุ่มแถวดิบให้เป็นเครื่อง ----------
    //
    // key เป็น "แผนก:เครื่อง" ไม่ใช่แค่รหัสเครื่อง เพราะเครื่องเดียวอาจมีบางเดือน
    // สังกัดแผนกเดิม บางเดือนสังกัดแผนกใหม่ (ย้ายกลางปีงบ) ต้องแยกเป็นคนละก้อน
    // ไม่ให้ยอดของสองแผนกปนกันเป็นเครื่องเดียว
    const deviceMap = new Map();
    const departmentsPerDevice = new Map();

    for (const row of rows) {
      const key = `${row.effective_department_id ?? "none"}:${row.device_id}`;

      if (!deviceMap.has(key)) {
        deviceMap.set(key, {
          id: row.device_id,
          serial_number: row.serial_number,
          model: row.model,
          status: row.status,
          brand_name: row.brand_name,
          department_id: row.effective_department_id,
          monthly: [],
        });

        departmentsPerDevice.set(row.device_id, (departmentsPerDevice.get(row.device_id) || 0) + 1);
      }

      if (row.month) {
        deviceMap.get(key).monthly.push({
          month: row.month,
          net_pages: row.net_pages,
          total_cost: row.total_cost,
          // SQL คืน DECIMAL เป็น string ที่เป๊ะอยู่แล้ว แปลงเป็นจำนวนเต็มสตางค์ทันที
          // เพื่อให้ทุกการบวกต่อจากนี้เป็นจำนวนเต็ม ไม่ใช่ float (ดู money.cjs)
          total_cost_satang: toSatang(row.total_cost),
        });
      }
    }

    for (const device of deviceMap.values()) {
      device.total_pages = device.monthly.reduce((sum, row) => sum + Number(row.net_pages || 0), 0);
      device.total_cost_satang = sumSatang(device.monthly.map((row) => row.total_cost_satang));
      device.total_cost = fromSatang(device.total_cost_satang);
      device.moved_during_period = (departmentsPerDevice.get(device.id) || 1) > 1;

      if (currentMonths.length) {
        const current = device.monthly.filter((row) => currentSet.has(row.month));
        const previous = device.monthly.filter((row) => previousSet.has(row.month));

        device.current_month_pages = current.reduce((sum, row) => sum + Number(row.net_pages || 0), 0);
        device.previous_month_pages = previous.reduce((sum, row) => sum + Number(row.net_pages || 0), 0);
        device.current_month_cost_satang = sumSatang(current.map((row) => row.total_cost_satang));
        device.previous_month_cost_satang = sumSatang(previous.map((row) => row.total_cost_satang));
        device.current_month_cost = fromSatang(device.current_month_cost_satang);
        device.previous_month_cost = fromSatang(device.previous_month_cost_satang);
        device.has_current_data = current.length > 0;
        device.has_previous_data = previous.length > 0;
      }
    }

    // ---------- จัดเครื่องเข้าแผนก ----------
    const departmentMap = new Map(departments.map((dep) => [dep.id, { ...dep, devices: [] }]));
    const unassignedDevices = [];

    for (const device of deviceMap.values()) {
      const department = departmentMap.get(device.department_id);
      if (department) department.devices.push(device);
      else unassignedDevices.push(device);
    }

    // ---------- สรุปยอดและแนวโน้มระดับแผนก ----------
    for (const department of departmentMap.values()) {
      department.device_count = department.devices.length;
      department.total_pages = department.devices.reduce((sum, d) => sum + d.total_pages, 0);
      department.total_cost_satang = sumSatang(department.devices.map((d) => d.total_cost_satang));
      department.total_cost = fromSatang(department.total_cost_satang);

      if (!currentMonths.length) continue;

      department.current_month_pages = department.devices.reduce((s, d) => s + (d.current_month_pages || 0), 0);
      department.previous_month_pages = department.devices.reduce((s, d) => s + (d.previous_month_pages || 0), 0);
      department.current_month_cost_satang = sumSatang(department.devices.map((d) => d.current_month_cost_satang));
      department.previous_month_cost_satang = sumSatang(department.devices.map((d) => d.previous_month_cost_satang));
      department.current_month_cost = fromSatang(department.current_month_cost_satang);
      department.previous_month_cost = fromSatang(department.previous_month_cost_satang);

      const hasCurrent = department.devices.some((d) => d.has_current_data);
      const hasPrevious = department.devices.some((d) => d.has_previous_data);

      department.change_percent = changePercent(
        department.current_month_pages,
        department.previous_month_pages,
        hasPrevious
      );
      department.cost_change_percent = changePercent(
        department.current_month_cost,
        department.previous_month_cost,
        hasPrevious
      );

      if (!hasCurrent && !hasPrevious) department.trend = "no-data";
      else if (department.current_month_pages > department.previous_month_pages) department.trend = "up";
      else if (department.current_month_pages < department.previous_month_pages) department.trend = "down";
      else department.trend = "flat";
    }

    // ---------- จัดแผนกเข้าฝ่าย ----------
    //
    // แผนกที่ division_id ไม่ตรงกับฝ่ายไหน (ข้อมูลเพี้ยน หรือฝ่ายถูกลบ) ไปอยู่ใน
    // ฝ่ายเสมือน "ไม่ได้ระบุฝ่าย" แทนที่จะหายไปเงียบๆ จากรายงาน — ยอดที่หายไปโดย
    // ไม่มีใครรู้อันตรายกว่ายอดที่โผล่ในกลุ่มที่ชื่อไม่สวย
    const divisionMap = new Map(divisions.map((div) => [div.id, { ...div, departments: [] }]));
    const unassignedDivision = { id: "__unassigned__", name: "ไม่ได้ระบุฝ่าย", departments: [] };

    for (const department of departmentMap.values()) {
      const division = divisionMap.get(department.division_id);
      if (division) division.departments.push(department);
      else unassignedDivision.departments.push(department);
    }

    const divisionList = [...divisionMap.values()];
    if (unassignedDivision.departments.length) divisionList.push(unassignedDivision);

    for (const division of divisionList) {
      division.total_pages = division.departments.reduce((sum, d) => sum + d.total_pages, 0);
      division.total_cost_satang = sumSatang(division.departments.map((d) => d.total_cost_satang));
      division.total_cost = fromSatang(division.total_cost_satang);
      division.device_count = division.departments.reduce((sum, d) => sum + d.device_count, 0);
      division.departments.sort((a, b) => b.total_cost - a.total_cost);
    }

    divisionList.sort((a, b) => b.total_cost - a.total_cost);

    cache.operationalData(res);
    res.json({
      month: currentMonths.length ? currentMonths.join(",") : null,
      // ช่วงที่ถูกใช้เป็นตัวเทียบ — ส่งกลับไปด้วยเพื่อให้หน้าเว็บเขียนได้ว่า
      // "เทียบกับ ก.ค.–ก.ย. 2568" แทนคำว่า "เทียบกับช่วงก่อนหน้า" ที่คลุมเครือ
      previous_month: previousMonths.length ? previousMonths.join(",") : null,
      fiscal_year_id: fiscal_year_id ?? null,
      divisions: divisionList,
      unassignedDevices,
    });
  })
);

module.exports = router;
