import { fiscalYearMonths, fromSatang, getFiscalYearRange, sumCostSatang } from "@suth/domain";
import { t } from "../lib/locale";
import { formatMonth, yearLabel } from "../lib/locale-format";

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
 *   - **ยอดเงินรวมเป็นสตางค์** ผ่าน `sumCostSatang` ของ domain ซึ่งนับรายการที่ยังไม่รู้
 *     ราคาแยกไว้เสมอ ไม่บวกเป็นศูนย์เงียบๆ (Q27)
 *   - **ราคาไม่ครบ = ยังไม่สรุป** ยอดเงินที่ยืนยันแล้วแสดงได้พร้อมสถานะ แต่ไม่จัดอันดับ
 *     ค่าใช้จ่ายและไม่คิดส่วนต่างค่าใช้จ่าย (Q30)
 *   - **ฐานเป็นศูนย์ไม่มีเปอร์เซ็นต์** ส่วนต่างจริงยังแสดงได้ แต่ "เพิ่มขึ้นกี่ %" จากศูนย์
 *     ไม่มีความหมาย
 *   - **"ยอดพิมพ์" คือยอดพิมพ์จริง (จำนวนหน้าดิบ)** ส่วนหน้าสุทธิหลังหัก 2% เป็นฐานคิดเงิน
 *     และแสดงคู่กันเสมอภายใต้ชื่อของมันเอง
 */

/** ชุดสีของกราฟมี 8 สีที่แยกกันได้และไม่วนซ้ำ — เลือกรายการมาเทียบได้ไม่เกินนี้ */
export const MAX_ITEMS = 8;
/** จำนวนที่อ่านกราฟได้สบาย ใช้เป็นคำแนะนำ ไม่ได้บังคับ */
export const SUGGESTED_ITEMS = 5;

export const DIMENSIONS = ["overall", "division", "department", "contract"];
export const METRICS = ["cost", "rawPages"];
export const VIEWS = ["select", "rank"];
export const DIRECTIONS = ["high", "low"];
export const LIMITS = [5, 10];

const GROUPING = {
  division: { id: "division_id", name: "division_name" },
  department: { id: "department_id", name: "department_name", hint: "division_name" },
  // สัญญาที่คิดเงินของเดือนนั้น ไม่ใช่สัญญาปัจจุบันของเครื่อง (ADR-0019)
  contract: { id: "billing_contract_id", name: "billing_contract_no" },
  // อาคารของเดือนนั้นจากประวัติการย้าย — API ส่งเฉพาะชื่อ จึงใช้ชื่อเป็น key (หน้าเปรียบเทียบ)
  building: { id: "building_name", name: "building_name" },
};

export function dimensionLabel(dimension) {
  return {
    overall: t("ภาพรวม"),
    division: t("ฝ่าย"),
    department: t("แผนก"),
    contract: t("สัญญา"),
    building: t("อาคาร"),
  }[dimension] ?? "";
}

function emptyLabel(dimension) {
  return {
    division: t("ไม่ระบุฝ่าย"),
    department: t("ไม่ระบุแผนก"),
    contract: t("ไม่ผูกสัญญา"),
    building: t("ไม่ระบุอาคาร"),
  }[dimension] ?? t("ไม่ระบุ");
}

/** ชื่อตัวชี้วัดแบบเต็มที่ใช้ทั้งหัวกราฟ หัวตาราง และไฟล์ */
export function metricLabel(metric, { incomplete = false } = {}) {
  if (metric === "rawPages") return t("ยอดพิมพ์จริง");
  return incomplete ? t("ค่าใช้จ่ายที่ยืนยันแล้ว") : t("ค่าใช้จ่ายสุทธิ");
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
  if (!summary?.readings) return "no-data";
  if (!summary.unpriced) return "complete";
  return summary.unpriced === summary.readings ? "unpriced" : "partial";
}

/** สถานะข้อมูลเป็นข้อความ — ใช้ทั้งหน้าจอและคอลัมน์สถานะในไฟล์ */
export function statusLabel(summary) {
  switch (dataStatus(summary)) {
    case "no-data": return t("ไม่มีข้อมูล");
    case "complete": return t("ยืนยันราคาครบ");
    case "unpriced": return t("ยังยืนยันราคาไม่ได้ {0} รายการ", [summary.unpriced]);
    default: return t("รอยืนยันราคา {0} รายการ", [summary.unpriced]);
  }
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
  if (metric === "cost" && (base.unpriced || value.unpriced)) return { diff: null, ratio: null, reason: "unpriced" };
  const from = sortValue(base, metric);
  const delta = sortValue(value, metric) - from;
  return {
    diff: metric === "cost" ? fromSatang(delta) : delta,
    ratio: from === 0 ? null : delta / from,
    reason: from === 0 ? "zero-base" : null,
  };
}

export function differenceNote(result, { isBase = false } = {}) {
  if (isBase) return t("รายการฐาน");
  switch (result?.reason) {
    case "no-base-data": return t("ฐานไม่มีข้อมูลในช่วงนี้ จึงยังเทียบไม่ได้");
    case "no-data": return t("ไม่มีข้อมูลในช่วงนี้");
    case "unpriced": return t("ราคายังยืนยันไม่ครบ จึงยังไม่คิดส่วนต่างค่าใช้จ่าย");
    case "zero-base": return t("ฐานเป็นศูนย์ แสดงเฉพาะส่วนต่างจริง ไม่คิดเปอร์เซ็นต์");
    default: return "";
  }
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
export function itemOptions(dimension, { divisions = [], departments = [], contracts = [] } = {}, rows = []) {
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
  return {
    label: (first && first[spec.name]) || option?.label || emptyLabel(dimension),
    hint: spec.hint ? (first?.[spec.hint] ?? option?.hint ?? "") : "",
  };
}

/**
 * แผนกชื่อซ้ำกันข้ามฝ่ายมีได้จริง — เติมชื่อฝ่ายต่อท้ายเฉพาะชื่อที่ซ้ำ ไม่งั้นกราฟมี
 * สองแท่งชื่อเดียวกันแต่ไม่ต้องยาวทุกแท่งเพื่อกันกรณีที่เกิดไม่บ่อย
 */
function disambiguate(entries) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
  return entries.map((entry) => ({
    ...entry,
    displayLabel: counts.get(entry.label) > 1 && entry.hint ? `${entry.label} (${entry.hint})` : entry.label,
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
 * จัดอันดับมาก–น้อย
 *
 * กลุ่มที่ไม่มีรายการเลยไม่ถูกจัดอันดับ (ไม่สร้างศูนย์ให้) และเมื่อกลุ่มใดในขอบเขตยัง
 * ยืนยันราคาไม่ครบ อันดับค่าใช้จ่ายคืน null — ให้หน้าจอบอกเหตุผลแทน (Q30)
 * ค่าที่เท่ากันเรียงด้วยชื่อ เพื่อให้ผลเดิมทุกครั้งที่เปิด
 */
export function rankEntries(entries, { metric, direction = "high", limit = 5 }) {
  const recorded = (entries ?? []).filter((entry) => entry.summary.readings > 0);
  if (metric === "cost" && recorded.some((entry) => entry.summary.unpriced > 0)) return null;
  const factor = direction === "low" ? 1 : -1;
  return recorded
    .slice()
    .sort((a, b) => factor * (sortValue(a.summary, metric) - sortValue(b.summary, metric))
      || String(a.label).localeCompare(String(b.label), "th"))
    .slice(0, limit === 10 ? 10 : 5)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * แบบจำลองของพื้นที่เปรียบเทียบบนหน้าภาพรวม — กราฟ ตาราง และไฟล์อ่านจากที่นี่ชุดเดียว
 *
 * @param {object} input
 * @param {object[]} input.rows แถวของช่วงเวลาที่เลือก (กรองเดือนแล้ว)
 * @param {"overall"|"division"|"department"|"contract"} input.dimension
 * @param {"select"|"rank"} input.view
 * @param {string[]} input.items key ของรายการที่ผู้ใช้เลือก (มุมมองเลือกรายการ)
 * @param {"cost"|"rawPages"} input.metric
 * @param {object[]} input.options ตัวเลือกจาก itemOptions() ใช้หาชื่อของรายการที่ไม่มีข้อมูล
 * @param {string[]} [input.months] เดือนที่ผู้ใช้เลือกแสดง — ใส่มาเมื่อเดือนที่ไม่มีข้อมูลต้อง
 *   ยังเป็นช่องว่างบนแกนและในไฟล์ (หน้าเปรียบเทียบ) ไม่ใส่ = เฉพาะเดือนที่มีแถว
 */
export function buildComparison({ rows = [], dimension = "overall", view = "select", items = [], metric = "cost", direction = "high", limit = 5, options = [], months: shownMonths = null }) {
  const months = shownMonths?.length ? [...shownMonths].sort() : [...new Set(rows.map((row) => row.month))].sort();
  const total = summarize(rows);
  const base = { dimension, metric, months, total, direction, limit };

  if (dimension === "overall") {
    const entries = months.map((month) => {
      const monthRows = rows.filter((row) => row.month === month);
      return { key: month, label: formatMonth(month), displayLabel: formatMonth(month), hint: "", summary: summarize(monthRows) };
    });
    return { ...base, view: "overall", entries, scopeRows: rows, scope: total, blocked: rows.length ? null : "no-data" };
  }

  const groups = groupRows(rows, dimension);

  if (view === "rank") {
    const all = [...groups.entries()].map(([key, list]) => entryFor(key, dimension, list, options));
    const ranked = rankEntries(all, { metric, direction, limit });
    return {
      ...base,
      view: "rank",
      entries: ranked ? disambiguate(ranked) : [],
      // ข้อมูลรายละเอียดเป็นของทุกกลุ่มก่อนตัดอันดับ — อันดับเป็นผลสรุป ไม่ใช่ขอบเขตของข้อมูล
      scopeRows: rows,
      scope: total,
      rankedFrom: all.filter((entry) => entry.summary.readings > 0).length,
      blocked: !rows.length ? "no-data" : ranked === null ? "unpriced" : null,
    };
  }

  const chosen = [...new Set(items.map(String))].slice(0, MAX_ITEMS);
  const chosenSet = new Set(chosen);
  const scopeRows = rows.filter((row) => chosenSet.has(groupKey(row, dimension)));
  const entries = disambiguate(chosen.map((key) => entryFor(key, dimension, groups.get(key), options, months)));
  return {
    ...base,
    view: "select",
    entries,
    scopeRows,
    scope: summarize(scopeRows),
    blocked: !chosen.length ? "no-items" : !scopeRows.length ? "no-data" : null,
  };
}

/**
 * ขอบเขตของตัวเลขสำคัญ แผงรายละเอียด และช่วงก่อนหน้าบนหน้าภาพรวม
 *
 * ต้องเป็นชุดเดียวกับกราฟ ตาราง และไฟล์ Excel — เดิมการ์ดตัวเลขรวมทั้งองค์กรขณะที่
 * กราฟแสดงเฉพาะฝ่ายที่เลือก กดการ์ดแล้วแผงรายละเอียดกลับเห็นแค่บางฝ่าย และ
 * เปอร์เซ็นต์เทียบช่วงก่อนเอายอดที่เลือกไปเทียบกับยอดทั้งองค์กรของช่วงก่อน
 *
 * มุมมองเลือกรายการ (ที่เลือกแล้ว) = เฉพาะรายการที่เลือก ส่วนภาพรวม อันดับ และยัง
 * ไม่ได้เลือก = ทุกแถว — อันดับเป็นผลสรุปของขอบเขต ไม่ใช่ขอบเขต เปลี่ยน 5/10 จึง
 * ไม่เปลี่ยนยอดรวม
 */
export function comparisonScope(model) {
  if (model?.view !== "select" || !model.entries?.length) return { selected: false, dimension: model?.dimension, keys: null, label: "" };
  return {
    selected: true,
    dimension: model.dimension,
    keys: model.entries.map((entry) => entry.key),
    label: model.entries.map((entry) => entry.displayLabel).join(", "),
  };
}

/** แถวที่อยู่ในขอบเขต — ใช้กับแถวของช่วงก่อนหน้าได้ด้วย เพราะคัดด้วย key ชุดเดียวกัน */
export function rowsInScope(rows, scope) {
  if (!scope?.keys) return rows ?? [];
  const keys = new Set(scope.keys);
  return (rows ?? []).filter((row) => keys.has(groupKey(row, scope.dimension)));
}

/** เปลี่ยนแปลงจากช่วงก่อนหน้าเป็นเปอร์เซ็นต์ — กฎเดียวกับ difference() (ราคาไม่ครบ ฐานศูนย์ ไม่มีข้อมูล) */
export function periodChange(previous, current, metric) {
  const result = difference(previous, current, metric);
  return { percent: result.ratio === null ? null : result.ratio * 100, reason: result.reason };
}

/** ป้ายของรายการบนกราฟ — ติดสถานะไว้กับชื่อเมื่อยอดเงินของรายการนั้นยังไม่ครบ */
function chartLabel(entry, metric) {
  const status = dataStatus(entry.summary);
  if (status === "no-data") return `${entry.displayLabel} · ${t("ไม่มีข้อมูล")}`;
  if (metric === "cost" && entry.summary.unpriced) return `${entry.displayLabel} · ${t("รอราคา {0}", [entry.summary.unpriced])}`;
  return entry.displayLabel;
}

/**
 * ข้อมูลของกราฟบนหน้าจอ — ชนิดกราฟเลือกตามคำถาม
 *
 *   ภาพรวม           แท่งตั้ง (ค่าใช้จ่ายแต่ละเดือน) หรือเส้น (แนวโน้มยอดพิมพ์)
 *   อันดับ             แท่งแนวนอน — ชื่อหน่วยงานยาวอ่านได้ครบ
 *   เลือกรายการ ≥ 2 เดือน เส้นหนึ่งเส้นต่อรายการ ดูแนวโน้มรายเดือน
 *   เลือกรายการ 1 เดือน  แท่งแนวนอน — เส้นที่มีจุดเดียวไม่บอกอะไร
 */
export function comparisonChart(model) {
  const { metric, entries, months } = model;
  const incomplete = metric === "cost" && model.scope.unpriced > 0;
  const seriesLabel = metricLabel(metric, { incomplete });
  if (model.view === "overall") {
    return {
      kind: metric === "cost" ? "bar" : "line",
      horizontal: false,
      labels: entries.map((entry) => chartLabel(entry, metric)),
      categoryLabel: t("เดือน"),
      series: [{ key: metric, label: seriesLabel, data: entries.map((entry) => metricValue(entry.summary, metric)) }],
    };
  }
  if (model.view === "select" && months.length >= 2) {
    return {
      kind: "line",
      horizontal: false,
      labels: months.map((month) => formatMonth(month)),
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

/* --------------------------------------------------------------------------
   เปรียบเทียบความแตกต่าง (หน้าเปรียบเทียบ → ฝ่าย/แผนก)
   -------------------------------------------------------------------------- */

/**
 * @param {object} input
 * @param {"division"|"department"} input.dimension
 * @param {"units"|"periods"} input.basis
 *   units   = หน่วยงานเทียบกันในช่วงเดียวกัน ฐานคือรายการหนึ่งที่ผู้ใช้เลือก
 *   periods = หน่วยงานเดียวกันเทียบช่วงที่ดูกับช่วงฐาน — สองมิตินี้ไม่เปลี่ยนพร้อมกัน
 * @param {{months: string[], rows: object[]}} input.current ช่วงที่ดู
 * @param {{months: string[], rows: object[]}} [input.reference] ช่วงฐาน (เฉพาะ periods)
 */
export function buildDifference({ dimension, basis = "units", items = [], baseKey = "", metric = "cost", current, reference = { months: [], rows: [] }, options = [] }) {
  const chosen = [...new Set(items.map(String))].slice(0, MAX_ITEMS);
  const chosenSet = new Set(chosen);
  const inScope = (row) => chosenSet.has(groupKey(row, dimension));
  const now = groupRows(current.rows, dimension);

  if (basis === "periods") {
    const before = groupRows(reference.rows, dimension);
    const referenceRows = reference.rows.filter(inScope);
    const currentRows = current.rows.filter(inScope);
    const scope = summarize(currentRows);
    const referenceScope = summarize(referenceRows);
    const blockCostDifference = metric === "cost" && (scope.unpriced > 0 || referenceScope.unpriced > 0);
    const entries = disambiguate(chosen.map((key) => {
      const described = describe(key, dimension, now.get(key) ?? before.get(key), options);
      const referenceSummary = summarize(before.get(key) ?? []);
      const summary = summarize(now.get(key) ?? []);
      return {
        key, ...described, reference: referenceSummary, summary,
        difference: blockCostDifference ? { diff: null, ratio: null, reason: "unpriced" } : difference(referenceSummary, summary, metric),
      };
    }));
    return {
      dimension, basis, metric, entries,
      months: current.months,
      referenceMonths: reference.months,
      scopeRows: [...referenceRows, ...currentRows],
      scope,
      referenceScope,
      blocked: !chosen.length ? "no-items" : !referenceRows.length && !currentRows.length ? "no-data" : null,
    };
  }

  const scopeRows = current.rows.filter(inScope);
  const scope = summarize(scopeRows);
  const blockCostDifference = metric === "cost" && scope.unpriced > 0;
  const entries = disambiguate(chosen.map((key) => ({ key, ...describe(key, dimension, now.get(key), options), summary: summarize(now.get(key) ?? []) })));
  const baseEntry = entries.find((entry) => entry.key === String(baseKey)) ?? entries[0] ?? null;
  return {
    dimension, basis, metric,
    months: current.months,
    referenceMonths: [],
    baseKey: baseEntry?.key ?? "",
    baseEntry,
    entries: entries.map((entry) => ({
      ...entry,
      isBase: entry === baseEntry,
      difference: entry === baseEntry ? null : blockCostDifference
        ? { diff: null, ratio: null, reason: "unpriced" }
        : difference(baseEntry.summary, entry.summary, metric),
    })),
    scopeRows,
    scope,
    blocked: chosen.length < 2 ? "no-items" : !scopeRows.length ? "no-data" : null,
  };
}

/** กราฟแท่งแนวนอนของหน้าเปรียบเทียบความแตกต่าง — ช่วง A/B ได้สองชุดวางคู่กันต่อรายการ */
export function differenceChart(model, { currentLabel, referenceLabel }) {
  const incomplete = model.metric === "cost" && (model.scope.unpriced > 0 || (model.referenceScope?.unpriced ?? 0) > 0);
  const labelOf = (entry) => {
    const unpriced = entry.summary.unpriced + (entry.reference?.unpriced ?? 0);
    const parts = [entry.displayLabel];
    if (entry.isBase) parts.push(t("ฐาน"));
    if (model.metric === "cost" && unpriced) parts.push(t("รอราคา {0}", [unpriced]));
    return parts.join(" · ");
  };
  const series = model.basis === "periods"
    ? [
      { key: "reference", label: referenceLabel, slot: 3, data: model.entries.map((entry) => metricValue(entry.reference, model.metric)) },
      { key: "current", label: currentLabel, slot: 1, data: model.entries.map((entry) => metricValue(entry.summary, model.metric)) },
    ]
    : [{ key: "current", label: metricLabel(model.metric, { incomplete }), slot: 1, data: model.entries.map((entry) => metricValue(entry.summary, model.metric)) }];
  return { kind: "bar", horizontal: true, labels: model.entries.map(labelOf), series };
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

export const REFERENCE_MODES = ["previous-year", "previous-span"];

/**
 * เดือนของช่วงฐานสำหรับการเทียบช่วง A/B
 *
 *   previous-year  ช่วงเดียวกันของปีงบก่อน (ต.ค.–ธ.ค. 2568 → ต.ค.–ธ.ค. 2567)
 *                  จับคู่ตามตำแหน่งในปีงบ ไม่ใช่ลบปีปฏิทิน
 *   previous-span  ช่วงก่อนหน้าที่ยาวเท่ากันติดกัน — ข้ามรอยต่อปีงบได้
 *
 * ลำดับเดือนของทั้งสองปีงบมาจาก `fiscalYearMonths`/`getFiscalYearRange` ของ domain
 * ไม่เขียนกฎ ต.ค.–ก.ย. ซ้ำที่นี่ (ADR-0001)
 *
 * @param {string[]} months เดือนของช่วงที่ดู — ว่าง = ทั้งปีงบ
 * @param {{year: string|number, start_month: string, end_month: string}} fiscalYear ปีงบที่ active
 */
export function referenceMonths(months, mode, fiscalYear) {
  if (!fiscalYear?.start_month) return [];
  const current = fiscalYearMonths({ startMonth: fiscalYear.start_month, endMonth: fiscalYear.end_month });
  const previous = fiscalYearMonths(getFiscalYearRange(Number(fiscalYear.year) - 1));
  const selected = (months?.length ? months : current).filter((month) => current.includes(month)).sort();
  if (!selected.length) return [];
  if (mode === "previous-span") {
    const timeline = [...previous, ...current];
    const first = timeline.indexOf(selected[0]);
    return timeline.slice(Math.max(0, first - selected.length), first);
  }
  return selected.map((month) => previous[current.indexOf(month)]);
}

function monthIndex(month) {
  const [year, value] = String(month).split("-").map(Number);
  return year * 12 + value;
}

/** ช่วงเวลาเป็นภาษาคน — "ต.ค. 2568 – ธ.ค. 2568" หรือรายการเดือนเมื่อไม่ต่อเนื่อง */
export function periodLabel(months) {
  const list = [...(months ?? [])].sort();
  if (!list.length) return "";
  if (list.length === 1) return formatMonth(list[0]);
  const contiguous = list.every((month, index) => index === 0 || monthIndex(month) === monthIndex(list[index - 1]) + 1);
  return contiguous ? `${formatMonth(list[0])} – ${formatMonth(list.at(-1))}` : list.map((month) => formatMonth(month)).join(", ");
}

/* --------------------------------------------------------------------------
   สถานะใน URL — เปิดลิงก์เดิมหรือกดย้อนกลับแล้วได้มุมมองเดิม
   -------------------------------------------------------------------------- */

const pick = (value, allowed, fallback) => {
  const text = Array.isArray(value) ? value[0] : value;
  return allowed.includes(text) ? text : fallback;
};

const listFrom = (value) => String(Array.isArray(value) ? value[0] ?? "" : value ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter((item) => /^(\d+|unassigned)$/.test(item));

// URL ข้ามข้อจำกัดของ UiCombobox ได้ จึงต้องบังคับกฎเดียวกับหน้าจอตั้งแต่ตอนอ่าน
// รวมทั้งตัดค่าซ้ำเพื่อให้จำนวนที่ URL แสดงตรงกับจำนวนชุดข้อมูลที่แบบจำลองใช้จริง
const itemsFrom = (value) => [...new Set(listFrom(value))].slice(0, MAX_ITEMS);

/**
 * อ่านสถานะจาก query — ค่าที่ไม่รู้จักตกไปที่ค่าเริ่มต้น เทียบกับรายการที่อนุญาตด้วย
 * includes() ไม่ใช่การมี property บน object ("constructor" ต้องไม่ผ่าน)
 *
 * `?contract=` เป็นตัวกรองสัญญาเดิมของหน้าภาพรวม — แปลงเป็น "เทียบตามสัญญา" ให้ลิงก์เก่ายังพาไปดูสัญญานั้น
 */
export function comparisonFromQuery(query = {}) {
  const legacyContract = itemsFrom(query.contract);
  const by = pick(query.by, DIMENSIONS, legacyContract.length ? "contract" : "overall");
  const items = itemsFrom(query.items);
  return {
    by,
    view: pick(query.view, VIEWS, legacyContract.length && !query.by ? "select" : "rank"),
    items: items.length ? items : !query.by ? legacyContract : [],
    metric: pick(query.measure, ["cost", "pages"], "cost") === "pages" ? "rawPages" : "cost",
    direction: pick(query.dir, DIRECTIONS, "high"),
    limit: query.n === "10" ? 10 : 5,
  };
}

/** สถานะเป็น query — ค่าเริ่มต้นไม่ถูกเขียน ลิงก์ของมุมมองปกติจึงสั้นเหมือนเดิม */
export function comparisonToQuery(state) {
  const overall = state.by === "overall";
  return {
    by: overall ? undefined : state.by,
    view: overall || state.view === "rank" ? undefined : state.view,
    items: !overall && state.view === "select" && state.items.length ? state.items.join(",") : undefined,
    measure: state.metric === "rawPages" ? "pages" : undefined,
    dir: !overall && state.view === "rank" && state.direction === "low" ? "low" : undefined,
    n: !overall && state.view === "rank" && state.limit === 10 ? "10" : undefined,
    contract: undefined,
  };
}

/** สถานะของหน้าเปรียบเทียบความแตกต่างใน URL — ใช้ชื่อพารามิเตอร์ที่ไม่ชนกับโหมดอื่นของหน้า */
export function differenceFromQuery(query = {}) {
  const items = itemsFrom(query.items);
  const requestedBase = listFrom(query.base)[0] ?? "";
  return {
    level: pick(query.level, ["division", "department"], "division"),
    basis: pick(query.basis, ["units", "periods"], "units"),
    reference: pick(query.ref, REFERENCE_MODES, "previous-year"),
    items,
    base: items.includes(requestedBase) ? requestedBase : items[0] ?? "",
    metric: pick(query.measure, ["cost", "pages"], "cost") === "pages" ? "rawPages" : "cost",
  };
}

export function differenceToQuery(state) {
  return {
    level: state.level === "division" ? undefined : state.level,
    basis: state.basis === "units" ? undefined : state.basis,
    ref: state.basis === "periods" && state.reference !== "previous-year" ? state.reference : undefined,
    items: state.items.length ? state.items.join(",") : undefined,
    base: state.basis === "units" && state.base ? state.base : undefined,
    measure: state.metric === "rawPages" ? "pages" : undefined,
  };
}
