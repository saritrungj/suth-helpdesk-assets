import { fiscalYearMonths, fiscalYearOfMonth, fromSatang, getFiscalYearRange, monthIndex, sumCostSatang } from "@suth/domain";
import { t } from "../lib/locale";
import { MONTH_NAMES, formatMonth, yearLabel } from "../lib/locale-format";

/**
 * comparison.js — ตรรกะการเปรียบเทียบที่หน้าภาพรวมการพิมพ์และหน้าเปรียบเทียบใช้ร่วมกัน
 *
 * ทั้งสองหน้าอ่านแถวชุดเดียวกันจาก `/dashboard/monthly-kpi` (หนึ่งแถว = หนึ่งเครื่อง
 * หนึ่งเดือน) ซึ่ง API จัดฝ่าย แผนก และสัญญาที่คิดเงิน "ที่มีผลในเดือนนั้น" มาให้แล้ว
 * ไฟล์นี้จึงไม่หาราคาและไม่คิดส่วนลดเอง — รวมยอดที่ได้มาเท่านั้น (ADR-0019)
 *
 * กติกาที่ทั้งหน้าจอและไฟล์ Excel ต้องเหมือนกัน จึงอยู่ที่นี่ที่เดียว
 *
 *   - **ไม่มีข้อมูล ≠ ศูนย์** กลุ่มที่ไม่มีรายการยอดพิมพ์เลยได้ค่า null ส่วนกลุ่มที่บันทึก
 *     0 หน้าไว้จริงได้ 0 และยังอยู่ในอันดับต่ำสุด
 *   - **ยอดเงินรวมเป็นสตางค์** ผ่าน `sumCostSatang` ของ domain โดยทุกยอดที่บันทึกได้
 *     ต้องมีราคาแล้วตั้งแต่ขาเข้า (ADR-0021)
 *   - **ฐานเป็นศูนย์ไม่มีเปอร์เซ็นต์** ส่วนต่างจริงยังแสดงได้ แต่ "เพิ่มขึ้นกี่ %" จากศูนย์
 *     ไม่มีความหมาย
 *   - **"ยอดพิมพ์" คือยอดพิมพ์จริง (จำนวนหน้าดิบ)** ส่วนหน้าสุทธิหลังหัก 2% เป็นฐานคิดเงิน
 *     และแสดงคู่กันเสมอภายใต้ชื่อของมันเอง
 */

/** ชุดสีของกราฟมี 8 สีที่แยกกันได้และไม่วนซ้ำ — เลือกรายการมาเทียบได้ไม่เกินนี้ */
export const MAX_ITEMS = 8;
export const DIMENSIONS = ["overall", "division", "department", "contract", "building", "device", "fiscalYear"];

const GROUPING = {
  division: { id: "division_id", name: "division_name" },
  department: { id: "department_id", name: "department_name", hint: "division_name" },
  // สัญญาที่คิดเงินของเดือนนั้น ไม่ใช่สัญญาปัจจุบันของเครื่อง (ADR-0019)
  contract: { id: "billing_contract_id", name: "billing_contract_no" },
  // อาคารของเดือนนั้นจากประวัติการย้าย — ID แยกตัวตนออกจากชื่อที่แสดง
  building: { id: "building_id", name: "building_name" },
  // เครื่องนับตามตัวเครื่อง ไม่ใช่ตามที่ตั้ง — เครื่องที่ย้ายระหว่างปียังเป็นเส้นเดียว (#115)
  device: { id: "device_id", name: "serial_number" },
  // เทียบข้ามปีงบ — แถวถูกย้ายมาอยู่บนแกนเดือนของปีงบก่อนด้วย yearRows()
  fiscalYear: { id: "fiscal_year", name: "fiscal_year_label" },
};

/** ที่ตั้งล่าสุดของเครื่องในแถวชุดนี้ — แถวเรียงตามเดือนจาก API จึงใช้แถวสุดท้าย */
function deviceLocation(rows) {
  const last = rows?.at(-1);
  return last ? [last.building_name, last.location].filter(Boolean).join(" ") : "";
}

export function dimensionLabel(dimension) {
  return {
    overall: t("ภาพรวม"),
    division: t("ฝ่าย"),
    department: t("แผนก"),
    contract: t("สัญญา"),
    building: t("อาคาร"),
    device: t("เครื่อง"),
    fiscalYear: t("ปีงบ"),
  }[dimension] ?? "";
}

function emptyLabel(dimension) {
  return {
    division: t("ไม่ระบุฝ่าย"),
    department: t("ไม่ระบุแผนก"),
    contract: t("ไม่ผูกสัญญา"),
    building: t("ไม่ระบุอาคาร"),
    device: t("ไม่ระบุเครื่อง"),
  }[dimension] ?? t("ไม่ระบุ");
}

/** ชื่อตัวชี้วัดแบบเต็มที่ใช้ทั้งหัวกราฟ หัวตาราง และไฟล์ */
export function metricLabel(metric) {
  return metric === "rawPages" ? t("ยอดพิมพ์จริง") : t("ค่าใช้จ่ายสุทธิ");
}

export function metricUnit(metric) {
  return metric === "rawPages" ? t("หน้า") : t("บาท");
}

/* --------------------------------------------------------------------------
   รวมยอด
   -------------------------------------------------------------------------- */

/**
 * สรุปแถวยอดพิมพ์ชุดหนึ่ง
 *
 * `netPages` รวมเป็นหน่วยร้อยของหน้าแล้วหารครั้งเดียว เพราะหน้าสุทธิมีทศนิยมสองตำแหน่ง
 * (หน้าดิบ × 0.98) และการบวกทศนิยมตรงๆ ทิ้งเศษอย่าง 98.97999999 ไว้ในไฟล์ Excel
 */
export function summarize(rows = []) {
  const { satang, unpriced } = sumCostSatang(rows.map((row) => row.total_cost));
  let rawPages = 0;
  let netHundredths = 0;
  const devices = new Set();
  for (const row of rows) {
    rawPages += Number(row.pages_printed || 0);
    netHundredths += Math.round(Number(row.net_pages || 0) * 100);
    devices.add(row.device_id);
  }
  return {
    readings: rows.length,
    rawPages,
    netPages: netHundredths / 100,
    costSatang: satang,
    // ไม่มีรายการ หรือทุกรายการยังไม่รู้ราคา = ไม่รู้ยอดเงิน ไม่ใช่ศูนย์บาท
    cost: rows.length && unpriced < rows.length ? fromSatang(satang) : null,
    unpriced,
    devices: devices.size,
  };
}

/**
 * ค่าเฉลี่ยต่อเครื่องของ summary เดียวกัน
 *
 * ทุกยอดที่บันทึกมีราคาเสมอ เพราะทางเขียนปฏิเสธยอดที่หาราคาไม่ได้ (ADR-0021)
 */
export function averagePerDevice(summary, field) {
  if (!summary?.devices) return null;
  const value = summary[field];
  return value === null || value === undefined ? null : value / summary.devices;
}

/** ค่าที่แสดงของตัวชี้วัด — null = ไม่มีข้อมูล (หรือยังไม่รู้ยอดเงินเลยสักรายการ) */
export function metricValue(summary, metric) {
  if (!summary?.readings) return null;
  return metric === "rawPages" ? summary.rawPages : summary.cost;
}

/** ค่าที่ใช้เรียงอันดับ — เงินใช้สตางค์ซึ่งเป็นจำนวนเต็ม ไม่ให้เศษทศนิยมตัดสินลำดับ */
function sortValue(summary, metric) {
  return metric === "rawPages" ? summary.rawPages : summary.costSatang;
}

export function dataStatus(summary) {
  return summary?.readings ? "complete" : "no-data";
}

/**
 * ส่วนต่างของค่าเทียบกับฐาน — สูตรเดียวของทั้งหน้าจอและไฟล์
 *
 *   ส่วนต่าง   = ค่าของรายการ − ค่าฐาน
 *   ส่วนต่าง % = ส่วนต่าง ÷ ค่าฐาน (คืนเป็นสัดส่วน เช่น 0.125 = 12.5%)
 *
 * `reason` บอกเหตุที่ไม่มีค่าเพื่อให้หน้าจอเขียนเหตุผลได้ ไม่ใช่แสดงขีดเฉยๆ
 */
export function difference(base, value, metric) {
  if (!base?.readings) return { diff: null, ratio: null, reason: "no-base-data" };
  if (!value?.readings) return { diff: null, ratio: null, reason: "no-data" };
  const from = sortValue(base, metric);
  const delta = sortValue(value, metric) - from;
  return {
    diff: metric === "cost" ? fromSatang(delta) : delta,
    ratio: from === 0 ? null : delta / from,
    reason: from === 0 ? "zero-base" : null,
  };
}

/* --------------------------------------------------------------------------
   จัดกลุ่ม
   -------------------------------------------------------------------------- */

/** key ของกลุ่มที่แถวนี้สังกัด — ไม่มีค่า = "unassigned" ซึ่งยังเจาะดูได้ ไม่หายไปจากรายงาน */
export function groupKey(row, dimension) {
  const id = row?.[GROUPING[dimension]?.id];
  return id === null || id === undefined || id === "" ? "unassigned" : String(id);
}

export function groupRows(rows, dimension) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const key = groupKey(row, dimension);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

/**
 * ตัวเลือกของรายการที่จะเทียบ — ข้อมูลอ้างอิงก่อน แล้วตามด้วยกลุ่มที่มีในแถวแต่ไม่อยู่
 * ในข้อมูลอ้างอิง (รวม "ไม่ระบุ") เพื่อให้เลือกหน่วยงานที่ยังไม่มียอดได้ และเห็นว่า
 * "ไม่มีข้อมูล" แทนที่จะหาไม่เจอ
 */
export function itemOptions(dimension, { divisions = [], departments = [], contracts = [], buildings = [] } = {}, rows = []) {
  const divisionName = new Map(divisions.map((division) => [String(division.id), division.name]));
  const source = {
    division: divisions.map((division) => ({ value: String(division.id), label: division.name })),
    department: departments.map((department) => {
      const hint = divisionName.get(String(department.division_id)) ?? "";
      return { value: String(department.id), label: department.name, hint, keywords: hint };
    }),
    contract: contracts.map((contract) => {
      const hint = contract.fiscal_year ? t("ปีงบ {0}", [yearLabel(contract.fiscal_year)]) : "";
      return { value: String(contract.id), label: contract.contract_no, hint, keywords: hint };
    }),
    building: buildings.map((building) => ({ value: String(building.id), label: building.name })),
    // เครื่องที่มียอดในช่วงนี้ ค้นได้ทั้ง Serial ยี่ห้อ/รุ่น และที่ตั้ง
    device: [...groupRows(rows, "device").entries()].filter(([key]) => key !== "unassigned").map(([key, list]) => {
      const hint = deviceLocation(list);
      const first = list[0];
      return { value: key, label: first.serial_number || key, hint, keywords: [hint, first.brand_name, first.model].filter(Boolean).join(" ") };
    }).sort((a, b) => String(a.label).localeCompare(String(b.label))),
  }[dimension] ?? [];

  const options = new Map(source.map((option) => [option.value, option]));
  const spec = GROUPING[dimension];
  if (spec) {
    for (const row of rows) {
      const key = groupKey(row, dimension);
      if (options.has(key)) continue;
      const hint = spec.hint ? row[spec.hint] ?? "" : undefined;
      options.set(key, { value: key, label: key === "unassigned" ? emptyLabel(dimension) : row[spec.name] || emptyLabel(dimension), hint, keywords: hint });
    }
  }
  return [...options.values()];
}

/** ชื่อของกลุ่ม — จากแถวก่อน (ชื่อที่มีผลในช่วงนั้น) แล้วค่อยข้อมูลอ้างอิง */
function describe(key, dimension, groupRowsList, options) {
  const spec = GROUPING[dimension];
  const first = groupRowsList?.[0];
  const option = options.find((item) => item.value === key);
  if (key === "unassigned") return { label: emptyLabel(dimension), hint: "" };
  if (dimension === "device") return { label: (first && first.serial_number) || option?.label || key, hint: deviceLocation(groupRowsList) || option?.hint || "" };
  return {
    label: (first && first[spec.name]) || option?.label || emptyLabel(dimension),
    hint: spec.hint ? (first?.[spec.hint] ?? option?.hint ?? "") : "",
  };
}

/**
 * แผนกชื่อซ้ำกันข้ามฝ่ายมีได้จริง — เติมชื่อฝ่ายต่อท้ายเฉพาะชื่อที่ซ้ำ ไม่งั้นกราฟมี
 * สองแท่งชื่อเดียวกันแต่ไม่ต้องยาวทุกแท่งเพื่อกันกรณีที่เกิดไม่บ่อย
 */
function disambiguate(entries, dimension) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
  return entries.map((entry) => ({
    ...entry,
    // Serial อย่างเดียวคนจำไม่ได้ว่าเครื่องไหน — ป้ายของเครื่องมีที่ตั้งกำกับเสมอ
    displayLabel: dimension === "device" && entry.hint ? `${entry.label} · ${entry.hint}`
      : counts.get(entry.label) > 1 && entry.hint ? `${entry.label} (${entry.hint})` : entry.label,
  }));
}

function entryFor(key, dimension, groupRowsList, options, months) {
  const rows = groupRowsList ?? [];
  return {
    key,
    ...describe(key, dimension, rows, options),
    summary: summarize(rows),
    monthly: months ? months.map((month) => summarize(rows.filter((row) => row.month === month))) : [],
  };
}

/**
 * จัดอันดับมาก–น้อยของทุกรายการ — อันดับอยู่ในไฟล์ Excel เท่านั้น ไม่มีบนหน้าจอ (#115)
 *
 * คืนทุกรายการที่มีข้อมูลเรียงจากมากไปน้อย อันดับต้นและท้ายจึงอยู่ในรายการเดียวกัน
 * กลุ่มที่ไม่มีรายการเลยไม่ถูกจัดอันดับ (ไม่สร้างศูนย์ให้)
 * ค่าที่เท่ากันเรียงด้วยชื่อ เพื่อให้ผลเดิมทุกครั้งที่ส่งออก
 */
export function rankEntries(entries, { metric }) {
  const recorded = (entries ?? []).filter((entry) => entry.summary.readings > 0);
  return recorded
    .slice()
    .sort((a, b) => sortValue(b.summary, metric) - sortValue(a.summary, metric)
      || String(a.label).localeCompare(String(b.label), "th"))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * แบบจำลองของพื้นที่เปรียบเทียบ — กราฟ ตาราง และไฟล์ Excel อ่านจากที่นี่ชุดเดียว
 *
 * `rows` ผ่านตัวกรองของหน้ามาแล้ว ฟังก์ชันนี้จึง **ไม่คัดข้อมูลออกอีก** หน้าที่เดียว
 * คือแบ่งแถวชุดนั้นตามมิติที่เลือกแล้วเรียงจากมากไปน้อย — ตัวเลขรวมของแบบจำลองจึง
 * เท่ากับตัวเลขสำคัญบนหัวหน้าเสมอ ไม่ว่าผู้ใช้จะเทียบตามอะไร
 *
 * กราฟมีสีที่แยกกันออกจำกัด จึงวาดได้ `chartLimit` รายการแรก ส่วน `entries` มีครบทุก
 * กลุ่มให้ตารางและไฟล์ — จำนวนที่ไม่ได้ขึ้นกราฟอยู่ที่ `hidden` เพื่อให้หน้าจอบอกผู้ใช้
 * ตรงๆ แทนที่จะตัดทิ้งเงียบๆ
 *
 * @param {object} input
 * @param {object[]} input.rows แถวรายเครื่องรายเดือนที่ผ่านตัวกรองของหน้าแล้ว
 * @param {"overall"|"division"|"department"|"contract"|"building"|"device"|"fiscalYear"} input.dimension
 * @param {"cost"|"rawPages"} input.metric
 * @param {object[]} [input.options] ตัวเลือกจาก itemOptions() ใช้หาชื่อของกลุ่มที่ไม่มีข้อมูล
 * @param {string[]} [input.include] รหัสที่ผู้ใช้เลือกไว้ในตัวกรอง — กลุ่มที่เลือกแล้วไม่มียอด
 *   ต้องยังอยู่ในตารางพร้อมคำว่า "ไม่มีข้อมูล"
 * @param {string[]} [input.months] เดือนที่ต้องมีบนแกน — ใส่มาเมื่อเดือนที่ไม่มีข้อมูลต้อง
 *   เป็นช่องว่าง ไม่ใช่หายไปจากแกน
 * @param {number} [input.chartLimit] จำนวนเส้น/แท่งสูงสุดบนกราฟ
 */
export function buildComparison({ rows = [], dimension = "overall", metric = "cost", options = [], include = [], months: shownMonths = null, chartLimit = MAX_ITEMS }) {
  const months = shownMonths?.length ? [...shownMonths].sort() : [...new Set(rows.map((row) => row.month))].sort();
  const scope = summarize(rows);
  const base = { dimension, metric, months, scope, scopeRows: rows };

  if (dimension === "overall") {
    const entries = months.map((month) => {
      const label = formatMonth(month);
      return { key: month, label, displayLabel: label, hint: "", summary: summarize(rows.filter((row) => row.month === month)) };
    });
    return { ...base, view: "overall", entries, chartEntries: entries, hidden: 0, ranking: null, blocked: rows.length ? null : "no-data" };
  }

  const groups = groupRows(rows, dimension);
  // กลุ่มที่มียอด บวกกลุ่มที่ผู้ใช้เลือกไว้แต่ยังไม่มียอดในช่วงนี้
  const keys = [...new Set([...groups.keys(), ...include.map(String)])];
  const all = disambiguate(keys.map((key) => entryFor(key, dimension, groups.get(key), options, months)), dimension);
  const ranked = rankEntries(all, { metric });
  const ranking = {
    entries: ranked,
    from: all.filter((entry) => entry.summary.readings > 0).length,
    blocked: !rows.length ? "no-data" : null,
  };

  // เรียงมาก→น้อยตามตัวชี้วัดที่ดูอยู่ แล้วต่อท้ายด้วยกลุ่มที่ยังไม่มียอดเลย
  const order = ranked;
  const seen = new Set(order.map((entry) => entry.key));
  const rest = all.filter((entry) => !seen.has(entry.key)).sort((x, y) => String(x.label).localeCompare(String(y.label), "th"));
  const entries = [...order.map(({ rank: _rank, ...entry }) => entry), ...rest];

  return {
    ...base,
    view: "group",
    entries,
    chartEntries: entries.slice(0, chartLimit),
    hidden: Math.max(0, entries.length - chartLimit),
    ranking,
    blocked: !rows.length ? "no-data" : null,
  };
}

/** เปลี่ยนแปลงจากช่วงก่อนหน้าเป็นเปอร์เซ็นต์ — กฎเดียวกับ difference() */
export function periodChange(previous, current, metric) {
  const result = difference(previous, current, metric);
  return { percent: result.ratio === null ? null : result.ratio * 100, reason: result.reason };
}

/** ป้ายของรายการบนกราฟ — ติดสถานะไว้กับชื่อเมื่อยอดเงินของรายการนั้นยังไม่ครบ */
function chartLabel(entry, metric) {
  const status = dataStatus(entry.summary);
  if (status === "no-data") return `${entry.displayLabel} · ${t("ไม่มีข้อมูล")}`;
  return entry.displayLabel;
}

/**
 * ข้อมูลของกราฟบนหน้าจอ — ชนิดกราฟเลือกตามคำถาม
 *
 *   ภาพรวม            แท่งตั้งของแต่ละเดือน (ค่าใช้จ่าย) หรือเส้น (ยอดพิมพ์)
 *   แบ่งกลุ่ม ≥ 2 เดือน  เส้นหนึ่งเส้นต่อกลุ่ม เทียบกันตลอดช่วง
 *   แบ่งกลุ่ม 1 เดือน    แท่งแนวนอน — เส้นที่มีจุดเดียวไม่บอกอะไร
 *
 * วาดเฉพาะ `chartEntries` ส่วนตารางและไฟล์ใช้ `entries` ที่มีครบทุกกลุ่ม
 */
export function comparisonChart(model) {
  const { metric, months } = model;
  const entries = model.chartEntries ?? model.entries;
  const seriesLabel = metricLabel(metric);
  if (model.view === "overall") {
    return {
      kind: metric === "cost" ? "bar" : "line",
      horizontal: false,
      labels: entries.map((entry) => chartLabel(entry, metric)),
      categoryLabel: t("เดือน"),
      series: [{ key: metric, label: seriesLabel, data: entries.map((entry) => metricValue(entry.summary, metric)) }],
    };
  }
  if (model.view === "group" && months.length >= 2) {
    return {
      kind: "line",
      horizontal: false,
      labels: months.map((month) => monthText(month)),
      categoryLabel: t("เดือน"),
      series: entries.map((entry) => ({
        key: entry.key,
        label: chartLabel(entry, metric),
        data: entry.monthly.map((summary) => metricValue(summary, metric)),
      })),
    };
  }
  return {
    kind: "bar",
    horizontal: true,
    labels: entries.map((entry) => chartLabel(entry, metric)),
    categoryLabel: dimensionLabel(model.dimension),
    series: [{ key: metric, label: seriesLabel, data: entries.map((entry) => metricValue(entry.summary, metric)) }],
  };
}

/**
 * สถานะของพื้นที่กราฟ — บอกว่าจะวาดได้ไหม และถ้าไม่ได้ เพราะอะไร
 *
 *   "ready"          วาดได้ มีอย่างน้อยหนึ่งจุดที่เป็นตัวเลข
 *   "no-data"        ไม่มียอดพิมพ์ในขอบเขตที่เลือก
 */
export function chartState(model) {
  if (model.blocked) return model.blocked;
  const drawable = comparisonChart(model).series.some((item) => item.data.some((value) => value !== null));
  if (drawable) return "ready";

  return "no-data";
}

/* --------------------------------------------------------------------------
   เทียบข้ามปีงบ (#115)
   -------------------------------------------------------------------------- */

/** เลือกเทียบได้ไม่เกินสามปีงบ — เส้นมากกว่านั้นซ้อนกันจนอ่านไม่ออก */
export const MAX_YEARS = 3;
const POSITION = /^P(\d{2})$/;
/**
 * แกนเดือนของปีงบ "P01" (ต.ค.) ถึง "P12" (ก.ย.) — ที่เดียวที่สร้างลำดับนี้
 * หน้าที่วาดแกนข้ามปีงบ (ภาพรวม เปรียบเทียบ รายละเอียดเครื่อง) นำเข้าไปใช้ ไม่สร้างเอง
 */
export const FISCAL_POSITIONS = Object.freeze(Array.from({ length: 12 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`));
/** ปีงบใดก็ได้ — ใช้แค่ลำดับเดือนของปีงบ (ต.ค.→ก.ย.) จาก domain ไม่เขียนกฎนั้นซ้ำที่นี่ (ADR-0001) */
const ANY_FISCAL_YEAR = 2569;

/** ตำแหน่งของเดือนในปีงบ "P01" (ต.ค.) ถึง "P12" (ก.ย.) — เดือนเดียวกันของต่างปีงบได้ตำแหน่งเดียวกัน */
export function fiscalPosition(month) {
  const year = fiscalYearOfMonth(month);
  if (!year) return null;
  const index = fiscalYearMonths(getFiscalYearRange(year)).indexOf(month);
  return index < 0 ? null : `P${String(index + 1).padStart(2, "0")}`;
}

/** ชื่อของแกนเดือน — เดือนจริง ("ต.ค. 2568") หรือตำแหน่งในปีงบ ("ต.ค.") เมื่อเทียบข้ามปี */
export function monthText(key, options) {
  const match = POSITION.exec(String(key ?? ""));
  if (!match) return formatMonth(key, options);
  const calendar = fiscalYearMonths(getFiscalYearRange(ANY_FISCAL_YEAR))[Number(match[1]) - 1];
  return MONTH_NAMES[Number(calendar.slice(5)) - 1];
}

/**
 * ปีงบตั้งต้นของการเทียบข้ามปี — ปีที่ดูอยู่กับปีก่อนหน้า ว่างเมื่อยังไม่รู้ปีที่ดูอยู่
 * @param {number|string|null|undefined} currentYear ปีงบ พ.ศ. ที่เลือกอยู่บนแถบบนสุด
 */
export function defaultYearPair(currentYear) {
  const current = Number(currentYear);
  return current ? [String(current - 1), String(current)] : [];
}

/**
 * ตัวเลือกปีงบของการเทียบข้ามปี เรียงจากใหม่ไปเก่า
 *
 * รวมปีก่อนหน้าของปีที่ดูอยู่เสมอแม้ยังไม่ได้ตั้งปีงบนั้นไว้ในระบบ เพราะยอดย้อนหลังนำเข้าได้
 * @param {Array<{year: number|string}>} fiscalYears ปีงบที่มีในระบบ
 * @param {number|string|null|undefined} currentYear ปีงบ พ.ศ. ที่เลือกอยู่
 */
export function yearComparisonOptions(fiscalYears, currentYear) {
  return [...new Set([...(fiscalYears ?? []).map((year) => String(year.year)), ...defaultYearPair(currentYear)])]
    .sort((a, b) => Number(b) - Number(a))
    .map((year) => ({ value: year, label: t("ปีงบ {0}", [yearLabel(year)]) }));
}

/** เดือนทั้งหมดของหลายปีงบ — พารามิเตอร์ month ของ /dashboard/monthly-kpi */
export function fiscalYearsMonths(years) {
  return (years ?? []).flatMap((year) => fiscalYearMonths(getFiscalYearRange(Number(year))));
}

/**
 * วางแถวของหลายปีงบบนแกนเดียวกันตามตำแหน่งเดือนในปีงบ
 *
 * `month` กลายเป็นตำแหน่ง ("P01") ส่วนเดือนจริงเก็บไว้ที่ `calendar_month` — ไฟล์และแผง
 * รายละเอียดยังแสดงเดือนจริงได้ แถวของปีที่ไม่ได้เลือกถูกตัดออก
 */
export function yearRows(rows, years) {
  const wanted = new Set((years ?? []).map(String));
  return (rows ?? []).flatMap((row) => {
    const year = fiscalYearOfMonth(row.month);
    if (!wanted.has(String(year))) return [];
    return [{ ...row, calendar_month: row.month, month: fiscalPosition(row.month), fiscal_year: String(year), fiscal_year_label: t("ปีงบ {0}", [yearLabel(year)]) }];
  });
}

/**
 * แบบจำลองของการเทียบข้ามปีงบ — รูปเดียวกับการเลือกรายการ (หนึ่งเส้นต่อปีงบ) กราฟ ตาราง
 * และไฟล์จึงใช้โค้ดชุดเดิม
 *
 * แกนครบ ต.ค. ถึง ก.ย. เสมอ เดือนที่ปีหนึ่งยังไม่มียอด
 * เป็นช่องว่าง ไม่ใช่ศูนย์ และไม่ประมาณยอดของเดือนที่ยังไม่ถึง
 *
 * @param {object} input
 * @param {object[]} input.rows แถวของทุกปีงบที่เลือก (เดือนจริง)
 * @param {Array<string|number>} input.years ปีงบ พ.ศ. ที่เทียบ ไม่เกิน MAX_YEARS
 * @param {{dimension: string, key: string}|null} [input.scope] ขอบเขตเดียว เช่น ฝ่ายหนึ่งฝ่าย — ว่าง = ทั้งองค์กร
 * @param {string[]} [input.positions] ตำแหน่งเดือนที่ต้องแสดง (จากช่วงเวลาที่ผู้ใช้เลือก)
 */
export function buildYearComparison({ rows = [], years = [], metric = "cost", positions = null }) {
  const chosen = [...new Set((years ?? []).map(String))].sort().slice(-MAX_YEARS);
  const shifted = yearRows(rows, chosen);
  const months = positions?.length ? [...new Set(positions)].sort() : [...FISCAL_POSITIONS];
  const options = chosen.map((year) => ({ value: year, label: t("ปีงบ {0}", [yearLabel(year)]) }));
  const model = buildComparison({
    rows: shifted.filter((row) => months.includes(row.month)),
    dimension: "fiscalYear", metric, options, months,
    // ปีที่เลือกแล้วยังไม่มียอดต้องเป็นเส้นว่าง ไม่ใช่หายไปจากกราฟ
    include: chosen,
    chartLimit: MAX_YEARS,
  });
  // ปีงบเรียงตามเวลาเสมอ ไม่เรียงตามยอด — สีและลำดับในคำอธิบายกราฟต้องไม่สลับที่
  // เมื่อปีหนึ่งแซงอีกปีระหว่างปี และอันดับของปีงบก็ไม่มีความหมาย เพราะปีที่ผ่านมา
  // ครบปีย่อมมากกว่าปีที่เพิ่งเริ่มเสมอ
  const byYear = new Map(model.entries.map((entry) => [entry.key, entry]));
  const entries = chosen.map((year) => byYear.get(year)).filter(Boolean);
  return { ...model, entries, chartEntries: entries, hidden: 0, years: chosen, ranking: null };
}

/**
 * สลอตสีผูกกับตัวตนของรายการ ไม่ใช่ลำดับ — เอารายการหนึ่งออกแล้วที่เหลือคงสีเดิม
 * และสองรายการที่แสดงพร้อมกันไม่ได้สีเดียวกัน (design-system.md — กฎของชุดสีกราฟ)
 */
export function stableSlots(previous, keys) {
  const next = new Map();
  const taken = new Set();
  for (const key of keys) {
    const slot = previous?.get(key);
    if (slot && !taken.has(slot)) {
      next.set(key, slot);
      taken.add(slot);
    }
  }
  for (const key of keys) {
    if (next.has(key)) continue;
    let slot = 1;
    while (taken.has(slot)) slot += 1;
    next.set(key, slot);
    taken.add(slot);
  }
  return next;
}

/** ข้อสังเกตที่ต้องอ่านคู่กับตัวเลข — ไม่ใช่ข้อสรุป */
export function deviceSpread(summaries) {
  const counts = summaries.filter((summary) => summary?.readings).map((summary) => summary.devices);
  if (counts.length < 2) return null;
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return min === max ? null : { min, max };
}

/* --------------------------------------------------------------------------
   ช่วงเวลา
   -------------------------------------------------------------------------- */

/** ช่วงเวลาเป็นภาษาคน — "ต.ค. 2568 – ธ.ค. 2568" หรือรายการเดือนเมื่อไม่ต่อเนื่อง */
export function periodLabel(months) {
  const list = [...(months ?? [])].sort();
  if (!list.length) return "";
  if (list.length === 1) return formatMonth(list[0]);
  const contiguous = list.every((month, index) => index === 0 || monthIndex(month) === monthIndex(list[index - 1]) + 1);
  return contiguous ? `${formatMonth(list[0])} – ${formatMonth(list.at(-1))}` : list.map((month) => formatMonth(month)).join(", ");
}
