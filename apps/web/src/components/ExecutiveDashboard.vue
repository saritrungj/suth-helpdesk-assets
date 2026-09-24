<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { GitCompareArrows, PanelRightOpen, RefreshCw } from 'lucide-vue-next';
import { useBuildings, useContracts, useDepartments, useDivisions, useMonthlyKpi, useReadingMonths } from '../api/queries';
import { activeFiscalYear, activeFiscalYearRange, fiscalYearMonths, fiscalYearState, setActiveFiscalYear } from '../store/fiscalYear';
import { t } from '../lib/locale';
import { yearLabel } from '../lib/locale-format';
import { formatBahtValue, formatCount, formatNetPages } from '../lib/format';
import { errorMessage } from '../lib/api-error';
import { UiAlert, UiButton, UiPageHeader, UiStat } from '../ui';
import DashboardFilters from './DashboardFilters.vue';
import ExecutiveDetails from './ExecutiveDetails.vue';
import ExportMenu from './ExportMenu.vue';
import PrintComparison from './PrintComparison.vue';
import OverviewTrend from './OverviewTrend.vue';
import ComparisonTable from './ComparisonTable.vue';
import TopShareCard from './TopShareCard.vue';
import { dashboardKpis, previousYearMonths, topShare } from './dashboard-kpi';
import {
  MAX_YEARS, buildComparison, buildYearComparison, dimensionLabel, fiscalPosition,
  itemOptions, metricLabel, metricUnit, monthText, periodLabel, summarize,
  yearComparisonOptions, yearRows,
} from './comparison';
import {
  comparisonSheet, comparisonTitle, conditionsSheet, detailSheet, exportFilename, monthlySheet,
  monthsSlug, rankingSheet, saveWorkbook, standardNotes, summarySheet,
} from './comparison-export';
import {
  DEFAULT_BY, PAGE_DIMENSIONS, SCOPE_KEYS, VIEW_QUERY_KEYS, filterRows, pruneUnavailableScopes, requestedMonths, selectedKeysFor, viewFromQuery, viewToQuery,
} from './dashboard-view';
import { dashboardCsv, downloadCsv } from './dashboard-csv';

/**
 * ExecutiveDashboard — หน้าภาพรวมการพิมพ์
 *
 * โครงหน้าเรียงตามคำถามที่หัวหน้าหน่วยงานถามจริง
 *
 *   ตัวกรอง          ดูข้อมูลชุดไหน (ปีงบ ช่วงเวลา ฝ่าย แผนก สัญญา อาคาร เครื่อง)
 *   ตัวเลขสำคัญ       ชุดนั้นรวมแล้วเป็นเท่าไร
 *   เปรียบเทียบ       ชุดนั้นแบ่งตามอะไรแล้วต่างกันอย่างไร
 *   ตารางรายละเอียด   ทุกกลุ่มในชุดนั้น ค้นหาและเรียงได้
 *   รายละเอียด        เจาะถึงรายเครื่องรายเดือนในลิ้นชัก ไม่เปลี่ยนหน้า
 *
 * **ทุกส่วนอ่านจากแถวชุดเดียวกัน** (`rows`) ที่ผ่านตัวกรองแล้ว การเลือก "เปรียบเทียบตาม"
 * จึงเปลี่ยนแค่วิธีแบ่ง ไม่เปลี่ยนตัวเลขสำคัญ และไฟล์ที่ส่งออกตรงกับจอเสมอโดยไม่ต้อง
 * มีกฎพิเศษ — เดิมมีตัวกรองสองชั้นที่ชื่อซ้ำกัน แล้วต้องเขียนกฎว่าชั้นไหนมีผลกับอะไร
 *
 * สถานะทั้งหมดอยู่ใน URL และมี **ผู้เขียน URL คนเดียว** (watch ด้านล่าง) — เดิมมีสี่จุด
 * ที่เรียก router.replace พร้อมกัน แต่ละจุดอ่าน route.query ของตัวเอง ตัวที่เขียนทีหลัง
 * จึงทับตัวกรองที่เพิ่งเลือกไปเงียบๆ
 */
const props = defineProps({
  /**
   * "overview" (/dashboard) ภาพรวมทั้งหมด: ปีงบจากแถบบนสุด ตัวกรองช่วงเวลากับสัญญา กราฟค่าใช้จ่ายกับยอดพิมพ์
   * "compare" (/compare) ตัวกรองครบ หลายปีงบ และเปรียบเทียบตามมิติ (#206)
   *
   * โค้ดชุดเดียวกัน เพราะตัวเลขทั้งสองหน้าต้องมาจากแถวชุดเดียวกันด้วยกฎเดียวกัน — สองหน้าที่คำนวณ
   * แยกกันคือที่มาของ "ภาพรวมบอกอย่าง หน้าเทียบบอกอีกอย่าง"
   */
  mode: { type: String, default: 'overview' },
});
const isOverview = props.mode === 'overview';
const viewOptions = { defaultBy: DEFAULT_BY[props.mode], dimensions: PAGE_DIMENSIONS[props.mode] };

const route = useRoute();
const router = useRouter();

const view = ref(viewFromQuery(route.query, viewOptions));
const detailOpen = ref(false);
const detailScope = ref(null);
const detailGroup = ref('department');
const exportBusy = ref(false);
const exportError = ref('');
const scopeNotice = ref('');

/* --------------------------------------------------------------------------
   สถานะ ↔ URL — เขียนที่เดียว อ่านที่เดียว
   -------------------------------------------------------------------------- */

/** ชื่อพารามิเตอร์ของมุมมองเดิมที่ไม่มีความหมายแล้ว — ต้องถูกล้างออก ไม่ใช่ค้างใน URL */
const LEGACY_QUERY_KEYS = ['items', 'scope', 'scopeItem', 'view', 'dir', 'n', 'type', 'groups', 'level', 'basis', 'ref', 'base', 'metric', 'tab', 'floor'];
const OWNED = new Set([...VIEW_QUERY_KEYS, ...LEGACY_QUERY_KEYS]);
/** ค่าที่ไม่ใช่ของหน้านี้ (เช่น ?fy= ของทั้งแอป) ต้องรอดจากการเขียนทับทุกครั้ง */
const externalQuery = (query) => Object.fromEntries(Object.entries(query).filter(([key]) => !OWNED.has(key)));

let applyingFromRoute = false;
function writeQuery(value) {
  router.replace({ query: { ...externalQuery(route.query), ...viewToQuery(value, viewOptions) } });
}
// flush 'sync' เพราะ watcher ของอีกฝั่งต้องไม่รันหลังธงถูกปลดไปแล้ว
watch(view, (value) => {
  if (applyingFromRoute) return;
  writeQuery(value);
}, { deep: true, flush: 'sync' });

watch(() => route.query, (query) => {
  const next = viewFromQuery(query, viewOptions);
  if (JSON.stringify(next) !== JSON.stringify(view.value)) {
    applyingFromRoute = true;
    view.value = next;
    applyingFromRoute = false;
  }
  canonicalize(query, next);
});

/** ลิงก์เก่า ค่าที่ไม่รู้จัก และค่าซ้ำ ถูกเขียนกลับให้ URL ตรงกับสิ่งที่หน้าใช้จริง */
function canonicalize(query, value) {
  const wanted = viewToQuery(value, viewOptions);
  const drifted = VIEW_QUERY_KEYS.some((key) => String(query[key] ?? '') !== String(wanted[key] ?? ''))
    || LEGACY_QUERY_KEYS.some((key) => query[key] !== undefined);
  if (drifted) writeQuery(value);
}
canonicalize(route.query, view.value);

/* --------------------------------------------------------------------------
   ปีงบและช่วงเวลา
   -------------------------------------------------------------------------- */

/**
 * ปีงบที่เลือกอยู่ — ไม่ได้ระบุ = ปีงบของทั้งแอป (แถบบนสุด)
 *
 * ปีที่ใหม่ที่สุดที่เลือกคือ "ปีงบหลัก" และต้องเป็นตัวเดียวกับที่แถบบนสุดแสดงเสมอ
 * ไม่งั้นหน้าเดียวจะมีปีงบสองความหมายให้ผู้ใช้เดา
 */
const activeYear = computed(() => (activeFiscalYear.value ? String(activeFiscalYear.value.year) : ''));
const selectedYears = computed(() => {
  const years = view.value.years.length ? view.value.years : [activeYear.value].filter(Boolean);
  return [...new Set(years)].sort();
});
const { data: readingMonths } = useReadingMonths();
const yearOptions = computed(() => yearComparisonOptions(fiscalYearState.list, activeFiscalYear.value?.year, { dataMonths: readingMonths.value }));

let reconcilingYears = false;
async function chooseYears(years) {
  let next = [...new Set(years.map(String))].sort().slice(-MAX_YEARS);
  // "ล้างทั้งหมด" หรือเอาทุกปีออก = กลับไปดูปีงบหลักปีเดียว (#204) — เดิม return เฉยๆ ปุ่มล้างจึงไม่ทำอะไรเลย
  if (!next.length) {
    view.value = { ...view.value, years: [] };
    return;
  }
  // ปีงบหลักต้องมีอยู่จริงในระบบถึงจะสลับไปได้ ส่วนปีที่เอามาเทียบเป็นปีที่เคยนำเข้ายอด
  // ย้อนหลังไว้แต่ยังไม่ได้ตั้งเป็นปีงบในระบบก็ได้ (ช่วงเดือนของปีนั้นคำนวณจากกฎ ต.ค.–ก.ย.)
  const record = [...next].reverse()
    .map((year) => fiscalYearState.list.find((item) => String(item.year) === year))
    .find(Boolean);
  if (!record) {
    // ไม่มีปีไหนที่เลือกไว้เป็นปีงบในระบบเลย ปีงบหลักจึงสลับไปไม่ได้ — คงไว้ในชุด
    // ไม่งั้นแถบบนสุดกับตัวกรองของหน้าจะเป็นคนละปี ซึ่งคือสิ่งที่งานนี้ตั้งใจกำจัด
    if (!activeYear.value) return;
    next = [...new Set([...next, activeYear.value])].sort().slice(-MAX_YEARS);
  }

  const nextView = { ...view.value, years: next.length > 1 ? next : [] };
  if (record && record.id !== fiscalYearState.activeId) {
    // ด่านของปีงบยับยั้งได้ (เช่นมีฟอร์มที่ยังไม่บันทึกค้างอยู่) — ถูกยับยั้งแล้วตัวกรองต้องไม่เปลี่ยนตาม
    // เขียน fy + มุมมองเป็น navigation เดียว ไม่เปิดช่องให้ watcher อีกตัวหยิบ fy เก่ามาทับ
    const query = { ...externalQuery(route.query), ...viewToQuery(nextView, viewOptions), fy: record.id };
    if (!(await setActiveFiscalYear(record.id, { query }))) return;
  }
  // vue-router คืน NavigationFailure แบบ resolved promise ได้เมื่อ navigation ก่อนหน้าถูกแทนที่
  // ยืนยัน URL หลัง state เปลี่ยนแล้วอีกครั้ง เพื่อไม่ให้แถบบนเป็นปีใหม่แต่ลิงก์ยังเก็บ fy เก่า
  if (record && String(route.query.fy ?? '') !== String(record.id)) {
    await router.replace({ query: { ...externalQuery(route.query), ...viewToQuery(nextView, viewOptions), fy: record.id } });
  }
  view.value = nextView;
}

/*
 * URL, page memory และ Back/Forward ต้องผ่าน normalization เดียวกับการเลือกใน UI
 * ไม่งั้น ?years= อาจชี้ปีหนึ่ง แต่แถบบน/PeriodPicker ยังใช้อีกปี แล้วล้างเดือนที่ถูกต้องทิ้ง
 */
watch(
  [() => view.value.years.join(), () => fiscalYearState.list.map((item) => `${item.id}:${item.year}`).join()],
  async () => {
    if (!view.value.years.length || reconcilingYears) return;
    reconcilingYears = true;
    try { await chooseYears(view.value.years); }
    finally { reconcilingYears = false; }
  },
  { immediate: true },
);

const primaryMonths = computed(() => (activeFiscalYearRange.value ? fiscalYearMonths(activeFiscalYearRange.value) : []));
/*
 * เดือนที่เคยมีข้อมูลจริงทุกปี — ใช้จำกัดตัวเลือกของ PeriodPicker เท่านั้น ไม่ใช่ตัวกรองของกราฟ
 *
 * ตัวเลือกยึดเดือนของ "ปีงบหลัก" เพราะช่องเลือกเดือนแสดงได้ทีละปีงบ เดือนที่มีข้อมูล
 * เฉพาะปีที่เอามาเทียบ (ไม่ใช่ปีหลัก) จึงยังเลือกไม่ได้ — เป็นข้อจำกัดที่ยอมรับไว้
 * แทนการทำช่องเลือกเดือนที่ต้องอธิบายว่าเดือนนี้มีข้อมูลของปีไหนบ้าง
 */
const monthOptions = computed(() => {
  const months = new Set(readingMonths.value ?? []);
  return primaryMonths.value.filter((month) => months.has(month));
});

/*
 * เดือนที่เลือกไว้เป็นของปีงบหลัก — ปีงบเปลี่ยนเมื่อไร เดือนที่ค้างอยู่ใช้ต่อไม่ได้
 * ล้างทิ้งแทนที่จะปล่อยให้ตัวเลขเป็นของช่วงที่ไม่มีใครเลือก
 */
const primaryYearPending = computed(() => {
  const requested = view.value.years.at(-1);
  if (!requested) return false;
  if (!fiscalYearState.list.length) return true;
  const record = fiscalYearState.list.find((item) => String(item.year) === requested);
  return Boolean(record && record.id !== fiscalYearState.activeId);
});

watch([primaryMonths, () => view.value.months.join(), primaryYearPending], ([months, , pending]) => {
  if (pending || !months.length || !view.value.months.length) return;
  const inRange = view.value.months.filter((month) => months.includes(month));
  if (inRange.length !== view.value.months.length) {
    view.value = { ...view.value, months: inRange };
    // ถ้าการแก้นี้เกิดกลาง route→view sync ผู้เขียน URL ถูกกันไว้ชั่วคราว
    // เขียน canonical URL หลังธงถูกปลด เพื่อให้ลิงก์ไม่ค้างค่าที่หน้าไม่ได้ใช้จริง
    if (applyingFromRoute) queueMicrotask(() => canonicalize(route.query, view.value));
  }
}, { immediate: true, flush: 'sync' });

const requestMonths = computed(() => requestedMonths(view.value, selectedYears.value));
const monthParam = computed(() => requestMonths.value.join(',') || undefined);
/*
 * ช่วงเวลาเป็นภาษาคน
 *
 * ปีงบเดียวเขียนเดือนพร้อมปีได้ตรงๆ แต่หลายปีงบเขียนแบบนั้นจะชี้ผิด เพราะเดือนที่เลือก
 * หมายถึงตำแหน่งเดือนของทุกปีที่เลือก ไม่ใช่เดือนของปีหลักปีเดียว — จึงเขียนเป็นชื่อ
 * เดือนล้วน แล้วให้ชื่อปีงบอยู่ในบรรทัดเดียวกันก่อนหน้า
 */
const periodText = computed(() => {
  const months = view.value.months;
  if (selectedYears.value.length > 1) {
    return months.length
      ? months.map((month) => monthText(fiscalPosition(month))).join(', ')
      : t('ทุกเดือนของปีงบที่เลือก');
  }
  return months.length ? periodLabel(months) : t('ทั้งปีงบ ({0})', [periodLabel(primaryMonths.value)]);
});
const yearsText = computed(() => selectedYears.value.map((year) => t('ปีงบ {0}', [yearLabel(year)])).join(', '));

/* --------------------------------------------------------------------------
   ข้อมูล
   -------------------------------------------------------------------------- */
const report = useMonthlyKpi(computed(() => ({ month: monthParam.value })));
const divisions = useDivisions();
const departments = useDepartments();
const contracts = useContracts();
const buildings = useBuildings();

const loading = computed(() => report.isPending.value || report.isPlaceholderData.value);
const failed = computed(() => report.isError.value);
const ready = computed(() => !loading.value && !failed.value);

// ห้ามแสดงข้อมูลของช่วงเดิมใต้ชื่อช่วงที่เพิ่งเลือก — ระหว่างโหลดจึงเป็นแถวว่างเสมอ
const wanted = computed(() => new Set(requestMonths.value));
const rawRows = computed(() => {
  if (loading.value || report.isError.value) return [];
  const rows = report.data.value || [];
  // ยังไม่รู้ปีงบ (ยังไม่มีใครตั้งไว้) = ไม่ได้ขอเดือนไหนเป็นพิเศษ จึงใช้ทุกแถวที่ API ส่งมา
  // ไม่ใช่คัดทิ้งทั้งหมดจนหน้าว่างโดยไม่มีคำอธิบาย
  return requestMonths.value.length ? rows.filter((row) => wanted.value.has(row.month)) : rows;
});
const rows = computed(() => filterRows(rawRows.value, view.value));

// รอคำตอบของช่วงใหม่ก่อนตรวจ; แถวของช่วงเก่าที่ cache ค้างอยู่ห้ามใช้ตัดตัวกรอง
//
// ผูกกับ "ปีที่รอตรวจ" ไม่ใช่ธงเปิด/ปิด และดู activeYear ด้วย — ถ้าข้อมูลของปีใหม่อยู่ใน cache แล้ว (เปิดปีนั้น
// มาก่อน หรือการ์ดเทียบปีก่อนเพิ่งโหลดเดือนชุดเดียวกัน #197) ready กับแถวเปลี่ยนก่อนที่ธงจะถูกตั้ง
// แล้วตัวกรองที่ไม่มีข้อมูลค้างอยู่เงียบๆ
let pruneForYear = null;
watch(activeYear, (year, previous) => {
  if (previous && year !== previous) {
    pruneForYear = year;
    scopeNotice.value = '';
  }
});
watch([ready, rawRows, activeYear], ([isReady, currentRows, year]) => {
  if (pruneForYear === null || year !== pruneForYear || !isReady) return;
  pruneForYear = null;
  const result = pruneUnavailableScopes(view.value, currentRows);
  if (!result.removed.length) return;
  view.value = result.view;
  const labels = { divisions: t('ฝ่าย'), departments: t('แผนก'), contracts: t('สัญญา'), buildings: t('อาคาร'), devices: t('เครื่อง') };
  const removedText = result.removed.flatMap(({ key, values }) => {
    const names = new Map((scopeOptions.value[key] ?? []).map((option) => [String(option.value), option.label]));
    return values.map((value) => `${labels[key]}: ${names.get(String(value)) ?? value}`);
  }).join(', ');
  scopeNotice.value = t('เปลี่ยนปีงบแล้ว: นำตัวกรองที่ไม่มีข้อมูลออก ({0})', [removedText]);
});

const references = computed(() => ({
  divisions: divisions.data.value ?? [],
  departments: departments.data.value ?? [],
  contracts: contracts.data.value ?? [],
  buildings: buildings.data.value ?? [],
}));
/** ตัวเลือกของตัวกรองมาจากข้อมูลอ้างอิงทั้งหมด ไม่ใช่จากแถวที่กรองแล้ว — ไม่งั้นเลือกเพิ่มไม่ได้ */
const scopeOptions = computed(() => Object.fromEntries(
  [['divisions', 'division'], ['departments', 'department'], ['contracts', 'contract'], ['buildings', 'building'], ['devices', 'device']]
    .map(([key, dimension]) => [key, itemOptions(dimension, references.value, rawRows.value)])
));

/* --------------------------------------------------------------------------
   แบบจำลองที่กราฟ ตาราง และไฟล์ใช้ร่วมกัน
   -------------------------------------------------------------------------- */
const yearMode = computed(() => view.value.by === 'fiscalYear');

const model = computed(() => (yearMode.value
  ? buildYearComparison({
    rows: rows.value,
    years: selectedYears.value,
    metric: view.value.metric,
    positions: view.value.months.map(fiscalPosition).filter(Boolean),
  })
  : buildComparison({
    rows: rows.value,
    dimension: view.value.by,
    metric: view.value.metric,
    options: scopeOptions.value[`${view.value.by}s`] ?? [],
    include: selectedKeysFor(view.value, view.value.by),
  })));

const noun = computed(() => dimensionLabel(view.value.by));
const metricText = computed(() => `${metricLabel(model.value.metric)} (${metricUnit(model.value.metric)})`);

/**
 * ตัวกรองที่ใช้อยู่ เขียนเป็นภาษาคน — ใช้ทั้งคำอธิบายบนหน้าและแผ่น "เงื่อนไขรายงาน"
 *
 * ต้นทางเดียวกันทั้งสองที่ ไม่งั้นไฟล์ที่ส่งออกจะอ้างขอบเขตคนละอย่างกับที่คนเห็นบนจอ
 */
const FILTER_LABELS = { divisions: t('ฝ่าย'), departments: t('แผนก'), contracts: t('สัญญา'), buildings: t('อาคาร'), devices: t('เครื่อง') };
const activeFilters = computed(() => SCOPE_KEYS.flatMap((key) => {
  const values = view.value[key];
  if (!values.length) return [];
  const names = new Map((scopeOptions.value[key] ?? []).map((option) => [String(option.value), option.label]));
  return [{ key, label: FILTER_LABELS[key], values, text: values.map((value) => names.get(String(value)) ?? value).join(', ') }];
}));
const scopeCaption = computed(() => {
  const active = activeFilters.value;
  if (!active.length) return t('ทุกหน่วยงาน');
  const total = active.reduce((count, filter) => count + filter.values.length, 0);
  // เขียนชื่อออกมาตรงๆ เมื่อยังสั้นพอ เพราะ "ตัวกรอง 2 รายการ" ไม่ได้บอกว่ากรองอะไรไว้
  return total <= 3 ? active.map((filter) => `${filter.label}: ${filter.text}`).join(' · ') : t('ตัวกรอง {0} รายการ', [formatCount(total)]);
});
const scopeText = computed(() => [yearsText.value, periodText.value, scopeCaption.value, metricText.value].join(' · '));

/* --------------------------------------------------------------------------
   ตัวเลขสำคัญ — ขอบเขตเดียวกับกราฟ ตาราง และไฟล์ เพราะอ่านจาก rows ชุดเดียวกัน
   -------------------------------------------------------------------------- */
const money = (value) => (value == null ? '—' : formatBahtValue(value));
const totals = computed(() => summarize(rows.value));
// ระหว่างเปลี่ยนช่วง คงตัวเลขพร้อมคำอธิบายเดิมไว้ด้วยกัน ไม่ติดหัวข้อใหม่บนยอดเก่า
const stats = computed(() => ({
  totals: totals.value,
  caption: t('ตัวเลขของ {0} · {1} · {2}', [scopeCaption.value, yearsText.value, periodText.value]),
}));
const settledStats = ref(null);
watch([stats, ready], ([value, isReady]) => { if (isReady) settledStats.value = value; }, { immediate: true });
const shownStats = computed(() => (loading.value && settledStats.value ? settledStats.value : stats.value));
const statsReady = computed(() => ready.value || (loading.value && Boolean(settledStats.value)));

/* --------------------------------------------------------------------------
   การ์ดตัวเลขหลักและอันดับ (#197) — เทียบกับเดือนเดียวกันของปีงบก่อน ตัวกรองเดียวกัน
   -------------------------------------------------------------------------- */
// เทียบได้เมื่อดูปีงบเดียว — หลายปีงบในจอเดียวคือการเปรียบเทียบอยู่แล้ว (มุมมอง "ปีงบ")
const previousMonths = computed(() => (selectedYears.value.length === 1 ? previousYearMonths(requestMonths.value) : []));
const previousReport = useMonthlyKpi(computed(() => ({ month: previousMonths.value.join(',') || undefined })), { enabled: computed(() => previousMonths.value.length > 0) });
const previousRows = computed(() => {
  if (!previousMonths.value.length || previousReport.isPending.value || previousReport.isPlaceholderData.value || previousReport.isError.value) return null;
  const wantedPrevious = new Set(previousMonths.value);
  return filterRows((previousReport.data.value || []).filter((row) => wantedPrevious.has(row.month)), view.value);
});
const kpi = computed(() => dashboardKpis({ rows: rows.value, previousRows: previousRows.value, months: requestMonths.value }));
const previousYearText = computed(() => (activeYear.value ? yearLabel(Number(activeYear.value) - 1) : ''));
const compareHint = computed(() => {
  if (selectedYears.value.length > 1) return '';
  return kpi.value.comparable ? t('เทียบช่วงเดียวกันปีงบ {0}', [previousYearText.value]) : t('ยังไม่มีข้อมูลปีก่อนให้เทียบ');
});
const unitText = computed(() => (view.value.metric === 'cost' ? t('บาท') : t('หน้า')));
const formatMetric = (value) => (view.value.metric === 'cost' ? money(value) : formatCount(value));
const topDivisions = computed(() => topShare(buildComparison({ rows: rows.value, dimension: 'division', metric: view.value.metric, options: scopeOptions.value.divisions ?? [] }), { metric: view.value.metric }));
const topDevices = computed(() => topShare(buildComparison({ rows: rows.value, dimension: 'device', metric: view.value.metric, options: scopeOptions.value.devices ?? [] }), { metric: view.value.metric }));
/** ไปหน้าเปรียบเทียบด้วยขอบเขตเดียวกับที่ดูอยู่ (ปีงบ ช่วงเวลา สัญญา) */
function compareQuery(dimension) {
  return { ...externalQuery(route.query), ...viewToQuery({ ...view.value, by: dimension }, { defaultBy: DEFAULT_BY.compare }) };
}
function compareBy(dimension) {
  if (isOverview) router.push({ path: '/compare', query: compareQuery(dimension) });
  else view.value = { ...view.value, by: dimension };
}

/* กราฟสองกราฟของหน้าภาพรวม (#206) — แถวชุดเดียวกับการ์ดตัวเลข */
const costTrend = computed(() => buildComparison({ rows: rows.value, dimension: 'overall', metric: 'cost' }));
const pagesTrend = computed(() => buildComparison({ rows: rows.value, dimension: 'overall', metric: 'rawPages' }));
const trendCaption = computed(() => [yearsText.value, periodText.value, scopeCaption.value].join(' · '));
const fiscalYearLabel = computed(() => (activeYear.value ? yearLabel(activeYear.value) : ''));

const settledTable = ref(null);
watch([model, periodText, ready], ([value, period, isReady]) => {
  if (isReady) settledTable.value = { model: value, description: `${comparisonTitle(value)} · ${period}` };
}, { immediate: true });
const tableView = computed(() => (loading.value && settledTable.value
  ? settledTable.value : { model: model.value, description: `${comparisonTitle(model.value)} · ${periodText.value}` }));

/* --------------------------------------------------------------------------
   รายละเอียดรายเครื่อง — ลิ้นชักในหน้าเดิม ไม่เปลี่ยนเส้นทาง
   -------------------------------------------------------------------------- */
/** แถวที่ส่งออกและเจาะดู — โหมดปีงบใช้แถวที่ย้ายมาอยู่บนแกนเดือนของปีงบแล้ว */
const exportRows = computed(() => (yearMode.value
  ? yearRows(rows.value, selectedYears.value).filter((row) => model.value.months.includes(row.month))
  : rows.value));
const detailRows = computed(() => exportRows.value.map((row) => (row.calendar_month ? { ...row, month: row.calendar_month } : row)));

watch(monthParam, () => { detailOpen.value = false; exportError.value = ''; });

function openDetails(group = 'department', entry = null) {
  if (!ready.value || !rows.value.length) return;
  detailScope.value = entry
    ? { dimension: model.value.view === 'overall' ? 'month' : view.value.by, key: entry.key, label: entry.displayLabel }
    : null;
  detailGroup.value = entry ? 'device' : (yearMode.value ? 'fiscalYear' : group);
  detailOpen.value = true;
}
function reload() { report.refetch(); }

/* --------------------------------------------------------------------------
   ส่งออก — Excel เป็นรายงาน CSV เป็นข้อมูลดิบ ทั้งคู่ใช้ตัวกรองชุดเดียวกับจอ
   -------------------------------------------------------------------------- */
const blockedReason = computed(() => {
  if (!ready.value) return t('รอข้อมูลโหลดเสร็จ');
  if (!exportRows.value.length) return t('ยังไม่มีการพิมพ์ในขอบเขตที่เลือก');
  return '';
});

function filenameFor(kind) {
  return exportFilename([
    kind === 'csv' ? 'print-usage-data' : 'print-usage-report',
    `fy${selectedYears.value.join('_') || 'all'}`,
    monthsSlug(view.value.months, primaryMonths.value),
    view.value.by,
    view.value.metric === 'rawPages' ? 'pages' : 'cost',
  ]);
}

function conditions(m, includedRows) {
  const ranking = m.ranking && !m.ranking.blocked
    ? t('ทุก{0} {1} รายการ เรียงตาม{2}จากมากไปน้อย (แผ่น “อันดับ”)', [noun.value, formatCount(m.ranking.from), metricLabel(m.metric)])
    : '';
  return [
    [t('ปีงบประมาณ'), yearsText.value],
    [t('ช่วงเวลา'), periodText.value],
    ...(yearMode.value
      ? [[t('เดือนของปีงบบนแกน'), m.months.map((month) => monthText(month)).join(', ') || t('ไม่มี')]]
      : [[t('เดือนที่มีข้อมูล'), periodLabel(m.months) || t('ไม่มี')]]),
    ...activeFilters.value.map((filter) => [filter.label, filter.text]),
    [t('เปรียบเทียบตาม'), dimensionLabel(m.dimension)],
    [t('ตัวเลขที่ดู'), metricText.value],
    ...(m.hidden ? [[t('กลุ่มที่อยู่บนกราฟ'), t('{0} จาก {1} รายการที่สูงสุด — ตารางและแผ่นอื่นมีครบ', [formatCount(m.chartEntries.length), formatCount(m.entries.length)])]] : []),
    ...(ranking ? [[t('อันดับ'), ranking]] : []),
    [t('จำนวนรายการ'), formatCount(includedRows.length)],
    [t('จำนวนเครื่องที่มีข้อมูล'), formatCount(summarize(includedRows).devices)],
    ...standardNotes(),
  ];
}

async function runExcel() {
  if (blockedReason.value) return;
  exportBusy.value = true;
  exportError.value = '';
  // จับแบบจำลองชุดเดียวไว้ก่อน await — เปลี่ยนตัวเลือกระหว่างสร้างไฟล์แล้วไฟล์ยังเป็นชุดที่กด
  const m = model.value;
  const includedRows = exportRows.value;
  const filename = filenameFor('excel');
  const ranking = rankingSheet(m);
  try {
    await saveWorkbook(filename, [
      summarySheet(includedRows),
      monthlySheet(includedRows),
      comparisonSheet(m),
      ...(ranking ? [ranking] : []),
      detailSheet(includedRows),
      conditionsSheet(filename, conditions(m, includedRows)),
    ]);
  } catch (error) { exportError.value = errorMessage(error, t('ส่งออกไม่สำเร็จ')); }
  finally { exportBusy.value = false; }
}

function runCsv() {
  if (blockedReason.value) return;
  exportError.value = '';
  try { downloadCsv(`${filenameFor('csv')}.csv`, dashboardCsv(detailRows.value)); }
  catch (error) { exportError.value = errorMessage(error, t('ส่งออกไม่สำเร็จ')); }
}
</script>

<template>
  <div class="w-full min-w-0 max-w-[calc(100vw-2rem)] overflow-x-clip">
    <UiPageHeader :title="isOverview ? t('ภาพรวมการพิมพ์') : t('เปรียบเทียบการพิมพ์')">
      <template #actions>
        <UiButton variant="ghost" icon-only :label="t('โหลดข้อมูลใหม่')" :loading="report.isFetching.value" @click="reload">
          <RefreshCw :size="16" />
        </UiButton>
        <UiButton v-if="isOverview" variant="secondary" :to="{ path: '/compare', query: compareQuery(DEFAULT_BY.compare) }">
          <template #icon><GitCompareArrows :size="16" /></template>{{ t('เปรียบเทียบ') }}
        </UiButton>
        <UiButton variant="secondary" :disabled="!ready || !rows.length" @click="openDetails()">
          <template #icon><PanelRightOpen :size="16" /></template>{{ t('ดูรายละเอียด') }}
        </UiButton>
        <!-- ส่งออกทั้งขอบเขตที่ตัวกรองเลือกไว้ ไม่ใช่เฉพาะสิ่งที่กราฟวาด จึงเป็นปุ่มของหน้า
             ไม่ใช่ปุ่มของการ์ดกราฟ -->
        <ExportMenu :disabled="Boolean(blockedReason)" :reason="blockedReason" :busy="exportBusy" @excel="runExcel" @csv="runCsv" />
      </template>
    </UiPageHeader>

    <DashboardFilters
      :model-value="view" :options="scopeOptions" :year-options="yearOptions" :selected-years="selectedYears" :month-options="monthOptions"
      :variant="mode" :fiscal-year-label="fiscalYearLabel"
      @update:model-value="(next) => (view = next)" @update:years="chooseYears" />

    <UiAlert v-if="failed" tone="danger" class="mb-4">
      {{ errorMessage(report.error.value, t('โหลดภาพรวมไม่สำเร็จ')) }}
      <template #actions><UiButton variant="secondary" @click="reload">{{ t('ลองใหม่') }}</UiButton></template>
    </UiAlert>
    <UiAlert v-if="scopeNotice" tone="info" class="mb-4">{{ scopeNotice }}</UiAlert>
    <UiAlert v-if="exportError" tone="danger" class="mb-4">{{ exportError }}</UiAlert>

    <p class="text-xs text-ink-mute mb-1.5">{{ shownStats.caption }}</p>
    <section class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4" :aria-label="t('สรุปตัวเลขสำคัญ')" :aria-busy="loading" :class="loading && settledStats && 'opacity-45'">
      <UiStat emphasis :label="t('ค่าใช้จ่าย')" :value="failed ? '—' : money(shownStats.totals.cost)" :unit="t('บาท')" :loading="loading && !settledStats"
        :delta="kpi.cost.delta" delta-inverse :hint="compareHint" :trend="kpi.cost.trend" />
      <UiStat tone="ink" :label="t('ยอดพิมพ์')" :value="statsReady ? formatCount(shownStats.totals.rawPages) : '—'" :unit="t('หน้า')" :loading="loading && !settledStats"
        :delta="kpi.pages.delta" delta-inverse :hint="statsReady ? t('หลังหัก 2% เหลือ {0} หน้า', [formatNetPages(shownStats.totals.netPages)]) : ''" :trend="kpi.pages.trend" />
      <UiStat tone="ink" :label="t('เฉลี่ยหน้าละ')" :value="kpi.perPage.value === null ? '—' : formatBahtValue(kpi.perPage.value)" :unit="t('บาท')" :loading="loading && !settledStats"
        :delta="kpi.perPage.delta" delta-inverse :hint="t('ค่าใช้จ่าย ÷ ยอดพิมพ์หลังหัก 2%')" />
      <UiStat tone="ink" :label="t('เครื่องที่มีการพิมพ์')" :value="statsReady ? formatCount(shownStats.totals.devices) : '—'" :unit="t('เครื่อง')" :loading="loading && !settledStats" />
    </section>
    <!-- ค่าใช้จ่ายที่นี่ไม่เท่ายอดตามใบแจ้งหนี้โดยตั้งใจ — บอกส่วนที่ขาด ไม่ให้ดูเหมือนข้อมูลหลุดจากหน้าค่าใช้จ่าย (#208) -->
    <p class="text-xs text-ink-mute -mt-2 mb-4" data-testid="cost-scope-note">
      {{ t('ค่าใช้จ่าย = ค่าพิมพ์จากยอดพิมพ์หลังหัก 2% ยังไม่รวมค่าเช่าคงที่และ VAT') }}
      · <RouterLink :to="{ path: '/expense', query: { fy: route.query.fy } }" class="underline hover:text-ink">{{ t('ดูยอดตามใบแจ้งหนี้') }}</RouterLink>
    </p>

    <template v-if="isOverview">
      <OverviewTrend :cost="costTrend" :pages="pagesTrend" :loading="loading" :failed="failed" :scope-text="trendCaption"
        @details="(entry) => openDetails('device', entry)" />

      <div class="grid grid-cols-1 lg:grid-cols-2 items-start gap-3 mb-4">
        <TopShareCard :title="t('ฝ่ายที่ใช้มากที่สุด ({0})', [unitText])" :data="topDivisions" :format="formatMetric" :loading="loading && !settledStats"
          :more-label="t('เทียบทุกฝ่าย')" @more="compareBy('division')" />
        <TopShareCard :title="t('เครื่องที่ใช้มากที่สุด ({0})', [unitText])" :data="topDevices" :format="formatMetric" :loading="loading && !settledStats"
          :more-label="t('เทียบทุกเครื่อง')" @more="compareBy('device')" />
      </div>
    </template>

    <template v-else>
      <PrintComparison v-model:state="view" :model="model" :loading="loading" :failed="failed" :scope-text="scopeText"
        :dimensions="PAGE_DIMENSIONS.compare" @details="(entry) => openDetails('device', entry)" />

      <ComparisonTable class="mb-4" :model="tableView.model" :loading="loading" :description="tableView.description"
        @details="(entry) => openDetails('device', entry)" />
    </template>

    <ExecutiveDetails v-model:open="detailOpen" :rows="detailRows" :scope="detailScope" :context="`${yearsText} · ${periodText}`" :initial-group="detailGroup" />
  </div>
</template>
