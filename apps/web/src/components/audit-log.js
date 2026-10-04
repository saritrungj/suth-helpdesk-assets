import { t } from "../lib/locale";
import { formatDate, formatMonth } from "../lib/locale-format";

/**
 * audit-log.js — คำและการแสดงค่าของประวัติการแก้ไข (ADR-0035) ใช้ทั้งหน้าประวัติและหน้ารายละเอียดเครื่อง
 */

const ENTITY_LABEL = {
  print_reading: "ยอดพิมพ์",
  device: "เครื่อง",
  contract: "สัญญา",
  fiscal_year: "ปีงบ",
  brand: "ยี่ห้อ",
  building: "อาคาร",
  floor: "ชั้น",
  division: "ฝ่าย",
  department: "แผนก",
  alias: "ชื่อเรียกอื่น",
  user: "ผู้ใช้",
  import_session: "งานนำเข้า",
  service_period: "ช่วงที่ต้องกรอก",
};

export const auditEntityLabel = (entity) => t(ENTITY_LABEL[entity] ?? entity);

export const auditEntityOptions = () =>
  Object.keys(ENTITY_LABEL).map((value) => ({ value, label: auditEntityLabel(value) }));

const ACTION = {
  create: { label: "เพิ่ม", tone: "ok" },
  update: { label: "แก้ไข", tone: "info" },
  delete: { label: "ลบ", tone: "danger" },
};

export function auditActionOf(action) {
  const meta = ACTION[action] ?? { label: action, tone: "neutral" };
  return { label: t(meta.label), tone: meta.tone };
}

const FIELD_LABEL = {
  pages: "ยอดพิมพ์", serial_number: "Serial", brand_id: "ยี่ห้อ", model: "รุ่น", building_id: "อาคาร",
  floor_id: "ชั้น", location: "ตำแหน่ง", division_id: "ฝ่าย", department_id: "แผนก",
  contract_id: "สัญญา", price_override: "ราคาพิเศษ", status: "สถานะ", installation_status: "สถานะการติดตั้ง",
  effective_from: "เริ่ม", effective_to: "สิ้นสุด", history_known: "ยืนยันย้อนหลังได้", note: "หมายเหตุ",
  contract_no: "เลขที่สัญญา", monthly_rental: "ค่าเช่า/เดือน", vat_rate: "VAT (%)", price_lines: "ราคาต่อหน้า",
  name: "ชื่อ", year: "ปีงบ", start_month: "เดือนแรก", end_month: "เดือนสุดท้าย", username: "ชื่อผู้ใช้", role: "สิทธิ์",
  password_changed: "เปลี่ยนรหัสผ่าน", alias: "ชื่อเรียกอื่น", target_id: "ของรายการ (รหัส)", id: "รหัส",
  devices_created: "เครื่องใหม่", devices_filled: "เติมข้อมูล", readings_new: "ยอดใหม่", readings_overwritten: "แทนที่",
  contracts_created: "สัญญาใหม่", fiscal_years_created: "ปีงบใหม่",
};

const fieldLabel = (key) => t(FIELD_LABEL[key] ?? key);

/** ช่องที่เก็บรหัสของรายการอื่น → ชนิดรายการใน `names` ที่ API ส่งมากับแถว */
const REFERENCE_KIND = {
  brand_id: "brand", building_id: "building", floor_id: "floor", division_id: "division",
  department_id: "department", contract_id: "contract",
};

/** ค่าที่ฐานเก็บเป็นรหัสภาษาอังกฤษ → คำที่หน้าอื่นใช้ */
const VALUE_LABEL = {
  status: { active: "ใช้งานอยู่", repair: "ซ่อมบำรุง", retired: "ปลดระวาง" },
  installation_status: { installed: "ติดตั้งแล้ว", not_installed: "ยังไม่ได้ติดตั้ง" },
  role: { admin: "ผู้ดูแลระบบ", staff: "เจ้าหน้าที่", viewer: "ดูอย่างเดียว" },
};

const DATE_FIELDS = new Set(["effective_from", "effective_to"]);
const MONTH_FIELDS = new Set(["start_month", "end_month"]);

const isEmpty = (value) => value === null || value === undefined || value === "";

const plain = (value) => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : t("ว่าง");
  if (isEmpty(value)) return t("ว่าง");
  if (typeof value === "number") return value.toLocaleString("th-TH");
  if (typeof value === "boolean") return value ? t("ใช่") : t("ไม่ใช่");
  return String(value);
};

/** ชื่อของรายการที่รหัสชี้ถึง — ไม่มีชื่อ (ถูกลบไปแล้ว หรือ API ไม่ได้ส่งมา) ยังต้องบอกว่าเป็นรหัส */
const nameOf = (names, kind, id) => names?.[kind]?.[id] ?? t("รหัส {0} (ไม่พบชื่อ)", [id]);

/** "2:0.4500, 3:1.2000" → "A4 เลเซอร์ ขาวดำ 0.4500 บาท, …" */
function priceLines(value, names) {
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [id, price] = part.split(":").map((piece) => piece.trim());
      const category = names?.meter_category?.[id] ?? t("หมวดรหัส {0} (ไม่พบชื่อ)", [id]);
      return t("{0} {1} บาท", [category, price]);
    })
    .join(", ");
}

/**
 * ค่าของช่องหนึ่งเป็นข้อความที่อ่านออก — ชื่อแทนรหัส คำไทยแทนรหัสสถานะ วันที่แบบเดียวกับหน้าอื่น (#237)
 * ค่าที่ไม่รู้จักแสดงตามที่เก็บไว้ ไม่เดา
 */
function show(key, value, names) {
  if (isEmpty(value)) return t("ว่าง");
  if (REFERENCE_KIND[key]) return nameOf(names, REFERENCE_KIND[key], value);
  if (VALUE_LABEL[key]?.[value]) return t(VALUE_LABEL[key][value]);
  if (DATE_FIELDS.has(key) && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return formatDate(String(value).slice(0, 10));
  if (MONTH_FIELDS.has(key) && /^\d{4}-\d{2}$/.test(String(value))) return formatMonth(String(value));
  if (key === "price_lines") return priceLines(value, names);
  return plain(value);
}

/**
 * ช่องที่เปลี่ยนเป็นบรรทัดละช่อง "ช่อง: เดิม → ใหม่" — เพิ่ม = แสดงค่าใหม่, ลบ = แสดงค่าเดิม
 * @param {object|null} before
 * @param {object|null} after
 * @param {Record<string, Record<string, string>>} [names] ชื่อปัจจุบันของรายการที่อ้างถึงด้วยรหัส (จาก API)
 */
export function auditValueText(before, after, names) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys
    .map((key) => {
      if (!before) return `${fieldLabel(key)}: ${show(key, after?.[key], names)}`;
      if (!after) return `${fieldLabel(key)}: ${show(key, before?.[key], names)}`;
      return `${fieldLabel(key)}: ${show(key, before[key], names)} → ${show(key, after[key], names)}`;
    })
    .join("\n");
}
