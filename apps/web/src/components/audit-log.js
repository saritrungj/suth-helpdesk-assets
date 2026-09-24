import { t } from "../lib/locale";

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
  pages: "ยอดพิมพ์", serial_number: "Serial", brand_id: "ยี่ห้อ (รหัส)", model: "รุ่น", building_id: "อาคาร (รหัส)",
  floor_id: "ชั้น (รหัส)", location: "ตำแหน่ง", division_id: "ฝ่าย (รหัส)", department_id: "แผนก (รหัส)",
  contract_id: "สัญญา (รหัส)", price_override: "ราคาพิเศษ", status: "สถานะ", installation_status: "สถานะการติดตั้ง",
  effective_from: "เริ่ม", effective_to: "สิ้นสุด", history_known: "ยืนยันย้อนหลังได้", note: "หมายเหตุ",
  contract_no: "เลขที่สัญญา", monthly_rental: "ค่าเช่า/เดือน", vat_rate: "VAT (%)", price_lines: "ราคา (หมวด:บาท)",
  name: "ชื่อ", year: "ปีงบ", start_month: "เดือนแรก", end_month: "เดือนสุดท้าย", username: "ชื่อผู้ใช้", role: "สิทธิ์",
  password_changed: "เปลี่ยนรหัสผ่าน", alias: "ชื่อเรียกอื่น", target_id: "ของรายการ (รหัส)",
  devices_created: "เครื่องใหม่", devices_filled: "เติมข้อมูล", readings_new: "ยอดใหม่", readings_overwritten: "แทนที่",
  contracts_created: "สัญญาใหม่", fiscal_years_created: "ปีงบใหม่",
};

const fieldLabel = (key) => t(FIELD_LABEL[key] ?? key);

const show = (value) => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : t("ว่าง");
  if (value === null || value === undefined || value === "") return t("ว่าง");
  if (typeof value === "number") return value.toLocaleString("th-TH");
  if (typeof value === "boolean") return value ? t("ใช่") : t("ไม่ใช่");
  return String(value);
};

/**
 * ช่องที่เปลี่ยนเป็นบรรทัดละช่อง "ช่อง: เดิม → ใหม่" — เพิ่ม = แสดงค่าใหม่, ลบ = แสดงค่าเดิม
 * @param {object|null} before
 * @param {object|null} after
 */
export function auditValueText(before, after) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys
    .map((key) => {
      if (!before) return `${fieldLabel(key)}: ${show(after?.[key])}`;
      if (!after) return `${fieldLabel(key)}: ${show(before?.[key])}`;
      return `${fieldLabel(key)}: ${show(before[key])} → ${show(after[key])}`;
    })
    .join("\n");
}
