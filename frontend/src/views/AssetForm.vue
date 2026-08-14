<script setup>
/**
 * AssetForm.vue — Popup เพิ่ม/แก้ไขทรัพย์สิน
 *
 * โหมดแก้ไข (assetId เป็น number): แสดงฟอร์มแก้ไขอย่างเดียว เหมือนเดิม
 * โหมดเพิ่มใหม่ (assetId เป็น null): มีแท็บให้เลือก 2 แบบ อยู่ใน popup เดียวกัน
 *   1) "เพิ่มทีละรายการ" — ฟอร์มเดิม
 *   2) "นำเข้าไฟล์ (CSV/Excel)" — อัปโหลดไฟล์เพื่อเพิ่มหลายรายการพร้อมกัน
 *      (ย้ายมาจากหน้าแยก ImportDevices.vue เดิม)
 *
 * การใช้งาน (จาก AssetList.vue / AddAsset.vue):
 * <AssetForm v-model="showFormModal" :asset-id="editingAssetId" :initial-tab="'import'" @saved="onSaved" />
 *
 * - modelValue (v-model): true = เปิด popup, false = ปิด
 * - assetId: null = โหมดเพิ่มใหม่ (มีแท็บ), number = โหมดแก้ไข (ไม่มีแท็บ)
 * - initialTab: 'single' | 'import' — แท็บเริ่มต้นตอนเปิด popup โหมดเพิ่มใหม่
 * - emits('saved', data): ยิงตอนเพิ่ม/แก้ไขทีละรายการสำเร็จ ให้ parent re-fetch รายการ
 */
import { ref, computed, watch } from "vue";
import api from "../services/api";
import SearchableSelect from "../components/SearchableSelect.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  assetId: { type: [Number, String, null], default: null },
  initialTab: { type: String, default: "single" },
});

const emit = defineEmits(["update:modelValue", "saved"]);

const isEdit = computed(() => props.assetId !== null && props.assetId !== undefined);

// =======================
// แท็บ (แสดงเฉพาะโหมดเพิ่มใหม่)
// =======================
const TABS = [
  { key: "single", label: "เพิ่มทีละรายการ" },
  { key: "import", label: "นำเข้าไฟล์ (CSV/Excel)" },
];

const activeTab = ref(props.initialTab === "import" ? "import" : "single");

function selectTab(key) {
  activeTab.value = key;
}

// =======================
// โหมดเพิ่ม/แก้ไข ทีละรายการ (ฟอร์มเดิม)
// =======================
const defaultForm = () => ({
  serial_number: "",
  brand_id: "",
  model: "",
  building_id: "",
  floor_id: "",
  location: "",
  division_id: "",
  department_id: "",
  contract_id: null,
  price_override: null,
  status: "active",
});

const form = ref(defaultForm());

const brands = ref([]);
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const contracts = ref([]);

const masterLoaded = ref(false);
const loading = ref(false); // โหลดข้อมูลเดิม (โหมดแก้ไข)
const saving = ref(false);
const formError = ref(null);

// floors ที่ backend คืนมามีของทุกอาคารรวมกัน ต้องกรองตาม building ที่เลือกไว้
// ไม่งั้นชื่อชั้นที่ซ้ำกันในแต่ละตึก (เช่น "ชั้น 1" ของทุกตึก) จะโชว์ปนกันเป็นรายการซ้ำๆ
const filteredFloors = computed(() => {
  if (!form.value.building_id) return [];
  return floors.value.filter(
    (f) => Number(f.building_id) === Number(form.value.building_id)
  );
});

// department ที่ backend คืนมามีของทุกฝ่ายรวมกัน ต้องกรองตามฝ่ายที่เลือกไว้ (เหมือน building → floor)
const filteredDepartments = computed(() => {
  if (!form.value.division_id) return [];
  return departments.value.filter(
    (d) => Number(d.division_id) === Number(form.value.division_id)
  );
});

// เมื่อผู้ใช้เปลี่ยนอาคารเอง ให้ล้างชั้นเดิมทิ้ง เพราะชั้นเดิมอาจไม่ได้อยู่ในอาคารใหม่
function onBuildingChange(value) {
  form.value.building_id = value;
  form.value.floor_id = "";
}

// เมื่อผู้ใช้เปลี่ยนฝ่ายเอง ให้ล้างแผนกเดิมทิ้ง เพราะแผนกเดิมอาจไม่ได้อยู่ในฝ่ายใหม่
function onDivisionChange(value) {
  form.value.division_id = value;
  form.value.department_id = "";
}

// ตัวเลือกสำหรับ SearchableSelect ของแต่ละฟิลด์ — สไตล์และการค้นหาแบบเดียวกับหน้า "บันทึกยอดพิมพ์รายเดือน"
const brandOptions = computed(() => brands.value.map((b) => ({ value: b.id, label: b.name })));
const buildingOptions = computed(() => buildings.value.map((b) => ({ value: b.id, label: b.name })));
const floorOptions = computed(() => filteredFloors.value.map((f) => ({ value: f.id, label: f.name })));
const divisionOptions = computed(() => divisions.value.map((d) => ({ value: d.id, label: d.name })));
const departmentOptions = computed(() => filteredDepartments.value.map((d) => ({ value: d.id, label: d.name })));

async function loadMasterData() {
  if (masterLoaded.value) return; // โหลดครั้งเดียวพอ ใช้ซ้ำได้ทุกครั้งที่เปิด modal
  try {
    const [brandRes, buildingRes, floorRes, divisionRes, departmentRes, contractRes] =
      await Promise.all([
        api.get("/brands"),
        api.get("/buildings"),
        api.get("/floors"),
        api.get("/divisions"),
        api.get("/departments"),
        api.get("/contracts"),
      ]);

    brands.value = brandRes.data;
    buildings.value = buildingRes.data;
    floors.value = floorRes.data;
    divisions.value = divisionRes.data;
    departments.value = departmentRes.data;
    contracts.value = contractRes.data;
    masterLoaded.value = true;
  } catch (err) {
    console.error("Load master error:", err);
    formError.value = "โหลด Master Data ไม่สำเร็จ";
  }
}

async function loadAsset(id) {
  loading.value = true;
  formError.value = null;
  try {
    const res = await api.get(`/devices/${id}`);
    const d = res.data.data ?? res.data;

    form.value = {
      serial_number: d.serial_number ?? "",
      brand_id: d.brand_id ?? "",
      model: d.model ?? "",
      building_id: d.building_id ?? "",
      floor_id: d.floor_id ?? "",
      location: d.location ?? "",
      division_id: d.division_id ?? "",
      department_id: d.department_id ?? "",
      contract_id: d.contract_id ?? null,
      price_override: d.price_override ?? null,
      status: d.status ?? "active",
    };
  } catch (err) {
    console.error("Load asset error:", err);
    formError.value = "โหลดข้อมูลทรัพย์สินไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

// =======================
// ประวัติการย้าย (อาคาร/ชั้น/ฝ่าย/แผนก) — ดูอย่างเดียว แสดงเฉพาะโหมดแก้ไข
// =======================
const showHistory = ref(false);
const historyLoading = ref(false);
const historyRows = ref([]);
const historyLoaded = ref(false);

function formatHistoryDate(value) {
  if (!value) return "-";
  // value เป็น "YYYY-MM-DD" จาก backend
  const [y, m, d] = value.split("-");
  const monthsTH = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  return `${Number(d)} ${monthsTH[Number(m) - 1] || m} ${Number(y) + 543}`;
}

async function loadHistory(id) {
  historyLoading.value = true;
  try {
    const res = await api.get(`/devices/${id}/history`);
    historyRows.value = res.data.history || [];
    historyLoaded.value = true;
  } catch (err) {
    console.error("Load device history error:", err);
  } finally {
    historyLoading.value = false;
  }
}

function toggleHistory() {
  showHistory.value = !showHistory.value;
  if (showHistory.value && !historyLoaded.value && isEdit.value) {
    loadHistory(props.assetId);
  }
}

// =======================
// นำเข้าไฟล์ (CSV/Excel) — ย้ายมาจาก ImportDevices.vue เดิม
// ประกาศ ref ของส่วนนี้ไว้ก่อน watch ด้านล่าง เพราะ watch มี immediate:true
// จะรันตอน setup ทันที ถ้า resetImportState() ถูกเรียกก่อน const พวกนี้ถูก initialize
// จะเจอ ReferenceError (temporal dead zone)
// =======================
const importFile = ref(null);
const importLoading = ref(false);
const importResult = ref(null);
const dragOver = ref(false);

const skippedCount = computed(() => importResult.value?.skipped?.length || 0);

function resetImportState() {
  importFile.value = null;
  importLoading.value = false;
  importResult.value = null;
  dragOver.value = false;
}

// เปิด modal ทีไร (หรือสลับระหว่าง add/edit) ให้เตรียมฟอร์มใหม่ให้ตรงโหมด
watch(
  () => [props.modelValue, props.assetId],
  ([visible, assetId]) => {
    if (!visible) return;

    formError.value = null;
    activeTab.value = props.initialTab === "import" ? "import" : "single";
    resetImportState();
    loadMasterData();

    showHistory.value = false;
    historyLoaded.value = false;
    historyRows.value = [];

    if (assetId !== null && assetId !== undefined) {
      loadAsset(assetId);
    } else {
      form.value = defaultForm();
    }
  },
  { immediate: true }
);

function validate() {
  if (!form.value.serial_number.trim()) return "กรุณากรอก Serial Number";
  if (!form.value.brand_id) return "กรุณาเลือก Brand";
  return null;
}

async function submit() {
  const err = validate();
  if (err) {
    formError.value = err;
    return;
  }

  const data = {
    serial_number: form.value.serial_number.trim(),
    brand_id: Number(form.value.brand_id),
    model: form.value.model,
    building_id: form.value.building_id ? Number(form.value.building_id) : null,
    floor_id: form.value.floor_id ? Number(form.value.floor_id) : null,
    location: form.value.location?.trim() || null,
    division_id: form.value.division_id ? Number(form.value.division_id) : null,
    department_id: form.value.department_id ? Number(form.value.department_id) : null,
    contract_id: form.value.contract_id ? Number(form.value.contract_id) : null,
    price_override:
      form.value.price_override !== "" && form.value.price_override !== null
        ? Number(form.value.price_override)
        : null,
    status: form.value.status || "active",
  };

  saving.value = true;
  formError.value = null;

  try {
    let res;
    if (isEdit.value) {
      res = await api.put(`/devices/${props.assetId}`, data);
    } else {
      res = await api.post("/devices", data);
    }

    emit("saved", res.data);
    close();
  } catch (err) {
    console.error("Save asset error:", err);
    formError.value = err.response?.data?.error || "บันทึกข้อมูลไม่สำเร็จ";
  } finally {
    saving.value = false;
  }
}

// เทมเพลต CSV — คอลัมน์เดียวกับที่ backend อ่าน (serial_number, brand, model, status, building)
// พร้อมคอลัมน์เผื่ออนาคต (floor, division, department, contract_no, price_override)
// status ใส่เป็น active / repair / retired ได้เลย (ไม่กรอก = default "active" เหมือนฟอร์มเพิ่มทีละรายการ)
const TEMPLATE_CSV = [
  "serial_number,brand,model,status,building,floor,division,department,contract_no,price_override",
  "SN-HP-001,HP,LaserJet M404dn,active,อาคารบริหาร,ชั้น 2,ฝ่ายบริหารงานทั่วไป,แผนกการเงินและบัญชี,CONT-67-001,",
  "SN-CN-002,Canon,imageCLASS LBP6030,active,อาคารบริหาร,ชั้น 3,ฝ่ายบริหารงานทั่วไป,แผนกทรัพยากรบุคคล,CONT-67-001,",
  "SN-EP-003,Epson,EcoTank L3250,repair,อาคารผู้ป่วยนอก (OPD),ชั้น 1,ฝ่ายการแพทย์,แผนกอายุรกรรม,CONT-67-001,1.50",
].join("\r\n");

function downloadTemplate() {
  // ใส่ BOM กัน Excel เปิดภาษาไทยแล้วเพี้ยน (แบบเดียวกับ export CSV ใน DataTable.vue)
  const blob = new Blob(["\uFEFF" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_import_devices.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setImportFile(f) {
  if (!f) return;
  importFile.value = f;
  importResult.value = null; // ไฟล์ใหม่ = ล้างผลลัพธ์เก่าทิ้ง กันสับสนว่าผลลัพธ์เป็นของไฟล์ไหน
}

const handleImportFileChange = (e) => {
  setImportFile(e.target.files[0]);
};

const handleImportDrop = (e) => {
  dragOver.value = false;
  setImportFile(e.dataTransfer.files[0]);
};

function clearImportFile() {
  importFile.value = null;
  importResult.value = null;
}

const uploadImportFile = async () => {
  if (!importFile.value) return;

  importLoading.value = true;
  importResult.value = null;

  const formData = new FormData();
  formData.append("file", importFile.value);

  try {
    // ใช้ api.js แทน fetch ตรงๆ เพื่อให้แนบ token และใช้ base URL เดียวกับหน้าอื่นๆ
    const res = await api.post("/devices/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    importResult.value = res.data;
  } catch (err) {
    console.error("Upload error:", err);

    importResult.value = {
      error: err.response?.data?.error || "อัปโหลดไม่สำเร็จ กรุณาลองใหม่",
    };
  } finally {
    importLoading.value = false;
  }
};

// =======================
// ปิด popup
// =======================
function close() {
  if (saving.value || importLoading.value) return;
  emit("update:modelValue", false);
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
    @click.self="close"
  >
    <div class="bg-gray-50 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div class="p-5 border-b flex items-center justify-between">
        <h2 class="text-lg font-bold">
          {{ isEdit ? "แก้ไขทรัพย์สิน" : "เพิ่มทรัพย์สิน" }}
        </h2>
        <button @click="close" class="text-gray-400 hover:text-gray-700 text-xl leading-none">
          &times;
        </button>
      </div>

      <!-- แท็บ (เฉพาะโหมดเพิ่มใหม่) -->
      <div v-if="!isEdit" class="flex gap-1 border-b px-5">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          @click="selectTab(tab.key)"
          class="px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="activeTab === tab.key
            ? 'border-[var(--brand-text)] text-[var(--brand-text)]'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- แท็บ: เพิ่ม/แก้ไข ทีละรายการ -->
      <template v-if="isEdit || activeTab === 'single'">
        <div class="p-5">
          <div v-if="loading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูลเดิม...</div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Serial -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">Serial Number</label>
              <input v-model="form.serial_number" class="border rounded p-2 w-full bg-gray-50" />
            </div>

            <!-- Brand -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">Brand</label>
              <SearchableSelect
                v-model="form.brand_id"
                :options="brandOptions"
                placeholder="-- เลือก Brand --"
                search-placeholder="พิมพ์ชื่อ Brand..."
              />
            </div>

            <!-- Model -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">Model</label>
              <input v-model="form.model" class="border rounded p-2 w-full bg-gray-50" />
            </div>

            <!-- Status -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">สถานะ</label>
              <select v-model="form.status" class="border rounded p-2 w-full bg-gray-50">
                <option value="active">ใช้งานอยู่</option>
                <option value="repair">ซ่อมบำรุง</option>
                <option value="retired">ปลดระวาง</option>
              </select>
            </div>

            <!-- Building -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">อาคาร</label>
              <SearchableSelect
                :model-value="form.building_id"
                @update:model-value="onBuildingChange"
                :options="buildingOptions"
                placeholder="-- เลือกอาคาร --"
                search-placeholder="พิมพ์ชื่ออาคาร..."
              />
            </div>

            <!-- Floor -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">ชั้น</label>
              <SearchableSelect
                v-model="form.floor_id"
                :options="floorOptions"
                :placeholder="form.building_id ? '-- เลือกชั้น --' : 'เลือกอาคารก่อน'"
                search-placeholder="พิมพ์ชื่อชั้น..."
              />
            </div>

            <!-- Location detail -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">ตำแหน่งเครื่อง</label>
              <input
                v-model="form.location"
                placeholder="เช่น ห้องการเงิน, หน้าห้องพยาบาล"
                class="border rounded p-2 w-full bg-gray-50"
              />
            </div>

            <!-- Division -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">ฝ่าย</label>
              <SearchableSelect
                :model-value="form.division_id"
                @update:model-value="onDivisionChange"
                :options="divisionOptions"
                placeholder="-- เลือกฝ่าย --"
                search-placeholder="พิมพ์ชื่อฝ่าย..."
              />
            </div>

            <!-- Department -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">แผนก</label>
              <SearchableSelect
                v-model="form.department_id"
                :options="departmentOptions"
                :placeholder="form.division_id ? '-- เลือกแผนก --' : 'เลือกฝ่ายก่อน'"
                search-placeholder="พิมพ์ชื่อแผนก..."
              />
            </div>

            <!-- Contract -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">สัญญา</label>
              <select v-model="form.contract_id" class="border rounded p-2 w-full bg-gray-50">
                <option :value="null">ไม่มี</option>
                <option v-for="c in contracts" :key="c.id" :value="c.id">{{ c.contract_no }}</option>
              </select>
            </div>

            <!-- Price -->
            <div>
              <label class="block text-sm text-gray-500 mb-1">ราคาเฉพาะเครื่อง (Override)</label>
              <input type="number" step="0.01" v-model="form.price_override" class="border rounded p-2 w-full bg-gray-50" />
            </div>
          </div>

          <!-- ประวัติการย้าย — แสดงเฉพาะโหมดแก้ไข (เครื่องใหม่ยังไม่มีประวัติ) -->
          <div v-if="isEdit" class="mt-4 border rounded-lg overflow-hidden bg-gray-50">
            <button
              type="button"
              @click="toggleHistory"
              class="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100"
            >
              <span class="text-sm font-medium text-gray-700">ประวัติการย้าย (อาคาร/ชั้น/ฝ่าย/แผนก)</span>
              <span class="text-xs text-gray-400">{{ showHistory ? "ซ่อน" : "แสดง" }}</span>
            </button>

            <div v-if="showHistory" class="border-t p-3">
              <div v-if="historyLoading" class="text-center text-gray-400 text-sm py-3">กำลังโหลด...</div>

              <div v-else-if="!historyRows.length" class="text-center text-gray-400 text-sm py-3">
                ยังไม่มีประวัติการย้ายบันทึกไว้
              </div>

              <div v-else class="space-y-2">
                <div
                  v-for="row in historyRows"
                  :key="row.id"
                  class="text-sm bg-gray-50 rounded p-2 border"
                >
                  <div class="text-xs text-gray-400 mb-1">
                    {{ formatHistoryDate(row.effective_from) }}
                    —
                    {{ row.effective_to ? formatHistoryDate(row.effective_to) : "ปัจจุบัน" }}
                  </div>
                  <div class="text-gray-700">
                    {{ row.division_name || "ไม่ระบุฝ่าย" }} / {{ row.department_name || "ไม่ระบุแผนก" }}
                    <span class="text-gray-400">
                      ({{ row.building_name || "-" }}{{ row.floor_name ? " ชั้น " + row.floor_name : "" }}{{ row.location ? " " + row.location : "" }})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="formError" class="mt-4 bg-red-100 text-red-700 p-3 rounded text-sm">
            {{ formError }}
          </div>
        </div>

        <div class="p-5 border-t flex justify-end gap-2">
          <button @click="close" :disabled="saving" class="border px-4 py-2 rounded hover:bg-gray-50">
            ยกเลิก
          </button>
          <button
            @click="submit"
            :disabled="saving || loading"
            class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {{ saving ? "กำลังบันทึก..." : "บันทึก" }}
          </button>
        </div>
      </template>

      <!-- แท็บ: นำเข้าไฟล์ (CSV/Excel) -->
      <template v-else>
        <div class="p-5">
          <!-- เทมเพลตไฟล์ CSV — ดาวน์โหลดไปกรอกข้อมูลของจริงแล้วอัปโหลดกลับเข้ามาที่นี่ -->
          <div class="flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm">
            <p class="text-blue-800">
              ยังไม่มีไฟล์? ดาวน์โหลดเทมเพลต CSV ไปกรอกข้อมูลอุปกรณ์ตามตัวอย่างได้เลย
            </p>
            <button
              type="button"
              @click="downloadTemplate"
              class="inline-flex items-center gap-1.5 bg-white border border-blue-300 text-[var(--brand-text)] hover:bg-blue-100 text-sm font-medium px-3 py-1.5 rounded-lg whitespace-nowrap"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              ดาวน์โหลดเทมเพลต
            </button>
          </div>

          <!-- Dropzone / เลือกไฟล์ -->
          <label
            class="block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
            :class="dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'"
            @dragover.prevent="dragOver = true"
            @dragleave.prevent="dragOver = false"
            @drop.prevent="handleImportDrop"
          >
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              class="hidden"
              @change="handleImportFileChange"
            />

            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-10 h-10 mx-auto text-gray-400 mb-2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>

            <p v-if="!importFile" class="text-sm text-gray-600">
              ลากไฟล์มาวางตรงนี้ หรือ <span class="text-[var(--brand-text)] font-medium">คลิกเพื่อเลือกไฟล์</span>
            </p>
            <p v-else class="text-sm text-gray-800 font-medium">
              {{ importFile.name }}
              <span class="text-gray-400 font-normal">({{ formatSize(importFile.size) }})</span>
            </p>

            <p class="text-xs text-gray-400 mt-1">รองรับ .csv .xlsx .xls</p>
          </label>

          <div class="flex items-center gap-3 mt-4">
            <button
              type="button"
              @click="uploadImportFile"
              :disabled="!importFile || importLoading"
              class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-2"
            >
              <svg v-if="importLoading" class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
              {{ importLoading ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์" }}
            </button>

            <button
              v-if="importFile && !importLoading"
              type="button"
              @click="clearImportFile"
              class="text-sm text-gray-500 hover:text-gray-700"
            >
              ยกเลิก
            </button>
          </div>

          <!-- ผลลัพธ์ -->
          <div v-if="importResult && !importResult.error" class="mt-6">
            <div class="grid grid-cols-3 gap-3">
              <div class="bg-gray-50 border rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-gray-700">{{ importResult.total_rows }}</p>
                <p class="text-xs text-gray-500 mt-1">แถวทั้งหมดในไฟล์</p>
              </div>
              <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-green-700">{{ importResult.inserted }}</p>
                <p class="text-xs text-green-700 mt-1">บันทึกสำเร็จ</p>
              </div>
              <div
                class="border rounded-lg p-4 text-center"
                :class="skippedCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50'"
              >
                <p class="text-2xl font-bold" :class="skippedCount > 0 ? 'text-amber-700' : 'text-gray-700'">
                  {{ skippedCount }}
                </p>
                <p class="text-xs mt-1" :class="skippedCount > 0 ? 'text-amber-700' : 'text-gray-500'">ข้ามไป</p>
              </div>
            </div>

            <!-- รายการที่ข้ามไป พร้อมเหตุผล — ให้แก้ไฟล์/master data แล้วอัปโหลดใหม่ได้ตรงจุด -->
            <div v-if="skippedCount > 0" class="mt-4 border border-amber-200 rounded-lg overflow-hidden">
              <div class="bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
                {{ skippedCount }} แถวที่ยังไม่ได้บันทึก — ชื่อยี่ห้อ/อาคารในไฟล์ไม่ตรงกับข้อมูลในระบบ
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-gray-500 border-b bg-gray-50">
                      <th class="p-2">เลขซีเรียล</th>
                      <th class="p-2">ยี่ห้อ (ในไฟล์)</th>
                      <th class="p-2">อาคาร (ในไฟล์)</th>
                      <th class="p-2">สาเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in importResult.skipped" :key="i" class="border-b last:border-0">
                      <td class="p-2">{{ row.serial_number }}</td>
                      <td class="p-2">{{ row.brand || "-" }}</td>
                      <td class="p-2">{{ row.building || "-" }}</td>
                      <td class="p-2 text-amber-700">{{ row.reason }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="px-4 py-2.5 text-xs text-gray-500 bg-gray-50">
                แก้ชื่อในไฟล์ให้ตรงกับที่มีอยู่ในระบบ (หรือเพิ่มยี่ห้อ/อาคารใหม่ในหน้า Admin ก่อน) แล้วอัปโหลดไฟล์เฉพาะแถวเหล่านี้ใหม่อีกครั้ง
              </p>
            </div>

            <div v-else class="mt-3 text-sm text-green-700">
              นำเข้าครบทุกแถวเรียบร้อย ไม่มีรายการที่ต้องแก้ไข
            </div>
          </div>

          <div v-else-if="importResult && importResult.error" class="mt-6 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
            {{ importResult.error }}
          </div>
        </div>

        <div class="p-5 border-t flex justify-end">
          <button @click="close" class="border px-4 py-2 rounded hover:bg-gray-50">
            ปิด
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
