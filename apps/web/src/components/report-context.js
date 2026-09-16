import { activeFiscalYear } from "../store/fiscalYear";
import { yearLabel, formatMonth } from "../lib/locale-format";
import { t } from "../lib/locale";

/**
 * Build export context at the report boundary, never inside a generic table.
 *
 * ## สถานะราคา (`unpricedReadings`)
 *
 * ไฟล์ที่ส่งออกไปแล้วเดินทางต่อได้เองโดยไม่มีหน้าจอติดไปด้วย — คนที่เปิดมันอาจเป็น
 * คนที่ไม่เคยเห็นระบบนี้เลย และเปิดในอีกหกเดือนข้างหน้า ป้าย "ยอดนี้ยังไม่ครบ"
 * ที่อยู่บนหน้าจออย่างเดียวจึงคุ้มครองอะไรไม่ได้เลยเมื่อตัวเลขออกไปเป็น .xlsx
 * (ADR-0019 Q27 ระบุว่าต้องแสดงสถานะนี้ใน Excel และ PDF ด้วย)
 *
 * ส่งค่า 0 มาก็เขียนบรรทัดนี้เหมือนกัน เพราะ "ยืนยันครบแล้ว" เป็นข้อมูลที่คนอ่าน
 * ต้องการพอๆ กัน — การไม่มีบรรทัดนี้เลยแปลได้สองอย่าง (ครบ หรือ ไม่มีใครตรวจ)
 * ซึ่งเป็นความกำกวมที่ไฟล์รายงานไม่ควรมี
 *
 * รายงานที่ไม่มียอดเงินเลย (เช่น ทะเบียนเครื่อง) ไม่ต้องส่ง — บรรทัดนี้จะไม่ขึ้น
 */
export function reportContext({ months = [], filters = {}, labels = {}, unpricedReadings = null } = {}) {
  const defaultLabels = { building: t("อาคาร"), floor: t("ชั้น"), division: t("ฝ่าย"), department: t("แผนก"), brand: t("ยี่ห้อ"), status: t("สถานะ"), search: t("ค้นหา") };
  return [
    [t("ปีงบประมาณ"), yearLabel(activeFiscalYear.value?.year)],
    [t("ช่วงเวลา"), months.length ? months.map((m) => formatMonth(m)).join(", ") : t("ทั้งปีงบ")],
    ...Object.entries(filters).filter(([, value]) => value !== "" && value != null)
      .map(([key, value]) => [labels[key] || defaultLabels[key] || key, String(value)]),
    ...(unpricedReadings === null ? [] : [[
      t("สถานะราคา"),
      Number(unpricedReadings) > 0
        ? t("ยังยืนยันราคาไม่ได้ {0} รายการ — ยอดเงินในไฟล์นี้เป็นเฉพาะส่วนที่ยืนยันราคาแล้ว", [Number(unpricedReadings)])
        : t("ยืนยันราคาครบทุกรายการ"),
    ]]),
  ];
}
