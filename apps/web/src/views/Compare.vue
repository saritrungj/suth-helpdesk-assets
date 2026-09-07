<script setup>
/**
 * Compare — เปรียบเทียบตัวชี้วัดระหว่างเดือน
 *
 * ใช้ตอบคำถามเดียว: "เดือนนี้ต่างจากเดือนก่อนยังไง และเพราะอะไร"
 * เลือกได้หลายเดือน ไม่จำกัดแค่คู่เดียว เพราะการดูสามสี่เดือนติดกันบอกได้ว่า
 * ตัวเลขที่กระโดดเป็นแนวโน้มจริงหรือเป็นเดือนที่ผิดปกติเดือนเดียว
 *
 * เดือนที่เลือกถูก sync กับ ?months= ใน URL เพื่อให้ส่งลิงก์ให้คนอื่นเปิดดูชุด
 * เดียวกันได้ — เป็นหน้าที่ถูกแชร์ในไลน์กลุ่มบ่อยที่สุด
 *
 * ทิศทางของสีในหน้านี้กลับด้านกับกราฟการเงินทั่วไป: ตัวเลขที่ "เพิ่มขึ้น" ใช้โทน
 * เตือน เพราะทุกตัวชี้วัดในหน้านี้คือต้นทุน ไม่ใช่รายได้
 *
 * "จำนวนหน้าพิมพ์รวม" เป็นยอดดิบตามที่กรอก ส่วน "สุทธิ" คือหลังหัก 20% ตามสัญญา
 * ทั้งสองแสดงคู่กันเสมอ เพราะเป็นตัวเลขที่คนมักเอาไปสับสนกัน
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Minus, TrendingDown, TrendingUp } from "lucide-vue-next";
import { formatMonthTH, fromSatang, sumSatang, toSatang } from "@suth/domain";
import api from "../services/api";
import { formatBahtValue, formatCount } from "../lib/format";
import PeriodPicker from "../components/PeriodPicker.vue";
import {
  UiAlert,
  UiButton,
  UiCard,
  UiChart,
  UiCombobox,
  UiEmpty,
  UiField,
  UiPageHeader,
  UiSelect,
  UiSkeleton,
} from "../ui";

const route = useRoute();
const router = useRouter();

function sumCost(rows) {
  return fromSatang(sumSatang((rows ?? []).map((r) => r.total_cost_satang ?? toSatang(r.total_cost))));
}

/* --------------------------------------------------------------------------
   ข้อมูลและตัวกรอง
   -------------------------------------------------------------------------- */
const loading = ref(true);
const loadError = ref("");

const rawRows = ref([]);
const monthsWithData = ref([]);
const selectedMonths = ref([]);

const filters = ref({
  building: "",
  floor: "",
  division: "",
  department: "",
  brand: "",
  status: "",
});

const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const brands = ref([]);
const devices = ref([]);

const STATUS_OPTIONS = [
  { value: "", label: "ทุกสถานะ" },
  { value: "active", label: "ใช้งานอยู่" },
  { value: "repair", label: "ซ่อมบำรุง" },
  { value: "retired", label: "ปลดระวาง" },
];

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

watch(() => filters.value.building, () => (filters.value.floor = ""));
watch(() => filters.value.division, () => (filters.value.department = ""));

const hasActiveFilter = computed(() => Object.values(filters.value).some(Boolean));

function resetFilters() {
  filters.value = { building: "", floor: "", division: "", department: "", brand: "", status: "" };
}

const deviceById = computed(() => new Map(devices.value.map((d) => [d.id, d])));

/**
 * เครื่องนี้ผ่านตัวกรองไหม — ถ้าหาข้อมูลเครื่องไม่เจอ (เช่นถูกลบไปแล้วแต่ยังมี
 * ยอดพิมพ์ในประวัติ) ให้ผ่าน ไม่กรองออก มิฉะนั้นยอดรวมจะหายไปเงียบๆ
 */
function deviceMatches(deviceId) {
  const device = deviceById.value.get(deviceId);
  if (!device) return true;

  const f = filters.value;
  return (
    (!f.floor || device.floor_name === f.floor) &&
    (!f.division || device.division_name === f.division) &&
    (!f.department || device.department_name === f.department) &&
    (!f.brand || device.brand_name === f.brand) &&
    (!f.status || device.status === f.status)
  );
}

async function loadMasterData() {
  try {
    const [building, floor, division, department, brand, device] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
      api.get("/brands"),
      api.get("/devices"),
    ]);

    buildings.value = building.data ?? [];
    floors.value = floor.data ?? [];
    divisions.value = division.data ?? [];
    departments.value = department.data ?? [];
    brands.value = brand.data ?? [];
    devices.value = device.data ?? [];
  } catch (err) {
    console.error("Load master data error:", err);
  }
}

/* --------------------------------------------------------------------------
   sync เดือนที่เลือกกับ ?months= ใน URL
   -------------------------------------------------------------------------- */
let syncingFromRoute = false;
let firstLoad = true;

watch(selectedMonths, (value) => {
  if (syncingFromRoute) return;
  router.replace({
    query: { ...route.query, months: value.length ? value.join(",") : undefined },
  });
});

function monthsFromQuery(available) {
  const raw = route.query.months;
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((m) => available.includes(m))
    .sort();
}

async function loadData() {
  loading.value = true;
  loadError.value = "";

  try {
    const res = await api.get("/dashboard/monthly-kpi", {
      params: filters.value.building ? { building_name: filters.value.building } : {},
    });

    rawRows.value = res.data ?? [];
    const unique = [...new Set(rawRows.value.map((r) => r.month))].sort();
    monthsWithData.value = unique;

    syncingFromRoute = true;
    if (firstLoad) {
      selectedMonths.value = monthsFromQuery(unique);
      firstLoad = false;
    } else {
      // เปลี่ยนอาคารแล้วเดือนบางเดือนอาจไม่มีข้อมูลในอาคารใหม่ — ตัดเฉพาะเดือนที่
      // ไม่มีจริงออก ไม่ล้างทั้งหมด ผู้ใช้จะได้ไม่ต้องเลือกเดือนใหม่ทุกครั้งที่สลับอาคาร
      selectedMonths.value = selectedMonths.value.filter((m) => unique.includes(m));
    }
    syncingFromRoute = false;
  } catch (err) {
    console.error("Load compare data error:", err);
    loadError.value = "โหลดข้อมูลเปรียบเทียบไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

watch(() => filters.value.building, loadData);

/* --------------------------------------------------------------------------
   ตัวชี้วัดและการคำนวณ
   -------------------------------------------------------------------------- */
function aggregate(month) {
  const rows = rawRows.value.filter((r) => r.month === month && deviceMatches(r.device_id));
  if (!rows.length) return null;

  const totalPages = rows.reduce((s, r) => s + Number(r.pages_printed || 0), 0);
  const netPages = rows.reduce((s, r) => s + Number(r.net_pages || 0), 0);
  const totalCost = sumCost(rows);

  return {
    totalPages,
    netPages,
    totalCost,
    activeDevices: new Set(rows.map((r) => r.device_id)).size,
    costPerPage: totalPages > 0 ? totalCost / totalPages : 0,
  };
}

const monthStats = computed(() =>
  selectedMonths.value.map((m) => ({
    month: m,
    label: formatMonthTH(m, { long: true }),
    stats: aggregate(m),
  }))
);

/**
 * ตัวชี้วัดทั้งห้าของหน้านี้
 *
 * "รวม" คือยอดมิเตอร์ดิบตามที่กรอก ส่วน "สุทธิ" คือหลังหัก 20% ตามสัญญา —
 * แสดงคู่กันเสมอเพราะเป็นสองตัวเลขที่คนเอาไปสับสนกันบ่อยที่สุด
 */
const METRICS = [
  {
    key: "totalPages",
    label: "จำนวนหน้าพิมพ์รวม",
    unit: "หน้า",
    hint: "ยอดดิบตามที่กรอก ยังไม่หัก 20%",
    format: formatCount,
  },
  {
    key: "netPages",
    label: "จำนวนหน้าพิมพ์สุทธิ",
    unit: "หน้า",
    hint: "หลังหัก 20% แล้ว",
    format: formatCount,
  },
  {
    key: "totalCost",
    label: "ค่าใช้จ่ายสุทธิ",
    unit: "บาท",
    hint: "หลังหัก 20% แล้ว",
    format: formatBahtValue,
  },
  {
    key: "activeDevices",
    label: "เครื่องที่มีการใช้งาน",
    unit: "เครื่อง",
    hint: "นับเฉพาะเครื่องที่มียอดในเดือนนั้น",
    format: formatCount,
  },
  {
    key: "costPerPage",
    label: "ต้นทุนเฉลี่ยต่อหน้า",
    unit: "บาท/หน้า",
    hint: "ค่าใช้จ่ายสุทธิ หารด้วยจำนวนหน้าดิบ",
    format: (v) => Number(v).toFixed(3),
  },
];

function diffPercent(before, after) {
  if (!before) return after > 0 ? 100 : 0;
  return ((after - before) / before) * 100;
}

/** ผลต่างเทียบกับเดือนก่อนหน้า "ในรายการที่เลือก" ไม่ใช่เดือนก่อนหน้าตามปฏิทิน */
function deltaVsPrevious(metricKey, index) {
  if (index === 0) return null;
  const previous = monthStats.value[index - 1].stats;
  const current = monthStats.value[index].stats;
  if (!previous || !current) return null;
  return diffPercent(previous[metricKey], current[metricKey]);
}

const summaryFirst = computed(() => monthStats.value[0] ?? null);
const summaryLast = computed(() =>
  monthStats.value.length > 1 ? monthStats.value[monthStats.value.length - 1] : null
);

const summaryLines = computed(() => {
  if (!summaryFirst.value?.stats || !summaryLast.value?.stats) return [];

  return METRICS.map((metric) => {
    const before = summaryFirst.value.stats[metric.key];
    const after = summaryLast.value.stats[metric.key];
    const percent = diffPercent(before, after);

    if (Math.abs(percent) < 0.05) {
      return {
        trend: null,
        text: `${metric.label}แทบไม่เปลี่ยน (${metric.format(before)} → ${metric.format(after)} ${metric.unit})`,
      };
    }

    return {
      trend: percent > 0 ? "up" : "down",
      text:
        `${metric.label}${percent > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(percent).toFixed(1)}% ` +
        `(จาก ${metric.format(before)} เป็น ${metric.format(after)} ${metric.unit})`,
    };
  });
});

onMounted(async () => {
  await loadMasterData();
  await loadData();
});
</script>

<template>
  <div>
    <UiPageHeader
      eyebrow="รายงาน"
      title="เปรียบเทียบข้อมูลรายเดือน"
      description="เลือกเดือนที่ต้องการวางเทียบกัน ระบบจะสรุปให้ว่าตัวเลขไหนขยับไปทางไหนและกี่เปอร์เซ็นต์"
    />

    <!-- ตัวกรอง -->
    <UiCard class="mb-4" title="เลือกช่วงที่จะเปรียบเทียบ">
      <template #actions>
        <UiButton v-if="hasActiveFilter" size="sm" variant="ghost" @click="resetFilters">
          ล้างตัวกรอง
        </UiButton>
      </template>

      <UiField
        label="เดือนที่จะเปรียบเทียบ"
        hint="เลือกได้หลายเดือน — ระบบจะเรียงตามเวลาและเทียบกับเดือนก่อนหน้าในรายการให้เอง"
        class="max-w-sm mb-4"
      >
        <PeriodPicker
          v-model="selectedMonths"
          :options="monthsWithData"
          mode="multi"
          all-label="ทุกเดือนที่มีข้อมูล"
          :all-emits-empty="false"
        />
      </UiField>

      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 pt-4 border-t border-line-soft">
        <UiField label="อาคาร">
          <UiCombobox v-model="filters.building" :options="buildingOptions" placeholder="ทุกอาคาร" any-label="ทุกอาคาร" />
        </UiField>

        <UiField label="ชั้น">
          <UiCombobox v-model="filters.floor" :options="floorOptions" placeholder="ทุกชั้น" any-label="ทุกชั้น" />
        </UiField>

        <UiField label="ยี่ห้อ">
          <UiCombobox v-model="filters.brand" :options="brandOptions" placeholder="ทุกยี่ห้อ" any-label="ทุกยี่ห้อ" />
        </UiField>

        <UiField label="ฝ่าย">
          <UiCombobox v-model="filters.division" :options="divisionOptions" placeholder="ทุกฝ่าย" any-label="ทุกฝ่าย" />
        </UiField>

        <UiField label="แผนก">
          <UiCombobox v-model="filters.department" :options="departmentOptions" placeholder="ทุกแผนก" any-label="ทุกแผนก" />
        </UiField>

        <UiField label="สถานะเครื่อง">
          <UiSelect v-model="filters.status" :options="STATUS_OPTIONS" value-key="value" label-key="label" />
        </UiField>
      </div>
    </UiCard>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadData">ลองใหม่</UiButton>
      </template>
    </UiAlert>

    <div v-if="loading" class="flex flex-col gap-3">
      <UiSkeleton height="8rem" />
      <UiSkeleton height="14rem" />
    </div>

    <UiCard v-else-if="!monthStats.length">
      <UiEmpty
        title="ยังไม่ได้เลือกเดือน"
        description="เลือกอย่างน้อยหนึ่งเดือนด้านบน หรือสองเดือนขึ้นไปเพื่อให้ระบบสรุปความเปลี่ยนแปลงให้"
      />
    </UiCard>

    <template v-else>
      <!-- บทสรุปอัตโนมัติ -->
      <UiCard
        v-if="summaryFirst && summaryLast"
        class="mb-4"
        eyebrow="สรุปอัตโนมัติ"
        :title="`${summaryFirst.label} เทียบกับ ${summaryLast.label}`"
        :description="monthStats.length > 2 ? `จากทั้งหมด ${monthStats.length} เดือนที่เลือก` : ''"
      >
        <ul class="flex flex-col gap-2 list-none">
          <li v-for="(line, index) in summaryLines" :key="index" class="flex items-start gap-2 text-sm">
            <component
              :is="line.trend === 'up' ? TrendingUp : line.trend === 'down' ? TrendingDown : Minus"
              :size="15"
              class="shrink-0 mt-0.5"
              :class="
                line.trend === 'up' ? 'text-danger-ink' : line.trend === 'down' ? 'text-ok-ink' : 'text-ink-mute'
              "
              aria-hidden="true"
            />
            <span class="text-ink-soft">{{ line.text }}</span>
          </li>
        </ul>
      </UiCard>

      <UiAlert v-else tone="warn" class="mb-4">
        ตอนนี้เลือกไว้เดือนเดียว ({{ summaryFirst?.label }}) — เลือกอีกเดือนเพื่อให้ระบบเทียบให้
      </UiAlert>

      <!-- ตารางเปรียบเทียบ -->
      <UiCard flush class="mb-4" title="ตารางเปรียบเทียบ">
        <div class="overflow-x-auto scroll-hint-x">
          <table class="w-full text-sm min-w-max">
            <thead>
              <tr class="bg-surface-2">
                <th
                  scope="col"
                  class="sticky left-0 z-[1] bg-surface-2 text-left text-xs font-semibold text-ink-mute px-4 py-2.5 border-b border-line-soft shadow-[1px_0_0_var(--line-soft)]"
                >
                  ตัวชี้วัด
                </th>
                <th
                  v-for="stat in monthStats"
                  :key="stat.month"
                  scope="col"
                  class="text-right text-xs font-semibold text-ink-mute px-4 py-2.5 whitespace-nowrap border-b border-line-soft"
                >
                  {{ stat.label }}
                </th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="metric in METRICS" :key="metric.key" class="border-b border-line-soft last:border-0">
                <th
                  scope="row"
                  class="sticky left-0 z-[1] bg-surface text-left font-normal px-4 py-2.5 shadow-[1px_0_0_var(--line-soft)]"
                >
                  <span class="block text-ink-soft">{{ metric.label }}</span>
                  <span class="block text-2xs text-ink-mute">{{ metric.hint }}</span>
                </th>

                <td v-for="(stat, index) in monthStats" :key="stat.month" class="px-4 py-2.5 text-right">
                  <span class="block font-semibold text-ink numeral">
                    {{ stat.stats ? metric.format(stat.stats[metric.key]) : "—" }}
                  </span>

                  <span
                    v-if="deltaVsPrevious(metric.key, index) !== null"
                    class="inline-flex items-center gap-0.5 text-2xs font-medium numeral"
                    :class="deltaVsPrevious(metric.key, index) >= 0 ? 'text-danger-ink' : 'text-ok-ink'"
                  >
                    <component
                      :is="deltaVsPrevious(metric.key, index) >= 0 ? TrendingUp : TrendingDown"
                      :size="11"
                      aria-hidden="true"
                    />
                    {{ Math.abs(deltaVsPrevious(metric.key, index)).toFixed(1) }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>

      <!-- กราฟรายตัวชี้วัด -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <!-- กราฟย่อยชุดเดียวกันหลายใบ (small multiples) — ทุกใบมีชุดข้อมูลเดียว
             จึงใช้สีเดียวกันทั้งหมด หัวการ์ดเป็นตัวบอกว่าใบไหนคือตัวชี้วัดอะไร
             การให้สีต่างกันทั้งที่ไม่ได้ใช้สีสื่อความหมายคือการเปลืองช่องทางสีไปเปล่าๆ -->
        <UiCard v-for="metric in METRICS" :key="`chart-${metric.key}`" :title="metric.label" :eyebrow="metric.unit">
          <UiChart
            kind="line"
            :labels="monthStats.map((s) => s.label)"
            :series="[
              {
                key: metric.key,
                label: metric.label,
                slot: 1,
                data: monthStats.map((s) => s.stats?.[metric.key] ?? null),
              },
            ]"
            height="13rem"
            :loading="loading"
            :unit="metric.unit"
            :format-value="metric.format"
            category-label="เดือน"
          />
        </UiCard>
      </div>
    </template>
  </div>
</template>
