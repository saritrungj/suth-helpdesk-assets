<script setup>
import { resolveReference } from "../lib/reference-filters";
import { useReferenceFilters } from "../composables/use-reference-filters";
import { formatMonth } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * Compare — เปรียบเทียบตัวชี้วัด
 *
 * "เทียบระหว่าง" มีสี่แบบ และทุกแบบเป็นการแยกกลุ่มจริง (breakout) ไม่ใช่ตัวกรอง
 *
 *   เดือน          ยอดรวมทีละเดือน — "เดือนนี้ต่างจากเดือนก่อนยังไง และเพราะอะไร"
 *   สัญญา / อาคาร  หนึ่งเส้นต่อหนึ่งสัญญา/อาคารบนกราฟเดียว (แบบ Comparisons ของ GA4)
 *   ปีงบ           หนึ่งเส้นต่อหนึ่งปีงบ วางซ้อนตามเดือนของปีงบ ต.ค.→ก.ย. (#115)
 *   ฝ่าย / แผนก    ตรวจความแตกต่างของหน่วยงาน — ดู components/UnitDifference.vue
 *
 * เดิม "ตามสัญญา" กับ "ตามอาคาร" คำนวณชุดเดียวกันทุกประการ ต่างกันแค่ช่องตัวกรองที่
 * โผล่มา ถ้าไม่ได้เลือกอะไร สองโหมดให้ตัวเลขตรงกันทุกช่อง — ปุ่มที่ชื่อว่า "เทียบ"
 * แต่ไม่ได้เทียบอะไร ตัวกรอง (คัดแถวออก) กับการแยกกลุ่ม (หนึ่งแถว/เส้นต่อหนึ่งค่า)
 * เป็นคนละเครื่องมือ (Metabase: filter vs breakout) จึงแยกให้ชัด
 *
 * เลือกได้หลายเดือน ไม่จำกัดแค่คู่เดียว เพราะการดูสามสี่เดือนติดกันบอกได้ว่า
 * ตัวเลขที่กระโดดเป็นแนวโน้มจริงหรือเป็นเดือนที่ผิดปกติเดือนเดียว
 *
 * เดือน กลุ่มที่เลือก และตัวกรองถูก sync กับ URL (?months= ?groups= ?contract=
 * ?building= ?floor=) เพื่อให้ส่งลิงก์ให้คนอื่นเปิดดูชุดเดียวกันได้ และเปิดรายละเอียด
 * แล้วกดย้อนกลับได้มุมมองเดิม — เป็นหน้าที่ถูกแชร์ในไลน์กลุ่มบ่อยที่สุด
 *
 * ทุกโหมดส่งออก Excel ด้วยปุ่มและไฟล์รูปแบบเดียวกับหน้าภาพรวม (เปรียบเทียบ + กราฟ /
 * ข้อมูลรายละเอียด / เงื่อนไขรายงาน) จากแบบจำลองใน components/comparison.js
 *
 * ทิศทางของสีในหน้านี้กลับด้านกับกราฟการเงินทั่วไป: ตัวเลขที่ "เพิ่มขึ้น" ใช้โทน
 * เตือน เพราะทุกตัวชี้วัดในหน้านี้คือต้นทุน ไม่ใช่รายได้
 *
 * "จำนวนหน้าดิบ" เป็นยอดที่กรอก ส่วน "สุทธิ" คือหลังหัก 2% ตามกฎธุรกิจ
 * ทั้งสองแสดงคู่กันเสมอ เพราะเป็นตัวเลขที่คนมักเอาไปสับสนกัน
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { CircleAlert, Info, Minus, TrendingDown, TrendingUp } from "lucide-vue-next";
import { fiscalYearMonths, fromSatang, sumCostSatang } from "@suth/domain";
import { activeFiscalYear, activeFiscalYearRange, fiscalYearState } from "../store/fiscalYear";
import { yearLabel } from "../lib/locale-format";
import api from "../services/api";
import { useDepartments, useDivisions, useMonthlyKpi } from "../api/queries";
import { formatBahtValue, formatCount } from "../lib/format";
import PeriodPicker from "../components/PeriodPicker.vue";
import UnitDifference from "../components/UnitDifference.vue";
import ExportExcelButton from "../components/ExportExcelButton.vue";
import { FISCAL_POSITIONS, MAX_ITEMS, MAX_YEARS, YEAR_SCOPES, buildComparison, defaultYearPair, dimensionLabel, fiscalYearsMonths, groupKey, itemOptions, monthText, periodLabel, summarize, yearComparisonOptions, yearRows } from "../components/comparison";
import { conditionsSheet, detailSheet, exportFilename, monthsSlug, priceStatusLine, saveWorkbook, standardNotes } from "../components/comparison-export";
import { compareSheet } from "../components/compare-export";
import { useExportTask } from "../composables/useExportTask";
import { modeMemory } from "../lib/session-memory";
import {
  UiAlert,
  UiButton,
  UiCard,
  UiFilterBar,
  UiChart,
  UiCombobox,
  UiEmpty,
  UiField,
  UiPageHeader,
  UiSegmented,
  UiSkeleton,
} from "../ui";

const route = useRoute();
const router = useRouter();

/**
 * รวมค่าใช้จ่ายของแถว v_monthly_kpi พร้อมจำนวนรายการที่ยังยืนยันราคาไม่ได้
 *
 * เดิมบรรทัดนี้เป็น `sumSatang(rows.map((r) => toSatang(r.total_cost)))` ซึ่งอ่าน
 * แล้วดูถูกต้องทุกอย่าง แต่ `toSatang(null)` เป็น 0 — รายการที่ยังไม่รู้ราคาจึง
 * ถูกบวกเข้าไปเป็นศูนย์บาท แล้วหน้านี้ประกาศยอดที่ไม่ครบเป็นข้อสรุป ผิด Q27
 */
function sumCost(rows) {
  const { satang, unpriced } = sumCostSatang(
    (rows ?? []).map((r) => (r.total_cost_satang != null ? fromSatang(r.total_cost_satang) : r.total_cost))
  );
  return { cost: fromSatang(satang), unpriced };
}

/* --------------------------------------------------------------------------
   ข้อมูลและตัวกรอง
   -------------------------------------------------------------------------- */
const selectedMonths = ref(monthsFromQuery());
const COMPARISON_TYPES = [
  { value: "month", label: t("เดือน") },
  { value: "contract", label: t("สัญญา") },
  { value: "building", label: t("อาคาร") },
  { value: "year", label: t("ปีงบ") },
  { value: "department", label: t("ฝ่าย / แผนก") },
];
const comparisonTypeFromQuery = () =>
  COMPARISON_TYPES.some((type) => type.value === route.query.type) ? route.query.type : "month";
const comparisonType = ref(comparisonTypeFromQuery());
/** ชุดสีของกราฟมี 8 สี — เกินกว่านี้สีจะวนซ้ำจนแยกเส้นไม่ออก (ค่าเดียวกับหน้าภาพรวม) */
const MAX_SERIES = MAX_ITEMS;

const queryText = (value) => String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();
/** กลุ่มที่เลือกจาก URL — ตัดค่าซ้ำและเกินจำนวนสีตั้งแต่ตอนอ่าน ให้ URL ตรงกับสิ่งที่วาดจริง */
const groupsFromQuery = () =>
  [...new Set(queryText(route.query.groups).split(",").map((item) => item.trim()).filter(Boolean))].slice(0, MAX_SERIES);
/** ตัวกรองมีเฉพาะโหมดเดือน — โหมดแยกกลุ่มต้องได้ทุกสัญญา/อาคาร */
const filtersFromQuery = () => ({
  building: queryText(route.query.building),
  floor: queryText(route.query.floor),
  contract: /^\d+$/.test(queryText(route.query.contract)) ? queryText(route.query.contract) : "",
});

/** สัญญา อาคาร หรือปีงบที่เลือกมาเทียบ — ว่าง = ค่าเริ่มต้นของแบบนั้น (ยอดสูงสุด / ปีนี้กับปีก่อน) */
const selectedGroups = ref(groupsFromQuery());

/** ขอบเขตเดียวของการเทียบข้ามปีงบ เช่น ฝ่ายหนึ่งฝ่าย — "overall" = ทั้งองค์กร */
const YEAR_SCOPE_OPTIONS = YEAR_SCOPES.map((value) => ({ value, label: value === "overall" ? t("ทั้งองค์กร") : dimensionLabel(value) }));
const EMPTY_YEAR_SCOPE = () => ({ scope: "overall", item: "" });
function yearScopeFromQuery() {
  const scope = YEAR_SCOPES.includes(queryText(route.query.scope)) ? queryText(route.query.scope) : "overall";
  const item = queryText(route.query.scopeItem);
  return { scope, item: scope !== "overall" && /^(\d+|unassigned)$/.test(item) ? item : "" };
}
const yearScope = ref(yearScopeFromQuery());

const filters = ref(filtersFromQuery());

const referenceError = ref("");
const referencesReady = ref(false);
const buildings = ref([]);
const floors = ref([]);
const contracts = ref([]);
const divisionQuery = useDivisions();
const departmentQuery = useDepartments();
const divisions = computed(() => divisionQuery.data.value ?? []);
const departments = computed(() => departmentQuery.data.value ?? []);

const { buildingOptions, floorOptions, referenceLabel, normalizeReferences } =
  useReferenceFilters(filters, { buildings, floors, divisions, departments });

const contractOptions = computed(() =>
  contracts.value.map((contract) => ({ value: String(contract.id), label: contract.contract_no }))
);

// อ่านค่าจาก URL ห้ามถูกล้างตาม — เปิดลิงก์ที่มีทั้งอาคารและชั้นต้องได้ทั้งสองค่า
let syncingScopeFromRoute = false;
const referenceNotice = ref("");

const hasActiveFilter = computed(() => Object.values(filters.value).some(Boolean));

/**
 * แต่ละแบบการเทียบจำรายการและตัวกรองของตัวเอง (#115) — เดิมสลับแบบแล้วล้างทุกอย่าง
 * เลือกสัญญา A, B ไว้ สลับไปดูอาคารแล้วกลับมา ต้องยังเห็น A, B ไม่ใช่เริ่มเลือกใหม่
 * ปุ่ม "ล้างตัวกรอง" เป็นทางเดียวที่กลับไปค่าเริ่มต้น
 */
const memory = modeMemory("compare");
const EMPTY_FILTERS = () => ({ building: "", floor: "", contract: "" });

function resetFilters() {
  filters.value = EMPTY_FILTERS();
}

function clearAll() {
  resetFilters();
  selectedGroups.value = [];
  yearScope.value = EMPTY_YEAR_SCOPE();
  memory.clear();
}

let syncingTypeFromRoute = false;
watch(comparisonType, (value, previous) => {
  if (value !== "department") void loadMasterData();
  // เปลี่ยนจาก URL (ย้อนกลับ/ลิงก์) มีกลุ่มและตัวกรองของมันเองมาด้วย — ห้ามทับด้วยความจำ
  if (syncingTypeFromRoute) return;
  memory.save(previous, { groups: selectedGroups.value, filters: filters.value, yearScope: yearScope.value });
  const saved = memory.restore(value);
  // เปลี่ยนแล้วเขียน URL ครั้งเดียว — ถ้าให้ watcher ของขอบเขตเขียนเองอีกรอบ สองคำสั่ง replace
  // จะอ่าน route.query ชุดเดิม แล้วอันหลังพากลุ่มของแบบเก่ากลับมา
  syncingScopeFromRoute = true;
  selectedGroups.value = saved?.groups ?? [];
  filters.value = { ...EMPTY_FILTERS(), ...saved?.filters };
  yearScope.value = { ...EMPTY_YEAR_SCOPE(), ...saved?.yearScope };
  syncingScopeFromRoute = false;
  router.replace({ query: { ...route.query, type: value, ...scopeQuery(selectedGroups.value, filters.value, yearScope.value) } });
}, { flush: "sync" });

watch(() => route.query.type, () => {
  const next = comparisonTypeFromQuery();
  if (next === comparisonType.value) return;
  syncingTypeFromRoute = true;
  comparisonType.value = next;
  syncingTypeFromRoute = false;
});

/** มิติของแต่ละแถวมาจากประวัติที่มีผลในเดือนนั้นแล้ว */
function rowMatches(row) {
  const f = filters.value;
  return (
    (!f.building || String(row.building_id) === f.building) &&
    (!f.floor || String(row.floor_id) === f.floor) &&
    (!f.contract || String(row.billing_contract_id) === f.contract)
  );
}

async function retryReferences() {
  await Promise.all([(comparisonType.value !== "department" || referenceError.value) ? loadMasterData() : Promise.resolve(), divisionQuery.refetch(), departmentQuery.refetch()]);
}

let masterDataLoaded = false;
let masterDataPromise = null;
async function loadMasterData() {
  if (masterDataLoaded) return;
  if (masterDataPromise) return masterDataPromise;
  referenceError.value = "";
  masterDataPromise = (async () => {
    try {
      const [building, floor, contract] = await Promise.all([
        api.get("/buildings"),
        api.get("/floors"),
        api.get("/contracts"),
      ]);

      buildings.value = building.data ?? [];
      floors.value = floor.data ?? [];
      contracts.value = contract.data ?? [];
      masterDataLoaded = true;
      referencesReady.value = true;
    } catch (err) {
      referenceError.value = t("โหลดข้อมูลอ้างอิงไม่สำเร็จ");
    } finally {
      masterDataPromise = null;
    }
  })();
  return masterDataPromise;
}

/* --------------------------------------------------------------------------
   sync กลุ่มที่เลือกและตัวกรองกับ URL
   -------------------------------------------------------------------------- */
const scopeQuery = (groups, f, ys = EMPTY_YEAR_SCOPE()) => ({
  groups: groups.length ? groups.join(",") : undefined,
  contract: f.contract || undefined,
  building: f.building || undefined,
  floor: f.floor || undefined,
  scope: ys.scope !== "overall" ? ys.scope : undefined,
  scopeItem: ys.scope !== "overall" && ys.item ? ys.item : undefined,
});

watch([selectedGroups, filters, yearScope], ([groups, f, ys]) => {
  if (syncingScopeFromRoute) return;
  router.replace({ query: { ...route.query, ...scopeQuery(groups, f, ys) } });
}, { deep: true, flush: "sync" });

watch([() => route.query, referencesReady], ([query]) => {
  if (!referencesReady.value) return;
  // Normalize the entire scope with one route write; separate writers can restore
  // each other's legacy values when a link includes both groups and location.
  let groups = groupsFromQuery();
  const resolved = normalizeReferences(filtersFromQuery());
  if (comparisonType.value === "building") {
    const results = groups.map((value) => ({ raw: value, ...(value === "unassigned" ? { value } : resolveReference(value, buildingOptions.value)) }));
    resolved.rejected.push(...results.filter((result) => result.rejected).map((result) => result.raw));
    groups = [...new Set(results.map((result) => result.value).filter(Boolean))];
  }
  if (resolved.rejected.length) referenceNotice.value = t("ล้างตัวกรองจากลิงก์ที่ไม่พบหรือระบุได้ไม่แน่ชัด: {0}", [resolved.rejected.join(", ")]);
  const ys = yearScopeFromQuery();
  syncingScopeFromRoute = true;
  selectedGroups.value = groups;
  filters.value = resolved.values;
  yearScope.value = ys;
  syncingScopeFromRoute = false;
  const normalized = scopeQuery(groups, resolved.values, ys);
  if (Object.keys(normalized).some((key) => queryText(query[key]) !== queryText(normalized[key]))) {
    router.replace({ query: { ...query, ...normalized } });
  }
});

/* --------------------------------------------------------------------------
   sync เดือนที่เลือกกับ ?months= ใน URL
   -------------------------------------------------------------------------- */
let syncingFromRoute = false;
watch(selectedMonths, (value) => {
  if (syncingFromRoute) return;
  router.replace({
    query: { ...route.query, months: value.length ? value.join(",") : undefined },
  });
}, { flush: "sync" });

function monthsFromQuery() {
  const raw = route.query.months;
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m))
    .sort();
}

watch(activeFiscalYear, (year, previous) => {
  if (previous && year?.id !== previous.id) selectedMonths.value = [];
});
watch(() => route.query.months, () => {
  syncingFromRoute = true;
  selectedMonths.value = monthsFromQuery();
  syncingFromRoute = false;
});

/*
 * เทียบข้ามปีงบ: โหลดทุกเดือนของปีที่เลือก แล้ววางแถวบนแกนเดือนของปีงบ (ต.ค. = P01) กลุ่ม
 * ปีงบจึงใช้กราฟ ตาราง และไฟล์ชุดเดียวกับแบบสัญญา/อาคาร ไม่ได้เลือกปีเอง = ปีนี้กับปีก่อน
 */
const yearMode = computed(() => comparisonType.value === "year");
const defaultYears = computed(() => defaultYearPair(activeFiscalYear.value?.year));
const chosenYears = computed(() => {
  const picked = selectedGroups.value.filter((value) => /^\d{4}$/.test(value));
  return picked.length ? [...picked].sort().slice(-MAX_YEARS) : defaultYears.value;
});
const yearOptions = computed(() => yearComparisonOptions(fiscalYearState.list, activeFiscalYear.value?.year));

const monthlyParams = computed(() => ({
  // โหลดทั้งปีงบ แล้วกรองด้วย ID ที่ตั้งของแต่ละเดือนที่ rowMatches
  month: yearMode.value
    ? fiscalYearsMonths(chosenYears.value).join(",") || undefined
    : activeFiscalYearRange.value ? fiscalYearMonths(activeFiscalYearRange.value).join(",") : undefined,
}));
const monthlyQuery = useMonthlyKpi(monthlyParams);
const yearScopeOptions = computed(() => (yearScope.value.scope === "overall" ? [] : itemOptions(yearScope.value.scope, {
  divisions: divisions.value, departments: departments.value, buildings: buildings.value,
}, monthlyQuery.data.value ?? [])));
const rawRows = computed(() => {
  const rows = monthlyQuery.data.value ?? [];
  if (yearMode.value) {
    const { scope, item } = yearScope.value;
    return yearRows(scope !== "overall" && item ? rows.filter((row) => groupKey(row, scope) === item) : rows, chosenYears.value);
  }
  return rows.filter((row) => !activeFiscalYearRange.value
    || (row.month >= activeFiscalYearRange.value.startMonth && row.month <= activeFiscalYearRange.value.endMonth));
});
const loading = computed(() => monthlyQuery.isPending.value || monthlyQuery.isPlaceholderData.value);
const loadError = computed(() => monthlyQuery.isError.value ? t("โหลดข้อมูลเปรียบเทียบไม่สำเร็จ") : "");
const monthsWithData = computed(() => {
  const months = [...new Set(rawRows.value.filter(rowMatches).map((row) => row.month))].sort();
  if (!yearMode.value) return months;
  // แกนของการเทียบข้ามปีเริ่ม ต.ค. เสมอ เดือนที่ไม่มียอดเป็นช่องว่าง ไม่ใช่หายไปจากแกน
  return [...FISCAL_POSITIONS];
});

/* --------------------------------------------------------------------------
   ตัวชี้วัดและการคำนวณ
   -------------------------------------------------------------------------- */
function aggregate(month, inGroup = () => true) {
  const rows = rawRows.value.filter((row) => row.month === month && rowMatches(row) && inGroup(row));
  if (!rows.length) return null;

  const totalPages = rows.reduce((s, r) => s + Number(r.pages_printed || 0), 0);
  const netPages = rows.reduce((s, r) => s + Number(r.net_pages || 0), 0);
  const { cost: totalCost, unpriced } = sumCost(rows);

  return {
    totalPages,
    netPages,
    totalCost,
    unpriced,
    activeDevices: new Set(rows.map((r) => r.device_id)).size,

    // ค่าเฉลี่ยต่อหน้าคำนวณไม่ได้เมื่อตัวเศษยังไม่ครบ — ยอดเงินบางส่วนหารด้วย
    // จำนวนหน้าทั้งหมด ให้ตัวเลขที่ต่ำกว่าความจริงโดยไม่มีอะไรบอก (Q29)
    costPerPage: unpriced > 0 ? null : totalPages > 0 ? totalCost / totalPages : 0,
  };
}

const monthStats = computed(() =>
  (selectedMonths.value.length && !yearMode.value ? selectedMonths.value : monthsWithData.value).map((m) => ({
    month: m,
    label: yearMode.value ? monthText(m) : formatMonth(m, { long: true }),
    stats: aggregate(m),
  }))
);

/**
 * ตัวชี้วัดทั้งห้าของหน้านี้
 *
 * "รวม" คือยอดที่กรอก ส่วน "สุทธิ" คือหลังหัก 2% ตามกฎธุรกิจ —
 * แสดงคู่กันเสมอเพราะเป็นสองตัวเลขที่คนเอาไปสับสนกันบ่อยที่สุด
 */
const METRICS = [
  {
    key: "totalPages",
    shortLabel: t("หน้าดิบ"),
    label: t("จำนวนหน้าดิบ"),
    unit: t("หน้า"),
    hint: t("ยอดตามที่กรอก ยังไม่หัก 2%"),
    format: formatCount,
  },
  {
    key: "netPages",
    shortLabel: t("หน้าสุทธิ"),
    label: t("จำนวนหน้าสุทธิ"),
    unit: t("หน้า"),
    hint: t("หลังหัก 2% แล้ว"),
    format: formatCount,
  },
  {
    key: "totalCost",
    shortLabel: t("ค่าใช้จ่าย"),
    label: t("ค่าใช้จ่ายสุทธิ"),
    unit: t("บาท"),
    hint: t("หลังหัก 2% แล้ว"),
    format: formatBahtValue,
    // ตัวชี้วัดที่ค่าขึ้นกับราคา — เทียบข้ามเดือนไม่ได้จนกว่าราคาจะครบทั้งสองเดือน
    needsPrice: true,
  },
  {
    key: "activeDevices",
    shortLabel: t("เครื่องที่ใช้งาน"),
    label: t("เครื่องที่มีการใช้งาน"),
    unit: t("เครื่อง"),
    hint: t("นับเฉพาะเครื่องที่มียอดในเดือนนั้น"),
    format: formatCount,
  },
  {
    key: "costPerPage",
    shortLabel: t("บาทต่อหน้า"),
    // ไม่ใช้คำว่า "ต้นทุนเฉลี่ย" เดี่ยวๆ เพราะ CONTEXT.md สงวนคำนั้นไว้ให้
    // "ต้นทุนเฉลี่ยต่อเครื่องที่บันทึกยอด" และระบุ "ต้นทุนเฉลี่ยต่อหน้า" ไว้ในช่อง
    // Avoid ตรงๆ — สองอย่างนี้เป็นคนละตัวเลขและเคยถูกอ่านสลับกันมาแล้ว
    label: t("ค่าใช้จ่ายต่อหน้าที่พิมพ์จริง"),
    unit: t("บาท/หน้า"),
    hint: t("ค่าใช้จ่ายสุทธิ หารด้วยจำนวนหน้าดิบ"),
    format: (v) => (v === null ? t("ยังคำนวณค่าเฉลี่ยครบไม่ได้") : Number(v).toFixed(3)),
    needsPrice: true,
  },
];

const METRIC_BY_KEY = Object.fromEntries(METRICS.map((metric) => [metric.key, metric]));

/* --------------------------------------------------------------------------
   กราฟใบเดียว + ตัวสลับตัวชี้วัด

   เดิมมีกราฟห้าใบที่แสดงตัวเลขชุดเดียวกับตารางเปรียบเทียบ (และแต่ละใบยังมีปุ่ม
   "ตาราง" ของตัวเองอีก) ตัวเลขชุดเดียวจึงอยู่บนจอสามรอบ ตอนนี้ตารางเป็นตัวเลขหลัก
   ส่วนกราฟมีใบเดียวแบบเดียวกับแดชบอร์ด แล้วสลับว่าจะดูตัวชี้วัดไหน
   -------------------------------------------------------------------------- */
/**
 * ตัวชี้วัดเริ่มต้นคือค่าใช้จ่าย แต่ถ้าทุกเดือนยังยืนยันราคาไม่ครบ กราฟค่าใช้จ่ายจะว่าง
 * ทั้งใบ — เปิดหน้ามาเจอกรอบเปล่าไม่ได้บอกอะไร จึงเริ่มที่จำนวนหน้าแทนจนกว่าผู้ใช้จะเลือกเอง
 */
const metricFromQuery = () =>
  METRICS.some((metric) => metric.key === route.query.metric) ? route.query.metric : null;
const chosenMetricKey = ref(metricFromQuery());
const chartMetricKey = computed({
  get: () => chosenMetricKey.value ?? (costChartable.value ? "totalCost" : "totalPages"),
  set: (value) => { chosenMetricKey.value = value; },
});
const chartMetric = computed(() => METRIC_BY_KEY[chartMetricKey.value]);
const METRIC_OPTIONS = METRICS.map((metric) => ({ value: metric.key, label: metric.shortLabel }));
let syncingMetricFromRoute = false;
watch(chosenMetricKey, (value) => {
  if (syncingMetricFromRoute) return;
  router.replace({ query: { ...route.query, metric: value ?? undefined } });
}, { flush: "sync" });

watch(() => route.query.metric, () => {
  const next = metricFromQuery();
  if (next === chosenMetricKey.value) return;
  syncingMetricFromRoute = true;
  chosenMetricKey.value = next;
  syncingMetricFromRoute = false;
});

/* --------------------------------------------------------------------------
   แยกกลุ่มตามสัญญา / อาคาร
   -------------------------------------------------------------------------- */
const GROUPING = {
  // key เดียวกับแบบจำลองของ comparison.js — แถวที่ไม่มีสัญญา/อาคารเป็น "unassigned" ไม่ใช่
  // ข้อความว่าง ซึ่งหลุดจาก ?groups= ทันทีที่เขียนลง URL จนเลือก "ไม่ผูกสัญญา" ไม่ได้ (#115)
  contract: {
    id: (row) => groupKey(row, "contract"),
    label: (row) => row.billing_contract_no || t("ไม่ผูกสัญญา"),
    noun: t("สัญญา"),
  },
  year: {
    id: (row) => row.fiscal_year ?? "",
    label: (row) => row.fiscal_year_label,
    noun: t("ปีงบ"),
  },
  building: {
    id: (row) => groupKey(row, "building"),
    label: (row) => row.building_name || t("ไม่ระบุอาคาร"),
    noun: t("อาคาร"),
  },
};
const grouping = computed(() => GROUPING[comparisonType.value] ?? null);

/** ทุกกลุ่มที่มียอดในปีงบนี้ เรียงจากยอดพิมพ์มากไปน้อย — กลุ่มใหญ่ที่สุดได้สีแรก */
const availableGroups = computed(() => {
  const by = grouping.value;
  if (!by) return [];
  const groups = new Map();
  for (const row of rawRows.value) {
    const id = by.id(row);
    const entry = groups.get(id) ?? { value: id, label: by.label(row), pages: 0 };
    entry.pages += Number(row.pages_printed || 0);
    groups.set(id, entry);
  }
  return [...groups.values()].sort((a, b) => b.pages - a.pages);
});

const activeGroups = computed(() => {
  // ปีงบที่เลือกแสดงครบแม้ปีนั้นยังไม่มียอด — เส้นว่างบอกว่า "ไม่มีข้อมูล" ไม่ใช่หายไปเงียบๆ
  if (yearMode.value) return chosenYears.value.map((year) => ({ value: year, label: t("ปีงบ {0}", [yearLabel(year)]) }));
  if (!selectedGroups.value.length) return availableGroups.value.slice(0, MAX_SERIES);
  const chosen = new Set(selectedGroups.value);
  return availableGroups.value.filter((group) => chosen.has(group.value)).slice(0, MAX_SERIES);
});
const groupsTruncated = computed(() => !yearMode.value &&
  (selectedGroups.value.length || availableGroups.value.length) > MAX_SERIES
);

// สีผูกกับตัวตนของกลุ่ม ไม่ผูกกับอันดับ — เอากลุ่มหนึ่งออกแล้วกลุ่มที่เหลือต้องคงสีเดิม
// (design-system.md — กฎของชุดสีกราฟ) สลอตที่ว่างจึงถูกนำกลับมาใช้ใหม่เท่านั้น
const groupSlots = ref(new Map());
watch(
  () => activeGroups.value.map((group) => `${comparisonType.value}:${group.value}`),
  (keys) => {
    const next = new Map(keys.filter((key) => groupSlots.value.has(key))
      .map((key) => [key, groupSlots.value.get(key)]));
    const taken = new Set(next.values());
    for (const key of keys) {
      if (next.has(key)) continue;
      let slot = 1;
      while (taken.has(slot)) slot += 1;
      next.set(key, slot);
      taken.add(slot);
    }
    groupSlots.value = next;
  },
  { immediate: true }
);

/** ตัวเลขของแต่ละกลุ่มในทุกเดือนที่แสดง — ใช้ทั้งกราฟและตาราง */
const groupStats = computed(() => {
  const by = grouping.value;
  if (!by) return [];
  return activeGroups.value.map((group) => ({
    ...group,
    months: monthStats.value.map((entry) => aggregate(entry.month, (row) => by.id(row) === group.value)),
  }));
});

/** ค่าของตัวชี้วัดในหนึ่งช่อง — ตัวชี้วัดที่ขึ้นกับราคาแต่ราคายังไม่ครบ ไม่มีค่า (Q30) */
function metricValue(stats, metric) {
  if (!stats) return null;
  if (metric.needsPrice && stats.unpriced > 0) return null;
  return stats[metric.key];
}

/**
 * ยอดรวมทั้งช่วงของหนึ่งกลุ่ม — ค่าต่อหน้าคิดจากผลรวม ไม่ใช่เฉลี่ยของค่าเฉลี่ย
 * จำนวนเครื่องรวมข้ามเดือนไม่ได้ (เครื่องเดียวกันถูกนับทุกเดือน) จึงไม่มียอดรวม
 */
function groupTotal(months, metric) {
  const present = months.filter(Boolean);
  if (!present.length || metric.key === "activeDevices") return null;
  if (metric.needsPrice && present.some((m) => m.unpriced > 0)) return null;
  const sum = (field) => present.reduce((total, m) => total + Number(m[field] || 0), 0);
  if (metric.key === "costPerPage") {
    const pages = sum("totalPages");
    return pages > 0 ? sum("totalCost") / pages : 0;
  }
  return sum(metric.key);
}

function cellText(stats, metric) {
  if (!stats) return "—";
  const value = metricValue(stats, metric);
  return value === null ? t("ราคายังไม่ครบ") : metric.format(value);
}

const chartSeries = computed(() => {
  const metric = chartMetric.value;
  if (grouping.value) {
    return groupStats.value.map((group) => ({
      key: `${comparisonType.value}:${group.value}`,
      label: group.label,
      slot: groupSlots.value.get(`${comparisonType.value}:${group.value}`),
      data: group.months.map((stats) => metricValue(stats, metric)),
    }));
  }
  return [{ key: metric.key, label: metric.label, slot: 1, data: monthStats.value.map((entry) => metricValue(entry.stats, metric)) }];
});

const costChartable = computed(() => monthStats.value.some((entry) => metricValue(entry.stats, METRIC_BY_KEY.totalCost) !== null));

/** กราฟที่ไม่มีจุดให้วาดเลยไม่ต้องแสดงกรอบเปล่า — บอกเหตุผลแทน */
const chartHasData = computed(() => chartSeries.value.some((series) => series.data.some((value) => value !== null)));

/**
 * เปอร์เซ็นต์เปลี่ยนแปลง — ฐานเป็นศูนย์คืน null เพราะ "เพิ่มขึ้น 100%" จากศูนย์เป็นตัวเลข
 * ที่ทำให้เข้าใจผิด ส่วนต่างจริงยังอ่านได้จากยอดสองเดือนที่แสดงคู่กัน (#103)
 */
function diffPercent(before, after) {
  if (!before) return null;
  return ((after - before) / before) * 100;
}

/**
 * เทียบสองเดือนนี้ได้จริงหรือยัง สำหรับตัวชี้วัดตัวนี้
 *
 * ตัวชี้วัดที่ขึ้นกับราคา เทียบกันไม่ได้เมื่อเดือนใดเดือนหนึ่งยังมีรายการที่ยืนยัน
 * ราคาไม่ได้ — ยอดที่เอามาเทียบเป็นยอด "เท่าที่รู้" ของคนละสัดส่วนกัน เปอร์เซ็นต์
 * ที่ได้จึงไม่ได้วัดการเปลี่ยนแปลงของค่าใช้จ่าย แต่วัดว่าเดือนไหนยืนยันราคาไปได้
 * มากกว่ากัน ซึ่งเป็นคนละคำถามโดยสิ้นเชิง (Q30)
 */
function comparable(metric, before, after) {
  if (!before || !after) return false;
  if (before[metric.key] === null || after[metric.key] === null) return false;
  if (metric.needsPrice && (before.unpriced > 0 || after.unpriced > 0)) return false;
  return true;
}

/** ผลต่างเทียบกับเดือนก่อนหน้า "ในรายการที่เลือก" ไม่ใช่เดือนก่อนหน้าตามปฏิทิน */
function deltaVsPrevious(metricKey, index, entries = monthStats.value) {
  if (index === 0) return null;
  const previous = entries[index - 1].stats;
  const current = entries[index].stats;
  if (!comparable(METRIC_BY_KEY[metricKey], previous, current)) return null;
  return diffPercent(previous[metricKey], current[metricKey]);
}

/** รายการที่ยืนยันราคาไม่ได้ในทุกเดือนที่กำลังดูอยู่ ไม่ใช่แค่สองเดือนที่เอามาเทียบ */
const unpricedInSelection = computed(() =>
  monthStats.value.reduce((sum, entry) => sum + (entry.stats?.unpriced || 0), 0)
);

const summaryFirst = computed(() => monthStats.value[0] ?? null);
const summaryLast = computed(() =>
  monthStats.value.length > 1 ? monthStats.value[monthStats.value.length - 1] : null
);

const summaryLines = computed(() => {
  if (!summaryFirst.value?.stats || !summaryLast.value?.stats) return [];

  const first = summaryFirst.value.stats;
  const last = summaryLast.value.stats;

  return METRICS.map((metric) => {
    const before = first[metric.key];
    const after = last[metric.key];

    // เทียบไม่ได้ = บอกยอดของแต่ละเดือนไปตามตรงพร้อมเหตุผล ไม่ใช่เงียบหายไปทั้ง
    // บรรทัด (ซึ่งทำให้ดูเหมือนตัวชี้วัดนี้ไม่มีอยู่) และไม่ใช่สรุปเปอร์เซ็นต์จาก
    // ยอดที่ยังไม่ครบ (ซึ่งเป็นการสรุปที่ข้อมูลยังไม่พอจะพูด — Q30)
    if (!comparable(metric, first, last)) {
      return {
        trend: null,
        incomplete: true,
        text: t("{0}: {1} → {2} — ยังสรุปไม่ได้เพราะมีรายการที่ยืนยันราคาไม่ได้อยู่", [
          metric.label,
          metric.format(before),
          metric.format(after),
        ]),
      };
    }

    const percent = diffPercent(before, after);

    if (percent === null) {
      return {
        trend: after > 0 ? "up" : null,
        text: t("{0}: {1} → {2} {3} — เดือนแรกเป็นศูนย์ จึงไม่คิดเปอร์เซ็นต์", [metric.label, metric.format(before), metric.format(after), metric.unit]),
      };
    }

    if (Math.abs(percent) < 0.05) {
      return {
        trend: null,
        text: t("{0}แทบไม่เปลี่ยน ({1} → {2} {3})", [metric.label, metric.format(before), metric.format(after), metric.unit]),
      };
    }

    return {
      trend: percent > 0 ? "up" : "down",
      text:
        `${metric.label}${percent > 0 ? t("เพิ่มขึ้น") : t("ลดลง")} ${Math.abs(percent).toFixed(1)}% ` +
        t("(จาก {0} เป็น {1} {2})", [metric.format(before), metric.format(after), metric.unit]),
    };
  });
});

/**
 * ข้อเท็จจริงที่ต้องอ่านคู่กับบทสรุปเสมอ ไม่ใช่เชิงอรรถที่จะละไว้ก็ได้
 *
 * ## ทำไมจำนวนเครื่องที่ต่างกันถึงสำคัญกว่าที่เห็น
 *
 * บทสรุปของหน้านี้เทียบ "เดือนแรกกับเดือนสุดท้าย" ของยอดรวม โดยไม่เคยบอกว่าสอง
 * เดือนนั้นมาจากเครื่องคนละจำนวนกัน เดือนที่บันทึกยอดไป 12 เครื่องกับเดือนที่
 * บันทึกไป 20 เครื่อง ย่อมมียอดรวมต่างกันแน่นอนแม้ทุกเครื่องพิมพ์เท่าเดิมทุกแผ่น
 * — "ค่าใช้จ่ายเพิ่มขึ้น 67%" ในกรณีนั้นวัดความคืบหน้าของการกรอกข้อมูล ไม่ได้วัด
 * ค่าใช้จ่าย แต่คนอ่านไม่มีทางรู้ (Q30)
 */
const summaryCaveats = computed(() => {
  const first = summaryFirst.value?.stats;
  const last = summaryLast.value?.stats;
  if (!first || !last) return [];

  const notes = [];

  if (first.activeDevices !== last.activeDevices) {
    notes.push(
      t("สองเดือนนี้มีเครื่องที่บันทึกยอดไม่เท่ากัน ({0} เทียบกับ {1} เครื่อง) ยอดรวมจึงต่างกันได้เองโดยที่การใช้งานไม่เปลี่ยน", [
        formatCount(first.activeDevices),
        formatCount(last.activeDevices),
      ])
    );
  }

  const unpriced = (first.unpriced || 0) + (last.unpriced || 0);
  if (unpriced > 0) {
    notes.push(
      t("ยังยืนยันราคาไม่ได้ {0} รายการในสองเดือนนี้ — ตัวเลขค่าใช้จ่ายเป็นยอดเฉพาะส่วนที่ยืนยันแล้ว", [formatCount(unpriced)])
    );
  }

  return notes;
});

/* --------------------------------------------------------------------------
   ส่งออก Excel — ไฟล์เดียวกับหน้าภาพรวม: เปรียบเทียบ + กราฟ / ข้อมูลรายละเอียด / เงื่อนไข

   ตัวเลขมาจาก buildComparison ชุดเดียวกับหน้าภาพรวม โดยใช้แถว เดือน และกลุ่มที่หน้านี้
   แสดงอยู่ เดือนที่เลือกแต่ไม่มีข้อมูลยังเป็นช่องว่างในไฟล์ ไม่หายไปจากแกน
   -------------------------------------------------------------------------- */
const exportMonths = computed(() => monthStats.value.map((entry) => entry.month));
const exportRows = computed(() => {
  const months = new Set(exportMonths.value);
  return rawRows.value.filter((row) => months.has(row.month) && rowMatches(row));
});
/** แบบจำลองสรุปร่วมใช้สองตัวชี้วัด; compareSheet ใช้ chartSeries เพื่อส่งออกตัวชี้วัดจริงทั้งห้าแบบ */
const exportMetric = computed(() => (chartMetric.value.needsPrice ? "cost" : "rawPages"));
const exportModel = computed(() => (grouping.value
  ? buildComparison({
    rows: exportRows.value,
    dimension: yearMode.value ? "fiscalYear" : comparisonType.value,
    items: activeGroups.value.map((group) => group.value),
    options: activeGroups.value.map((group) => ({ value: group.value, label: group.label })),
    metric: exportMetric.value,
    months: exportMonths.value,
  })
  : buildComparison({ rows: exportRows.value, dimension: "overall", metric: exportMetric.value, months: exportMonths.value })));

const { busy: exporting, error: exportError, run: runExport } = useExportTask();
const exportBlocked = computed(() => {
  if (loading.value || loadError.value) return t("รอข้อมูลโหลดเสร็จ");
  return exportRows.value.length ? "" : t("ยังไม่มียอดพิมพ์ในขอบเขตนี้");
});

function exportConditions(model, kind) {
  const f = filters.value;
  const typeLabel = COMPARISON_TYPES.find((type) => type.value === comparisonType.value)?.label ?? "";
  const summary = summarize(model.scopeRows);
  const { scope, item } = yearScope.value;
  const period = yearMode.value ? [
    [t("ปีงบที่เปรียบเทียบ"), activeGroups.value.map((group) => group.label).join(", ")],
    [t("เดือนของปีงบบนแกน"), exportMonths.value.map((month) => monthText(month)).join(", ")],
    [t("ขอบเขต"), scope !== "overall" && item
      ? `${dimensionLabel(scope)}: ${yearScopeOptions.value.find((option) => option.value === item)?.label ?? item}` : t("ทั้งองค์กร")],
  ] : [
    [t("ปีงบประมาณ"), yearLabel(activeFiscalYear.value?.year)],
    [t("ช่วงเวลา"), periodLabel(exportMonths.value)],
  ];
  return [
    ...period,
    [t("เทียบระหว่าง"), typeLabel],
    ...(grouping.value && !yearMode.value ? [[t("รายการที่เปรียบเทียบ"), model.entries.map((entry) => entry.displayLabel).join(", ")]] : []),
    ...(grouping.value && !yearMode.value && !selectedGroups.value.length ? [[t("วิธีเลือกรายการ"), t("ไม่ได้เลือกเอง — {0} รายการที่มียอดพิมพ์สูงสุดในปีงบ", [MAX_SERIES])]] : []),
    ...(f.contract ? [[t("สัญญาที่คิดเงิน"), contractOptions.value.find((option) => option.value === f.contract)?.label ?? f.contract]] : []),
    ...(f.building ? [[t("อาคาร"), referenceLabel("building", f.building)]] : []),
    ...(f.floor ? [[t("ชั้น"), referenceLabel("floor", f.floor)]] : []),
    ...(kind === "raw" ? [] : [[t("ตัวชี้วัด"), `${chartMetric.value.label} (${chartMetric.value.unit})`]]),
    [t("ตัวชี้วัดบนหน้าจอ"), chartMetric.value.label],
    [t("จำนวนรายการยอดพิมพ์"), formatCount(model.scopeRows.length)],
    [t("จำนวนเครื่องที่มีข้อมูล"), formatCount(summary.devices)],
    [t("สถานะราคา"), priceStatusLine(summary.unpriced)],
    ...standardNotes(),
  ];
}

async function runCompareExport(kind) {
  if (exportBlocked.value) return;
  // จับแบบจำลองและเงื่อนไขไว้ก่อน await — เปลี่ยนตัวเลือกระหว่างสร้างไฟล์ ไฟล์ยังเป็นชุดที่กด
  const model = exportModel.value;
  const filename = exportFilename([
    kind === "raw" ? "print-usage-data" : "print-comparison",
    yearMode.value ? `fy${chosenYears.value.join("_")}` : `fy${activeFiscalYear.value?.year ?? "all"}`,
    yearMode.value ? "full-year" : monthsSlug(selectedMonths.value, activeFiscalYearRange.value ? fiscalYearMonths(activeFiscalYearRange.value) : []),
    comparisonType.value,
    kind === "raw" ? null : ({ totalPages: "pages", netPages: "net-pages", totalCost: "cost", activeDevices: "devices", costPerPage: "cost-per-page" })[chartMetricKey.value],
  ]);
  const conditions = conditionsSheet(filename, exportConditions(model, kind));
  const sheets = kind === "report"
    ? [compareSheet(model, chartMetric.value, chartSeries.value), detailSheet(model.scopeRows), conditions]
    : [detailSheet(model.scopeRows), conditions];
  await runExport(() => saveWorkbook(filename, sheets));
}

// ตัวเลข หัวข้อ และแกนกราฟต้องมาจากคำขอที่เสร็จรอบเดียวกัน ไม่ปนของเก่ากับของใหม่
const currentDisplay = computed(() => ({
  monthStats: monthStats.value, grouping: grouping.value, groupStats: groupStats.value,
  summaryFirst: summaryFirst.value, summaryLast: summaryLast.value,
  summaryLines: summaryLines.value, summaryCaveats: summaryCaveats.value,
  chartMetric: chartMetric.value, chartSeries: chartSeries.value, chartHasData: chartHasData.value,
  unpricedInSelection: unpricedInSelection.value, groupsTruncated: groupsTruncated.value,
  yearMode: yearMode.value, selectedGroups: [...selectedGroups.value],
}));
const settledDisplay = ref(null);
watch([currentDisplay, loading, loadError], ([value, pending, error]) => {
  if (!pending && !error) settledDisplay.value = value;
}, { immediate: true });
const display = computed(() => loading.value && settledDisplay.value ? settledDisplay.value : currentDisplay.value);

onMounted(async () => {
  if (comparisonType.value !== "department") await loadMasterData();
});
</script>

<template>
  <div>
    <UiPageHeader
      :title="t(&quot;เปรียบเทียบ&quot;)"
      :description="t(&quot;เทียบยอดพิมพ์และค่าใช้จ่ายระหว่างเดือน ระหว่างสัญญา ระหว่างอาคาร หรือระหว่างหน่วยงาน&quot;)"
    />

    <UiAlert v-if="referenceError || divisionQuery.isError.value || departmentQuery.isError.value" tone="danger" class="mb-4">
      {{ t("โหลดข้อมูลอ้างอิงไม่สำเร็จ") }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="retryReferences()">{{ t("ลองใหม่") }}</UiButton>
      </template>
    </UiAlert>

    <UiAlert v-if="referenceNotice" tone="warn" class="mb-4">{{ referenceNotice }}</UiAlert>

    <!-- ฝ่าย/แผนกมีตัวเลือกและผลของตัวเอง (ตรวจความแตกต่าง) รวมช่อง "เทียบระหว่าง" ไว้ในแถบเดียวกัน -->
    <UnitDifference v-if="comparisonType === 'department'" v-model:type="comparisonType" :types="COMPARISON_TYPES" />

    <template v-else>
    <!--
      ตัวกรองเป็นแถวเดียว ไม่ใช่การ์ด (#90) — "เทียบระหว่าง" อยู่หน้าสุดเพราะมันเปลี่ยน
      ทั้งหน้า ช่องที่เหลือเปลี่ยนตามแบบที่เลือก และทุกช่องมีป้ายชื่อแบบเดียวกัน
    -->
    <UiFilterBar :collapsible="false" class="mb-4">
      <template #primary>
        <UiField :label="t(&quot;เทียบระหว่าง&quot;)">
          <UiSegmented v-model="comparisonType" :options="COMPARISON_TYPES" />
        </UiField>

        <UiField v-if="!yearMode" :label="t(&quot;เดือน&quot;)" class="w-full sm:w-72">
          <PeriodPicker
            v-model="selectedMonths"
            :options="monthsWithData"
            mode="multi"
            :all-label="t(&quot;ทุกเดือนที่มีข้อมูล&quot;)"
            :all-emits-empty="false"
          />
        </UiField>

        <UiField v-if="grouping" :label="t(&quot;{0}ที่จะนำมาเทียบ&quot;, [grouping.noun])" class="w-full sm:w-80">
          <UiCombobox
            v-model="selectedGroups"
            :options="yearMode ? yearOptions : availableGroups"
            multiple
            :placeholder="yearMode ? t(&quot;ปีงบนี้กับปีก่อน&quot;) : t(&quot;ยอดพิมพ์สูงสุด {0} รายการ&quot;, [MAX_SERIES])"
            :search-placeholder="t(&quot;พิมพ์เพื่อค้นหา…&quot;)"
          />
        </UiField>

        <!-- เทียบข้ามปีงบดูได้ทั้งองค์กรหรือขอบเขตเดียว — หลายรายการคูณหลายปีจะเกินจำนวนสีเร็วมาก -->
        <template v-if="yearMode">
          <UiField :label="t(&quot;ขอบเขต&quot;)">
            <UiSegmented
              :model-value="yearScope.scope"
              :options="YEAR_SCOPE_OPTIONS"
              size="sm"
              @update:model-value="(scope) => (yearScope = { scope, item: '' })"
            />
          </UiField>
          <UiField v-if="yearScope.scope !== 'overall'" :label="t(&quot;{0}ที่จะดู&quot;, [dimensionLabel(yearScope.scope)])" class="w-full sm:w-72">
            <UiCombobox
              :model-value="yearScope.item"
              :options="yearScopeOptions"
              :placeholder="t(&quot;เลือก{0}&quot;, [dimensionLabel(yearScope.scope)])"
              :search-placeholder="t(&quot;พิมพ์เพื่อค้นหา…&quot;)"
              @update:model-value="(item) => (yearScope = { ...yearScope, item: item ?? '' })"
            />
          </UiField>
        </template>

        <template v-if="comparisonType === 'month'">
          <!-- ชื่อช่องบอกให้ตรงว่ากรองด้วยสัญญาที่คิดเงินของเดือนนั้น ไม่ใช่สัญญาปัจจุบัน
               ของเครื่องแบบตัวกรอง "สัญญา" ในหน้าทะเบียนและหน้ารายงาน (ADR-0019) -->
          <UiField :label="t(&quot;สัญญาที่คิดเงิน&quot;)" class="w-full sm:w-48">
            <UiCombobox
              v-model="filters.contract"
              :options="contractOptions"
              :placeholder="t(&quot;ทุกสัญญา&quot;)"
              :any-label="t(&quot;ทุกสัญญา&quot;)"
            />
          </UiField>
          <UiField :label="t(&quot;อาคาร&quot;)" class="w-full sm:w-48">
            <UiCombobox
              v-model="filters.building"
              :options="buildingOptions"
              :placeholder="t(&quot;ทุกอาคาร&quot;)"
              :any-label="t(&quot;ทุกอาคาร&quot;)"
            />
          </UiField>
          <UiField :label="t(&quot;ชั้น&quot;)" class="w-full sm:w-32">
            <UiCombobox
              v-model="filters.floor"
              :options="floorOptions"
              :placeholder="t(&quot;ทุกชั้น&quot;)"
              :any-label="t(&quot;ทุกชั้น&quot;)"
            />
          </UiField>
        </template>

        <UiField :label="t(&quot;ตัวชี้วัด&quot;)">
          <UiSegmented v-model="chartMetricKey" :options="METRIC_OPTIONS" size="sm" class="flex-wrap" />
        </UiField>

        <UiButton v-if="hasActiveFilter || selectedGroups.length" size="sm" variant="danger-ghost" class="ml-auto self-end" @click="clearAll">
          {{ t("ล้างตัวกรอง") }}
        </UiButton>
      </template>
      <template #actions>
        <ExportExcelButton :disabled="Boolean(exportBlocked)" :raw-disabled="Boolean(exportBlocked)" :busy="exporting" :reason="exportBlocked"
          @report="runCompareExport('report')" @raw="runCompareExport('raw')" />
      </template>
    </UiFilterBar>

      <UiAlert v-if="exportError" tone="danger" class="mb-4">
        {{ exportError }}
        <template #actions>
          <UiButton size="sm" variant="secondary" :loading="exporting" @click="runCompareExport('report')"> {{ t("ลองใหม่") }} </UiButton>
        </template>
      </UiAlert>

      <UiAlert v-if="loadError" tone="danger" class="mb-4">
        {{ loadError }}
        <template #actions>
          <UiButton size="sm" variant="secondary" @click="monthlyQuery.refetch()"> {{ t("ลองใหม่") }} </UiButton>
        </template>
      </UiAlert>

      <div v-if="loading && !settledDisplay" class="flex flex-col gap-3">
        <UiSkeleton height="8rem" />
        <UiSkeleton height="14rem" />
      </div>

      <UiCard v-else-if="!display.monthStats.some((month) => month.stats)">
        <UiEmpty
          :title="t(&quot;ยังไม่มีข้อมูลในช่วงที่เลือก&quot;)"
          :description="t(&quot;ยังไม่มียอดพิมพ์สำหรับปีงบและตัวกรองนี้&quot;)"
        />
      </UiCard>

      <div v-else :aria-busy="loading" :class="{ 'opacity-45': loading }">
        <!-- บทสรุปอัตโนมัติ — เฉพาะโหมดเดือน โหมดแยกกลุ่มไม่มี "ยอดเดียว" ให้สรุป -->
        <template v-if="!display.grouping">
          <UiCard
            v-if="display.summaryFirst?.stats && display.summaryLast?.stats"
            class="mb-4"
            :eyebrow="t(&quot;สรุปอัตโนมัติ&quot;)"
            :title="t(&quot;{0} เทียบกับ {1}&quot;, [display.summaryFirst.label, display.summaryLast.label])"
            :description="display.monthStats.length > 2 ? t(&quot;จากทั้งหมด {0} เดือนที่เลือก&quot;, [display.monthStats.length]) : ''"
          >
            <ul class="flex flex-col gap-2 list-none">
              <li v-for="(line, index) in display.summaryLines" :key="index" class="flex items-start gap-2 text-sm">
                <component
                  :is="line.incomplete ? CircleAlert : line.trend === 'up' ? TrendingUp : line.trend === 'down' ? TrendingDown : Minus"
                  :size="15"
                  class="shrink-0 mt-0.5"
                  :class="
                    line.incomplete ? 'text-warn-ink'
                    : line.trend === 'up' ? 'text-danger-ink'
                    : line.trend === 'down' ? 'text-ok-ink' : 'text-ink-mute'
                  "
                  aria-hidden="true"
                />
                <span class="text-ink-soft">{{ line.text }}</span>
              </li>
            </ul>

            <!--
              ข้อจำกัดของการเทียบครั้งนี้ อยู่ในการ์ดเดียวกับบทสรุปโดยตั้งใจ — เป็น
              เงื่อนไขของตัวเลขข้างบน ไม่ใช่ข้อมูลเสริมที่จะย้ายไปไว้ที่อื่นก็ได้
            -->
            <ul v-if="display.summaryCaveats.length" class="mt-3 pt-3 border-t border-line-soft flex flex-col gap-1.5 list-none">
              <li v-for="(note, index) in display.summaryCaveats" :key="`caveat-${index}`" class="flex items-start gap-2 text-sm text-ink-mute">
                <Info :size="15" class="shrink-0 mt-0.5" aria-hidden="true" />
                <span>{{ note }}</span>
              </li>
            </ul>
          </UiCard>

          <UiAlert v-else-if="display.summaryLast" tone="warn" class="mb-4">
            {{ t("ยังสรุปช่วงนี้ไม่ได้ เพราะเดือนแรกหรือเดือนสุดท้ายที่เลือกยังไม่มีข้อมูล") }}
          </UiAlert>

          <UiAlert v-else tone="warn" class="mb-4"> {{ t("ตอนนี้เลือกไว้เดือนเดียว (") }} {{ display.summaryFirst?.label }} {{ t(") — เลือกอีกเดือนเพื่อให้ระบบเทียบให้") }} </UiAlert>
        </template>

        <!--
          เดือนที่ราคายังไม่ครบไม่มีจุดบนกราฟของตัวชี้วัดที่ขึ้นกับราคา — ยอด "เท่าที่รู้"
          จะวาดเส้นที่ตกลงเพราะยืนยันราคาไม่ทัน ไม่ใช่เพราะใช้น้อยลง (Q30)
        -->
        <UiCard
          class="mb-4"
          :title="display.grouping ? t(&quot;{0} แยกตาม{1}&quot;, [display.chartMetric.label, display.grouping.noun]) : t(&quot;{0} รายเดือน&quot;, [display.chartMetric.label])"
          :description="display.chartMetric.hint"
        >
          <UiAlert v-if="display.chartMetric.needsPrice && display.unpricedInSelection > 0" tone="warn" class="mb-3">
            {{ t("ยังยืนยันราคาไม่ได้ {0} รายการในช่วงที่เลือก เดือนที่ราคายังไม่ครบจึงไม่มีจุดบนกราฟ", [formatCount(display.unpricedInSelection)]) }}
          </UiAlert>

          <UiAlert v-if="display.yearMode && display.selectedGroups.length > MAX_YEARS" tone="info" class="mb-3">
            {{ t("เทียบได้ครั้งละไม่เกิน {0} ปีงบ เพื่อให้เส้นบนกราฟยังอ่านออก — แสดง {0} ปีหลังสุดที่เลือก", [MAX_YEARS]) }}
          </UiAlert>

          <UiAlert v-if="display.grouping && display.groupsTruncated" tone="info" class="mb-3">
            {{ t("แสดงได้ครั้งละ {0} รายการ เพราะชุดสีมี {0} สี — เลือกเองได้จากช่องด้านบน", [MAX_SERIES]) }}
          </UiAlert>

          <UiChart
            v-if="display.chartHasData"
            kind="line"
            :labels="display.monthStats.map((s) => s.label)"
            :series="display.chartSeries"
            height="20rem"
            :loading="loading"
            :unit="display.chartMetric.unit"
            :format-value="display.chartMetric.format"
            :category-label="t(&quot;เดือน&quot;)"
          />
          <UiEmpty
            v-else
            compact
            :title="t(&quot;ยังวาดกราฟ{0}ไม่ได้&quot;, [display.chartMetric.label])"
            :description="display.chartMetric.needsPrice ? t(&quot;ทุกเดือนที่เลือกยังมีรายการที่ยืนยันราคาไม่ได้ ยืนยันช่วงที่สัญญามีผลก่อน แล้วกราฟจะขึ้นเอง&quot;) : t(&quot;ยังไม่มียอดในช่วงที่เลือก&quot;)"
          />
        </UiCard>

        <!-- ตารางเปรียบเทียบ — ตัวเลขหลักของหน้า: ทุกตัวชี้วัด (โหมดเดือน) หรือทุกกลุ่ม (โหมดแยกกลุ่ม) -->
        <UiCard
          flush
          class="mb-4"
          :title="t(&quot;ตารางเปรียบเทียบ&quot;)"
          :description="display.grouping ? t(&quot;{0} ของแต่ละ{1}&quot;, [display.chartMetric.label, display.grouping.noun]) : ''"
        >
          <!-- กล่องที่เลื่อนแนวนอนได้ต้องรับโฟกัสจากคีย์บอร์ด ไม่งั้นคนที่ไม่ใช้เมาส์เลื่อนดูเดือนท้ายๆ ไม่ได้ -->
          <div class="overflow-x-auto scroll-hint-x" tabindex="0" role="region" :aria-label="t(&quot;ตารางเปรียบเทียบ&quot;)">
            <table class="w-full text-sm min-w-max">
              <caption class="sr-only">{{ t("ตารางเปรียบเทียบ") }}</caption>
              <thead>
                <tr class="bg-surface-2">
                  <th
                    scope="col"
                    class="sticky left-0 z-[1] bg-surface-2 text-left text-xs font-semibold text-ink-mute px-4 py-2.5 border-b border-line-soft shadow-[1px_0_0_var(--line-soft)]"
                  > {{ display.grouping ? display.grouping.noun : t("ตัวชี้วัด") }} </th>
                  <th
                    v-for="stat in display.monthStats"
                    :key="stat.month"
                    scope="col"
                    class="text-right text-xs font-semibold text-ink-mute px-4 py-2.5 whitespace-nowrap border-b border-line-soft"
                  >
                    {{ stat.label }}
                  </th>
                  <th
                    v-if="display.grouping"
                    scope="col"
                    class="text-right text-xs font-semibold text-ink px-4 py-2.5 whitespace-nowrap border-b border-line-soft"
                  > {{ t("รวมทั้งช่วง") }} </th>
                </tr>
              </thead>

              <tbody v-if="display.grouping">
                <tr v-for="group in display.groupStats" :key="group.value" class="border-b border-line-soft last:border-0">
                  <th
                    scope="row"
                    class="sticky left-0 z-[1] bg-surface text-left font-medium text-ink-soft px-4 py-2.5 whitespace-nowrap shadow-[1px_0_0_var(--line-soft)]"
                  >
                    {{ group.label }}
                  </th>
                  <td
                    v-for="(stats, index) in group.months"
                    :key="display.monthStats[index].month"
                    class="px-4 py-2.5 text-right numeral whitespace-nowrap"
                    :class="stats && metricValue(stats, display.chartMetric) === null ? 'text-ink-mute text-xs' : 'text-ink'"
                  >
                    {{ cellText(stats, display.chartMetric) }}
                  </td>
                  <td class="px-4 py-2.5 text-right numeral font-semibold text-ink whitespace-nowrap">
                    {{ groupTotal(group.months, display.chartMetric) === null ? "—" : display.chartMetric.format(groupTotal(group.months, display.chartMetric)) }}
                  </td>
                </tr>
              </tbody>

              <tbody v-else>
                <tr v-for="metric in METRICS" :key="metric.key" class="border-b border-line-soft last:border-0">
                  <th
                    scope="row"
                    class="sticky left-0 z-[1] bg-surface text-left font-normal px-4 py-2.5 shadow-[1px_0_0_var(--line-soft)]"
                  >
                    <span class="block text-ink-soft">{{ metric.label }}</span>
                    <span class="block text-2xs text-ink-mute">{{ metric.hint }}</span>
                  </th>

                  <td v-for="(stat, index) in display.monthStats" :key="stat.month" class="px-4 py-2.5 text-right">
                    <span class="block font-semibold text-ink numeral whitespace-nowrap">
                      {{ stat.stats ? metric.format(stat.stats[metric.key]) : "—" }}<span
                        v-if="stat.stats && metric.key === 'totalCost' && stat.stats.unpriced > 0"
                        class="text-warn-ink"
                        :title="t(&quot;ยอดเฉพาะส่วนที่ยืนยันราคาแล้ว&quot;)"
                      >*</span>
                    </span>

                    <span
                      v-if="deltaVsPrevious(metric.key, index, display.monthStats) !== null"
                      class="inline-flex items-center gap-0.5 text-2xs font-medium numeral"
                      :class="deltaVsPrevious(metric.key, index, display.monthStats) >= 0 ? 'text-danger-ink' : 'text-ok-ink'"
                    >
                      <component
                        :is="deltaVsPrevious(metric.key, index, display.monthStats) >= 0 ? TrendingUp : TrendingDown"
                        :size="11"
                        aria-hidden="true"
                      />
                      {{ Math.abs(deltaVsPrevious(metric.key, index, display.monthStats)).toFixed(1) }}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <template v-if="!display.grouping && display.unpricedInSelection > 0" #footer>
            <p class="text-xs text-ink-mute">{{ t("* ยอดเฉพาะส่วนที่ยืนยันราคาแล้ว — เดือนนั้นยังมีรายการที่ยืนยันราคาไม่ได้") }}</p>
          </template>
        </UiCard>
      </div>
    </template>
  </div>
</template>
