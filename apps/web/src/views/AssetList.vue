<script setup>
/**
 * AssetList — ทะเบียนเครื่องพิมพ์ทั้งหมด
 *
 * เป็นหน้าที่มีตัวกรองเยอะที่สุดในระบบ (ยี่ห้อ อาคาร ชั้น ฝ่าย แผนก ปีงบ สถานะ)
 * เดิมวางเรียงเป็นแถวยาวเต็มความกว้างเหนือตาราง ทำให้เกิดปัญหาสองข้อ
 *
 *   - ตารางถูกดันตกจอ ต้องเลื่อนลงทุกครั้งที่เปิดหน้าถึงจะเห็นข้อมูล
 *   - มองไม่ออกว่าตอนนี้กรองอะไรอยู่บ้าง ต้องกวาดตาอ่านทุกช่องทีละช่อง
 *     ผลคือคนเห็นตารางว่างแล้วคิดว่าไม่มีข้อมูล ทั้งที่ลืมตัวกรองค้างไว้
 *
 * ตอนนี้ตัวกรองพับเก็บได้ และมี "ชิป" แสดงเงื่อนไขที่กำลังใช้อยู่เสมอแม้พับแล้ว
 * กดกากบาทบนชิปเพื่อเอาเงื่อนไขนั้นออกทีละอันได้ทันที
 *
 * ตัวเลือกชั้นและแผนกผูกกับอาคารและฝ่ายที่เลือกไว้ (cascading) เพื่อไม่ให้เลือก
 * ชั้นที่ไม่มีอยู่ในอาคารนั้นแล้วได้ตารางว่างโดยไม่รู้สาเหตุ
 */
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { CirclePlus, FileSpreadsheet, Move, Pencil, Trash2 } from "lucide-vue-next";
import api from "../services/api";
import { useQueryClient } from "@tanstack/vue-query";
import { invalidateAfterWrite } from "../api/invalidate";
import { authState } from "../store/auth";
import { askConfirm } from "../store/confirmDialog";
import { toastError, toastSuccess } from "../store/toast";
import { formatBahtValue, formatCount } from "../lib/format";
import AssetForm from "./AssetForm.vue";
import MoveDeviceModal from "./MoveDeviceModal.vue";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCombobox,
  UiDataTable,
  UiField,
  UiFilterBar,
  UiPageHeader,
  UiSegmented,
  UiTooltip,
} from "../ui";

const isAdmin = computed(() => authState.user?.role === "admin");

const assets = ref([]);
const loading = ref(true);
const loadError = ref("");

const fiscalYears = ref([]);
const brands = ref([]);
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);


/**
 * ค่าเริ่มต้นของตัวกรอง — ประกาศไว้ที่เดียวแล้วใช้ทั้งตอนเริ่มและตอนล้าง
 * เดิมเขียนรายการช่องซ้ำสองที่ แล้วเพิ่มช่องใหม่โดยลืมแก้ตัวที่สอง ทำให้ปุ่ม
 * "ล้างตัวกรอง" ล้างไม่ครบและผู้ใช้เห็นรายการที่ยังถูกกรองอยู่โดยไม่มีป้ายบอก
 */
function emptyFilters() {
  return {
    brand: "",
    building: "",
    floor: "",
    division: "",
    department: "",
    fiscalYear: "",
    status: "",
    // "ยังไม่ผูกสัญญา" — เครื่องกลุ่มนี้คิดค่าใช้จ่ายไม่ได้เลยถ้าไม่มีราคาเฉพาะเครื่อง
    // ยอดพิมพ์ของมันจึงหายไปจากงบเงียบๆ แดชบอร์ดเตือนเรื่องนี้แล้วลิงก์มาที่นี่
    unassigned: "",
  };
}

const filters = ref(emptyFilters());

const STATUS_META = {
  active: { label: "ใช้งานอยู่", tone: "ok" },
  repair: { label: "ซ่อมบำรุง", tone: "warn" },
  retired: { label: "ปลดระวาง", tone: "neutral" },
};

const STATUS_OPTIONS = [
  { value: "", label: "ทั้งหมด" },
  { value: "active", label: "ใช้งานอยู่" },
  { value: "repair", label: "ซ่อมบำรุง" },
  { value: "retired", label: "ปลดระวาง" },
];

const CONTRACT_OPTIONS = [
  { value: "", label: "ทั้งหมด" },
  { value: "1", label: "ยังไม่ผูกสัญญา" },
];

/* --------------------------------------------------------------------------
   ตัวเลือกของตัวกรอง
   -------------------------------------------------------------------------- */
const toOptions = (list) => list.map((item) => ({ value: item.name, label: item.name }));

const brandOptions = computed(() => toOptions(brands.value));
const buildingOptions = computed(() => toOptions(buildings.value));
const divisionOptions = computed(() => toOptions(divisions.value));

const fiscalYearOptions = computed(() =>
  fiscalYears.value.map((f) => ({ value: String(f.year), label: `ปีงบ ${Number(f.year)}` }))
);

/** ชั้นที่เลือกได้ = เฉพาะชั้นในอาคารที่เลือกไว้ และตัดชื่อซ้ำออก */
const floorOptions = computed(() => {
  const building = buildings.value.find((b) => b.name === filters.value.building);
  const source = building
    ? floors.value.filter((f) => Number(f.building_id) === Number(building.id))
    : floors.value;

  const seen = new Set();
  return source
    .filter((f) => !seen.has(f.name) && seen.add(f.name))
    .map((f) => ({ value: f.name, label: f.name }));
});

const departmentOptions = computed(() => {
  const division = divisions.value.find((d) => d.name === filters.value.division);
  const source = division
    ? departments.value.filter((d) => Number(d.division_id) === Number(division.id))
    : departments.value;
  return toOptions(source);
});

/* --------------------------------------------------------------------------
   ชิปสรุปเงื่อนไขที่ใช้อยู่ — เห็นได้ตลอดแม้พับแผงตัวกรองแล้ว
   -------------------------------------------------------------------------- */
const FILTER_LABELS = {
  brand: "ยี่ห้อ",
  building: "อาคาร",
  floor: "ชั้น",
  division: "ฝ่าย",
  department: "แผนก",
  fiscalYear: "ปีงบ",
  status: "สถานะ",
  unassigned: "สัญญา",
};

const activeFilters = computed(() =>
  Object.entries(filters.value)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => ({
      key,
      label: FILTER_LABELS[key],
      value:
        key === "status"
          ? (STATUS_META[value]?.label ?? value)
          : key === "unassigned"
            ? "ยังไม่ผูกสัญญา"
            : value,
    }))
);

/**
 * ป้ายที่ส่งให้ UiFilterBar
 *
 * ตัดสถานะเครื่องกับสัญญาออก เพราะสองอันนั้นเป็นปุ่มแบบแบ่งช่องที่อยู่ในสายตา
 * ตลอดอยู่แล้ว — การมีป้ายซ้ำอีกทำให้มีสองที่ที่เอาตัวกรองเดียวกันออกได้
 * ซึ่งชวนสับสนมากกว่าช่วย (หน้าบันทึกยอดพิมพ์ตัดช่องเลือกเดือนออกด้วยเหตุผลเดียวกัน)
 */
const CHIP_HIDDEN_KEYS = new Set(["status", "unassigned"]);

const filterChips = computed(() =>
  activeFilters.value
    .filter((chip) => !CHIP_HIDDEN_KEYS.has(chip.key))
    .map((chip) => ({ key: chip.key, label: `${chip.label}: ${chip.value}` }))
);

function clearFilter(key) {
  filters.value[key] = "";
}

function resetFilters() {
  filters.value = emptyFilters();
}

// เปลี่ยนอาคาร/ฝ่ายแล้ว ชั้น/แผนกที่เลือกไว้อาจไม่อยู่ในตัวเลือกใหม่ ล้างทิ้ง
watch(() => filters.value.building, () => (filters.value.floor = ""));
watch(() => filters.value.division, () => (filters.value.department = ""));

/* --------------------------------------------------------------------------
   ข้อมูล
   -------------------------------------------------------------------------- */
const filteredAssets = computed(() =>
  assets.value.filter(
    (a) =>
      (!filters.value.brand || a.brand_name === filters.value.brand) &&
      (!filters.value.building || a.building_name === filters.value.building) &&
      (!filters.value.floor || a.floor_name === filters.value.floor) &&
      (!filters.value.division || a.division_name === filters.value.division) &&
      (!filters.value.department || a.department_name === filters.value.department) &&
      (!filters.value.fiscalYear || String(a.fiscal_year) === filters.value.fiscalYear) &&
      (!filters.value.status || a.status === filters.value.status) &&
      (!filters.value.unassigned || !a.contract_no)
  )
);

/* --------------------------------------------------------------------------
   ลิงก์เข้าหน้านี้แบบเจาะจงตัวกรอง

   แถบ "สิ่งที่ต้องจัดการ" บนหน้าแรกลิงก์มาที่นี่พร้อมตัวกรองที่เกี่ยวข้อง —
   คำเตือนที่พาไปหน้าเปล่าแล้วให้ผู้ใช้ไล่หาเองว่ารายการไหนคือรายการที่เตือน
   คือคำเตือนที่ไม่มีใครกดครั้งที่สอง

   อ่านค่าครั้งเดียวตอนเปิดหน้า ไม่ผูกสองทางกับ URL เพราะการเขียน query กลับทุกครั้ง
   ที่ผู้ใช้ขยับตัวกรอง จะทำให้ปุ่มย้อนกลับของเบราว์เซอร์กลายเป็น "ย้อนตัวกรองทีละขั้น"
   ซึ่งไม่ใช่สิ่งที่คนคาดหวังจากปุ่มนั้น
   -------------------------------------------------------------------------- */
const route = useRoute();

const queryClient = useQueryClient();

onMounted(() => {
  if (route.query.status && STATUS_META[route.query.status]) {
    filters.value.status = route.query.status;
  }

  if (route.query.unassigned) {
    filters.value.unassigned = "1";
  }

  /**
   * เปิดหน้าต่างแก้ไข/ย้าย ตามที่หน้ารายละเอียดเครื่องส่งมา
   *
   * หน้ารายละเอียด (`/assets/:id`) ไม่มีฟอร์มของตัวเอง แต่ลิงก์กลับมาที่นี่พร้อม
   * `?edit=` หรือ `?move=` แทน — ฟอร์มกับ dialog ย้ายเครื่องมีที่อยู่ที่เดียว
   * ไม่ต้องดูแลสองชุดที่ค่อยๆ เพี้ยนออกจากกัน
   *
   * เช็คสิทธิ์ก่อนเปิดเสมอ ไม่ใช่เพราะกันคนแก้ (API เป็นคนบังคับสิทธิ์จริง) แต่
   * เพราะการเปิดฟอร์มให้คนที่กดบันทึกแล้วจะโดนปฏิเสธ คือการเสียเวลาเปล่าของเขา
   */
  if (isAdmin.value) {
    const editId = Number(route.query.edit);
    const moveId = Number(route.query.move);

    if (Number.isInteger(editId) && editId > 0) openEdit(editId);
    else if (Number.isInteger(moveId) && moveId > 0) openMove(moveId);
  }
});

/** ราคาที่ใช้จริง — ราคาเฉพาะเครื่องมีศักดิ์สูงกว่าราคาตามสัญญา */
function effectivePrice(asset) {
  const price = asset.price_override ?? asset.price_per_page;
  return price === null || price === undefined ? null : Number(price);
}

const columns = [
  { key: "serial_number", label: "Serial", width: "11rem" },
  {
    key: "brand_name",
    label: "ยี่ห้อ / รุ่น",
    value: (a) => `${a.brand_name || ""} ${a.model || ""}`.trim(),
  },
  { key: "building_name", label: "อาคาร" },
  { key: "floor_name", label: "ชั้น" },
  { key: "location", label: "ตำแหน่งที่ตั้ง" },
  { key: "division_name", label: "ฝ่าย", hidden: true },
  { key: "department_name", label: "แผนก" },
  { key: "contract_no", label: "สัญญา" },
  {
    key: "effective_price",
    label: "ราคา/แผ่น",
    align: "right",
    value: (a) => effectivePrice(a),
    csv: (a) => effectivePrice(a) ?? "",
  },
  {
    key: "status",
    label: "สถานะ",
    align: "center",
    value: (a) => STATUS_META[a.status]?.label ?? a.status,
  },
];

async function loadAssets() {
  loading.value = true;
  loadError.value = "";

  try {
    const res = await api.get("/devices");
    assets.value = res.data ?? [];
  } catch (err) {
    console.error("Load assets error:", err);
    loadError.value = "โหลดทะเบียนทรัพย์สินไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

async function loadFilterData() {
  try {
    const [fy, brand, building, floor, division, department] = await Promise.all([
      api.get("/fiscal-years"),
      api.get("/brands"),
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
    ]);

    fiscalYears.value = fy.data ?? [];
    brands.value = brand.data ?? [];
    buildings.value = building.data ?? [];
    floors.value = floor.data ?? [];
    divisions.value = division.data ?? [];
    departments.value = department.data ?? [];
  } catch (err) {
    console.error("Load filter data error:", err);
  }
}

/* --------------------------------------------------------------------------
   การกระทำกับหนึ่งเครื่อง (admin เท่านั้น — API บังคับสิทธิ์อยู่แล้ว
   ที่นี่แค่ไม่แสดงปุ่มที่กดไปก็ทำไม่ได้)
   -------------------------------------------------------------------------- */
const formOpen = ref(false);
const moveOpen = ref(false);
const activeAssetId = ref(null);

function openEdit(id) {
  activeAssetId.value = id;
  formOpen.value = true;
}

function openMove(id) {
  activeAssetId.value = id;
  moveOpen.value = true;
}

async function remove(asset) {
  const confirmed = await askConfirm(
    `เครื่อง Serial “${asset.serial_number}” จะถูกลบออกจากทะเบียน ยอดพิมพ์ที่เคยบันทึกไว้จะไม่ถูกนำมาคิดในรายงานอีก`,
    { title: "ลบเครื่องนี้ออกจากทะเบียน", confirmText: "ลบเครื่องนี้", danger: true }
  );
  if (!confirmed) return;

  try {
    await api.delete(`/devices/${asset.id}`);
    toastSuccess("ลบเครื่องออกจากทะเบียนเรียบร้อย");
    await Promise.all([loadAssets(), invalidateAfterWrite(queryClient, "device")]);
  } catch (err) {
    console.error(err);
    toastError(err.response?.data?.error || "ลบไม่สำเร็จ — อาจมียอดพิมพ์ที่อ้างถึงเครื่องนี้อยู่");
  }
}

onMounted(async () => {
  await loadAssets();
  await loadFilterData();
});
</script>

<template>
  <div>
    <UiPageHeader
      eyebrow="ทรัพย์สิน"
      title="ทะเบียนเครื่องพิมพ์"
      description="เครื่องพิมพ์และเครื่องถ่ายเอกสารทั้งหมดที่อยู่ในความดูแล พร้อมที่ตั้งและสัญญาที่ผูกอยู่"
    >
      <template #meta>
        <p class="text-xs text-ink-mute mt-2">
          <span class="numeral font-semibold text-ink-soft">{{ formatCount(filteredAssets.length) }}</span>
          เครื่องที่ตรงกับเงื่อนไข
          <span v-if="filteredAssets.length !== assets.length" class="text-ink-mute">
            (จากทั้งหมด {{ formatCount(assets.length) }})
          </span>
        </p>
      </template>

      <template #actions>
        <UiButton v-if="isAdmin" to="/admin/add-asset" variant="primary">
          <template #icon><CirclePlus :size="16" /></template>
          เพิ่มเครื่อง
        </UiButton>
      </template>
    </UiPageHeader>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadAssets">ลองใหม่</UiButton>
      </template>
    </UiAlert>

    <!-- ตัวกรอง — ใช้ UiFilterBar ตัวเดียวกับหน้าบันทึกยอดพิมพ์
         เดิมหน้านี้เขียนแผงพับกับชิปขึ้นเองแยกต่างหาก ทำให้สองหน้าที่ทำงาน
         เหมือนกันหน้าตาไม่เหมือนกัน และเวลาแก้พฤติกรรมต้องแก้สองที่ -->
    <UiFilterBar :chips="filterChips" @remove="clearFilter" @clear="resetFilters">
      <template #primary>
        <UiField label="สถานะเครื่อง">
          <UiSegmented v-model="filters.status" :options="STATUS_OPTIONS" size="sm" label="กรองตามสถานะเครื่อง" />
        </UiField>

        <!--
          เครื่องที่ยังไม่ผูกสัญญาคิดค่าใช้จ่ายไม่ได้เลยถ้าไม่มีราคาเฉพาะเครื่อง —
          ยอดพิมพ์ของมันหายไปจากงบเงียบๆ จึงต้องมีทางกรองดูได้โดยตรง ไม่ใช่ต้อง
          ไล่กวาดสายตาหาช่องสัญญาที่ว่างในตารางเป็นร้อยแถว
        -->
        <UiField label="สัญญา">
          <UiSegmented
            v-model="filters.unassigned"
            :options="CONTRACT_OPTIONS"
            size="sm"
            label="กรองตามการผูกสัญญา"
          />
        </UiField>
      </template>

      <UiField label="ยี่ห้อ">
        <UiCombobox v-model="filters.brand" :options="brandOptions" placeholder="ทุกยี่ห้อ" any-label="ทุกยี่ห้อ" />
      </UiField>

      <UiField label="อาคาร">
        <UiCombobox v-model="filters.building" :options="buildingOptions" placeholder="ทุกอาคาร" any-label="ทุกอาคาร" />
      </UiField>

      <UiField label="ชั้น">
        <UiCombobox v-model="filters.floor" :options="floorOptions" placeholder="ทุกชั้น" any-label="ทุกชั้น" />
      </UiField>

      <UiField label="ฝ่าย">
        <UiCombobox v-model="filters.division" :options="divisionOptions" placeholder="ทุกฝ่าย" any-label="ทุกฝ่าย" />
      </UiField>

      <UiField label="แผนก">
        <UiCombobox
          v-model="filters.department"
          :options="departmentOptions"
          placeholder="ทุกแผนก"
          any-label="ทุกแผนก"
        />
      </UiField>

      <UiField label="ปีงบประมาณ">
        <UiCombobox
          v-model="filters.fiscalYear"
          :options="fiscalYearOptions"
          placeholder="ทุกปีงบ"
          any-label="ทุกปีงบ"
        />
      </UiField>
    </UiFilterBar>

    <UiDataTable
      :rows="filteredAssets"
      :columns="columns"
      :loading="loading"
      row-key="id"
      export-filename="assets"
      search-placeholder="ค้นหา Serial, รุ่น, ตำแหน่ง…"
      empty-text="ยังไม่มีเครื่องในทะเบียน"
      empty-hint="เพิ่มทีละเครื่อง หรือนำเข้าทั้งหมดจากไฟล์ Excel ในครั้งเดียว"
      max-height="70vh"
      sticky-first
    >
      <!-- Serial เป็นลิงก์ไปหน้ารายละเอียดของเครื่องนั้น
           เดิมแถวหนึ่งแถวไม่มีทางกดเข้าไปดูอะไรได้เลย ข้อมูลทั้งหมดของเครื่อง
           จึงต้องยัดอยู่ในแถวที่กว้างเกินจอ — ตอนนี้ตารางเก็บเฉพาะสิ่งที่ใช้
           "หา" เครื่อง ส่วนสิ่งที่ใช้ "เข้าใจ" เครื่องอยู่ในหน้ารายละเอียด

           ทำเป็นลิงก์จริง ไม่ใช่ทั้งแถวที่กดได้ เพราะแถวนี้มีปุ่มแก้ไข/ย้าย/ลบ
           อยู่ด้วย การทำทั้งแถวให้กดได้จะทำให้กดพลาดไปหน้าอื่นตอนเล็งปุ่ม -->
      <!-- inline-flex + min-h-6: ข้อ 2.5.8 บังคับพื้นที่กด 24x24 ส่วนตัวอักษร
           บรรทัดเดียวสูงแค่ 17px และลิงก์นี้ไม่เข้าข้อยกเว้น "อยู่ในประโยค"
           เพราะมันอยู่เดี่ยวๆ ในช่องตาราง ไม่ได้แทรกอยู่ในข้อความ -->
      <template #cell-serial_number="{ row }">
        <RouterLink
          :to="`/assets/${row.id}`"
          class="inline-flex items-center min-h-6 font-mono text-sm text-ink hover:text-brand-ink hover:underline underline-offset-2 rounded-xs"
        >
          {{ row.serial_number || "—" }}
        </RouterLink>
        <span v-if="row.asset_code" class="block text-2xs text-ink-mute font-mono">
          {{ row.asset_code }}
        </span>
      </template>

      <template #cell-brand_name="{ row }">
        <span class="text-ink-soft">{{ row.brand_name || "—" }}</span>
        <span class="block text-2xs text-ink-mute">{{ row.model || "" }}</span>
      </template>

      <template #cell-contract_no="{ row }">
        <span>{{ row.contract_no || "—" }}</span>
        <span v-if="row.fiscal_year" class="block text-2xs text-ink-mute numeral">
          ปีงบ {{ Number(row.fiscal_year) }}
        </span>
      </template>

      <template #cell-effective_price="{ row }">
        <span>{{ effectivePrice(row) === null ? "—" : formatBahtValue(effectivePrice(row)) }}</span>
        <UiTooltip
          v-if="row.price_override !== null && row.price_override !== undefined"
          content="เครื่องนี้ตั้งราคาต่อแผ่นเฉพาะตัว ไม่ได้ใช้ราคาตามสัญญา"
        >
          <span class="block text-2xs text-accent-ink cursor-help">ราคาเฉพาะเครื่อง</span>
        </UiTooltip>
      </template>

      <template #cell-status="{ row }">
        <UiBadge :tone="STATUS_META[row.status]?.tone ?? 'neutral'" dot>
          {{ STATUS_META[row.status]?.label ?? row.status }}
        </UiBadge>
      </template>

      <template #empty="{ search }">
        <div class="py-12 text-center">
          <template v-if="search || activeFilters.length">
            <p class="text-md font-semibold text-ink">ไม่มีเครื่องที่ตรงกับเงื่อนไข</p>
            <p class="text-sm text-ink-mute mt-1">ลองเอาตัวกรองบางอันออก แล้วดูใหม่อีกครั้ง</p>
            <UiButton v-if="activeFilters.length" size="sm" variant="secondary" class="mt-4" @click="resetFilters">
              ล้างตัวกรองทั้งหมด
            </UiButton>
          </template>

          <template v-else>
            <p class="text-md font-semibold text-ink">ยังไม่มีเครื่องในทะเบียน</p>
            <p class="text-sm text-ink-mute mt-1">
              เริ่มจากนำเข้าไฟล์ Excel ที่มีอยู่แล้ว จะเร็วกว่าพิมพ์ทีละเครื่องมาก
            </p>
            <UiButton
              v-if="isAdmin"
              variant="primary"
              size="sm"
              class="mt-4"
              :to="{ path: '/admin/add-asset', query: { tab: 'import' } }"
            >
              <template #icon><FileSpreadsheet :size="15" /></template>
              นำเข้าจากไฟล์ CSV / Excel
            </UiButton>
          </template>
        </div>
      </template>

      <template v-if="isAdmin" #actions="{ row }">
        <UiTooltip content="แก้ไขข้อมูลเครื่อง">
          <UiButton size="sm" variant="ghost" icon-only :label="`แก้ไข ${row.serial_number}`" @click="openEdit(row.id)">
            <Pencil :size="15" />
          </UiButton>
        </UiTooltip>

        <UiTooltip content="ย้ายที่ตั้งหรือเปลี่ยนแผนก">
          <UiButton size="sm" variant="ghost" icon-only :label="`ย้าย ${row.serial_number}`" @click="openMove(row.id)">
            <Move :size="15" />
          </UiButton>
        </UiTooltip>

        <UiTooltip content="ลบออกจากทะเบียน">
          <UiButton
            size="sm"
            variant="danger-ghost"
            icon-only
            :label="`ลบ ${row.serial_number}`"
            @click="remove(row)"
          >
            <Trash2 :size="15" />
          </UiButton>
        </UiTooltip>
      </template>
    </UiDataTable>

    <AssetForm v-model="formOpen" :asset-id="activeAssetId" @saved="loadAssets" />
    <MoveDeviceModal v-model="moveOpen" :asset-id="activeAssetId" @saved="loadAssets" />
  </div>
</template>
