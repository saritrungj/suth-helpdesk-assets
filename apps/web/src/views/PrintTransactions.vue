<script setup>
import { reportContext } from "../components/report-context";
import { formatFiscalYearRange, formatMonth } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * PrintTransactions — บันทึกยอดพิมพ์รายเดือนของแต่ละเครื่อง
 *
 * เป็นหน้าที่เจ้าหน้าที่เปิดบ่อยที่สุดในระบบ และเป็นงานที่ทำซ้ำทุกเดือนกับเครื่อง
 * เป็นร้อยเครื่อง หน้านี้จึงถูกออกแบบรอบ "งานที่ยังไม่เสร็จ" ไม่ใช่รอบ "รายการ
 * ทั้งหมด"
 *
 *   - แถบความคืบหน้าด้านบนบอกทันทีว่าปีงบนี้กรอกครบไปแล้วกี่เครื่อง เหลืออีกเท่าไหร่
 *   - ปุ่ม "ยังกรอกไม่ครบ" กรองให้เหลือเฉพาะงานที่ค้างในคลิกเดียว
 *   - ในตารางมีแถบเล็กๆ บอกว่าเครื่องนั้นกรอกไปกี่เดือนแล้ว เห็นได้จากหางตา
 *     โดยไม่ต้องอ่านตัวเลข
 *
 * การกรอกทำในหน้าต่างเดียวจบทั้งปีงบ (12 ช่อง) ไม่ใช่ทีละเดือน เพราะข้อมูลมิเตอร์
 * มักถูกไล่เก็บย้อนหลังทีเดียวหลายเดือน
 *
 * ตอนบันทึกจะส่งครบทุกเดือนเสมอ รวมถึงเดือนที่ถูกลบจนว่าง เพราะฝั่ง API ต้องรู้ว่า
 * ให้ลบค่าที่เคยบันทึกไว้ทิ้ง ไม่ใช่แค่ไม่พูดถึงเดือนนั้น
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import { ChevronDown, CircleCheck, ClipboardList, ClipboardPaste, Pencil, Search, Undo2 } from "lucide-vue-next";

import api from "../services/api";
import { useQueryClient } from "@tanstack/vue-query";
import { invalidateAfterWrite } from "../api/invalidate";
import { authState } from "../store/auth";
import {
  activeFiscalYearRange,
  fiscalYearMonths,
  fiscalYearState,
  registerFiscalYearGuard,
} from "../store/fiscalYear";
import { toastError, toastSuccess } from "../store/toast";
import { createDraftGuard } from "../lib/draft-guard";
import { formatCount, percentOf } from "../lib/format";
import { errorMessage } from "../lib/api-error";
import { applyPaste, describePaste, parseNumbers } from "../lib/paste-numbers";
import { useCoverage, useMonthPages } from "../api/queries";
import MonthEntryGrid from "../components/MonthEntryGrid.vue";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiCombobox,
  UiDataTable,
  UiEmpty,
  UiField,
  UiFilterBar,
  UiInput,
  UiMeter,
  UiModal,
  UiPageHeader,
  UiSegmented,
  UiSelect,
  UiSkeleton,
  UiTooltip,
} from "../ui";

/**
 * ลิงก์เข้าหน้านี้แบบเจาะจงเดือน
 *
 * แถบ "สิ่งที่ต้องจัดการ" บนหน้าแรกส่ง ?month= ของเดือนที่ค้างนานที่สุดมาให้
 * เพื่อให้กดครั้งเดียวแล้วเห็นงานที่ต้องทำจริงๆ — ไม่ใช่พาไปหน้าเปล่าแล้วให้
 * ผู้ใช้ไล่หาเองว่าเดือนไหนที่ยังขาด ซึ่งเป็นข้อมูลที่หน้าแรกรู้อยู่แล้ว
 */
const route = useRoute();

const queryClient = useQueryClient();

/** viewer ดูได้อย่างเดียว — API บังคับด้วย staffMiddleware อยู่แล้ว ที่นี่แค่ไม่แสดงปุ่มที่กดไม่ได้ */
const canEdit = computed(() => authState.user?.role !== "viewer");

const loading = ref(true);
const workspace = ref(null);
const pageError = ref("");
const summaryError = ref("");
const summaryLoading = ref(true);
let summaryRequest = 0;

const devices = ref([]);
const filledSummary = ref({});

const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const brands = ref([]);

/**
 * โหมดการทำงานของหน้านี้
 *
 *   overview  ดูภาพรวมทั้งปีงบว่าเครื่องไหนกรอกครบแล้ว (ของเดิม)
 *   month     กรอกยอดของ "เดือนเดียว หลายเครื่อง" รวดเดียว (ตรงกับงานจริง)
 *
 * โหมด month ต้องเลือกเดือนก่อนเสมอ เพราะกรอกโดยไม่รู้ว่าเดือนไหนไม่มีความหมาย
 */
const mode = ref(canEdit.value ? "month" : "overview");
const yearExpanded = ref(false);
// Only the initial selection may be filled by coverage. User choices, including
// "all year", remain authoritative when a delayed response arrives.
const awaitingDefaultMonth = ref(!route.query.month);

const MODE_OPTIONS = [
  { value: "overview", label: t("ภาพรวมทั้งปี") },
  { value: "month", label: t("กรอกรายเดือน") },
];

const search = ref("");
const filters = ref({
  // เติมจาก query ตั้งแต่ตอนประกาศ ไม่รอ onMounted — ถ้ารอ หน้าจะโหลดรายการ
  // ของ "ทั้งปีงบ" รอบหนึ่งก่อนแล้วค่อยโหลดใหม่ตามเดือนที่ระบุ ซึ่งเป็นการยิง
  // คำขอทิ้งเปล่าและทำให้เห็นข้อมูลผิดแวบหนึ่ง
  month: typeof route.query.month === "string" ? route.query.month : "",
  building: typeof route.query.building === "string" ? route.query.building : "",
  floor: "",
  division: "",
  department: "",
  brand: "",
  deviceStatus: route.query.fill === "empty" ? "active" : "",
  fillStatus: route.query.fill === "empty" ? "none" : "",
});

const fiscalYearId = computed(() => fiscalYearState.activeId);

// ความครบถ้วนรายเดือนของทั้งปีงบ — ใช้เลือกเดือนตั้งต้นของโหมดกรอกรายเดือน
// และใช้ cache ก้อนเดียวกับหน้าแรก จึงไม่ยิงซ้ำเมื่อเปิดสลับกัน
const coverageQuery = useCoverage(fiscalYearId);
const { data: coverage, refetch: refetchCoverage } = coverageQuery;
const range = computed(() => activeFiscalYearRange.value);
const displayYearBE = computed(() => formatFiscalYearRange(range.value));
const fyMonths = computed(() => fiscalYearMonths(range.value));
const monthsPerYear = computed(() => fyMonths.value.length || 12);

const STATUS_META = {
  active: { label: t("ใช้งานอยู่"), tone: "ok" },
  repair: { label: t("ซ่อมบำรุง"), tone: "warn" },
  retired: { label: t("ปลดระวาง"), tone: "neutral" },
};

const DEVICE_STATUS_OPTIONS = [
  { value: "", label: t("ทุกสถานะ") },
  { value: "active", label: t("ใช้งานอยู่") },
  { value: "repair", label: t("ซ่อมบำรุง") },
  { value: "retired", label: t("ปลดระวาง") },
];

const FILL_STATUS_OPTIONS = [
  { value: "", label: t("ทั้งหมด") },
  { value: "none", label: t("ยังไม่กรอก") },
  { value: "partial", label: t("กรอกบางเดือน") },
  { value: "done", label: t("ครบแล้ว") },
];

const monthOptions = computed(() => [
  { value: "", label: t("ทั้งปีงบ") },
  ...fyMonths.value.map((m) => ({ value: m, label: formatMonth(m, { long: true }) })),
]);

/* --------------------------------------------------------------------------
   โหลดข้อมูล
   -------------------------------------------------------------------------- */
async function loadDevices() {
  const res = await api.get("/devices");
  devices.value = res.data ?? [];
}

async function loadMasterData() {
  try {
    const [building, floor, division, department, brand] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
      api.get("/brands"),
    ]);

    buildings.value = building.data ?? [];
    floors.value = floor.data ?? [];
    divisions.value = division.data ?? [];
    departments.value = department.data ?? [];
    brands.value = brand.data ?? [];
  } catch (err) {
    console.error("Load master data error:", err);
  }
}

async function loadSummary() {
  const request = ++summaryRequest;
  summaryError.value = "";
  summaryLoading.value = true;
  if (!fiscalYearId.value) {
    filledSummary.value = {};
    summaryLoading.value = false;
    return;
  }

  try {
    const res = await api.get("/print-transactions/summary", {
      params: { fiscal_year_id: fiscalYearId.value },
    });
    if (request !== summaryRequest) return;

    filledSummary.value = Object.fromEntries(
      (res.data ?? []).map((r) => [
        r.device_id,
        {
          filled: Number(r.filled || 0),
          totalPages: Number(r.total_pages || 0),
          latestMonth: r.latest_month || null,
          latestPages: Number(r.latest_pages || 0),
        },
      ])
    );
  } catch (err) {
    if (request === summaryRequest) summaryError.value = t("โหลดความคืบหน้าปีไม่สำเร็จ");
  } finally {
    if (request === summaryRequest) summaryLoading.value = false;
  }
}

/**
 * ยอดของเดือนที่กำลังดู/กรอก และของเดือนก่อนหน้า — ผูกกับ key ตามเดือน
 *
 * เดิมเป็น `loadMonthPages()` ที่เขียนผลลง ref ก้อนเดียวโดยไม่ตรวจว่าคำตอบที่มา
 * เป็นของเดือนที่เลือกอยู่หรือเปล่า เลือก ก.ค. แล้วรีบเปลี่ยนเป็น ส.ค. ถ้าคำตอบ
 * ของ ก.ค. มาช้ากว่า ยอด ก.ค. จะไปแสดงใต้หัวข้อ ส.ค. แล้วถ้าผู้ใช้กดบันทึกตอนนั้น
 * ตัวเลขของเดือนหนึ่งจะถูกเขียนทับลงอีกเดือนหนึ่งจริงๆ
 *
 * และการโหลดล้มเหลวเคยถูกกลืนเป็น `{}` ซึ่งหน้าตาเหมือน "เดือนนี้ยังไม่มีใครกรอก"
 * ทั้งที่จริงคือ "ยังไม่รู้" — ผู้ใช้จะกรอกทับของเดิมโดยไม่รู้ตัว
 */
const monthPagesQuery = useMonthPages(computed(() => filters.value.month));

const previousMonth = computed(() => {
  const index = fyMonths.value.indexOf(filters.value.month);
  return index > 0 ? fyMonths.value[index - 1] : "";
});

const previousPagesQuery = useMonthPages(previousMonth);

/** แปลงรายการที่ API คืนมาเป็น { [deviceId]: pages } */
function pagesByDevice(rows) {
  return Object.fromEntries((rows ?? []).map((row) => [row.device_id, Number(row.pages || 0)]));
}

const monthPages = computed(() => pagesByDevice(monthPagesQuery.data.value));
const previousPages = computed(() => pagesByDevice(previousPagesQuery.data.value));

/** ยอดของเดือนที่เลือกโหลดสำเร็จแล้วหรือยัง — ใช้กันไม่ให้กรอกทับข้อมูลที่ยังไม่รู้ */
const monthPagesReady = computed(
  () => !filters.value.month || (monthPagesQuery.isSuccess.value && !monthPagesQuery.isFetching.value)
);

const monthPagesError = computed(() =>
  monthPagesQuery.isError.value
    ? errorMessage(monthPagesQuery.error.value, t("โหลดยอดพิมพ์ของเดือนนี้ไม่สำเร็จ"))
    : ""
);

function previousMonthLabel(deviceId) {
  const value = previousPages.value[deviceId];
  return value === undefined ? "—" : formatCount(value);
}

/** อ้างอิงถึงตารางกรอก — ใช้สั่งล้าง draft หลังผู้ใช้ยืนยันแล้ว */
const entryGrid = ref(null);

/** ตารางกรอกมีของแก้ค้างกี่รายการ — ตัวตารางเป็นคนบอกมา */
const monthDirty = ref(false);
const monthDirtyCount = ref(0);

function onDirtyChange(count) {
  monthDirtyCount.value = count;
  monthDirty.value = count > 0;
}

/**
 * ด่านเดียวที่ทุกเส้นทาง "ทำให้ตารางกรอกหายไปจากหน้าจอ" ต้องผ่าน
 *
 * ตัวนับของแก้ค้างส่งเป็น 0 เมื่อไม่ได้อยู่โหมดกรอก เพื่อไม่ให้ถามในสถานการณ์ที่
 * ไม่มีอะไรจะหาย — ตารางที่ไม่ได้แสดงอยู่ไม่มี draft ให้รักษา
 */
const confirmDiscardDraft = createDraftGuard({
  dirtyCount: () => (mode.value === "month" ? monthDirtyCount.value : 0),
  describe: (count, consequence) =>
    t("มียอดพิมพ์ที่แก้ไว้ {0} รายการแต่ยังไม่ได้บันทึก {1}", [count, consequence]),
  discard: () => {
    monthDirty.value = false;
    monthDirtyCount.value = 0;
    entryGrid.value?.discard();
  },
});

/**
 * เปลี่ยนเดือนที่กำลังดู/กรอก
 *
 * ⚠️ ต้องถามที่ **หน้าแม่** ไม่ใช่ฝากไว้กับ watch ในตารางกรอกอย่างเดียว
 *
 * เพราะการเลือก "ทั้งปีงบ" ทำให้ `filters.month` เป็นค่าว่าง ซึ่งทำให้เงื่อนไข
 * `v-if="mode === 'month' && filters.month"` เป็นเท็จ **ตารางถูกถอดออกจากหน้าจอ
 * ทันที** watch ข้างในจึงไม่มีโอกาสได้ถามอะไรเลย ค่าที่กรอกค้างไว้หายเงียบๆ
 *
 * ตัว watch ในตารางยังเก็บไว้เป็นด่านสำรอง สำหรับกรณีที่เดือนถูกเปลี่ยนจากทางอื่น
 * (เช่นลิงก์ ?month= จากหน้าแรก) โดยที่ตารางยังอยู่บนหน้าจอ
 */
async function changeMonth(next) {
  awaitingDefaultMonth.value = false;
  if (next === filters.value.month) return;

  // ด่านล้าง draft ให้เองเมื่อผู้ใช้ยืนยัน เพื่อไม่ให้ watch ในตารางถามซ้ำอีกรอบ
  const ok = await confirmDiscardDraft(t("ถ้าเปลี่ยนเดือนตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด"), {
    confirmText: t("เปลี่ยนเดือนโดยไม่บันทึก"),
  });
  if (!ok) return;

  filters.value.month = next;
}

/**
 * เดือนที่ควรเปิดให้กรอกเป็นค่าเริ่มต้นตอนเข้าโหมดกรอกรายเดือน
 *
 * เลือก "เดือนที่ค้างนานที่สุดที่ผ่านไปแล้ว" ไม่ใช่เดือนล่าสุด เพราะงานที่ค้างนาน
 * ที่สุดคืองานที่เสี่ยงถูกลืมที่สุด และเป็นตัวที่ทำให้ปิดยอดทั้งปีไม่ได้
 *
 * API คำนวณมาให้แล้วใน `next_incomplete_month` — ใช้ค่านั้นตรงๆ ไม่คำนวณซ้ำ
 * ที่นี่ ไม่งั้นสองที่จะตอบไม่ตรงกันสักวัน
 */
function defaultEntryMonth() {
  if (coverage.value?.next_incomplete_month) return coverage.value.next_incomplete_month;

  // ครบหมดแล้ว — เปิดเดือนล่าสุดที่จบแล้วไว้ให้แก้ย้อนหลังได้
  const finished = (coverage.value?.months ?? []).filter((row) => !row.in_progress);
  return finished.at(-1)?.month ?? fyMonths.value.at(-1) ?? "";
}

/**
 * สลับโหมด
 *
 * ⚠️ ต้องถามก่อนถ้ามีของแก้ค้าง เพราะการออกจากโหมดกรอกทำให้ตารางถูกถอดออกจาก
 * หน้าจอทั้งตัว ค่าที่กรอกค้างไว้หายทันทีโดยไม่มีอะไรเตือน — และการเตือนตอน
 * เปลี่ยน route (onBeforeRouteLeave) ไม่ครอบกรณีนี้ เพราะยังอยู่หน้าเดิม
 */
async function setMode(next) {
  if (next === mode.value) return;

  const ok = await confirmDiscardDraft(t("ถ้าออกจากโหมดกรอกตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด"), {
    confirmText: t("ออกโดยไม่บันทึก"),
  });
  if (!ok) return;

  if (next === "month" && !filters.value.month) awaitingDefaultMonth.value = true;

  mode.value = next;
}

watch([coverage, mode, awaitingDefaultMonth], () => {
  if (mode.value !== "month" || !awaitingDefaultMonth.value || !coverage.value) return;
  filters.value.month = defaultEntryMonth();
  awaitingDefaultMonth.value = false;
}, { immediate: true });

/** บันทึกเสร็จแล้วต้องโหลดใหม่ทั้งยอดของเดือนนั้นและความคืบหน้าทั้งปี */
async function onMonthSaved() {
  await Promise.all([monthPagesQuery.refetch(), loadSummary()]);
  refetchCoverage();
}

/**
 * คอลัมน์ของโหมดกรอกรายเดือน — ตั้งใจให้น้อยกว่าโหมดภาพรวมมาก
 *
 * คนที่กำลังกรอกตัวเลขต้องการรู้แค่ "เครื่องไหน" "อยู่ที่ไหน" และ "เดือนก่อน
 * พิมพ์เท่าไหร่" (ไว้เทียบว่าตัวเลขที่กำลังกรอกสมเหตุสมผลไหม) คอลัมน์อื่น
 * ทำให้ต้องเลื่อนซ้ายขวาระหว่างพิมพ์ ซึ่งเป็นวิธีที่ดีที่สุดในการกรอกผิดแถว
 */
const entryColumns = computed(() => [
  { key: "serial_number", label: "Serial", width: "11rem" },
  {
    key: "location",
    label: t("ที่ตั้ง / แผนก"),
    value: (d) => [d.building_name, d.floor_name, d.location, d.department_name].filter(Boolean).join(" · ") || "—",
  },
  {
    key: "previous_month",
    label: previousMonth.value ? t("ยอด {0}",[formatMonth(previousMonth.value)]) : t("เดือนก่อนหน้า"),
    align: "right",
    width: "9rem",
    value: (d) => previousPages.value[d.id] ?? null,
  },
  {
    key: "entry",
    label: filters.value.month ? t("ยอด {0}",[formatMonth(filters.value.month)]) : t("ยอดพิมพ์"),
    align: "right",
    width: "9rem",
    sortable: false,
    value: (d) => monthPages.value[d.id] ?? null,
  },
]);

async function init() {
  loading.value = true;
  pageError.value = "";

  try {
    await Promise.all([loadDevices(), loadMasterData(), loadSummary()]);
  } catch (err) {
    console.error("Init print transactions error:", err);
    toastError(t("โหลดข้อมูลไม่สำเร็จ"));
    pageError.value = t("โหลดข้อมูลไม่สำเร็จ");
  } finally {
    loading.value = false;
  }
}

// เปลี่ยนปีงบ -> เดือนที่เลือกไว้อาจอยู่นอกช่วงของปีใหม่ ล้างก่อนแล้วโหลดสรุปใหม่
//
// การล้างเดือนตรงนี้คือสิ่งที่ทำให้ตารางกรอกถูกถอดออกจากหน้าจอ จึงต้องมีคนถามก่อน
// แต่ **ถามที่นี่ไม่ทัน** — พอ watch ทำงาน ปีงบก็เปลี่ยนไปแล้ว ด่านจึงไปดักที่
// setActiveFiscalYear ในสโตร์แทน (ดู onMounted ด้านล่าง) พอถึงตรงนี้แปลว่าผ่านด่าน
// มาแล้วเสมอ
watch(
  fiscalYearId,
  (_, previous) => {
    if (!previous) return;
    filters.value.month = "";
    awaitingDefaultMonth.value = true;
    loadSummary();
  },
  { immediate: true }
);

// ไม่ต้อง watch เดือนเพื่อโหลดเองแล้ว — useMonthPages ผูกกับ key ตามเดือน
// พอเดือนเปลี่ยน key เปลี่ยน แล้วมันดึงชุดใหม่ให้เอง โดยคำตอบของเดือนเก่า
// ไปเข้า cache ของเดือนเก่า ไม่มีทางมาทับเดือนที่กำลังแสดงอยู่
watch(() => filters.value.building, () => (filters.value.floor = ""));
watch(() => filters.value.division, () => (filters.value.department = ""));

/* --------------------------------------------------------------------------
   ตัวเลือกตัวกรอง
   -------------------------------------------------------------------------- */
const toOptions = (list) => list.map((item) => ({ value: item.name, label: item.name }));

const buildingOptions = computed(() => toOptions(buildings.value));
const divisionOptions = computed(() => toOptions(divisions.value));
const brandOptions = computed(() => toOptions(brands.value));

const floorOptions = computed(() => {
  const building = buildings.value.find((b) => b.name === filters.value.building);
  const source = building
    ? floors.value.filter((f) => Number(f.building_id) === Number(building.id))
    : floors.value;

  const seen = new Set();
  return source.filter((f) => !seen.has(f.name) && seen.add(f.name)).map((f) => ({ value: f.name, label: f.name }));
});

const departmentOptions = computed(() => {
  const division = divisions.value.find((d) => d.name === filters.value.division);
  const source = division
    ? departments.value.filter((d) => Number(d.division_id) === Number(division.id))
    : departments.value;
  return toOptions(source);
});

const hasActiveFilter = computed(() => search.value !== "" || Object.values(filters.value).some(Boolean));

/**
 * ป้ายของตัวกรองที่เปิดอยู่ — แสดงเหนือแผงเสมอ แม้แผงจะหุบ
 *
 * ป้ายต้องอ่านออกด้วยตัวเอง ("อาคาร: อาคารผู้ป่วยใน") ไม่ใช่แค่ค่าลอยๆ เพราะ
 * ตอนแผงหุบ ผู้ใช้ไม่เห็น label ของช่องนั้นแล้ว — ป้ายที่เขียนว่า "อาคาร 3"
 * เฉยๆ ไม่บอกว่ามันกรองอะไรอยู่
 *
 * เดือนไม่รวมอยู่ในนี้ เพราะช่องเลือกเดือนอยู่ในสายตาตลอดอยู่แล้ว การใส่ป้าย
 * ซ้ำอีกทำให้มีสองที่ที่เอาเดือนออกได้ ซึ่งชวนสับสนมากกว่าช่วย
 */
const FILTER_LABELS = {
  fillStatus: t("สถานะการกรอก"),
  building: t("อาคาร"),
  floor: t("ชั้น"),
  division: t("ฝ่าย"),
  department: t("แผนก"),
  brand: t("ยี่ห้อ"),
  deviceStatus: t("สถานะเครื่อง"),
};

function optionLabel(options, value, key = "value", labelKey = "label") {
  const match = (options ?? []).find((option) =>
    typeof option === "string" ? option === value : option[key] === value
  );
  if (!match) return value;
  return typeof match === "string" ? match : match[labelKey];
}

const filterChips = computed(() => {
  const chips = [];

  if (search.value) {
    chips.push({ key: "search", label: t("ค้นหา: {0}", [search.value]) });
  }

  for (const [key, label] of Object.entries(FILTER_LABELS)) {
    const value = filters.value[key];
    if (!value) continue;

    let shown = value;
    if (key === "fillStatus") shown = optionLabel(FILL_STATUS_OPTIONS, value);
    if (key === "deviceStatus") shown = optionLabel(DEVICE_STATUS_OPTIONS, value);

    chips.push({ key, label: `${label}: ${shown}` });
  }

  return chips;
});

function removeFilter(key) {
  if (key === "search") {
    search.value = "";
    return;
  }
  filters.value = { ...filters.value, [key]: "" };
}

/**
 * ล้างตัวกรองทั้งหมด — รวม `month` ด้วย ซึ่งทำให้ตารางกรอกถูกถอดออกจากหน้าจอ
 * จึงต้องผ่านด่านเดียวกับการเปลี่ยนเดือน ไม่ใช่ล้างทันที
 */
async function resetFilters() {
  const ok = await confirmDiscardDraft(t("ถ้าล้างตัวกรองตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด"), {
    confirmText: t("ล้างตัวกรองโดยไม่บันทึก"),
  });
  if (!ok) return;

  awaitingDefaultMonth.value = false;
  search.value = "";
  filters.value = {
    building: "",
    floor: "",
    division: "",
    department: "",
    brand: "",
    deviceStatus: "",
    fillStatus: "",
    month: "",
  };
}

/* --------------------------------------------------------------------------
   สถานะการกรอก
   -------------------------------------------------------------------------- */
function fillInfo(deviceId) {
  return filledSummary.value[deviceId] ?? { filled: 0, totalPages: 0, latestMonth: null, latestPages: 0 };
}

function fillStatusOf(deviceId) {
  const filled = fillInfo(deviceId).filled;
  if (filled >= monthsPerYear.value) return "done";
  return filled > 0 ? "partial" : "none";
}

/** ความคืบหน้าของทั้งปีงบ — ตัวเลขที่บอกว่างานเดือนนี้เหลืออีกเท่าไหร่ */
const progress = computed(() => {
  const total = devices.value.length;
  const done = devices.value.filter((d) => fillStatusOf(d.id) === "done").length;
  const started = devices.value.filter((d) => fillStatusOf(d.id) === "partial").length;
  return { total, done, started, pending: total - done - started };
});

const filteredDevices = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  const f = filters.value;

  return devices.value.filter((d) => {
    const matchKeyword =
      !keyword ||
      d.serial_number?.toLowerCase().includes(keyword) ||
      d.model?.toLowerCase().includes(keyword) ||
      d.location?.toLowerCase().includes(keyword) ||
      d.department_name?.toLowerCase().includes(keyword) ||
      d.contract_no?.toLowerCase().includes(keyword);

    return (
      matchKeyword &&
      (!f.building || d.building_name === f.building) &&
      (!f.floor || d.floor_name === f.floor) &&
      (!f.division || d.division_name === f.division) &&
      (!f.department || d.department_name === f.department) &&
      (!f.brand || d.brand_name === f.brand) &&
      (!f.deviceStatus || d.status === f.deviceStatus) &&
      (!f.fillStatus || (mode.value === "month" && f.fillStatus === "none" ? !Object.hasOwn(monthPages.value, d.id) : fillStatusOf(d.id) === f.fillStatus)) &&
      // ⚠️ ตัวกรอง "เลือกเดือนแล้วเหลือเฉพาะเครื่องที่กรอกเดือนนั้นแล้ว" ใช้ได้
      // เฉพาะโหมดภาพรวม ซึ่งเป็นการ *ดู* ว่าเดือนนั้นใครกรอกไปแล้วบ้าง
      //
      // ในโหมดกรอกรายเดือนมันกลับหัวกลับหาง: เครื่องที่ต้องกรอกคือเครื่องที่
      // **ยังไม่มี** ยอดของเดือนนั้น การใช้ตัวกรองเดียวกันทำให้ตารางว่างเปล่า
      // ทุกครั้งที่เปิดเดือนที่ยังไม่ได้เริ่มกรอก — คือทุกครั้งที่มีงานให้ทำ
      (mode.value === "month" || !f.month || Object.hasOwn(monthPages.value, d.id))
    );
  });
});

const columns = computed(() => [
  { key: "serial_number", label: "Serial", width: "12rem" },
  {
    key: "fill_status",
    label: t("ความคืบหน้า"),
    align: "center",
    width: "10rem",
    value: (d) => fillInfo(d.id).filled,
    csv: (d) => `${fillInfo(d.id).filled}/${monthsPerYear.value}`,
  },
  {
    key: "total_pages",
    label: filters.value.month
      ? t("ยอดเดือน {0}", [formatMonth(filters.value.month)])
      : t("ยอดรวมทั้งปีงบ"),
    align: "right",
    value: (d) => (filters.value.month ? (monthPages.value[d.id] ?? 0) : fillInfo(d.id).totalPages),
  },
  {
    key: "latest_transaction",
    label: t("ยอดล่าสุดที่กรอก"),
    align: "right",
    value: (d) => {
      const info = fillInfo(d.id);
      return info.latestMonth ? t("{0} · {1} หน้า", [formatMonth(info.latestMonth), formatCount(info.latestPages)]) : "—";
    },
  },
  { key: "brand_name", label: t("ยี่ห้อ / รุ่น"), value: (d) => `${d.brand_name || ""} ${d.model || ""}`.trim() || "—" },
  {
    key: "building_name",
    label: t("อาคาร / ชั้น"),
    value: (d) => [d.building_name, d.floor_name].filter(Boolean).join(" / ") || "—",
  },
  { key: "location", label: t("ตำแหน่งที่ตั้ง") },
  {
    key: "division_name",
    label: t("ฝ่าย / แผนก"),
    value: (d) => [d.division_name, d.department_name].filter(Boolean).join(" / ") || "—",
  },
  {
    key: "status",
    label: t("สถานะเครื่อง"),
    align: "center",
    value: (d) => STATUS_META[d.status]?.label ?? d.status,
  },
]);

/* --------------------------------------------------------------------------
   หน้าต่างกรอกยอดทั้งปีของเครื่องเดียว
   -------------------------------------------------------------------------- */
const dialogOpen = ref(false);
const dialogDevice = ref(null);
const dialogLoading = ref(false);
const dialogSaving = ref(false);
const dialogError = ref("");
const monthRows = ref([]);
const annualSnapshot = ref([]);
const annualReady = ref(false);
const annualDirtyCount = computed(() => dialogOpen.value && annualReady.value
  ? monthRows.value.filter((row, index) => String(row.pages ?? "") !== String(annualSnapshot.value[index] ?? "")).length
  : 0);
const confirmDiscardAnnual = createDraftGuard({
  dirtyCount: () => annualDirtyCount.value,
  describe: (count, consequence) => t("มียอดพิมพ์ที่แก้ไว้ {0} รายการแต่ยังไม่ได้บันทึก {1}", [count, consequence]),
  discard: () => { dialogOpen.value = false; },
});

async function closeAnnual(open) {
  if (open || dialogSaving.value) return;
  if (await confirmDiscardAnnual(t("ถ้าปิดตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด"))) dialogOpen.value = false;
}

onBeforeRouteLeave(() => dialogSaving.value ? false : confirmDiscardAnnual(t("ถ้าออกจากหน้านี้ ค่าที่กรอกไว้จะหายทั้งหมด")));
function guardAnnualUnload(event) {
  if (!annualDirtyCount.value && !dialogSaving.value) return;
  event.preventDefault();
  event.returnValue = "";
}
onMounted(() => window.addEventListener("beforeunload", guardAnnualUnload));
onUnmounted(() => window.removeEventListener("beforeunload", guardAnnualUnload));

const filledInDialog = computed(() => monthRows.value.filter((row) => isFilled(row.pages)).length);

function isFilled(value) {
  return value !== null && value !== undefined && value !== "";
}

async function openDialog(device) {
  if (!fiscalYearId.value || !range.value) {
    toastError(t("เลือกปีงบประมาณจากแถบด้านบนก่อน"));
    return;
  }

  dialogDevice.value = device;
  annualReady.value = false;
  dialogError.value = "";
  beforePaste.value = null;
  // ต่อท้ายด้วยปีเสมอ เพราะปีงบไทยคร่อมสองปีปฏิทิน ชื่อเดือนเปล่าๆ จึงกำกวม
  monthRows.value = fyMonths.value.map((month) => ({
    month,
    label: formatMonth(month, { long: true }),
    pages: null,
  }));
  dialogOpen.value = true;

  dialogLoading.value = true;
  try {
    const res = await api.get(`/print-transactions/by-device/${device.id}`, {
      params: { fiscal_year_id: fiscalYearId.value },
    });

    const byMonth = Object.fromEntries((res.data ?? []).map((r) => [r.month, Number(r.pages)]));
    monthRows.value = monthRows.value.map((row) => ({ ...row, pages: byMonth[row.month] ?? null }));
    annualSnapshot.value = monthRows.value.map(row => row.pages);
    annualReady.value = true;
  } catch (err) {
    console.error("Load device months error:", err);
    dialogError.value = t("โหลดยอดที่เคยกรอกไว้ไม่สำเร็จ");
  } finally {
    dialogLoading.value = false;
  }
}

/* --------------------------------------------------------------------------
   วางข้อมูลจากตารางคำนวณ (Excel / Google Sheets)

   เจ้าหน้าที่ไล่อ่านมิเตอร์แล้วจดลงตารางคำนวณก่อนแทบทุกครั้ง การบังคับให้มา
   พิมพ์ซ้ำทีละช่องสิบสองครั้งต่อเครื่อง คูณด้วยจำนวนเครื่องเป็นร้อย คือที่มา
   ของเวลาส่วนใหญ่ที่หมดไปกับระบบนี้ — และเป็นจุดที่เกิดการพิมพ์ผิดมากที่สุดด้วย

   รองรับทั้งวางเป็นคอลัมน์ (คั่นด้วยขึ้นบรรทัด) และเป็นแถว (คั่นด้วย tab)
   ซึ่งเป็นสองรูปแบบที่ออกมาจากการคัดลอกในตารางคำนวณจริง
   -------------------------------------------------------------------------- */

/** ค่าก่อนวางครั้งล่าสุด — เก็บไว้ให้กดเลิกทำได้ */
const beforePaste = ref(null);

/**
 * วางค่าลงในช่องเดือน โดยเริ่มจากช่องที่กำลังโฟกัสอยู่
 *
 * เริ่มจากช่องที่โฟกัสไม่ใช่จากเดือนแรกเสมอ เพราะกรณีที่เจอบ่อยพอๆ กันคือ
 * "เพิ่งได้ตัวเลขของสามเดือนหลังมา" ไม่ใช่ทั้งปี
 */
function onPasteMonths(event) {
  const values = parseNumbers(event.clipboardData?.getData("text/plain") ?? "");

  // ค่าเดียวคือการวางปกติลงช่องเดียว ปล่อยให้เบราว์เซอร์จัดการตามปกติ
  if (values.length <= 1) return;

  event.preventDefault();

  const startIndex = Number(event.target.closest("[data-month-index]")?.dataset.monthIndex ?? 0);

  // เก็บของเดิมไว้ก่อนเขียนทับ เพื่อให้กด "เลิกทำ" ได้ — ความผิดพลาดในกริดที่
  // เพิ่งมาเห็นตอนดูช่องที่ยี่สิบ แก้ด้วยการพิมพ์กลับทีละช่องไม่ไหว
  beforePaste.value = monthRows.value.map((row) => row.pages);

  const result = applyPaste(
    monthRows.value.map((row) => row.pages),
    values,
    startIndex
  );

  monthRows.value.forEach((row, index) => {
    row.pages = result.values[index];
  });

  toastSuccess(t("{0} — กด \"เลิกทำ\" ถ้าไม่ถูกต้อง", [describePaste(result)]));
}

/** คืนค่าทั้งกริดกลับไปเป็นก่อนวางครั้งล่าสุด */
function undoPaste() {
  if (!beforePaste.value) return;

  monthRows.value.forEach((row, index) => {
    row.pages = beforePaste.value[index];
  });

  beforePaste.value = null;
}

/**
 * เลื่อนระหว่างช่องเดือนด้วยคีย์บอร์ด
 *
 * การกรอกสิบสองช่องแล้วต้องยกมือไปคลิกทีละช่องคือการทำงานสองเท่า — Enter กับ
 * ลูกศรขึ้นลงทำให้กรอกรวดเดียวจบได้เหมือนในตารางคำนวณ (Tab ทำงานอยู่แล้วโดย
 * ค่าเริ่มต้นของเบราว์เซอร์ ไม่ต้องเขียนเพิ่มและไม่ควรไปทับ)
 */
function onMonthKeydown(event, index) {
  const step = event.key === "Enter" || event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  if (!step) return;

  const target = document.querySelector(`[data-month-index="${index + step}"] input`);
  if (!target) return;

  event.preventDefault();
  target.focus();
  target.select();
}

async function save() {
  if (dialogSaving.value || !annualReady.value) return;
  dialogError.value = "";

  const invalid = monthRows.value.find((row) => isFilled(row.pages) && Number(row.pages) < 0);
  if (invalid) {
    dialogError.value = t("จำนวนหน้าของ{0}ติดลบไม่ได้", [invalid.label]);
    return;
  }

  // ส่งครบทุกเดือนเสมอ รวมเดือนที่ลบจนว่าง เพื่อให้ API รู้ว่าต้องลบค่าเดิมทิ้ง
  const items = monthRows.value.map((row) => ({
    month: row.month,
    pages: isFilled(row.pages) ? Number(row.pages) : null,
  }));

  dialogSaving.value = true;
  try {
    await api.post("/print-transactions/bulk-device", {
      device_id: dialogDevice.value.id,
      items,
    });

    toastSuccess(t("บันทึกยอดพิมพ์ของ {0} เรียบร้อย", [dialogDevice.value.serial_number]));
    await Promise.all([loadSummary(), invalidateAfterWrite(queryClient, "usage")]);
    dialogOpen.value = false;
  } catch (err) {
    console.error("Save print transactions error:", err);
    dialogError.value = errorMessage(err, t("บันทึกไม่สำเร็จ กรุณาลองใหม่"));
  } finally {
    dialogSaving.value = false;
  }
}

onMounted(init);

// ฝากด่านไว้กับสโตร์ปีงบตลอดเวลาที่หน้านี้ยังอยู่ — ถามที่นั่นไม่ใช่ที่ watch ของหน้านี้
// เพราะกว่า watch จะทำงาน ปีงบก็เปลี่ยนไปแล้ว
//
// ⚠️ ถ้าวันหลังหน้านี้ถูกครอบด้วย <KeepAlive> ต้องเปลี่ยนไปใช้ onActivated/onDeactivated
// ด้วย เพราะ onUnmounted จะไม่ยิงตอน deactivate แล้วด่านจะค้างบล็อกการเปลี่ยนปีงบ
// ของทั้งแอปทั้งที่ผู้ใช้ออกจากหน้านี้ไปแล้ว
const unregisterFiscalYearGuard = registerFiscalYearGuard(async () =>
  !dialogSaving.value && await confirmDiscardAnnual(t("ถ้าเปลี่ยนปีงบตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด")) && await confirmDiscardDraft(t("ถ้าเปลี่ยนปีงบตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด"), {
    confirmText: t("เปลี่ยนปีงบโดยไม่บันทึก"),
  })
);

onUnmounted(unregisterFiscalYearGuard);
</script>

<template>
  <div ref="workspace" class="ui-fullscreen-context">
    <UiPageHeader
      :eyebrow="t(&quot;บันทึกข้อมูล&quot;)"
      :title="t(&quot;บันทึกยอดพิมพ์รายเดือน&quot;)"
      :description="t(&quot;เลือกเดือน กรอกยอด แล้วตรวจจำนวนรายการก่อนบันทึก&quot;)"
    />

    <!-- ความคืบหน้าของทั้งปีงบ -->
    <UiCard class="mb-4" flush>
      <template #header>
        <p class="text-sm text-ink-soft">
          {{ t("ปีงบ {0}", [displayYearBE]) }}
          <span v-if="!summaryError && !summaryLoading && !loading && !pageError"> · {{ t("กรอกครบแล้ว {0} จาก {1} เครื่อง", [formatCount(progress.done), formatCount(progress.total)]) }}</span>
        </p>
      </template>
      <template #actions>
        <UiButton size="sm" variant="ghost" :aria-expanded="yearExpanded" aria-controls="year-progress" @click="yearExpanded = !yearExpanded">
          {{ t("รายละเอียดความคืบหน้าปี") }}
          <ChevronDown :size="14" :class="yearExpanded && 'rotate-180'" aria-hidden="true" />
        </UiButton>
        <UiButton
          v-if="yearExpanded && progress.total - progress.done > 0"
          size="sm"
          :variant="filters.fillStatus === 'done' ? 'secondary' : 'soft'"
          @click="filters.fillStatus = filters.fillStatus === 'partial' ? '' : 'partial'"
        >
          <template #icon><ClipboardList :size="15" /></template>
          {{ filters.fillStatus === "partial" ? t("แสดงทุกเครื่อง") : t("ดูเฉพาะที่ยังไม่ครบ") }}
        </UiButton>
      </template>

      <div id="year-progress" v-show="yearExpanded" class="px-4 py-3">
        <UiSkeleton v-if="loading || summaryLoading" height="2.5rem" />

        <div v-else-if="!summaryError && !pageError" class="flex flex-col gap-3">
          <UiMeter
            :value="progress.done"
            :max="progress.total || 1"
            tone="brand"
            size="lg"
            :label="t(&quot;สัดส่วนเครื่องที่กรอกครบแล้ว&quot;)"
          />

          <ul class="flex flex-wrap gap-x-6 gap-y-1.5 list-none text-sm">
            <li class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-brand shrink-0" aria-hidden="true"></span>
              <span class="text-ink-mute"> {{ t("ครบแล้ว") }} </span>
              <span class="numeral font-semibold text-ink">{{ formatCount(progress.done) }}</span>
            </li>
            <li class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-warn shrink-0" aria-hidden="true"></span>
              <span class="text-ink-mute"> {{ t("กรอกบางเดือน") }} </span>
              <span class="numeral font-semibold text-ink">{{ formatCount(progress.started) }}</span>
            </li>
            <li class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-line-strong shrink-0" aria-hidden="true"></span>
              <span class="text-ink-mute"> {{ t("ยังไม่เริ่ม") }} </span>
              <span class="numeral font-semibold text-ink">{{ formatCount(progress.pending) }}</span>
            </li>
          </ul>
        </div>
      </div>
    </UiCard>
    <UiAlert v-if="summaryError" tone="danger" class="mb-4">
      {{ summaryError }}
      <template #actions><UiButton variant="secondary" size="sm" @click="loadSummary">{{ t("ลองใหม่") }}</UiButton></template>
    </UiAlert>
    <UiAlert v-if="pageError" tone="danger" class="mb-4">
      {{ pageError }}
      <template #actions><UiButton variant="secondary" size="sm" @click="init">{{ t("ลองใหม่") }}</UiButton></template>
    </UiAlert>

    <!-- สลับโหมด — วางเหนือทุกอย่างที่มันเปลี่ยน เพราะมันเปลี่ยนทั้งหน้า -->
    <UiSegmented
      :model-value="mode"
      :options="MODE_OPTIONS"
      :label="t(&quot;โหมดการทำงาน&quot;)"
      class="mb-4"
      @update:model-value="setMode"
    />

    <UiAlert v-if="!canEdit" tone="info" class="mb-4"> {{ t("บัญชีของคุณมีสิทธิ์ดูอย่างเดียว จึงเปิดดูยอดที่บันทึกไว้ได้ แต่แก้ไขไม่ได้") }} </UiAlert>

    <!-- ตัวกรอง — ค้นหากับเดือนอยู่ในสายตาเสมอ ที่เหลือซ่อนอยู่หลังปุ่ม
         เพราะจากตัวกรองเก้าช่อง มีสองช่องที่คนแตะเกือบทุกครั้ง ส่วนอีกเจ็ดช่อง
         แทบไม่ถูกแตะเลย แต่กินความสูงจนตารางที่คนมากรอกหลุดใต้เส้นพับ -->
    <UiFilterBar :chips="filterChips" @remove="removeFilter" @clear="resetFilters">
      <template #primary>
        <UiField :label="t(&quot;ค้นหา&quot;)" class="flex-1 min-w-[16rem]">
          <UiInput v-model="search" clearable :placeholder="t(&quot;Serial, รุ่น, ตำแหน่ง, แผนก…&quot;)">
            <template #icon><Search :size="15" /></template>
          </UiInput>
        </UiField>

        <UiField :label="t(&quot;ดูยอดของเดือน&quot;)" class="w-full sm:w-56">
          <UiSelect
            :model-value="filters.month"
            :options="monthOptions"
            value-key="value"
            label-key="label"
            @update:model-value="changeMonth"
          />
        </UiField>
      </template>

      <UiField :label="t(&quot;สถานะการกรอก&quot;)">
        <UiSegmented
          v-model="filters.fillStatus"
          :options="FILL_STATUS_OPTIONS"
          size="sm"
          :label="t(&quot;กรองตามสถานะการกรอก&quot;)"
          block
        />
      </UiField>

      <UiField :label="t(&quot;อาคาร&quot;)">
        <UiCombobox v-model="filters.building" :options="buildingOptions" :placeholder="t(&quot;ทุกอาคาร&quot;)" :any-label="t(&quot;ทุกอาคาร&quot;)" />
      </UiField>

      <UiField :label="t(&quot;ชั้น&quot;)">
        <UiCombobox v-model="filters.floor" :options="floorOptions" :placeholder="t(&quot;ทุกชั้น&quot;)" :any-label="t(&quot;ทุกชั้น&quot;)" />
      </UiField>

      <UiField :label="t(&quot;ฝ่าย&quot;)">
        <UiCombobox v-model="filters.division" :options="divisionOptions" :placeholder="t(&quot;ทุกฝ่าย&quot;)" :any-label="t(&quot;ทุกฝ่าย&quot;)" />
      </UiField>

      <UiField :label="t(&quot;แผนก&quot;)">
        <UiCombobox v-model="filters.department" :options="departmentOptions" :placeholder="t(&quot;ทุกแผนก&quot;)" :any-label="t(&quot;ทุกแผนก&quot;)" />
      </UiField>

      <UiField :label="t(&quot;ยี่ห้อ&quot;)">
        <UiCombobox v-model="filters.brand" :options="brandOptions" :placeholder="t(&quot;ทุกยี่ห้อ&quot;)" :any-label="t(&quot;ทุกยี่ห้อ&quot;)" />
      </UiField>

      <UiField :label="t(&quot;สถานะเครื่อง&quot;)">
        <UiSelect
          v-model="filters.deviceStatus"
          :options="DEVICE_STATUS_OPTIONS"
          value-key="value"
          label-key="label"
        />
      </UiField>
    </UiFilterBar>

    <!-- ================= โหมดกรอกรายเดือน ================= -->
    <UiAlert v-if="mode === 'month' && awaitingDefaultMonth && coverageQuery.isError.value" tone="danger" class="mb-4">
      {{ t("โหลดเดือนที่ค้างไม่สำเร็จ เลือกเดือนเองหรือลองใหม่") }}
      <template #actions><UiButton variant="secondary" size="sm" @click="refetchCoverage()">{{ t("ลองใหม่") }}</UiButton></template>
    </UiAlert>
    <UiSkeleton v-else-if="mode === 'month' && awaitingDefaultMonth" height="2rem" class="mb-4" />
    <!-- โหลดยอดของเดือนไม่สำเร็จ ต้องบอกให้ชัด ไม่ใช่ปล่อยให้ตารางว่างเปล่า
         ซึ่งหน้าตาเหมือน "เดือนนี้ยังไม่มีใครกรอก" แล้วผู้ใช้จะกรอกทับของเดิม -->
    <UiAlert v-if="mode === 'month' && monthPagesError" tone="danger" class="mb-4">
      {{ monthPagesError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="monthPagesQuery.refetch()"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <MonthEntryGrid
      v-if="mode === 'month' && filters.month"
      ref="entryGrid"
      :devices="filteredDevices"
      :month="filters.month"
      :saved="monthPages"
      :can-edit="canEdit && monthPagesReady && !loading && !pageError"
      :ready="monthPagesReady && !loading && !pageError"
      @saved="onMonthSaved"
      @update:month="filters.month = $event"
      @update:dirty="onDirtyChange"
    >
      <template #default="{ displayValue, onInput, onPaste, draft }">
        <UiDataTable
          :rows="filteredDevices"
          :columns="entryColumns"
          :loading="loading"
          row-key="id"
          export-filename="print-transactions-month"
          :export-context="reportContext({ months: filters.month ? [filters.month] : [], filters, labels: FILTER_LABELS })"
          :searchable="false"
          :fullscreen-target="workspace"
          :empty-text="t(&quot;ไม่มีเครื่องที่ตรงกับเงื่อนไข&quot;)"
          :empty-hint="t(&quot;ลองล้างตัวกรอง หรือเพิ่มเครื่องเข้าทะเบียนก่อน&quot;)"
          max-height="60vh"
          sticky-first
          :row-class="row => draft.has(row.id) ? 'bg-brand-soft' : ''"
        >
          <template #cell-location="{ value }">
            <span class="block max-w-xs whitespace-normal break-words">{{ value }}</span>
          </template>
          <!-- inline-flex + min-h-6: ข้อ 2.5.8 บังคับพื้นที่กด 24x24 ส่วนตัวอักษร
               บรรทัดเดียวสูงแค่ 17px และลิงก์นี้ไม่เข้าข้อยกเว้น "อยู่ในประโยค"
               เพราะมันอยู่เดี่ยวๆ ในช่องตาราง ไม่ได้แทรกอยู่ในข้อความ (เจอบั๊กนี้
               ซ้ำที่นี่ตอนขยาย wcag.spec.js ให้รันกับฐาน CI จริงใน #63 — แก้ไปแล้ว
               ที่ทะเบียนทรัพย์สิน AssetList.vue แต่ไม่เคยตรวจหน้านี้ด้วยฐานจริงมาก่อน) -->
          <template #cell-serial_number="{ row }">
            <RouterLink
              :to="`/assets/${row.id}`"
              class="inline-flex items-center min-h-6 font-mono text-sm text-ink hover:text-brand-ink hover:underline underline-offset-2 rounded-xs"
            >
              {{ row.serial_number || "—" }}
            </RouterLink>
          </template>

          <template #cell-entry="{ row, index, rows }">
            <span v-if="draft.has(row.id)" class="block text-2xs text-brand-ink">{{ t("แก้ไขแล้ว") }}</span>
            <UiInput
              :model-value="displayValue(row.id)"
              type="text"
              inputmode="numeric"
              class="w-28 text-right"
              :disabled="!canEdit || !monthPagesReady || loading || !!pageError"
              :aria-label="t(&quot;ยอดพิมพ์ของ {0}&quot;, [row.serial_number])"
              :class="draft.has(row.id) ? 'ring-1 ring-brand-line' : ''"
              @update:model-value="(v) => onInput(row.id, v)"
              @paste="(e) => onPaste(e, index, rows)"
            />
          </template>

          <template #cell-previous_month="{ row }">
            <span class="numeral text-ink-mute">{{ previousMonthLabel(row.id) }}</span>
          </template>
        </UiDataTable>
      </template>
    </MonthEntryGrid>

    <UiAlert v-else-if="mode === 'month'" tone="warn" class="mb-4"> {{ t("เลือกเดือนที่จะกรอกก่อน แล้วตารางกรอกจะขึ้นมา") }} </UiAlert>

    <!-- ================= โหมดภาพรวมทั้งปี ================= -->
    <UiDataTable
      v-else-if="!summaryError && !pageError"
      :rows="filteredDevices"
      :columns="columns"
      :loading="loading"
      row-key="id"
      export-filename="print-transactions"
      :export-context="reportContext({ months: filters.month ? [filters.month] : [], filters, labels: FILTER_LABELS })"
      :searchable="false"
      :fullscreen-target="workspace"
      :empty-text="t(&quot;ไม่มีเครื่องที่ตรงกับเงื่อนไข&quot;)"
      :empty-hint="t(&quot;ลองล้างตัวกรอง หรือเพิ่มเครื่องเข้าทะเบียนก่อน&quot;)"
      max-height="68vh"
      sticky-first
    >
      <template #cell-serial_number="{ row }">
        <span class="font-mono text-sm text-ink">{{ row.serial_number || "—" }}</span>
        <span v-if="row.asset_code" class="block text-2xs text-ink-mute font-mono">{{ row.asset_code }}</span>
      </template>

      <template #cell-fill_status="{ row }">
        <span class="flex flex-col items-center gap-1">
          <span class="flex items-center gap-1.5 text-2xs numeral">
            <CircleCheck
              v-if="fillStatusOf(row.id) === 'done'"
              :size="12"
              class="text-ok-ink shrink-0"
              aria-hidden="true"
            />
            <span :class="fillStatusOf(row.id) === 'done' ? 'text-ok-ink font-medium' : 'text-ink-mute'">
              {{ fillInfo(row.id).filled }}/{{ monthsPerYear }} {{ t("เดือน") }} </span>
          </span>

          <span class="w-full h-1 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
            <span
              class="block h-full rounded-full transition-[width] duration-300"
              :class="fillStatusOf(row.id) === 'done' ? 'bg-ok' : 'bg-warn'"
              :style="{ width: `${percentOf(fillInfo(row.id).filled, monthsPerYear)}%` }"
            ></span>
          </span>
        </span>
      </template>

      <template #cell-total_pages="{ value }">
        {{ formatCount(value) }}
      </template>

      <template #cell-status="{ row }">
        <UiBadge :tone="STATUS_META[row.status]?.tone ?? 'neutral'" dot>
          {{ STATUS_META[row.status]?.label ?? row.status }}
        </UiBadge>
      </template>

      <template v-if="canEdit" #actions="{ row }">
        <UiTooltip :content="t(&quot;กรอกยอดพิมพ์ทั้งปีของเครื่องนี้&quot;)">
          <UiButton size="sm" variant="secondary" @click="openDialog(row)">
            <template #icon><Pencil :size="14" /></template> {{ t("กรอกยอด") }} </UiButton>
        </UiTooltip>
      </template>
    </UiDataTable>

    <!-- หน้าต่างกรอกยอดทั้งปี -->
    <UiModal
      :open="dialogOpen"
      @update:open="closeAnnual"
      :title="t(&quot;กรอกยอดพิมพ์ · {0}&quot;, [dialogDevice?.serial_number ?? ''])"
      :description="t(&quot;ปีงบ {0} — เว้นเดือนที่ยังไม่มีข้อมูลไว้ว่างได้ ระบบจะไม่นับเป็นศูนย์&quot;, [displayYearBE])"
      size="lg"
    >
      <div v-if="dialogLoading" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <UiSkeleton v-for="n in 12" :key="n" height="4rem" />
      </div>

      <div v-else class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p class="text-ink-mute"> {{ t("กรอกแล้ว") }} <span class="numeral font-semibold text-ink">{{ filledInDialog }}/{{ monthsPerYear }}</span> {{ t("เดือน") }} </p>

          <p v-if="dialogDevice" class="text-xs text-ink-mute truncate">
            {{ dialogDevice.brand_name }} {{ dialogDevice.model }} ·
            {{ dialogDevice.department_name || t("ไม่ระบุแผนก") }}
          </p>
        </div>

        <!--
          คำใบ้เรื่องการวางข้อมูล อยู่เหนือกริดเสมอ ไม่ซ่อนไว้ใน tooltip
          ความสามารถที่ประหยัดเวลาได้มากที่สุดของหน้านี้ต้องถูกมองเห็นก่อนที่คน
          จะเริ่มพิมพ์ทีละช่อง ไม่ใช่ให้มาค้นพบเองหลังจากพิมพ์ครบสิบสองช่องแล้ว
        -->
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
          <p class="flex items-center gap-2 text-xs text-ink-soft">
            <ClipboardPaste :size="14" class="shrink-0 text-ink-mute" aria-hidden="true" /> {{ t("คัดลอกตัวเลขจาก Excel มาวางในช่องแรกได้เลย ระบบจะเติมเดือนถัดไปให้เอง ·") }} <kbd class="rounded border border-line bg-surface px-1 font-sans text-2xs">Enter</kbd> {{ t("เลื่อนไปเดือนถัดไป") }} </p>

          <UiButton v-if="beforePaste" size="sm" variant="ghost" @click="undoPaste">
            <template #icon><Undo2 :size="14" /></template> {{ t("เลิกทำการวาง") }} </UiButton>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3" @paste="onPasteMonths">
          <UiField
            v-for="(row, index) in monthRows"
            :key="row.month"
            :label="row.label"
            :data-month-index="index"
          >
            <UiInput
              v-model="row.pages"
              :disabled="!annualReady || dialogSaving"
              type="number"
              min="0"
              :suffix="t(&quot;หน้า&quot;)"
              placeholder="—"
              @keydown="onMonthKeydown($event, index)"
            />
          </UiField>
        </div>

        <UiAlert v-if="dialogError" tone="danger">
          {{ dialogError }}
          <template v-if="!annualReady" #actions>
            <UiButton variant="secondary" @click="openDialog(dialogDevice)">{{ t("ลองใหม่") }}</UiButton>
          </template>
        </UiAlert>
      </div>

      <template #footer>
        <UiButton variant="secondary" :disabled="dialogSaving" @click="closeAnnual(false)"> {{ t("ยกเลิก") }} </UiButton>
        <UiButton variant="primary" :disabled="!annualReady" :loading="dialogSaving" @click="save"> {{ t("บันทึกยอดทั้งปี") }} </UiButton>
      </template>
    </UiModal>
  </div>
</template>
