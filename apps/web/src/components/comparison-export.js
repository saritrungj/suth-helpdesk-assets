import { fiscalYearOfMonth } from "@suth/domain";
import { t } from "../lib/locale";
import { formatMonth } from "../lib/locale-format";
import { FORMATS, createWorkbook, downloadWorkbook, monthCell, reportStamp } from "../lib/export-xlsx";
import { differenceNote, dimensionLabel, metricLabel, metricUnit, statusLabel } from "./comparison";

/**
 * comparison-export.js — ไฟล์ Excel ของการเปรียบเทียบ ใช้ร่วมกันสองหน้า
 *
 * ไฟล์เดียวมีสามแผ่น เรียงตามลำดับที่คนเปิดอ่าน
 *
 *   เปรียบเทียบ       ตารางตัวเลขชุดเดียวกับบนจอ + กราฟ Excel ที่อ้างอิงตารางนั้น
 *   ข้อมูลรายละเอียด  แถวรายเครื่องรายเดือนครบตามขอบเขต (ก่อนตัดอันดับ) ไว้ตรวจและวิเคราะห์ต่อ
 *   เงื่อนไขรายงาน    ช่วงเวลา ตัวเลือก ตัวชี้วัด หน่วย สถานะข้อมูล และเวลาที่ส่งออก
 *
 * ทุกตัวเลขมาจากแบบจำลองใน comparison.js ตัวเดียวกับที่หน้าจอวาด — ไฟล์นี้จัดวางเท่านั้น
 * ไม่คำนวณอะไรใหม่ ตัวเลขในไฟล์จึงตรงกับจอเสมอ
 */

const cell = (value) => (value === undefined ? null : value);
const countOrNull = (summary, field) => (summary?.readings ? summary[field] : null);

function sheetOf(name, columns, records, extra = {}) {
  return {
    name,
    header: columns.map((column) => column.header),
    rows: records.map((record) => columns.map((column) => cell(column.value(record)))),
    columns: columns.map(({ format, text, width }) => ({ format, text, width })),
    ...extra,
  };
}

/** คอลัมน์ยอดของหนึ่งรายการ — ไม่มีข้อมูลเป็นเซลล์ว่าง ไม่ใช่ศูนย์ */
function measureColumns(summaryOf, suffix = "") {
  return [
    { header: `${t("ยอดพิมพ์จริง (หน้า)")}${suffix}`, format: FORMATS.count, value: (record) => countOrNull(summaryOf(record), "rawPages") },
    { header: `${t("สุทธิหลังหัก 2% (หน้า)")}${suffix}`, format: FORMATS.pages, value: (record) => countOrNull(summaryOf(record), "netPages") },
    { header: `${t("ค่าใช้จ่ายที่ยืนยันแล้ว (บาท)")}${suffix}`, format: FORMATS.baht, value: (record) => summaryOf(record)?.cost ?? null },
    { header: `${t("เครื่องที่มีข้อมูล (เครื่อง)")}${suffix}`, format: FORMATS.count, value: (record) => summaryOf(record)?.devices ?? 0 },
    { header: `${t("รายการรอยืนยันราคา")}${suffix}`, format: FORMATS.count, value: (record) => summaryOf(record)?.unpriced ?? 0 },
    { header: `${t("สถานะข้อมูล")}${suffix}`, value: (record) => statusLabel(summaryOf(record)) },
  ];
}

const METRIC_COLUMN = { rawPages: 0, cost: 2 };

function labelColumns(dimension) {
  const columns = [{ header: dimensionLabel(dimension), text: dimension === "contract", value: (entry) => entry.displayLabel }];
  if (dimension === "department") columns.push({ header: t("ฝ่าย"), value: (entry) => entry.hint || "" });
  return columns;
}

/** ชื่อกราฟ/การ์ดของพื้นที่เปรียบเทียบ — ใช้ทั้งบนจอและในไฟล์ */
export function comparisonTitle(model) {
  const incomplete = model.metric === "cost" && model.scope.unpriced > 0;
  const metric = metricLabel(model.metric, { incomplete });
  const dimension = dimensionLabel(model.dimension);
  if (model.view === "overall") return t("{0}รายเดือน", [metric]);
  if (model.view === "rank") {
    if (model.blocked === "unpriced") return t("อันดับ{0}ตามค่าใช้จ่าย — ยังจัดอันดับไม่ได้จนกว่าราคาจะครบ", [dimension]);
    return t("อันดับ{0}ตาม{1} — {2} {3} อันดับ", [dimension, metric, model.direction === "low" ? t("ต่ำสุด") : t("สูงสุด"), model.limit]);
  }
  return model.months.length >= 2
    ? t("{0}รายเดือนของ{1}ที่เลือก", [metric, dimension])
    : t("{0}ของ{1}ที่เลือก", [metric, dimension]);
}

/** แผ่น "เปรียบเทียบ" ของหน้าภาพรวม — ตารางเดียวกับบนจอพร้อมกราฟที่อ้างอิงตารางนั้น */
export function comparisonSheet(model) {
  const name = t("เปรียบเทียบ");
  const title = comparisonTitle(model);
  const valueFormat = model.metric === "cost" ? FORMATS.baht : FORMATS.count;
  const valueTitle = `${metricLabel(model.metric, { incomplete: model.metric === "cost" && model.scope.unpriced > 0 })} (${metricUnit(model.metric)})`;
  const rowsEnd = model.entries.length;

  if (model.view === "overall") {
    const columns = [{ header: t("เดือน"), value: (entry) => entry.label }, ...measureColumns((entry) => entry.summary)];
    const valueColumn = 1 + METRIC_COLUMN[model.metric];
    return sheetOf(name, columns, model.entries, {
      chart: {
        type: model.metric === "cost" ? "column" : "line", title, valueFormat, valueTitle,
        series: [{ name: { c1: valueColumn, r1: 0 }, categories: { c1: 0, r1: 1, r2: rowsEnd }, values: { c1: valueColumn, r1: 1, r2: rowsEnd } }],
      },
    });
  }

  const leading = model.view === "rank"
    ? [{ header: t("อันดับ"), format: FORMATS.count, value: (entry) => entry.rank }, ...labelColumns(model.dimension)]
    : labelColumns(model.dimension);
  const labelColumn = model.view === "rank" ? 1 : 0;
  const measures = measureColumns((entry) => entry.summary);
  const monthly = model.view === "select" && model.months.length >= 2
    ? model.months.map((month, index) => ({
      header: formatMonth(month),
      format: valueFormat,
      value: (entry) => {
        const summary = entry.monthly[index];
        if (!summary?.readings) return null;
        return model.metric === "cost" ? summary.cost : summary.rawPages;
      },
    }))
    : [];
  const columns = [...leading, ...measures, ...monthly];

  if (monthly.length) {
    // หนึ่งเส้นต่อหนึ่งรายการ: หมวดคือหัวคอลัมน์รายเดือน ค่าคือเซลล์ในแถวของรายการนั้น
    const first = leading.length + measures.length;
    const last = first + monthly.length - 1;
    return sheetOf(name, columns, model.entries, {
      chart: {
        type: "line", title, valueFormat, valueTitle,
        series: model.entries.map((_, index) => ({
          name: { c1: labelColumn, r1: index + 1 },
          categories: { c1: first, r1: 0, c2: last, r2: 0 },
          values: { c1: first, r1: index + 1, c2: last, r2: index + 1 },
        })),
      },
    });
  }

  const valueColumn = leading.length + METRIC_COLUMN[model.metric];
  return sheetOf(name, columns, model.entries, {
    chart: {
      type: "bar", title, valueFormat, valueTitle,
      series: [{ name: { c1: valueColumn, r1: 0 }, categories: { c1: labelColumn, r1: 1, r2: rowsEnd }, values: { c1: valueColumn, r1: 1, r2: rowsEnd } }],
    },
  });
}

/** แผ่น "เปรียบเทียบ" ของหน้าเปรียบเทียบความแตกต่าง */
export function differenceSheet(model, { title, currentLabel, referenceLabel }) {
  const name = t("เปรียบเทียบ");
  const unit = metricUnit(model.metric);
  const valueFormat = model.metric === "cost" ? FORMATS.baht : FORMATS.count;
  const incomplete = model.metric === "cost" && (model.scope.unpriced > 0 || (model.referenceScope?.unpriced ?? 0) > 0);
  const metric = metricLabel(model.metric, { incomplete });
  const valueOf = (summary) => (!summary?.readings ? null : model.metric === "cost" ? summary.cost : summary.rawPages);
  const netValueOf = (summary) => (!summary?.readings ? null : summary.netPages);
  const netColumn = (label, summaryOf) => ({
    header: label ? `${t("สุทธิหลังหัก 2%")} — ${label} (${t("หน้า")})` : t("สุทธิหลังหัก 2% (หน้า)"),
    format: FORMATS.pages,
    value: (entry) => netValueOf(summaryOf(entry)),
  });
  const leading = labelColumns(model.dimension);
  const rowsEnd = model.entries.length;
  const diffColumns = [
    { header: t("ส่วนต่าง ({0})", [unit]), format: valueFormat, value: (entry) => entry.difference?.diff ?? null },
    { header: t("ส่วนต่าง (%)"), format: FORMATS.percent, value: (entry) => entry.difference?.ratio ?? null },
    { header: t("หมายเหตุการเทียบ"), value: (entry) => differenceNote(entry.difference, { isBase: entry.isBase }) },
  ];

  if (model.basis === "periods") {
    const referenceValueColumn = leading.length;
    const currentValueColumn = leading.length + (model.metric === "rawPages" ? 2 : 1);
    const columns = [
      ...leading,
      { header: `${referenceLabel} (${unit})`, format: valueFormat, value: (entry) => valueOf(entry.reference) },
      ...(model.metric === "rawPages" ? [netColumn(referenceLabel, (entry) => entry.reference)] : []),
      { header: `${currentLabel} (${unit})`, format: valueFormat, value: (entry) => valueOf(entry.summary) },
      ...(model.metric === "rawPages" ? [netColumn(currentLabel, (entry) => entry.summary)] : []),
      ...diffColumns,
      { header: t("เครื่องที่มีข้อมูล — {0}", [referenceLabel]), format: FORMATS.count, value: (entry) => entry.reference.devices },
      { header: t("เครื่องที่มีข้อมูล — {0}", [currentLabel]), format: FORMATS.count, value: (entry) => entry.summary.devices },
      { header: t("สถานะข้อมูล — {0}", [referenceLabel]), value: (entry) => statusLabel(entry.reference) },
      { header: t("สถานะข้อมูล — {0}", [currentLabel]), value: (entry) => statusLabel(entry.summary) },
    ];
    return sheetOf(name, columns, model.entries, {
      chart: {
        type: "bar", title, valueFormat, valueTitle: `${metric} (${unit})`,
        series: [referenceValueColumn, currentValueColumn].map((column) => ({ name: { c1: column, r1: 0 }, categories: { c1: 0, r1: 1, r2: rowsEnd }, values: { c1: column, r1: 1, r2: rowsEnd } })),
      },
    });
  }

  const columns = [
    ...leading,
    { header: t("บทบาทในการเทียบ"), value: (entry) => (entry.isBase ? t("ฐาน") : t("เทียบกับฐาน")) },
    { header: `${metric} (${unit})`, format: valueFormat, value: (entry) => valueOf(entry.summary) },
    ...(model.metric === "rawPages" ? [netColumn("", (entry) => entry.summary)] : []),
    ...diffColumns,
    { header: t("เครื่องที่มีข้อมูล (เครื่อง)"), format: FORMATS.count, value: (entry) => entry.summary.devices },
    { header: t("สถานะข้อมูล"), value: (entry) => statusLabel(entry.summary) },
  ];
  const valueColumn = leading.length + 1;
  return sheetOf(name, columns, model.entries, {
    chart: {
      type: "bar", title, valueFormat, valueTitle: `${metric} (${unit})`,
      series: [{ name: { c1: valueColumn, r1: 0 }, categories: { c1: 0, r1: 1, r2: rowsEnd }, values: { c1: valueColumn, r1: 1, r2: rowsEnd } }],
    },
  });
}

const DETAIL_COLUMNS = () => [
  { header: t("เดือน"), format: FORMATS.month, value: (row) => monthCell(row.month) },
  { header: t("ปีงบประมาณ"), format: "0", value: (row) => fiscalYearOfMonth(row.month) },
  { header: "Serial", text: true, value: (row) => row.serial_number ?? "" },
  { header: t("ยี่ห้อ"), value: (row) => row.brand_name ?? "" },
  { header: t("รุ่น"), value: (row) => row.model ?? "" },
  { header: t("ฝ่าย"), value: (row) => row.division_name || t("ไม่ระบุฝ่าย") },
  { header: t("แผนก"), value: (row) => row.department_name || t("ไม่ระบุแผนก") },
  { header: t("สัญญาที่คิดเงิน"), text: true, value: (row) => row.billing_contract_no || t("ไม่ผูกสัญญา") },
  { header: t("อาคาร"), value: (row) => row.building_name ?? "" },
  { header: t("ยอดพิมพ์จริง (หน้า)"), format: FORMATS.count, value: (row) => Number(row.pages_printed || 0) },
  { header: t("สุทธิหลังหัก 2% (หน้า)"), format: FORMATS.pages, value: (row) => Math.round(Number(row.net_pages || 0) * 100) / 100 },
  { header: t("ราคาต่อหน้า (บาท)"), format: FORMATS.price, value: (row) => (row.price_per_page == null ? null : Number(row.price_per_page)) },
  { header: t("ค่าใช้จ่ายที่ยืนยันแล้ว (บาท)"), format: FORMATS.baht, value: (row) => (row.total_cost == null ? null : Number(row.total_cost)) },
  { header: t("สถานะราคา"), value: (row) => (row.total_cost == null ? t("ยังยืนยันราคาไม่ได้") : t("ยืนยันราคาแล้ว")) },
];

/** แผ่น "ข้อมูลรายละเอียด" — หนึ่งแถวต่อเครื่องต่อเดือน เรียงตามเดือน หน่วยงาน และ Serial */
export function detailSheet(rows) {
  const sorted = [...rows].sort((a, b) => String(a.month).localeCompare(String(b.month))
    || String(a.division_name ?? "").localeCompare(String(b.division_name ?? ""), "th")
    || String(a.department_name ?? "").localeCompare(String(b.department_name ?? ""), "th")
    || String(a.serial_number ?? "").localeCompare(String(b.serial_number ?? "")));
  return sheetOf(t("ข้อมูลรายละเอียด"), DETAIL_COLUMNS(), sorted);
}

/** แผ่น "เงื่อนไขรายงาน" — ทุกไฟล์ขึ้นต้นด้วยชื่อรายงาน เวลาที่สร้าง และสกุลเงิน */
export function conditionsSheet(filename, pairs) {
  return {
    name: t("เงื่อนไขรายงาน"),
    header: [t("หัวข้อ"), t("รายละเอียด")],
    rows: [...reportStamp(filename), ...pairs.filter(([, value]) => value !== "" && value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value)])],
    columns: [{ width: 28 }, { width: 90 }],
    filter: false,
  };
}

/** บรรทัดสถานะราคาของไฟล์ — ไฟล์เดินทางต่อได้เองโดยไม่มีหน้าจอกำกับ (Q27) */
export function priceStatusLine(unpriced) {
  return Number(unpriced) > 0
    ? t("ยังยืนยันราคาไม่ได้ {0} รายการ — ยอดเงินในไฟล์นี้เป็นเฉพาะส่วนที่ยืนยันราคาแล้ว และยังไม่จัดอันดับหรือคิดส่วนต่างค่าใช้จ่าย", [Number(unpriced)])
    : t("ยืนยันราคาครบทุกรายการ");
}

/** นิยามและข้อควรระวังที่ทุกไฟล์เปรียบเทียบมีเหมือนกัน */
export function standardNotes() {
  return [
    [t("นิยามยอดพิมพ์"), t("ยอดพิมพ์จริง = จำนวนหน้าที่บันทึก (หน้าดิบ) · สุทธิหลังหัก 2% = หน้าดิบ × 0.98 ใช้เป็นฐานคิดเงิน")],
    [t("หน่วยงานและสัญญา"), t("ใช้ฝ่าย แผนก และสัญญาที่คิดเงินที่มีผลในแต่ละเดือน")],
    [t("ไม่มีข้อมูลกับศูนย์"), t("เซลล์ว่าง = ไม่มีรายการยอดพิมพ์ ส่วน 0 = บันทึกยอดเป็นศูนย์จริง")],
    [t("ข้อควรระวัง"), t("ยอดที่สูงกว่าไม่ได้แปลว่าสิ้นเปลือง และยอดที่ลดลงไม่ได้แปลว่าประหยัดเสมอ ให้อ่านคู่กับจำนวนเครื่องและลักษณะงานของหน่วยงาน")],
  ];
}

export async function saveWorkbook(filename, sheets) {
  downloadWorkbook(await createWorkbook({ sheets }), filename);
}

/** ชื่อไฟล์ ASCII ที่บอกขอบเขต เช่น print-comparison-fy2569-2025-10_2025-12-department-rank */
export function exportFilename(parts) {
  return parts
    .filter((part) => part !== "" && part !== null && part !== undefined)
    .map((part) => String(part).replace(/[^A-Za-z0-9_-]+/g, "_"))
    .join("-");
}

export function monthsSlug(months, allMonths = []) {
  const list = [...(months ?? [])].sort();
  if (!list.length || (allMonths.length && list.length === allMonths.length)) return "full-year";
  return list.length === 1 ? list[0] : `${list[0]}_${list.at(-1)}`;
}
