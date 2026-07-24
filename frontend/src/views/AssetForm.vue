<script setup>
/**
 * AssetForm.vue — เดิมเคยเป็นหน้าเต็ม (/admin/add-asset, /admin/edit-asset/:id)
 * ตอนนี้แปลงเป็น Modal Popup ตามข้อ 6 ของสเปก: ปุ่ม "เพิ่ม" (และ "แก้ไข") เปิด Popup
 * แทนการเปลี่ยนหน้า แล้ว submit เสร็จก็ปิด modal + สั่งให้ parent (AssetList) refresh ตาราง
 *
 * การใช้งาน (จาก AssetList.vue):
 * <AssetForm v-model="showFormModal" :asset-id="editingAssetId" @saved="onSaved" />
 *
 * - modelValue (v-model): true = เปิด popup, false = ปิด
 * - assetId: null = โหมดเพิ่มใหม่, number = โหมดแก้ไข (โหลดข้อมูลเดิมมาเติมในฟอร์ม)
 * - emits('saved', data): ยิงตอน POST/PUT สำเร็จ ให้ parent re-fetch รายการ
 */
import { ref, computed, watch } from "vue";
import api from "../services/api";
import SearchableSelect from "../components/SearchableSelect.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  assetId: { type: [Number, String, null], default: null },
});

const emit = defineEmits(["update:modelValue", "saved"]);

const isEdit = computed(() => props.assetId !== null && props.assetId !== undefined);

const defaultForm = () => ({
  serial_number: "",
  brand_id: "",
  model: "",
  building_id: "",
  floor_id: "",
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

// เปิด modal ทีไร (หรือสลับระหว่าง add/edit) ให้เตรียมฟอร์มใหม่ให้ตรงโหมด
watch(
  () => [props.modelValue, props.assetId],
  ([visible, assetId]) => {
    if (!visible) return;

    formError.value = null;
    loadMasterData();

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
          {{ isEdit ? "แก้ไขทรัพย์สิน" : "เพิ่มทรัพย์สิน" }}
        </h2>
        <button @click="close" class="text-gray-400 hover:text-gray-700 text-xl leading-none">
          &times;
        </button>
      </div>

      <div class="p-5">
        <div v-if="loading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูลเดิม...</div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Serial -->
          <div>
            <label class="block text-sm text-gray-500 mb-1">Serial Number</label>
            <input v-model="form.serial_number" class="border rounded p-2 w-full" />
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
            <input v-model="form.model" class="border rounded p-2 w-full" />
          </div>

          <!-- Status -->
          <div>
            <label class="block text-sm text-gray-500 mb-1">สถานะ</label>
            <select v-model="form.status" class="border rounded p-2 w-full">
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
            <select v-model="form.contract_id" class="border rounded p-2 w-full">
              <option :value="null">ไม่มี</option>
              <option v-for="c in contracts" :key="c.id" :value="c.id">{{ c.contract_no }}</option>
            </select>
          </div>

          <!-- Price -->
          <div>
            <label class="block text-sm text-gray-500 mb-1">ราคาเฉพาะเครื่อง (Override)</label>
            <input type="number" step="0.01" v-model="form.price_override" class="border rounded p-2 w-full" />
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
    </div>
  </div>
</template>