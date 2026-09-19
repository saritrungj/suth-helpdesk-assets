import { locale } from "./locale";
import { t } from "./locale";
/**
 * format.js — การจัดรูปแบบตัวเลขสำหรับ "การแสดงผล" ฝั่งเว็บเท่านั้น
 *
 * กฎการคิดเงินและการปัดเศษอยู่ที่ packages/domain (ADR-0004) ห้ามคำนวณเงินที่นี่
 * ไฟล์นี้รับค่าที่คำนวณเสร็จแล้วมาทำให้อ่านง่ายบนหน้าจอ ไม่มีตรรกะธุรกิจ
 *
 * ใช้ locale "th-TH" ทุกที่ ไม่ใช้ locale ของเครื่อง เพื่อให้ตัวคั่นหลักและ
 * รูปแบบวันที่เหมือนกันทุกเครื่อง — รายงานที่พิมพ์ออกจากคนละเครื่องต้องหน้าตา
 * เหมือนกัน ไม่งั้นเวลาเอามาเทียบกันจะดูเหมือนตัวเลขคนละชุด
 */

const TH = () => locale.value === "en" ? "en-GB" : "th-TH";

/** จำนวนนับ (เครื่อง, แผ่น, รายการ) — ไม่มีทศนิยม */
export function formatCount(value) {
  return Number(value ?? 0).toLocaleString(TH(), { maximumFractionDigits: 0 });
}

/** จำนวนเงินหน่วยบาท — ทศนิยมสองตำแหน่งเสมอ ให้หลักตรงกันเมื่อวางเรียงกัน */
export function formatBahtValue(value) {
  return Number(value ?? 0).toLocaleString(TH(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * ราคาต่อหน้า (บาท/หน้า) — อย่างน้อยสองตำแหน่ง แต่แสดงได้ถึงสี่ตำแหน่ง
 *
 * สัญญากำหนดราคาได้ละเอียดถึงสี่ตำแหน่ง (ช่องกรอกรับ step 0.0001 และฐานข้อมูล
 * เก็บ DECIMAL(10,4)) ถ้าใช้ formatBahtValue ราคา 0.4275 จะขึ้นเป็น 0.43 ซึ่งไม่ตรง
 * กับตัวเลขในสัญญาที่คนเอามาเทียบ
 */
export function formatUnitPrice(value) {
  return Number(value ?? 0).toLocaleString(TH(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/**
 * ตัวเลขแบบย่อสำหรับแกนกราฟ (12,400 -> "1.2 หมื่น")
 *
 * ใช้เฉพาะบนแกนของกราฟที่พื้นที่จำกัดจริงๆ ห้ามใช้กับตัวเลขในตารางหรือรายงาน
 * เพราะการปัดทำให้ยอดที่คนเอาไปเทียบกับเอกสารอื่นไม่ตรง
 */
export function formatCompact(value) {
  const n = Number(value ?? 0);
  if (locale.value === "en") return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  if (Math.abs(n) >= 1_000_000) return t("{0} ล้าน", [(n / 1_000_000).toLocaleString(TH(), { maximumFractionDigits: 1 })]);
  if (Math.abs(n) >= 100_000) return t("{0} แสน", [(n / 100_000).toLocaleString(TH(), { maximumFractionDigits: 2 })]);
  if (Math.abs(n) >= 10_000) return t("{0} หมื่น", [(n / 10_000).toLocaleString(TH(), { maximumFractionDigits: 2 })]);
  if (Math.abs(n) >= 1_000) return t("{0} พัน", [(n / 1_000).toLocaleString(TH(), { maximumFractionDigits: 1 })]);
  return n.toLocaleString(TH(), { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 1 });
}

/** เปอร์เซ็นต์ที่ปลอดภัยจากการหารด้วยศูนย์ */
export function percentOf(value, total) {
  if (!total) return 0;
  return (Number(value ?? 0) / Number(total)) * 100;
}

/**
 * หน้าสุทธิหลังหัก 2% — มีทศนิยมได้สองตำแหน่ง (101 หน้า → 98.98) ไม่ปัดเป็นจำนวนเต็ม
 * ก่อนแสดง เพราะเป็นตัวเลขเดียวกับที่ใช้คิดเงินและที่อยู่ในไฟล์ Excel
 */
export function formatNetPages(value) {
  return Number(value ?? 0).toLocaleString(TH(), { maximumFractionDigits: 2 });
}

/** ส่วนต่างพร้อมเครื่องหมาย เช่น "+1,250.00" / "−40" — ศูนย์ไม่มีเครื่องหมาย */
export function formatSigned(value, formatter = formatCount) {
  const n = Number(value ?? 0);
  if (n === 0) return formatter(0);
  return `${n > 0 ? "+" : "−"}${formatter(Math.abs(n))}`;
}

/** สัดส่วนเป็นเปอร์เซ็นต์พร้อมเครื่องหมาย เช่น 0.125 → "+12.5%" */
export function formatSignedPercent(ratio) {
  return `${formatSigned(Number(ratio) * 100, (n) => n.toLocaleString(TH(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }))}%`;
}
