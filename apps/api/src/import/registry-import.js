// apps/api/src/import/registry-import.js
//
// ส่วนที่แตะฐานข้อมูลของการนำเข้าทะเบียนเครื่อง (#132)
//
//   loadRegistryContext  อ่านข้อมูลที่ planRegistryImport ต้องใช้
//   applyRegistryPlan    บันทึกแผนที่ตรวจผ่านแล้ว — ต้องเรียกใน withTransaction ทั้งก้อน
//
// เครื่องใหม่ลงด้วยขั้นตอนเดียวกับฟอร์ม "เพิ่มเครื่อง" ทุกประการ (devices/controller.js create):
// ประวัติที่ตั้งช่วงแรก สถานะการติดตั้ง ช่วงการคิดเงิน และมิเตอร์ — เครื่องที่มาจากไฟล์กับ
// เครื่องที่กรอกมือจึงอยู่ในรายงานเหมือนกัน

const { recordLocationHistory } = require("../devices/controller");
const { recordContractHistory, today } = require("../devices/contract-history");
const { setDeviceMeters } = require("../devices/meters");
const servicePeriod = require("../devices/service-period");
const lookupWrites = require("../master-data/lookup-writes");
const { nameKey } = require("../master-data/names");

const KINDS = ["brand", "building", "division"];

async function loadRegistryContext(q) {
  const master = {};
  for (const kind of KINDS) {
    master[kind] = { names: await lookupWrites.loadNames(q, kind), aliases: await lookupWrites.loadAliases(q, kind) };
  }
  const [floors] = await q.query("SELECT id, building_id, name FROM floor");
  const [departments] = await q.query("SELECT id, division_id, name FROM department");
  const [contracts] = await q.query(
    "SELECT id, contract_no, DATE_FORMAT(effective_from, '%Y-%m-%d') AS effective_from FROM contracts"
  );
  const [lines] = await q.query("SELECT contract_id, category_id FROM contract_price_line");
  const [categories] = await q.query("SELECT id, code, name, is_color FROM meter_category ORDER BY sort_order");
  // หมวดของมิเตอร์หลักและมีมิเตอร์สีหรือไม่ — ใช้เดาหมวดของรุ่นที่เคยลงแล้ว และเทียบว่าเครื่องมีอยู่แล้วหรือยัง
  const [devices] = await q.query(
    `SELECT d.id, d.serial_number, d.brand_id, d.model, d.building_id, d.floor_id, d.location,
            d.division_id, d.department_id, d.contract_id,
            (SELECT dm.category_id FROM device_meter dm JOIN meter_category mc ON mc.id = dm.category_id
              WHERE dm.device_id = d.id AND mc.is_color = 0 ORDER BY dm.id LIMIT 1) AS meter_category_id,
            EXISTS (SELECT 1 FROM device_meter dm JOIN meter_category mc ON mc.id = dm.category_id
              WHERE dm.device_id = d.id AND mc.is_color = 1) AS has_color_meter,
            -- เครื่องที่เคยย้าย (มีประวัติมากกว่าหนึ่งช่วง) ห้ามเติมที่ตั้งจากไฟล์ — ไม่รู้ว่าไฟล์หมายถึงช่วงไหน
            (SELECT COUNT(*) FROM device_location_history h WHERE h.device_id = d.id) AS history_rows
     FROM devices d`
  );
  return {
    master,
    floors,
    departments,
    contracts: contracts.map((c) => ({
      ...c,
      category_ids: lines.filter((l) => l.contract_id === c.id).map((l) => l.category_id),
    })),
    categories: categories.map((c) => ({ ...c, is_color: Boolean(c.is_color) })),
    devices: devices.map((d) => ({ ...d, has_color_meter: Boolean(d.has_color_meter), history_rows: Number(d.history_rows) })),
  };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {ReturnType<import("./registry-plan").planRegistryImport>} plan แผนที่ valid แล้ว
 * @param {{ userId: number|null }} actor
 */
async function applyRegistryPlan(conn, plan, { userId }) {
  const refs = new Map();
  const id = (ref) => (typeof ref === "string" ? refs.get(ref) ?? null : ref ?? null);

  // 1. ชื่อที่ผู้ดูแลตัดสินว่าสร้างใหม่ — ก่อนชื่อเรียกอื่น เพราะชื่อเรียกอื่นอาจชี้มาที่รายการใหม่
  for (const kind of KINDS) {
    for (const entry of plan.unresolved[kind]) {
      if (entry.decision?.action !== "create") continue;
      const name = entry.decision.as ?? entry.name;
      const createdId = await lookupWrites.createLookup(conn, kind, name);
      refs.set(`new:${kind}:${nameKey(entry.name)}`, createdId);
      // สร้างด้วยชื่อทางการ → ชื่อที่ไฟล์เขียนเป็นชื่อเรียกอื่นของรายการใหม่ (ADR-0025)
      if (entry.decision.as) await lookupWrites.addAlias(conn, kind, createdId, entry.name);
    }
  }
  for (const kind of KINDS) {
    for (const entry of plan.unresolved[kind]) {
      if (entry.decision?.action !== "alias") continue;
      const target = entry.decision.target_id ?? refs.get(`new:${kind}:${nameKey(entry.decision.target_new)}`);
      await lookupWrites.addAlias(conn, kind, target, entry.name);
    }
  }

  // 2. ชั้นและแผนกใหม่ใต้รายการแม่
  for (const floor of plan.new_floors) {
    const [result] = await conn.query("INSERT INTO floor (building_id, name) VALUES (?, ?)", [id(floor.parent), floor.name]);
    refs.set(floor.ref, result.insertId);
  }
  for (const department of plan.new_departments) {
    const [result] = await conn.query("INSERT INTO department (division_id, name) VALUES (?, ?)", [id(department.parent), department.name]);
    refs.set(department.ref, result.insertId);
  }

  // 3. เครื่อง
  let created = 0;
  let filled = 0;
  for (const row of plan.rows) {
    const v = row.values;
    const values = {
      ...v,
      brand_id: id(v.brand_id),
      building_id: id(v.building_id),
      floor_id: id(v.floor_id),
      division_id: id(v.division_id),
      department_id: id(v.department_id),
    };

    if (row.action === "create") {
      const columns = ["serial_number", "brand_id", "model", "building_id", "floor_id", "location", "division_id", "department_id", "contract_id", "price_override", "status", "installation_status"];
      const [result] = await conn.query(
        `INSERT INTO devices (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        columns.map((column) => values[column] ?? null)
      );
      const deviceId = result.insertId;
      // ช่วงประวัติแรกเริ่มที่วันเริ่มสัญญา ไม่ใช่วันนี้ — ยอดย้อนหลังในไฟล์ต้องอยู่กับหน่วยงานนี้
      // แม้เครื่องจะย้ายทีหลัง (ADR-0014)
      await recordLocationHistory(conn, deviceId, values, values.contract_start || values.installed_on);

      // ไฟล์ที่บอกสถานะการติดตั้งได้ (รายงานสถานะเครื่อง, รายงานมิเตอร์) = หลักฐานของการติดตั้ง
      // ยืนยันย้อนหลังได้ (historyKnown) เฉพาะเมื่อไฟล์ระบุวันติดตั้ง ไม่งั้นก่อนวันแรกที่มีหลักฐาน
      // ยังยืนยันไม่ได้ (ADR-0018 Q21) ไฟล์ที่บอกไม่ได้ (เทมเพลต) คงเป็น NULL ให้ผ่านหน้าตรวจยืนยัน
      if (values.installation_status) {
        await servicePeriod.recordInstallationReview(conn, deviceId, {
          installationStatus: values.installation_status,
          effectiveFrom: values.installed_on || today(),
          historyKnown: Boolean(values.installed_on_known),
          deviceStatus: values.status,
          userId,
        });
      }

      // ราคาของสัญญามีผลตลอดอายุสัญญา (ADR-0021) — ช่วงคิดเงินแรกเริ่มที่วันเริ่มสัญญา
      await recordContractHistory(
        conn,
        deviceId,
        { contractId: values.contract_id ?? null, priceOverride: values.price_override ?? null },
        values.contract_start || values.installed_on || today()
      );
      await setDeviceMeters(conn, deviceId, {
        primaryCategoryId: values.meter_category_id,
        hasColorMeter: values.has_color_meter,
      });
      created += 1;
      continue;
    }

    if (row.action === "fill") {
      const deviceId = row.device_id;
      // COALESCE: ถ้ามีคนเติมช่องนี้ระหว่างที่ตรวจไฟล์ ค่าของเขาชนะ — "เติมเฉพาะช่องที่ว่าง" ต้องจริง
      // แม้แผนจะเก่ากว่าข้อมูล ชื่อช่องมาจากรายการตายตัวใน registry-plan.js ไม่ใช่จากไฟล์
      await conn.query(
        `UPDATE devices SET ${row.fill.map((field) => `\`${field}\` = COALESCE(\`${field}\`, ?)`).join(", ")} WHERE id = ?`,
        [...row.fill.map((field) => values[field]), deviceId]
      );
      // ช่องที่ตั้งที่ยังว่าง: เติมที่ช่วงประวัติปัจจุบัน ไม่เปิดช่วงใหม่ — นี่คือการกรอกข้อมูลที่ขาด
      // ไม่ใช่การย้ายเครื่อง ยอดของเดือนก่อนหน้าจึงนับเข้าหน่วยงานนี้ด้วย
      const location = row.fill.filter((f) => ["building_id", "floor_id", "location", "division_id", "department_id"].includes(f));
      if (location.length) {
        const [update] = await conn.query(
          `UPDATE device_location_history SET ${location.map((f) => `\`${f}\` = COALESCE(\`${f}\`, ?)`).join(", ")}
           WHERE device_id = ? AND effective_to IS NULL`,
          [...location.map((field) => values[field]), deviceId]
        );
        if (!update.affectedRows) {
          const [[device]] = await conn.query(
            "SELECT building_id, floor_id, location, division_id, department_id FROM devices WHERE id = ?",
            [deviceId]
          );
          await recordLocationHistory(conn, deviceId, device, values.contract_start);
        }
      }
      filled += 1;
    }
  }

  return { created, filled };
}

/** คำตอบของทั้งสองโหมด — ไม่ส่งค่าภายใน (ref ของรายการใหม่) ออกไป */
function describeRegistryPlan(parsed, plan, context) {
  return {
    valid: plan.valid,
    blocking: plan.blocking,
    sheets: parsed.sheets,
    errors: parsed.errors,
    warnings: [...parsed.warnings, ...plan.warnings],
    summary: plan.summary,
    unresolved: plan.unresolved,
    models: plan.models,
    contracts: plan.contracts,
    new_floors: plan.new_floors.map(({ name, rows }) => ({ name, rows })),
    new_departments: plan.new_departments.map(({ name, rows }) => ({ name, rows })),
    rows: plan.rows.map((row) => ({
      sheet: row.sheet,
      row: row.row,
      serial_number: row.serial_number,
      action: row.action,
      reasons: row.reasons,
      notes: row.notes,
      waiting: row.waiting,
      fill: row.fill,
      installation: row.installation,
      ...row.display,
    })),
    // ตัวเลือกของหน้าตรวจ: "เป็นชื่อเรียกอื่นของ…" และหมวดมิเตอร์ของรุ่น
    choices: {
      brand: context.master.brand.names,
      building: context.master.building.names,
      division: context.master.division.names,
      meter_categories: context.categories.filter((c) => !c.is_color).map(({ id, code, name }) => ({ id, code, name })),
    },
  };
}

module.exports = { loadRegistryContext, applyRegistryPlan, describeRegistryPlan };
