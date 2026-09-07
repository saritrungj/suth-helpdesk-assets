<script setup>
/**
 * DeviceFormFields — ช่องกรอกข้อมูลเครื่องหนึ่งเครื่อง พร้อมการบันทึก
 *
 * แยกออกมาเป็นชิ้นเดียวเพื่อให้ "เพิ่มเครื่องใหม่" (หน้าเต็ม) กับ "แก้ไขเครื่อง"
 * (หน้าต่างซ้อนจากตาราง) ใช้ฟอร์มตัวเดียวกันจริงๆ ไม่ใช่สองชุดที่ต้องแก้คู่กัน
 * ทุกครั้ง — ของเดิมช่องกรอกอยู่ใน modal อย่างเดียว หน้าเพิ่มจึงต้องเปิด modal
 * ค้างไว้ตั้งแต่เข้าหน้า ซึ่งทำให้ปุ่มย้อนกลับของเบราว์เซอร์ทำงานแปลกๆ
 *
 * ข้อควรรู้เรื่องการบันทึกในโหมดแก้ไข: PUT /devices/:id ตั้งใจไม่รับฟิลด์ที่ตั้ง
 * (อาคาร/ชั้น/ฝ่าย/แผนก) เพื่อไม่ให้เขียนประวัติการย้ายซ้ำซ้อนจากหลายทาง จึงต้อง
 * ยิง PUT /devices/:id/move ต่ออีกครั้ง ประวัติการย้ายจึงถูกบันทึกเหมือนกดปุ่ม
 * "ย้ายเครื่อง" ตรงๆ
 *
 * ช่องที่อ้างอิงกัน (อาคาร -> ชั้น, ฝ่าย -> แผนก) ถูกล้างค่าลูกทุกครั้งที่เปลี่ยน
 * ค่าแม่ เพราะชั้นของอีกอาคารไม่มีอยู่จริงในอาคารใหม่
 */
import { computed, ref, watch } from "vue";
import api from "../services/api";
import { useQueryClient } from "@tanstack/vue-query";
import { invalidateAfterWrite } from "../api/invalidate";
import { toastError, toastSuccess } from "../store/toast";
import { UiAlert, UiCombobox, UiField, UiInput, UiSegmented, UiSkeleton } from "../ui";

const props = defineProps({
  /** null = เพิ่มใหม่, ตัวเลข = แก้ไขเครื่องนั้น */
  assetId: { type: [Number, String, null], default: null },
});

const emit = defineEmits(["saved", "dirty"]);

const queryClient = useQueryClient();

const isEdit = computed(() => props.assetId !== null && props.assetId !== undefined);

const STATUS_OPTIONS = [
  { value: "active", label: "ใช้งานอยู่" },
  { value: "repair", label: "ซ่อมบำรุง" },
  { value: "retired", label: "ปลดระวาง" },
];

const emptyForm = () => ({
  serial_number: "",
  asset_code: "",
  brand_id: "",
  model: "",
  building_id: "",
  floor_id: "",
  location: "",
  division_id: "",
  department_id: "",
  contract_id: "",
  price_override: "",
  status: "active",
});

const form = ref(emptyForm());

const brands = ref([]);
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const contracts = ref([]);

const masterLoaded = ref(false);
const loading = ref(false);
const saving = ref(false);
const formError = ref("");

const brandOptions = computed(() => brands.value.map((b) => ({ value: b.id, label: b.name })));
const buildingOptions = computed(() => buildings.value.map((b) => ({ value: b.id, label: b.name })));
const divisionOptions = computed(() => divisions.value.map((d) => ({ value: d.id, label: d.name })));

const floorOptions = computed(() => {
  if (!form.value.building_id) return [];
  return floors.value
    .filter((f) => Number(f.building_id) === Number(form.value.building_id))
    .map((f) => ({ value: f.id, label: f.name }));
});

const departmentOptions = computed(() => {
  if (!form.value.division_id) return [];
  return departments.value
    .filter((d) => Number(d.division_id) === Number(form.value.division_id))
    .map((d) => ({ value: d.id, label: d.name }));
});

const contractOptions = computed(() =>
  contracts.value.map((c) => ({
    value: c.id,
    label: c.contract_no,
    hint: c.fiscal_year ? `ปีงบ ${Number(c.fiscal_year)}` : "",
  }))
);

/** ราคาที่จะถูกใช้จริงถ้าบันทึกตามที่กรอกอยู่ตอนนี้ — แสดงให้เห็นก่อนกดบันทึก */
const effectivePriceHint = computed(() => {
  if (form.value.price_override !== "" && form.value.price_override !== null) {
    return `จะใช้ราคาเฉพาะเครื่อง ${Number(form.value.price_override).toLocaleString("th-TH", {
      minimumFractionDigits: 2,
    })} บาท/แผ่น แทนราคาตามสัญญา`;
  }
  const contract = contracts.value.find((c) => Number(c.id) === Number(form.value.contract_id));
  if (contract?.price_per_page !== undefined && contract?.price_per_page !== null) {
    return `เว้นว่างไว้ = ใช้ราคาตามสัญญา ${Number(contract.price_per_page).toLocaleString("th-TH", {
      minimumFractionDigits: 2,
    })} บาท/แผ่น`;
  }
  return "เว้นว่างไว้ = ใช้ราคาตามสัญญาที่เลือก";
});

watch(
  () => form.value.building_id,
  (_, previous) => {
    if (previous !== undefined && previous !== "") form.value.floor_id = "";
  }
);

watch(
  () => form.value.division_id,
  (_, previous) => {
    if (previous !== undefined && previous !== "") form.value.department_id = "";
  }
);

async function loadMasterData() {
  if (masterLoaded.value) return;

  try {
    const [brand, building, floor, division, department, contract] = await Promise.all([
      api.get("/brands"),
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
      api.get("/contracts"),
    ]);

    brands.value = brand.data ?? [];
    buildings.value = building.data ?? [];
    floors.value = floor.data ?? [];
    divisions.value = division.data ?? [];
    departments.value = department.data ?? [];
    contracts.value = contract.data ?? [];
    masterLoaded.value = true;
  } catch (err) {
    console.error("Load master data error:", err);
    formError.value = "โหลดข้อมูลอ้างอิงไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง";
  }
}

async function loadAsset(id) {
  loading.value = true;
  formError.value = "";

  try {
    const res = await api.get(`/devices/${id}`);
    const device = res.data.data ?? res.data;

    form.value = {
      serial_number: device.serial_number ?? "",
      asset_code: device.asset_code ?? "",
      brand_id: device.brand_id ?? "",
      model: device.model ?? "",
      building_id: device.building_id ?? "",
      floor_id: device.floor_id ?? "",
      location: device.location ?? "",
      division_id: device.division_id ?? "",
      department_id: device.department_id ?? "",
      contract_id: device.contract_id ?? "",
      price_override: device.price_override ?? "",
      status: device.status ?? "active",
    };
  } catch (err) {
    console.error("Load device error:", err);
    formError.value = "โหลดข้อมูลเครื่องไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

/** เริ่มฟอร์มใหม่ให้ตรงกับโหมดปัจจุบัน — parent เรียกทุกครั้งที่เปิดฟอร์ม */
async function reset() {
  formError.value = "";
  await loadMasterData();

  if (isEdit.value) await loadAsset(props.assetId);
  else form.value = emptyForm();
}

function validate() {
  if (!form.value.serial_number.trim()) return "กรอกหมายเลข Serial ของเครื่องก่อน";
  if (!form.value.brand_id) return "เลือกยี่ห้อของเครื่องก่อน";
  if (form.value.price_override !== "" && Number(form.value.price_override) < 0) {
    return "ราคาต่อแผ่นติดลบไม่ได้";
  }
  return "";
}

async function submit() {
  const problem = validate();
  if (problem) {
    formError.value = problem;
    return false;
  }

  const core = {
    serial_number: form.value.serial_number.trim(),
    asset_code: form.value.asset_code?.trim() || null,
    brand_id: Number(form.value.brand_id),
    model: form.value.model?.trim() || null,
    contract_id: form.value.contract_id ? Number(form.value.contract_id) : null,
    price_override:
      form.value.price_override !== "" && form.value.price_override !== null
        ? Number(form.value.price_override)
        : null,
    status: form.value.status || "active",
  };

  const placement = {
    building_id: form.value.building_id ? Number(form.value.building_id) : null,
    floor_id: form.value.floor_id ? Number(form.value.floor_id) : null,
    location: form.value.location?.trim() || null,
    division_id: form.value.division_id ? Number(form.value.division_id) : null,
    department_id: form.value.department_id ? Number(form.value.department_id) : null,
  };

  saving.value = true;
  formError.value = "";

  try {
    let res;

    if (isEdit.value) {
      res = await api.put(`/devices/${props.assetId}`, core);
      await api.put(`/devices/${props.assetId}/move`, placement);
      toastSuccess("บันทึกการแก้ไขเรียบร้อย");
    } else {
      res = await api.post("/devices", { ...core, ...placement });
      toastSuccess("เพิ่มเครื่องเข้าทะเบียนเรียบร้อย");
    }

    // ทะเบียนเครื่อง แดชบอร์ด และความครบถ้วนรายเดือนใช้ข้อมูลชุดนี้ทั้งหมด
    await invalidateAfterWrite(queryClient, "device");

    emit("saved", res.data);
    return true;
  } catch (err) {
    console.error("Save device error:", err);
    const message = err.response?.data?.error || "บันทึกไม่สำเร็จ";
    formError.value = message;
    toastError(message);
    return false;
  } finally {
    saving.value = false;
  }
}

defineExpose({ reset, submit, saving, loading });
</script>

<template>
  <div>
    <div v-if="loading" class="flex flex-col gap-4">
      <UiSkeleton v-for="n in 6" :key="n" height="2.5rem" />
    </div>

    <form v-else class="flex flex-col gap-5" @submit.prevent="submit">
      <!-- ตัวเครื่อง -->
      <fieldset class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <legend class="eyebrow mb-2">ข้อมูลเครื่อง</legend>

        <UiField
          label="หมายเลข Serial"
          required
          hint="เลขที่พิมพ์อยู่บนตัวเครื่อง ใช้เป็นตัวระบุหลักของทุกรายงาน"
        >
          <UiInput v-model="form.serial_number" mono placeholder="เช่น SN2446179" />
        </UiField>

        <UiField label="รหัสครุภัณฑ์" hint="ถ้ามีรหัสจากงานพัสดุ ให้กรอกไว้เพื่อใช้ตรวจสอบข้ามระบบ">
          <UiInput v-model="form.asset_code" mono placeholder="เช่น IT-PR-1024" />
        </UiField>

        <UiField label="ยี่ห้อ" required>
          <UiCombobox v-model="form.brand_id" :options="brandOptions" placeholder="เลือกยี่ห้อ" />
        </UiField>

        <UiField label="รุ่น">
          <UiInput v-model="form.model" placeholder="เช่น LaserJet M404dn" />
        </UiField>

        <UiField label="สถานะเครื่อง" class="sm:col-span-2">
          <UiSegmented v-model="form.status" :options="STATUS_OPTIONS" label="สถานะของเครื่อง" />
        </UiField>
      </fieldset>

      <!-- ที่ตั้ง -->
      <fieldset class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 border-t border-line-soft">
        <legend class="eyebrow mb-2">ที่ตั้งและหน่วยงานที่ดูแล</legend>

        <UiField label="อาคาร">
          <UiCombobox
            v-model="form.building_id"
            :options="buildingOptions"
            placeholder="เลือกอาคาร"
            any-label="ยังไม่ระบุ"
          />
        </UiField>

        <UiField
          label="ชั้น"
          :hint="form.building_id ? '' : 'เลือกอาคารก่อนถึงจะเลือกชั้นได้'"
        >
          <UiCombobox
            v-model="form.floor_id"
            :options="floorOptions"
            :disabled="!form.building_id"
            placeholder="เลือกชั้น"
            any-label="ยังไม่ระบุ"
            empty-text="อาคารนี้ยังไม่มีชั้นในระบบ"
          />
        </UiField>

        <UiField label="ตำแหน่งที่ตั้ง" class="sm:col-span-2" hint="จุดที่เครื่องตั้งอยู่จริง เพื่อให้คนไปหาเจอ">
          <UiInput v-model="form.location" placeholder="เช่น เคาน์เตอร์พยาบาล ฝั่งตะวันออก" />
        </UiField>

        <UiField label="ฝ่าย">
          <UiCombobox
            v-model="form.division_id"
            :options="divisionOptions"
            placeholder="เลือกฝ่าย"
            any-label="ยังไม่ระบุ"
          />
        </UiField>

        <UiField
          label="แผนก"
          :hint="form.division_id ? 'แผนกนี้จะเป็นผู้รับผิดชอบค่าใช้จ่ายของเครื่อง' : 'เลือกฝ่ายก่อนถึงจะเลือกแผนกได้'"
        >
          <UiCombobox
            v-model="form.department_id"
            :options="departmentOptions"
            :disabled="!form.division_id"
            placeholder="เลือกแผนก"
            any-label="ยังไม่ระบุ"
            empty-text="ฝ่ายนี้ยังไม่มีแผนกในระบบ"
          />
        </UiField>
      </fieldset>

      <!-- สัญญาและราคา -->
      <fieldset class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 border-t border-line-soft">
        <legend class="eyebrow mb-2">สัญญาและราคา</legend>

        <UiField label="สัญญาที่ผูกอยู่">
          <UiCombobox
            v-model="form.contract_id"
            :options="contractOptions"
            placeholder="เลือกสัญญา"
            any-label="ไม่ผูกกับสัญญา"
          />
        </UiField>

        <UiField label="ราคาต่อแผ่นเฉพาะเครื่อง" :hint="effectivePriceHint">
          <UiInput v-model="form.price_override" type="number" step="0.0001" min="0" suffix="บาท" />
        </UiField>
      </fieldset>

      <UiAlert v-if="formError" tone="danger">{{ formError }}</UiAlert>

      <button type="submit" class="hidden" tabindex="-1" aria-hidden="true"></button>
    </form>
  </div>
</template>
