// apps/web/src/components/import/import-session.js — ตรรกะของหน้านำเข้าไฟล์แบบ session (#180)
//
// แยกจาก component ให้เทสได้โดยไม่ต้อง render: ป้ายสถานะ การตัดสินใจที่ส่งให้ API ฟอร์มสัญญาจากหัวไฟล์
// และปีงบที่ควรเปิดดูหลังบันทึก

import { t } from "../../lib/locale";
import { buildDecisions } from "../device-import";

/** สถานะของ session → ป้ายและสีของ UiBadge (ADR-0027) */
export const STATUS = {
  draft: { label: "ต้องทำต่อ", tone: "warn" },
  validating: { label: "กำลังตรวจ", tone: "info" },
  ready: { label: "พร้อมบันทึก", tone: "ok" },
  processing: { label: "กำลังบันทึก", tone: "info" },
  completed: { label: "บันทึกแล้ว", tone: "brand" },
  failed: { label: "ล้มเหลว", tone: "danger" },
  expired: { label: "หมดอายุ/ยกเลิก", tone: "neutral" },
};

export function statusOf(status) {
  const meta = STATUS[status] ?? { label: status, tone: "neutral" };
  return { label: t(meta.label), tone: meta.tone };
}

/** สถานะที่ยังแก้การตัดสินใจและตรวจใหม่ได้ */
export const EDITABLE = new Set(["draft", "ready", "failed"]);

/** เหตุการณ์ในประวัติ → ข้อความ */
const EVENTS = {
  uploaded: "อัปโหลดไฟล์",
  validated: "ตรวจไฟล์",
  decisions_changed: "เปลี่ยนการตัดสินใจ",
  contract_created: "สร้างสัญญาจากไฟล์",
  fiscal_years_created: "สร้างปีงบ",
  commit_started: "เริ่มบันทึก",
  completed: "บันทึกสำเร็จ",
  stale: "ข้อมูลเปลี่ยนระหว่างตรวจ — ไม่ได้บันทึก",
  failed: "ล้มเหลว",
  expired: "หมดอายุ",
  abandoned: "ยกเลิก",
  file_downloaded: "ดาวน์โหลดไฟล์ต้นฉบับ",
};

export function eventLabel(event) {
  return t(EVENTS[event] ?? event);
}

/** รายละเอียดสั้นของเหตุการณ์ในประวัติ */
export function eventDetail(event) {
  const d = event.detail ?? {};
  switch (event.event) {
    case "uploaded":
      return d.file_name ?? "";
    case "validated":
      return t("ผล: {0}", [statusOf(d.status).label]);
    case "decisions_changed":
      return t("{0} รายการ", [d.changes?.length ?? 0]);
    case "contract_created":
      return `${d.contract_no ?? ""} ${d.effective_from ?? ""} – ${d.effective_to ?? ""}`.trim();
    case "fiscal_years_created":
      return (d.years ?? []).join(", ");
    case "completed":
      return t("เครื่องใหม่ {0} · เติม {1} · ยอดใหม่ {2} · เขียนทับ {3}", [d.devices_created ?? 0, d.devices_filled ?? 0, d.readings_new ?? 0, d.readings_overwritten ?? 0]);
    case "failed":
      return d.message ?? "";
    case "abandoned":
      return d.reason ?? "";
    default:
      return "";
  }
}

/**
 * การตัดสินใจทั้งชุดที่ส่งให้ PUT /import-sessions/:id/decisions
 * @param {{ names: object, models: object, renames: object }} choices ค่าในกล่องเลือกของหน้า
 * @param {Record<string, string>} acknowledged คีย์ความต่างของสัญญา → เหตุผล
 */
export function decisionsPayload(choices, acknowledged = {}) {
  const decisions = buildDecisions(choices.names, choices.models, choices.renames);
  const reasons = Object.fromEntries(
    Object.entries(acknowledged).filter(([, reason]) => String(reason ?? "").trim().length >= 3).map(([key, reason]) => [key, String(reason).trim()])
  );
  return Object.keys(reasons).length ? { ...decisions, acknowledged: reasons } : decisions;
}

/** ฟอร์มสร้างสัญญาจากค่าที่อ่านได้จากหัวไฟล์ — ช่องที่ไฟล์ไม่มีเริ่มว่าง ให้คนกรอก */
export function contractFormFromPrefill(prefill) {
  return {
    contract_no: prefill?.contract_no ?? "",
    effective_from: prefill?.effective_from ?? "",
    effective_to: prefill?.effective_to ?? "",
    monthly_rental: prefill?.monthly_rental ?? "",
    vat_rate: prefill?.vat_rate ?? "",
    price_lines: (prefill?.price_lines ?? []).map((line) => ({
      category_id: line.category_id,
      category_name: line.category_name,
      price_per_page: line.price_per_page ?? "",
      conflicting_prices: line.conflicting_prices ?? null,
    })),
  };
}

export function contractBodyFromForm(form) {
  const blank = (value) => value === "" || value === null || value === undefined;
  return {
    contract_no: form.contract_no,
    effective_from: form.effective_from,
    effective_to: form.effective_to,
    monthly_rental: blank(form.monthly_rental) ? null : form.monthly_rental,
    vat_rate: blank(form.vat_rate) ? null : form.vat_rate,
    price_lines: form.price_lines
      .filter((line) => !blank(line.price_per_page))
      .map((line) => ({ category_id: Number(line.category_id), price_per_page: String(line.price_per_page) })),
  };
}

/**
 * ปีงบที่ควรเปิดดูหลังบันทึก — ปีที่ครอบงวดล่าสุดในไฟล์ ไม่มีปีนั้น = ไม่มีลิงก์ (หน้านำเข้าเตือนให้สร้างปีงบไว้แล้ว)
 * @param {Array<{ id: number, start_month: string, end_month: string }>} list
 * @param {string[]} months งวดในไฟล์ "YYYY-MM"
 */
export function fiscalYearForMonths(list, months) {
  const last = [...(months ?? [])].sort().at(-1);
  if (!last) return null;
  return list.find((fy) => fy.start_month <= last && last <= fy.end_month) ?? null;
}

/** แถวของ checklist ที่ยังกันการบันทึก */
export function blockingItems(validation) {
  return (validation?.checklist ?? []).filter((item) => item.state === "blocking" || item.state === "waiting");
}
