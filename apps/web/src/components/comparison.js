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
/**
 * จำนวนที่อ่านกราฟได้สบาย ใช้เป็นคำแนะนำ และเป็นจำนวนที่ระบบเลือกให้เมื่อผู้ใช้ยังไม่ได้เลือกเอง
 */
export const SUGGESTED_ITEMS = 5;

export const DIMENSIONS = ["overall", "division", "department", "contract", "building", "device", "fiscalYear"];
export const METRICS = ["cost", "rawPages"];

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
 * กลุ่มที่ไม่มีรายการเลยไม่ถูกจัดอันดับ (ไม่สร้างศูนย์ให้) และเมื่อกลุ่มใดในขอบเขตยัง
 * ยืนยันราคาไม่ครบ อันดับค่าใช้จ่ายคืน null — ให้ไฟล์บอกเหตุผลแทน (Q30)
 * ค่าที่เท่ากันเรียงด้วยชื่อ เพื่อให้ผลเดิมทุกครั้งที่ส่งออก
 */
export function rankEntries(entries, { metric }) {
  const recorded = (entries ?? []).filter((entry) => entry.summary.readings > 0);
  if (metric === "cost" && recorded.some((entry) => entry.summary.unpriced > 0)) return null;
  return recorded
    .slice()
    .sort((a, b) => sortValue(b.summary, metric) - sortValue(a.summary, metric)
      || String(a.label).localeCompare(String(b.label), "th"))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * รายการที่ระบบเลือกให้เมื่อผู้ใช้ยังไม่ได้เลือกเอง — ยอดสูงสุดตามตัวชี้วัดที่ดูอยู่
 * ถ้าค่าใช้จ่ายยังจัดลำดับไม่ได้เพราะราคาไม่ครบ ใช้ยอดพิมพ์จริงแทน ไม่งั้นหน้าเปิดมาว่าง
 */
function suggestedKeys(entries, metric) {
  const ranked = rankEntries(entries, { metric }) ?? rankEntries(entries, { metric: "rawPages" });
  return ranked.slice(0, SUGGESTED_ITEMS).map((entry) => entry.key);
}

/**
 * แบบจำลองของพื้นที่เปรียบเทียบบนหน้าภาพรวม — กราฟ ตาราง และไฟล์อ่านจากที่นี่ชุดเดียว
 *
 * @param {object} input
 * @param {object[]} input.rows แถวของช่วงเวลาที่เลือก (กรองเดือนแล้ว)
 * @param {"overall"|"division"|"department"|"contract"} input.dimension
 * @param {string[]} input.items key ของรายการที่ผู้ใช้เลือก — ว่าง = ระบบเลือกยอดสูงสุดให้
 * @param {"cost"|"rawPages"} input.metric
 * @param {object[]} input.options ตัวเลือกจาก itemOptions() ใช้หาชื่อของรายการที่ไม่มีข้อมูล
 * @param {string[]} [input.months] เดือนที่ผู้ใช้เลือกแสดง — ใส่มาเมื่อเดือนที่ไม่มีข้อมูลต้อง
 *   ยังเป็นช่องว่างบนแกนและในไฟล์ (หน้าเปรียบเทียบ) ไม่ใส่ = เฉพาะเดือนที่มีแถว
 */
export function buildComparison({ rows = [], dimension = "overall", items = [], metric = "cost", options = [], months: shownMonths = null, autoPick = true, itemLimit = MAX_ITEMS }) {
  const months = shownMonths?.length ? [...shownMonths].sort() : [...new Set(rows.map((row) => row.month))].sort();
  const total = summarize(rows);
  const base = { dimension, metric, months, total };

  if (dimension === "overall") {
    const entries = months.map((month) => {
      const monthRows = rows.filter((row) => row.month === month);
      return { key: month, label: formatMonth(month), displayLabel: formatMonth(month), hint: "", summary: summarize(monthRows) };
    });
    return { ...base, view: "overall", entries, scopeRows: rows, scope: total, ranking: null, blocked: rows.length ? null : "no-data" };
  }

  const groups = groupRows(rows, dimension);
  const all = disambiguate([...groups.entries()].map(([key, list]) => entryFor(key, dimension, list, options)), dimension);
  const ranked = rankEntries(all, { metric });
  const ranking = {
    entries: ranked ?? [],
    from: all.filter((entry) => entry.summary.readings > 0).length,
    blocked: !rows.length ? "no-data" : ranked === null ? "unpriced" : null,
  };

  // Dashboard เปิดด้วยยอดรวมที่อธิบายขอบเขตได้ตรงๆ จนกว่าผู้ใช้จะเลือกรายการเอง
  // หน้า Compare เดิมยังใช้การเสนอรายการยอดสูงสุดได้ผ่านค่าเริ่มต้น autoPick=true
  if (!items.length && !autoPick) {
    const entries = months.map((month) => {
      const monthRows = rows.filter((row) => row.month === month);
      return { key: month, label: formatMonth(month), displayLabel: formatMonth(month), hint: "", summary: summarize(monthRows) };
    });
    return { ...base, view: "overall", autoPicked: false, entries, scopeRows: rows, scope: total, ranking, blocked: rows.length ? null : "no-data" };
  }

  // ยังไม่ได้เลือกเอง = ระบบเลือกยอดสูงสุดให้ก่อน เปิดหน้ามาจึงเห็นกราฟทันที (#115)
  // ขอบเขตของตัวเลขยังเป็นทุกแถว เพราะผู้ใช้ไม่ได้ตั้งใจจำกัดขอบเขตไว้ที่รายการเหล่านี้
  const autoPicked = !items.length;
  const requested = [...new Set(items.map(String))];
  const chosen = autoPicked ? suggestedKeys(all, metric) : itemLimit == null ? requested : requested.slice(0, itemLimit);
  const chosenSet = new Set(chosen);
  const scopeRows = autoPicked ? rows : rows.filter((row) => chosenSet.has(groupKey(row, dimension)));
  const entries = disambiguate(chosen.map((key) => entryFor(key, dimension, groups.get(key), options, months)), dimension);
  return {
    ...base,
    view: "select",
    autoPicked,
    entries,
    scopeRows,
    scope: summarize(scopeRows),
    ranking,
    blocked: !chosen.length || !scopeRows.length ? "no-data" : null,
  };
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

/* --------------------------------------------------------------------------
   เทียบข้ามปีงบ (#115)
   -------------------------------------------------------------------------- */

/** เลือกเทียบได้ไม่เกินสามปีงบ — เส้นมากกว่านั้นซ้อนกันจนอ่านไม่ออก */
export const MAX_YEARS = 3;
/** ขอบเขตของการเทียบข้ามปี — ไม่มีสัญญา เพราะสัญญาผูกกับปีงบเดียว เทียบข้ามปีไม่มีความหมาย */
export const YEAR_SCOPES = ["overall", "division", "department", "building", "device"];

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
export function buildYearComparison({ rows = [], years = [], scope = null, metric = "cost", positions = null }) {
  const chosen = [...new Set((years ?? []).map(String))].sort().slice(-MAX_YEARS);
  const scoped = scope?.key ? rows.filter((row) => groupKey(row, scope.dimension) === String(scope.key)) : rows;
  const shifted = yearRows(scoped, chosen);
  let months = positions?.length ? [...new Set(positions)].sort() : [];
  if (!months.length) {
    months = [...FISCAL_POSITIONS];
  }
  const options = chosen.map((year) => ({ value: year, label: t("ปีงบ {0}", [yearLabel(year)]) }));
  const model = buildComparison({ rows: shifted.filter(row => months.includes(row.month)), dimension: "fiscalYear", items: chosen, metric, options, months });
  return { ...model, years: chosen, yearScope: scope?.key ? scope : null, ranking: null };
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
 * `?view=` `?dir=` `?n=` ของมุมมองอันดับเดิมไม่มีความหมายแล้ว (อันดับอยู่ในไฟล์ Excel เท่านั้น
 * #115) ลิงก์เก่าที่มีค่าเหล่านี้จึงเปิดเป็นการเลือกรายการ และ URL ถูกล้างค่าเหล่านั้นออก
 */
export function comparisonFromQuery(query = {}) {
  const legacyContract = itemsFrom(query.contract);
  const by = pick(query.by, DIMENSIONS, legacyContract.length ? "contract" : "overall");
  const items = itemsFrom(query.items);
  const scope = pick(query.scope, YEAR_SCOPES, "overall");
  return {
    by,
    items: items.length ? items : !query.by ? legacyContract : [],
    metric: pick(query.measure, ["cost", "pages"], "cost") === "pages" ? "rawPages" : "cost",
    // เทียบข้ามปีงบ — ว่าง = ปีงบที่เลือกอยู่กับปีก่อนหน้า
    years: [...new Set(String(Array.isArray(query.years) ? query.years[0] ?? "" : query.years ?? "")
      .split(",").map((item) => item.trim()).filter((item) => /^\d{4}$/.test(item)))].sort().slice(-MAX_YEARS),
    scope,
    scopeItem: scope === "overall" ? "" : listFrom(query.scopeItem)[0] ?? "",
  };
}

/** สถานะเป็น query — ค่าเริ่มต้นไม่ถูกเขียน ลิงก์ของมุมมองปกติจึงสั้นเหมือนเดิม */
export function comparisonToQuery(state) {
  const overall = state.by === "overall";
  return {
    by: overall ? undefined : state.by,
    items: !overall && state.items.length ? state.items.join(",") : undefined,
    measure: state.metric === "rawPages" ? "pages" : undefined,
    years: state.by === "fiscalYear" && state.years?.length ? state.years.join(",") : undefined,
    scope: state.by === "fiscalYear" && state.scope && state.scope !== "overall" ? state.scope : undefined,
    scopeItem: state.by === "fiscalYear" && state.scope !== "overall" && state.scopeItem ? state.scopeItem : undefined,
    view: undefined,
    dir: undefined,
    n: undefined,
    contract: undefined,
  };
}
