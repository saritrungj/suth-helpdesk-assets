import { fiscalYearOfMonth } from "@suth/domain";
import { t } from "../lib/locale";
import { FORMATS, createWorkbook, downloadWorkbook, monthCell, reportStamp } from "../lib/export-xlsx";
import { differenceNote, dimensionLabel, metricLabel, metricUnit, monthText, statusLabel, summarize } from "./comparison";

/**
 * comparison-export.js — ไฟล์ Excel ของการเปรียบเทียบ ใช้ร่วมกันสองหน้า
 *
 * ไฟล์เดียวมีหลายแผ่น เรียงตามลำดับที่คนเปิดอ่าน
 *
 *   เปรียบเทียบ       ตารางตัวเลขชุดเดียวกับบนจอ + กราฟ Excel ที่อ้างอิงตารางนั้น
 *   อันดับ            ทุกรายการเรียงมาก→น้อย + กราฟ 10 อันดับแรกและท้าย (มีเฉพาะในไฟล์ #115)
 *   ข้อมูลรายละเอียด  แถวรายเครื่องรายเดือนครบตามขอบเขต ไว้ตรวจและวิเคราะห์ต่อ
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

export function summarySheet(rows) {
  const summary = summarize(rows);
  const record = {
    ...summary,
    pagesPerDevice: summary.devices ? summary.rawPages / summary.devices : null,
    costPerDevice: summary.devices && summary.cost != null ? summary.cost / summary.devices : null,
  };
  return sheetOf(t("สรุป"), [
    { header: t("ยอดพิมพ์จริง (หน้า)"), format: FORMATS.count, value: (item) => item.rawPages },
    { header: t("สุทธิหลังหัก 2% (หน้า)"), format: FORMATS.pages, value: (item) => item.netPages },
    { header: t("ค่าใช้จ่ายที่ยืนยันแล้ว (บาท)"), format: FORMATS.baht, value: (item) => item.cost },
    { header: t("เครื่องที่มีข้อมูล (เครื่อง)"), format: FORMATS.count, value: (item) => item.devices },
    { header: t("หน้าต่อเครื่อง"), format: FORMATS.pages, value: (item) => item.pagesPerDevice },
    { header: t("บาทต่อเครื่อง"), format: FORMATS.baht, value: (item) => item.costPerDevice },
    { header: t("รายการรอยืนยันราคา"), format: FORMATS.count, value: (item) => item.unpriced },
  ], [record]);
}

export function monthlySheet(rows) {
  const months = [...new Set((rows ?? []).map((row) => row.calendar_month ?? row.month))].sort();
  const records = months.map((month) => ({ month, summary: summarize(rows.filter((row) => (row.calendar_month ?? row.month) === month)) }));
  return sheetOf(t("รายเดือน"), [
    { header: t("เดือน"), value: (item) => monthText(item.month) },
    ...measureColumns((item) => item.summary),
  ], records);
}

export function qualitySheet(rows) {
  const priced = (rows ?? []).filter((row) => row.total_cost != null);
  const unpriced = (rows ?? []).filter((row) => row.total_cost == null);
  const records = [
    { label: t("ยืนยันราคาแล้ว"), summary: summarize(priced) },
    { label: t("ยังยืนยันราคาไม่ได้"), summary: summarize(unpriced) },
  ];
  return sheetOf(t("คุณภาพข้อมูล"), [
    { header: t("สถานะราคา"), value: (item) => item.label },
    { header: t("จำนวนรายการ"), format: FORMATS.count, value: (item) => item.summary.readings },
    { header: t("ยอดพิมพ์จริง (หน้า)"), format: FORMATS.count, value: (item) => item.summary.rawPages },
    { header: t("จำนวนเครื่อง"), format: FORMATS.count, value: (item) => item.summary.devices },
  ], records);
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
  // เลขสัญญาและ Serial เป็นรหัส ต้องคงตัวอักษรเดิม (Serial ขึ้นต้นด้วยศูนย์ได้)
  const columns = [{ header: dimensionLabel(dimension), text: dimension === "contract" || dimension === "device", value: (entry) => entry.displayLabel }];
  if (dimension === "department") columns.push({ header: t("ฝ่าย"), value: (entry) => entry.hint || "" });
  return columns;
}

/** ชื่อกราฟ/การ์ดของพื้นที่เปรียบเทียบ — ใช้ทั้งบนจอและในไฟล์ */
export function comparisonTitle(model) {
  const incomplete = model.metric === "cost" && model.scope.unpriced > 0;
  const metric = metricLabel(model.metric, { incomplete });
  const dimension = dimensionLabel(model.dimension);
  if (model.view === "overall") return t("{0}รายเดือน", [metric]);
  if (model.autoPicked) {
    return model.months.length >= 2
      ? t("{0}รายเดือนของ{1}ที่ยอดสูงสุด {2} รายการ", [metric, dimension, model.entries.length])
      : t("{0}ของ{1}ที่ยอดสูงสุด {2} รายการ", [metric, dimension, model.entries.length]);
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

  const leading = labelColumns(model.dimension);
  const labelColumn = 0;
  const measures = measureColumns((entry) => entry.summary);
  const monthly = model.months.length >= 2
    ? model.months.map((month, index) => ({
      header: monthText(month),
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

/** จำนวนรายการในกราฟอันดับแต่ละใบ — แท่งแนวนอนสิบแท่งยังอ่านชื่อหน่วยงานได้ครบ */
const RANKING_CHART_SIZE = 10;

/**
 * กราฟของแผ่นอันดับ: 10 อันดับแรกและ 10 อันดับท้าย
 *
 * ตารางเรียงมาก→น้อยอยู่แล้ว ใบแรกจึงเป็นแถวบนสุด ใบที่สองเป็นแถวล่างสุดของตาราง
 * เมื่อมีรายการไม่เกินสิบ สองใบจะครอบแถวชุดเดียวกันทั้งคู่ — คืนใบเดียวที่มีครบทุกรายการ
 * แทน ไม่งั้นได้กราฟซ้ำสองใบที่ติดป้าย "มากสุด/น้อยสุด 10 อันดับ" ทั้งที่แสดงของชุดเดียวกัน
 */
function rankingCharts(count, { labelColumn, valueColumn, valueFormat, valueTitle, noun, measure }) {
  const chartOf = (title, r1, r2) => ({
    type: "bar", title, valueFormat, valueTitle, categoryCount: r2 - r1 + 1,
    series: [{ name: { c1: valueColumn, r1: 0 }, categories: { c1: labelColumn, r1, r2 }, values: { c1: valueColumn, r1, r2 } }],
  });
  if (count <= RANKING_CHART_SIZE) {
    return [chartOf(t("{0}ตาม{1} — ทั้งหมด {2} รายการ", [noun, measure, count]), 1, count)];
  }
  return [
    chartOf(t("{0}ตาม{1} — มากสุด {2} อันดับ", [noun, measure, RANKING_CHART_SIZE]), 1, RANKING_CHART_SIZE),
    chartOf(t("{0}ตาม{1} — น้อยสุด {2} อันดับ", [noun, measure, RANKING_CHART_SIZE]), count - RANKING_CHART_SIZE + 1, count),
  ];
}

/**
 * แผ่น "อันดับ" — ทุกรายการของมิติที่เลือกเรียงจากมากไปน้อยตามตัวชี้วัดบนจอ (#115)
 *
 * อันดับอยู่ในไฟล์เท่านั้น บนหน้าจอไม่มีมุมมองอันดับ ตารางจึงมีครบทุกรายการ (ไม่ต้องเลือก
 * 5 หรือ 10 ตอนส่งออก) และมีกราฟสองใบ: 10 อันดับแรกและ 10 อันดับท้าย ใช้เท่าที่มีเมื่อไม่ครบสิบ
 * รายการ ค่าใช้จ่ายที่ราคายังไม่ครบไม่ถูกจัดอันดับ (Q30) — แผ่นบอกเหตุผลแทนตาราง
 *
 * @param {object} model แบบจำลองจาก buildComparison ที่ไม่ใช่ภาพรวม
 * @returns {object|null} null เมื่อไม่มีอะไรให้จัดอันดับ (ภาพรวมรายเดือน)
 */
export function rankingSheet(model) {
  const ranking = model.ranking;
  if (!ranking) return null;
  const name = t("อันดับ");
  const dimension = dimensionLabel(model.dimension);
  const metric = metricLabel(model.metric);
  if (ranking.blocked) {
    const reason = ranking.blocked === "unpriced"
      ? t("ยังจัดอันดับ{0}ตามค่าใช้จ่ายไม่ได้ เพราะราคายังยืนยันไม่ครบ {1} รายการ — อันดับจากยอดเงินบางส่วนจะชี้ผิดรายการ ส่งออกด้วยตัวชี้วัดยอดพิมพ์จริงเพื่อดูอันดับ", [dimension, model.total.unpriced])
      : t("ยังไม่มียอดพิมพ์ในช่วงที่เลือก");
    return { name, header: [t("หมายเหตุ")], rows: [[reason]], columns: [{ width: 90 }], filter: false };
  }
  const valueFormat = model.metric === "cost" ? FORMATS.baht : FORMATS.count;
  const valueTitle = `${metric} (${metricUnit(model.metric)})`;
  const leading = [{ header: t("อันดับ"), format: FORMATS.count, value: (entry) => entry.rank }, ...labelColumns(model.dimension)];
  const columns = [...leading, ...measureColumns((entry) => entry.summary)];
  const valueColumn = leading.length + METRIC_COLUMN[model.metric];
  const charts = rankingCharts(ranking.entries.length, { labelColumn: 1, valueColumn, valueFormat, valueTitle, noun: dimension, measure: metric });
  return sheetOf(name, columns, ranking.entries, { charts });
}

/**
 * แผ่น "อันดับ" ของหน้าค่าใช้จ่ายแยกแผนก — ทุกแผนกที่มีรายการยอดพิมพ์ เรียงมาก→น้อย (#115)
 *
 * หน้านั้นมีแต่หน้าสุทธิกับค่าใช้จ่าย (ไม่มีหน้าดิบ) อันดับจึงเรียงตามค่าใช้จ่ายสุทธิ และเมื่อ
 * ราคายังยืนยันไม่ครบแม้แผนกเดียว จะเรียงตามจำนวนหน้าสุทธิแทน เพราะอันดับจากยอดเงินบางส่วน
 * ชี้ผิดแผนกได้ (Q30) — `basis` บอกผู้เรียกว่าเรียงด้วยอะไร เพื่อเขียนไว้ในแผ่นบริบท
 * แผนกที่ไม่มีรายการเลยไม่ถูกจัดอันดับ ส่วนแผนกที่บันทึก 0 หน้าจริงอยู่ท้ายตาราง
 *
 * @param {object[]} divisions ต้นไม้ฝ่าย → แผนก → เครื่อง จาก /dashboard/by-department
 */
export function departmentRankingSheet(divisions) {
  const entries = (divisions ?? []).flatMap((division) => (division.departments ?? []).map((department) => ({
    label: department.name,
    hint: division.name,
    readings: (department.devices ?? []).reduce((sum, device) => sum + (device.monthly?.length ?? 0), 0),
    netPages: Number(department.total_pages || 0),
    costSatang: Number(department.total_cost_satang ?? Math.round(Number(department.total_cost || 0) * 100)),
    cost: Number(department.total_cost || 0),
    devices: Number(department.device_count ?? department.devices?.length ?? 0),
    unpriced: Number(department.unpriced_readings || 0),
  }))).filter((entry) => entry.readings > 0);
  const basis = entries.some((entry) => entry.unpriced > 0) ? "netPages" : "cost";
  const valueOf = (entry) => (basis === "cost" ? entry.costSatang : entry.netPages);
  const ranked = entries
    .sort((a, b) => valueOf(b) - valueOf(a) || String(a.label).localeCompare(String(b.label), "th"))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const columns = [
    { header: t("อันดับ"), format: FORMATS.count, value: (entry) => entry.rank },
    { header: t("แผนก"), value: (entry) => entry.label },
    { header: t("ฝ่าย"), value: (entry) => entry.hint },
    { header: t("ค่าใช้จ่ายสุทธิ (บาท)"), format: FORMATS.baht, value: (entry) => entry.cost },
    { header: t("จำนวนหน้าสุทธิ (หน้า)"), format: FORMATS.pages, value: (entry) => entry.netPages },
    { header: t("เครื่องที่มีข้อมูล (เครื่อง)"), format: FORMATS.count, value: (entry) => entry.devices },
    { header: t("รายการรอยืนยันราคา"), format: FORMATS.count, value: (entry) => entry.unpriced },
  ];
  const measure = basis === "cost" ? t("ค่าใช้จ่ายสุทธิ") : t("จำนวนหน้าสุทธิ");
  const charts = ranked.length ? rankingCharts(ranked.length, {
    labelColumn: 1,
    valueColumn: basis === "cost" ? 3 : 4,
    valueFormat: basis === "cost" ? FORMATS.baht : FORMATS.pages,
    valueTitle: basis === "cost" ? t("ค่าใช้จ่ายสุทธิ (บาท)") : t("จำนวนหน้าสุทธิ (หน้า)"),
    noun: t("แผนก"),
    measure,
  }) : undefined;
  return { sheet: sheetOf(t("อันดับ"), columns, ranked, charts ? { charts } : {}), basis, count: ranked.length };
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
  // แถวของการเทียบข้ามปีงบมีเดือนจริงอยู่ที่ calendar_month (month เป็นตำแหน่งในปีงบ)
  { header: t("เดือน"), format: FORMATS.month, value: (row) => monthCell(row.calendar_month ?? row.month) },
  { header: t("ปีงบประมาณ"), format: "0", value: (row) => fiscalYearOfMonth(row.calendar_month ?? row.month) },
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
  const sorted = [...rows].sort((a, b) => String(a.calendar_month ?? a.month).localeCompare(String(b.calendar_month ?? b.month))
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
