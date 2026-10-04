// apps/api/src/audit/names.js
//
// ชื่อของรายการที่ประวัติการแก้ไขอ้างถึงด้วยรหัส (#237)
//
// audit_log เก็บค่าก่อน/หลังตามคอลัมน์จริง จึงได้ "ฝ่าย: 21 → 27" ซึ่งผู้ดูแลอ่านไม่ออกว่าเครื่องย้ายจากไหน
// ไปไหน ไฟล์นี้หารหัสทั้งหมดที่แถวหนึ่งหน้าอ้างถึง แล้วอ่านชื่อครั้งเดียวต่อตาราง
//
// ชื่อที่ได้คือชื่อ **ปัจจุบัน** ของรายการ ไม่ใช่ชื่อ ณ เวลาที่บันทึก — รายการที่ถูกลบไปแล้วไม่มีชื่อ
// หน้าเว็บแสดงเป็นรหัสพร้อมบอกว่าไม่พบชื่อ ประวัติเดิมที่บันทึกไว้เป็นรหัสจึงอ่านได้โดยไม่ต้องแก้ข้อมูล

/** ช่องในค่าก่อน/หลัง → ชนิดรายการ */
const FIELD_KIND = {
  brand_id: "brand",
  building_id: "building",
  floor_id: "floor",
  division_id: "division",
  department_id: "department",
  contract_id: "contract",
};

/** ชนิดรายการ → ตารางและคอลัมน์ชื่อ (ค่าคงที่ในโค้ด ไม่ได้มาจากผู้ใช้) */
const KIND_TABLE = {
  brand: ["brand", "name"],
  building: ["building", "name"],
  floor: ["floor", "name"],
  division: ["division", "name"],
  department: ["department", "name"],
  contract: ["contracts", "contract_no"],
  meter_category: ["meter_category", "name"],
};

const asId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** รหัสหมวดมิเตอร์ในช่อง price_lines ("2:0.4500, 3:1.2000") */
function priceLineCategoryIds(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => asId(part.split(":")[0].trim()))
    .filter(Boolean);
}

/**
 * รหัสที่ค่าก่อน/หลังของแถวหนึ่งอ้างถึง แยกตามชนิดรายการ
 * @returns {Record<string, number[]>}
 */
function referencedIds(row) {
  const found = {};
  const add = (kind, id) => {
    if (!id) return;
    (found[kind] ??= new Set()).add(id);
  };
  for (const values of [row.before, row.after]) {
    if (!values || typeof values !== "object") continue;
    for (const [field, value] of Object.entries(values)) {
      if (FIELD_KIND[field]) add(FIELD_KIND[field], asId(value));
      else if (field === "price_lines") for (const id of priceLineCategoryIds(value)) add("meter_category", id);
    }
  }
  return Object.fromEntries(Object.entries(found).map(([kind, ids]) => [kind, [...ids]]));
}

/**
 * ใส่ `names` ให้แต่ละแถว: { ชนิด: { รหัส: ชื่อ } } เฉพาะรหัสที่แถวนั้นอ้างถึงและยังมีอยู่ในระบบ
 * @param {{ query: Function }} q
 * @param {Array<{ before: object|null, after: object|null }>} rows
 */
async function attachNames(q, rows) {
  const perRow = rows.map(referencedIds);
  const wanted = {};
  for (const ids of perRow) {
    for (const [kind, list] of Object.entries(ids)) for (const id of list) (wanted[kind] ??= new Set()).add(id);
  }

  const names = {};
  for (const [kind, ids] of Object.entries(wanted)) {
    const [table, column] = KIND_TABLE[kind];
    const [found] = await q.query(`SELECT id, \`${column}\` AS name FROM \`${table}\` WHERE id IN (?)`, [[...ids]]);
    names[kind] = new Map(found.map((item) => [item.id, item.name]));
  }

  return rows.map((row, index) => ({
    ...row,
    names: Object.fromEntries(
      Object.entries(perRow[index]).map(([kind, ids]) => [
        kind,
        Object.fromEntries(ids.filter((id) => names[kind].has(id)).map((id) => [id, names[kind].get(id)])),
      ])
    ),
  }));
}

module.exports = { referencedIds, attachNames };
