<script setup>
/**
 * MoveDeviceModal.vue — Popup "ย้ายเครื่อง"
 *
 * แยกออกมาจาก AssetForm.vue (แก้ไขทรัพย์สินทั่วไป) โดยเฉพาะ — จัดการเฉพาะ
 * อาคาร/ชั้น/ตำแหน่ง/ฝ่าย/แผนก ของเครื่อง ยิงไปที่ PUT /api/devices/:id/move
 * ซึ่ง backend จะบันทึกประวัติการย้าย (device_location_history) ให้อัตโนมัติ
 *
 * การใช้งาน (จาก AssetList.vue):
 * <MoveDeviceModal v-model="showMoveModal" :asset-id="movingAssetId" @saved="onSaved" />
 */
import { ref, computed, watch } from "vue";
import api from "../services/api";
import SearchableSelect from "../components/SearchableSelect.vue";
import { toastSuccess, toastError } from "../store/toast";
import { askConfirm } from "../store/confirmDialog";
import { formatDateTH } from "@suth/domain";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  assetId: { type: [Number, String, null], default: null },
});

const emit = defineEmits(["update:modelValue", "saved"]);

const defaultForm = () => ({
  building_id: "",
  floor_id: "",
  location: "",
  division_id: "",
  department_id: "",
});

const form = ref(defaultForm());
const serialNumber = ref(""); // แสดงไว้ในหัว popup ให้รู้ว่ากำลังย้ายเครื่องไหน

const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);

const masterLoaded = ref(false);
const loading = ref(false); // โหลดข้อมูลเครื่องปัจจุบัน
const saving = ref(false);
const formError = ref(null);

const filteredFloors = computed(() => {
  if (!form.value.building_id) return [];
  return floors.value.filter(
    (f) => Number(f.building_id) === Number(form.value.building_id)
  );
});

const filteredDepartments = computed(() => {
  if (!form.value.division_id) return [];
  return departments.value.filter(
    (d) => Number(d.division_id) === Number(form.value.division_id)
  );
});

function onBuildingChange(value) {
  form.value.building_id = value;
  form.value.floor_id = "";
}

function onDivisionChange(value) {
  form.value.division_id = value;
  form.value.department_id = "";
}

const buildingOptions = computed(() => buildings.value.map((b) => ({ value: b.id, label: b.name })));
const floorOptions = computed(() => filteredFloors.value.map((f) => ({ value: f.id, label: f.name })));
const divisionOptions = computed(() => divisions.value.map((d) => ({ value: d.id, label: d.name })));
const departmentOptions = computed(() => filteredDepartments.value.map((d) => ({ value: d.id, label: d.name })));

async function loadMasterData() {
  if (masterLoaded.value) return;
  try {
    const [buildingRes, floorRes, divisionRes, departmentRes] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
    ]);

    buildings.value = buildingRes.data;
    floors.value = floorRes.data;
    divisions.value = divisionRes.data;
    departments.value = departmentRes.data;
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

    serialNumber.value = d.serial_number ?? "";
    form.value = {
      building_id: d.building_id ?? "",
      floor_id: d.floor_id ?? "",
      location: d.location ?? "",
      division_id: d.division_id ?? "",
      department_id: d.department_id ?? "",
    };
  } catch (err) {
    console.error("Load asset error:", err);
    formError.value = "โหลดข้อมูลทรัพย์สินไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

// =======================
// ยอดพิมพ์สะสมของที่ตั้ง/สังกัดปัจจุบัน (ก่อนย้าย) — ให้ดูก่อนตัดสินใจย้าย
// =======================
const currentUsage = ref(null);
const usageLoading = ref(false);

async function loadCurrentUsage(id) {
  usageLoading.value = true;
  currentUsage.value = null;
  try {
    const res = await api.get(`/devices/${id}/current-usage`);
    currentUsage.value = res.data.usage;
  } catch (err) {
    console.error("Load current usage error:", err);
  } finally {
    usageLoading.value = false;
  }
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// =======================
// ประวัติการย้าย (อาคาร/ชั้น/ฝ่าย/แผนก) — ดูอย่างเดียว
// =======================
const showHistory = ref(false);
const historyLoading = ref(false);
const historyRows = ref([]);
const historyLoaded = ref(false);
const moveSuccessMsg = ref(null); // ข้อความแจ้งว่าย้ายสำเร็จแล้ว + เตือนว่าประวัติด้านล่างอัปเดตแล้ว

function formatHistoryDate(value) {
  if (!value) return "-";
  // mysql2 คืนคอลัมน์ DATE เป็น Date object พอผ่าน res.json() จะกลายเป็น ISO string
  // แบบ "2024-12-17T00:00:00.000Z" (ไม่ใช่ "2024-12-17" เปล่าๆ) — ตัดส่วนเวลาทิ้งก่อนเสมอ
  return formatDateTH(String(value).split("T")[0]);
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
  if (showHistory.value && !historyLoaded.value && props.assetId) {
    loadHistory(props.assetId);
  }
}

watch(
  () => [props.modelValue, props.assetId],
  ([visible, assetId]) => {
    if (!visible) return;

    formError.value = null;
    moveSuccessMsg.value = null;
    loadMasterData();

    historyLoaded.value = false;
    historyRows.value = [];

    if (assetId !== null && assetId !== undefined) {
      loadAsset(assetId);
      loadCurrentUsage(assetId);
      // เปิดพาแนลประวัติให้เห็นเลยโดยไม่ต้องกด — ข้อมูลนี้มีผลต่อการตัดสินใจย้าย
      // (เช่นเคส "ย้ายซ้ำในเดือนเดียวกัน") จึงไม่ควรซ่อนไว้เป็นค่าเริ่มต้น
      showHistory.value = true;
      loadHistory(assetId);
    } else {
      form.value = defaultForm();
      serialNumber.value = "";
      showHistory.value = false;
    }
  },
  { immediate: true }
);

function nameOf(list, id) {
  if (!id) return "-";
  return list.find((item) => Number(item.id) === Number(id))?.name || "-";
}

// สรุปที่ตั้งใหม่แบบอ่านง่าย ใช้ในกล่องยืนยันก่อนย้ายจริง
const newLocationSummary = computed(() => {
  const division = nameOf(divisions.value, form.value.division_id);
  const department = nameOf(departments.value, form.value.department_id);
  const building = nameOf(buildings.value, form.value.building_id);
  const floor = nameOf(floors.value, form.value.floor_id);
  return `${division} / ${department} — ${building}${floor !== "-" ? " ชั้น " + floor : ""}${form.value.location ? " " + form.value.location : ""}`;
});

async function submit() {
  const oldSummary = currentUsage.value
    ? `${currentUsage.value.division_name || "ไม่ระบุฝ่าย"} / ${currentUsage.value.department_name || "ไม่ระบุแผนก"}`
    : "ที่ตั้งปัจจุบัน";

  const confirmed = await askConfirm(
    `ย้ายจาก\n${oldSummary}\nไป\n${newLocationSummary.value}\n\nยอดพิมพ์/รายงานย้อนหลังของเครื่องนี้จะถูกแยกบันทึกตามช่วงที่ตั้ง ยืนยันการย้ายหรือไม่?`,
    { title: "ยืนยันการย้ายเครื่อง", confirmText: "ย้ายเครื่อง", danger: false }
  );
  if (!confirmed) return;

  const data = {
    building_id: form.value.building_id ? Number(form.value.building_id) : null,
    floor_id: form.value.floor_id ? Number(form.value.floor_id) : null,
    location: form.value.location?.trim() || null,
    division_id: form.value.division_id ? Number(form.value.division_id) : null,
    department_id: form.value.department_id ? Number(form.value.department_id) : null,
  };

  saving.value = true;
  formError.value = null;
  moveSuccessMsg.value = null;

  try {
    const res = await api.put(`/devices/${props.assetId}/move`, data);
    emit("saved", res.data);

    // ไม่ปิด modal ทันทีหลังย้ายสำเร็จ — รีโหลดยอดพิมพ์ที่เดิม (currentUsage จะกลายเป็น
    // ช่วงใหม่ที่เพิ่งเปิด) และประวัติการย้ายใหม่ทันที (loadHistory ไม่เช็ค historyLoaded
    // จึงดึงข้อมูลล่าสุดเสมอ) แล้วเปิดพาแนลประวัติให้เห็นเลยว่ายอดพิมพ์สะสมก่อนย้าย
    // ถูกบันทึกปิดช่วงเดิมไว้ในประวัติเรียบร้อยแล้ว — เดิมโค้ดปิด modal ทันทีตรงนี้ ทำให้
    // ผู้ใช้ไม่เห็นว่าประวัติอัปเดตจริงจนกว่าจะปิดแล้วเปิด popup ใหม่อีกครั้ง
    await Promise.all([loadCurrentUsage(props.assetId), loadHistory(props.assetId)]);
    showHistory.value = true;
    moveSuccessMsg.value = "ย้ายเครื่องสำเร็จ — ประวัติการย้ายด้านล่างอัปเดตแล้ว";
    toastSuccess("ย้ายเครื่องสำเร็จ");
  } catch (err) {
    console.error("Move asset error:", err);
    const message = err.response?.data?.error || "ย้ายเครื่องไม่สำเร็จ";
    formError.value = message;
    toastError(message);
  } finally {
    saving.value = false;
  }
}

function close() {
  if (saving.value) return;
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
          ย้ายเครื่อง
          <span v-if="serialNumber" class="text-gray-400 font-normal text-base">— {{ serialNumber }}</span>
        </h2>
        <button @click="close" class="text-gray-400 hover:text-gray-700 text-xl leading-none">
          &times;
        </button>
      </div>

      <div class="p-5">
        <div v-if="loading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูลเดิม...</div>

        <template v-else>
          <!-- ยอดพิมพ์สะสมที่ตำแหน่ง/สังกัดเดิม ก่อนย้าย -->
          <div class="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            <p class="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">
              ① ที่ตั้งเดิม (อ่านอย่างเดียว)
            </p>
            <div v-if="usageLoading" class="text-amber-700">กำลังโหลดยอดพิมพ์ที่เดิม...</div>
            <div v-else-if="!currentUsage" class="text-gray-500">ยังไม่มีประวัติที่ตั้งของเครื่องนี้</div>
            <div v-else>
              <p class="font-medium text-amber-800">
                ยอดพิมพ์สะสมที่เดิม
                ({{ currentUsage.division_name || "ไม่ระบุฝ่าย" }} / {{ currentUsage.department_name || "ไม่ระบุแผนก" }}
                <span class="font-normal text-amber-700">
                  — {{ currentUsage.building_name || "-" }}{{ currentUsage.floor_name ? " ชั้น " + currentUsage.floor_name : "" }}{{ currentUsage.location ? " " + currentUsage.location : "" }}
                </span>)
              </p>
              <p class="text-amber-700 mt-1">
                ตั้งแต่ {{ formatHistoryDate(currentUsage.effective_from) }} —
                <span class="font-semibold">{{ Number(currentUsage.total_pages).toLocaleString("th-TH") }} แผ่น (สุทธิ)</span>
                / <span class="font-semibold">฿{{ formatMoney(currentUsage.total_cost) }}</span>
              </p>
            </div>
          </div>

          <p class="text-xs font-semibold text-[var(--brand-text)] uppercase tracking-wide mb-2">
            ② เลือกที่ตั้งใหม่
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div class="sm:col-span-2">
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
        </div>

        <!-- ประวัติการย้าย -->
        <div class="mt-4 border rounded-lg overflow-hidden bg-gray-50">
          <button
            type="button"
            @click="toggleHistory"
            class="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100"
          >
            <span class="text-sm font-medium text-gray-700 flex items-center gap-2">
              ประวัติการย้าย (อาคาร/ชั้น/ฝ่าย/แผนก)
              <span
                v-if="historyLoaded && historyRows.length"
                class="text-xs font-semibold bg-blue-100 text-[var(--brand-text)] px-1.5 py-0.5 rounded-full"
              >
                {{ historyRows.length }} ครั้ง
              </span>
            </span>
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
                <div v-if="row.is_same_month_transition" class="text-xs text-amber-600 mt-1">
                  ย้ายซ้ำภายในเดือนเดียวกัน — ยอดพิมพ์ของเดือนนี้ถูกรวมไว้ในช่วงถัดไปแทน
                  (ระบบนับยอดพิมพ์ได้ละเอียดสุดแค่ระดับเดือน ไม่ใช่ว่าช่วงนี้ไม่มีการพิมพ์)
                </div>
                <div v-else class="text-xs text-gray-500 mt-1">
                  ยอดพิมพ์สะสมช่วงนี้(หัก 20% แล้ว):
                  <span class="font-medium text-gray-700">{{ Number(row.total_pages || 0).toLocaleString("th-TH") }} แผ่น</span>
                  / <span class="font-medium text-gray-700">฿{{ formatMoney(row.total_cost) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        </template>

        <div v-if="moveSuccessMsg" class="mt-4 bg-green-100 text-green-700 p-3 rounded text-sm">
          {{ moveSuccessMsg }}
        </div>

        <div v-if="formError" class="mt-4 bg-red-100 text-red-700 p-3 rounded text-sm">
          {{ formError }}
        </div>
      </div>

      <div class="p-5 border-t flex justify-end gap-2">
        <button @click="close" :disabled="saving" class="border px-4 py-2 rounded hover:bg-gray-50">
          {{ moveSuccessMsg ? "ปิด" : "ยกเลิก" }}
        </button>
        <button
          @click="submit"
          :disabled="saving || loading"
          class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {{ saving ? "กำลังย้าย..." : "ย้ายเครื่อง" }}
        </button>
      </div>
    </div>
  </div>
</template>