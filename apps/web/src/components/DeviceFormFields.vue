<script setup>
import { formatDate } from "../lib/locale-format";
import { t } from "../lib/locale";
import { formatUnitPrice } from "../lib/format";
import { errorMessage, fieldErrors } from "../lib/api-error";
import { useDraftSnapshot } from "../lib/use-draft-snapshot";
import { usePlacementFields } from "../lib/use-placement-fields";
import { formDraft } from "../lib/form-draft";
import { formatTime } from "../lib/locale-format";
import { authState } from "../store/auth";

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
import { computed, nextTick, onMounted, ref, watch } from "vue";
import api from "../services/api";
import { useQueryClient } from "@tanstack/vue-query";
import { invalidateAfterWrite } from "../api/invalidate";
import { toastError, toastSuccess } from "../store/toast";
import { UiAlert, UiButton, UiCheckbox, UiCombobox, UiField, UiInput, UiSegmented, UiSelect, UiSkeleton } from "../ui";

const props = defineProps({
  /**
   * แยกแต่ละกลุ่มเป็นการ์ดขาว — ใช้ในแผงแก้ไขที่พื้นเป็นโทนอ่อน (ในหน้าเพิ่มเครื่องอยู่ในการ์ดแล้ว)
   * และตัดคำอธิบายใต้ช่องที่บอกสิ่งที่เห็นอยู่แล้ว เหลือเฉพาะที่กันกรอกผิด
   */
  grouped: { type: Boolean, default: false },
  /** null = เพิ่มใหม่, ตัวเลข = แก้ไขเครื่องนั้น */
  assetId: { type: [Number, String, null], default: null },
  /** วันที่แนะนำจากงานค้าง; ผู้ใช้ยังต้องตรวจเอกสารก่อนบันทึก */
  initialBillingFrom: { type: String, default: "" },
  /**
   * ชื่อร่างของฟอร์มเพิ่มเครื่อง — ใส่แล้วค่าที่กรอกค้างรอดการออกจากหน้า สลับแท็บ และรีเฟรช (#177)
   * ใช้เฉพาะโหมดเพิ่ม การแก้ไขเครื่องเดิมมีด่านถามก่อนออกแทน (use-asset-draft-guard)
   */
  draftKey: { type: String, default: "" },
});

const emit = defineEmits(["saved", "dirty"]);

const queryClient = useQueryClient();

const isEdit = computed(() => props.assetId !== null && props.assetId !== undefined);

const STATUS_OPTIONS = [
  { value: "active", label: t("ใช้งานอยู่") },
  { value: "repair", label: t("ซ่อมบำรุง") },
  { value: "retired", label: t("ปลดระวาง") },
];

/**
 * สถานะการติดตั้ง — คนละคำถามกับสถานะเครื่องด้านบน (ADR-0018)
 *
 * ไม่มีค่าตั้งต้นและไม่มีตัวเลือก "ยังไม่ทราบ" โดยตั้งใจ: ข้อ Q18 บังคับว่าผู้กรอก
 * ต้องตอบเองก่อนบันทึกเครื่องใหม่ เพราะคำตอบนี้กลายเป็นตัวส่วนของความครบถ้วนทั้งปี
 * ค่าตั้งต้นจะถูกกดผ่านไปโดยไม่มีใครอ่าน แล้วไม่มีใครรู้ว่ามันมาจากไหน
 */
const INSTALLATION_OPTIONS = [
  { value: "installed", label: t("ติดตั้งแล้ว") },
  { value: "not_installed", label: t("ยังไม่ได้ติดตั้ง") },
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
  meter_category_id: "",
  has_color_meter: false,
  status: "active",
  installation_status: "",
  installed_on: "",
  billing_from: "",
});

const form = ref(emptyForm());

const brands = ref([]);
const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const contracts = ref([]);
const meterCategories = ref([]);

const masterLoaded = ref(false);
const loading = ref(false);
const saving = ref(false);
const formError = ref("");
const errors = ref({});
const { ready, dirty, capture } = useDraftSnapshot(form);
watch(dirty, (value) => emit("dirty", value));

// ---------- ร่างของฟอร์มเพิ่มเครื่อง (#177) ----------
const draft = computed(() =>
  props.draftKey && !isEdit.value ? formDraft(props.draftKey, authState.user?.id ?? null) : null
);
/** เวลาที่เก็บร่างที่เพิ่งกู้คืน — แสดงให้รู้ว่าค่าในฟอร์มไม่ได้เพิ่งกรอก และเริ่มใหม่ได้ */
const restoredAt = ref("");

// เก็บทุกครั้งที่ค่าเปลี่ยน ฟอร์มกลับไปว่างเท่าตอนเปิด = ไม่มีร่าง
watch(
  form,
  () => {
    if (!draft.value || !ready.value) return;
    if (dirty.value) draft.value.write(form.value);
    else draft.value.clear();
  },
  { deep: true }
);

/** ทิ้งร่างแล้วเริ่มฟอร์มว่าง */
async function discardDraft() {
  draft.value?.clear();
  restoredAt.value = "";
  await reset();
}

const brandOptions = computed(() => brands.value.map((b) => ({ value: b.id, label: b.name })));
const { buildingOptions, floorOptions, divisionOptions, departmentOptions } = usePlacementFields({
  form,
  ready,
  buildings,
  floors,
  divisions,
  departments,
});

const contractOptions = computed(() =>
  contracts.value.map((c) => ({
    value: c.id,
    label: c.contract_no,
    hint: t("{0} – {1}", [formatDate(c.effective_from), formatDate(c.effective_to)]),
  }))
);

/** หมวดมิเตอร์หลัก — ไม่รวมหมวดสี ซึ่งเป็นมิเตอร์ที่สองของเครื่อง */
const primaryCategories = computed(() => meterCategories.value.filter((c) => !c.is_color));

/** ราคาที่จะถูกใช้จริงถ้าบันทึกตามที่กรอกอยู่ตอนนี้ — แสดงให้เห็นก่อนกดบันทึก */
const effectivePriceHint = computed(() => {
  if (form.value.price_override !== "" && form.value.price_override !== null) {
    return t("จะใช้ราคาพิเศษเฉพาะเครื่อง {0} บาท/หน้า แทนราคาตามสัญญา", [formatUnitPrice(form.value.price_override)]);
  }
  const contract = contracts.value.find((c) => Number(c.id) === Number(form.value.contract_id));
  const line = contract?.price_lines?.find((l) => Number(l.category_id) === Number(form.value.meter_category_id));
  if (line) {
    return t("เว้นว่างไว้ = ใช้ราคาตามสัญญา {0} บาท/หน้า", [formatUnitPrice(line.price_per_page)]);
  }
  if (contract && form.value.meter_category_id) {
    return t("สัญญานี้ยังไม่มีราคาของหมวดที่เลือก — เครื่องนี้จะบันทึกจำนวนพิมพ์ไม่ได้");
  }
  return t("เว้นว่างไว้ = ใช้ราคาตามสัญญาที่เลือก");
});

async function loadMasterData() {
  if (masterLoaded.value) return;

  try {
    const [brand, building, floor, division, department, contract, category] = await Promise.all([
      api.get("/brands"),
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
      api.get("/contracts"),
      api.get("/contracts/meter-categories"),
    ]);

    brands.value = brand.data ?? [];
    buildings.value = building.data ?? [];
    floors.value = floor.data ?? [];
    divisions.value = division.data ?? [];
    departments.value = department.data ?? [];
    contracts.value = contract.data ?? [];
    meterCategories.value = category.data ?? [];
    masterLoaded.value = true;
  } catch (err) {
    console.error("Load master data error:", err);
    formError.value = t("โหลดข้อมูลอ้างอิงไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง");
  }
}

async function loadAsset(id) {
  loading.value = true;

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
      meter_category_id: device.meter_category_id ?? "",
      has_color_meter: Boolean(Number(device.has_color_meter)),
      status: device.status ?? "active",
      billing_from: props.initialBillingFrom,
    };
  } catch (err) {
    console.error("Load device error:", err);
    formError.value = t("โหลดข้อมูลเครื่องไม่สำเร็จ");
  } finally {
    loading.value = false;
  }
}

/** เริ่มฟอร์มใหม่ให้ตรงกับโหมดปัจจุบัน — parent เรียกทุกครั้งที่เปิดฟอร์ม */
async function reset() {
  ready.value = false;
  loading.value = true;
  formError.value = "";
  await loadMasterData();

  if (isEdit.value) await loadAsset(props.assetId);
  else form.value = emptyForm();
  await nextTick();
  capture();

  // กู้ร่างก่อนเปิด ready — ตัวล้างชั้น/แผนกเมื่ออาคาร/ฝ่ายเปลี่ยน (use-placement-fields) ทำงานเฉพาะ
  // หลัง ready ค่าที่กู้คืนจึงไม่ถูกล้างทิ้ง และ baseline ยังเป็นฟอร์มว่าง ฟอร์มจึงนับว่ามีงานค้าง
  const saved = draft.value?.read();
  restoredAt.value = "";
  if (saved) {
    const blank = emptyForm();
    const restored = Object.fromEntries(
      Object.keys(blank).map((key) => [key, Object.hasOwn(saved.values, key) ? saved.values[key] : blank[key]])
    );
    form.value = restored;
    restoredAt.value = saved.at;
    await nextTick();
  }
  ready.value = masterLoaded.value && !formError.value;
  loading.value = false;
}
onMounted(reset);

function validate() {
  if (!form.value.serial_number.trim()) return { field: "serial_number", message: t("กรอกหมายเลข Serial ของเครื่องก่อน") };
  if (!form.value.brand_id) return { field: "brand_id", message: t("เลือกยี่ห้อของเครื่องก่อน") };
  // เฉพาะตอนเพิ่มเครื่องใหม่ — การแก้ไขเครื่องเดิมไม่แตะสถานะการติดตั้ง ซึ่งมี
  // เส้นทางของตัวเองที่หน้าตรวจยืนยัน (ADR-0018 Q18)
  if (!isEdit.value && !form.value.installation_status) {
    return { field: "installation_status", message: t("เลือกว่าเครื่องนี้ติดตั้งแล้วหรือยัง") };
  }
  if (form.value.price_override !== "" && Number(form.value.price_override) < 0) {
    return { field: "price_override", message: t("ราคาต่อหน้าติดลบไม่ได้") };
  }
  return "";
}

async function submit() {
  if (saving.value || !ready.value) return false;
  errors.value = {};
  const problem = validate();
  if (problem) {
    formError.value = problem.message;
    errors.value = { [problem.field]: problem.message };
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
    meter_category_id: form.value.meter_category_id ? Number(form.value.meter_category_id) : null,
    has_color_meter: Boolean(form.value.has_color_meter),
    status: form.value.status || "active",
    ...(isEdit.value && form.value.billing_from
      ? { billing_from: form.value.billing_from }
      : {}),
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
      toastSuccess(t("บันทึกการแก้ไขเรียบร้อย"));
    } else {
      res = await api.post("/devices", {
        ...core,
        ...placement,
        installation_status: form.value.installation_status,
        // ไม่ระบุวัน = ติดตั้งวันนี้ ซึ่ง API เติมให้ — เครื่องที่อยู่มาก่อนแล้วเพิ่ง
        // มาลงทะเบียน ต้องระบุวันจริง ไม่งั้นยอดเดือนเก่าจะไม่ถูกนับว่าต้องกรอก
        installed_on: form.value.installed_on || undefined,
      });
      toastSuccess(t("เพิ่มเครื่องเข้าทะเบียนเรียบร้อย"));
    }

    // ทะเบียนเครื่อง แดชบอร์ด และความครบถ้วนรายเดือนใช้ข้อมูลชุดนี้ทั้งหมด
    await invalidateAfterWrite(queryClient, "device");
    draft.value?.clear();
    restoredAt.value = "";
    capture();
    emit("saved", res.data);
    return true;
  } catch (err) {
    console.error("Save device error:", err);
    errors.value = fieldErrors(err);
    const message = errorMessage(err, t("บันทึกไม่สำเร็จ"));
    formError.value = message;
    toastError(message);
    return false;
  } finally {
    saving.value = false;
  }
}

defineExpose({ reset, submit, saving, loading, ready, discardDraft });
</script>

<template>
  <div>
    <div v-if="loading" class="flex flex-col gap-4">
      <UiSkeleton v-for="n in 6" :key="n" height="2.5rem" />
    </div>

    <UiAlert v-else-if="!ready" tone="danger">
      {{ formError }}
      <template #actions><UiButton variant="secondary" @click="reset">{{ t("ลองใหม่") }}</UiButton></template>
    </UiAlert>
    <form v-else :inert="saving" class="flex flex-col gap-5" @submit.prevent="submit">
      <UiAlert v-if="restoredAt" tone="info" data-testid="draft-restored">
        {{ t("กู้คืนข้อมูลที่กรอกค้างไว้ตั้งแต่ {0}", [formatTime(restoredAt)]) }}
        <template #actions>
          <UiButton size="sm" variant="secondary" @click="discardDraft">{{ t("ล้างแล้วเริ่มใหม่") }}</UiButton>
        </template>
      </UiAlert>

      <!-- ตัวเครื่อง -->
      <!-- grouped: กลุ่มเป็นการ์ดขาวบนพื้นแผงโทนอ่อน (M3 tonal, รอบที่ 3 ของ #51)
           legend ลอย (float) จึงอยู่ในการ์ดเป็นแถวแรกของ grid ไม่ทับเส้นขอบแบบ legend ปกติ -->
      <fieldset class="grid grid-cols-1 sm:grid-cols-2 gap-4" :class="grouped && 'rounded-lg border border-line-soft bg-surface p-4'">
        <legend class="eyebrow" :class="grouped ? 'float-left w-full col-span-full' : 'mb-2'"> {{ t("ข้อมูลเครื่อง") }} </legend>

        <UiField
          :label="t(&quot;หมายเลข Serial&quot;)"
          :error="errors.serial_number"
          required
          :hint="grouped ? '' : t(&quot;เลขที่พิมพ์อยู่บนตัวเครื่อง ใช้เป็นตัวระบุหลักของทุกรายงาน&quot;)"
        >
          <UiInput v-model="form.serial_number" mono :placeholder="t(&quot;เช่น SN2446179&quot;)" />
        </UiField>

        <UiField :label="t(&quot;รหัสครุภัณฑ์&quot;)" :hint="grouped ? '' : t(&quot;ถ้ามีรหัสจากงานพัสดุ ให้กรอกไว้เพื่อใช้ตรวจสอบข้ามระบบ&quot;)">
          <UiInput v-model="form.asset_code" mono :placeholder="t(&quot;เช่น IT-PR-1024&quot;)" />
        </UiField>

        <UiField :label="t(&quot;ยี่ห้อ&quot;)" :error="errors.brand_id" required>
          <UiCombobox v-model="form.brand_id" :options="brandOptions" :placeholder="t(&quot;เลือกยี่ห้อ&quot;)" />
        </UiField>

        <UiField :label="t(&quot;รุ่น&quot;)">
          <UiInput v-model="form.model" :placeholder="t(&quot;เช่น LaserJet M404dn&quot;)" />
        </UiField>

      </fieldset>

      <!-- ที่ตั้ง -->
      <fieldset class="grid grid-cols-1 sm:grid-cols-2 gap-4" :class="grouped ? 'rounded-lg border border-line-soft bg-surface p-4' : 'pt-5 border-t border-line-soft'">
        <legend class="eyebrow" :class="grouped ? 'float-left w-full col-span-full' : 'mb-2'"> {{ t("ที่ตั้งและหน่วยงานที่ดูแล") }} </legend>

        <UiField :label="t(&quot;อาคาร&quot;)">
          <UiCombobox
            v-model="form.building_id"
            :options="buildingOptions"
            :placeholder="t(&quot;เลือกอาคาร&quot;)"
            :any-label="t(&quot;ยังไม่ระบุ&quot;)"
          />
        </UiField>

        <UiField
          :label="t(&quot;ชั้น&quot;)"
          :hint="form.building_id ? '' : t(&quot;เลือกอาคารก่อนถึงจะเลือกชั้นได้&quot;)"
        >
          <UiCombobox
            v-model="form.floor_id"
            :options="floorOptions"
            :disabled="!form.building_id"
            :placeholder="t(&quot;เลือกชั้น&quot;)"
            :any-label="t(&quot;ยังไม่ระบุ&quot;)"
            :empty-text="t(&quot;อาคารนี้ยังไม่มีชั้นในระบบ&quot;)"
          />
        </UiField>

        <UiField :label="t(&quot;ตำแหน่งที่ตั้ง&quot;)" class="sm:col-span-2" :hint="grouped ? '' : t(&quot;จุดที่เครื่องตั้งอยู่จริง เพื่อให้คนไปหาเจอ&quot;)">
          <UiInput v-model="form.location" :placeholder="t(&quot;เช่น เคาน์เตอร์พยาบาล ฝั่งตะวันออก&quot;)" />
        </UiField>

        <UiField :label="t(&quot;ฝ่าย&quot;)">
          <UiCombobox
            v-model="form.division_id"
            :options="divisionOptions"
            :placeholder="t(&quot;เลือกฝ่าย&quot;)"
            :any-label="t(&quot;ยังไม่ระบุ&quot;)"
          />
        </UiField>

        <UiField
          :label="t(&quot;แผนก&quot;)"
          :hint="form.division_id ? t(&quot;แผนกนี้จะเป็นผู้รับผิดชอบค่าใช้จ่ายของเครื่อง&quot;) : t(&quot;เลือกฝ่ายก่อนถึงจะเลือกแผนกได้&quot;)"
        >
          <UiCombobox
            v-model="form.department_id"
            :options="departmentOptions"
            :disabled="!form.division_id"
            :placeholder="t(&quot;เลือกแผนก&quot;)"
            :any-label="t(&quot;ยังไม่ระบุ&quot;)"
            :empty-text="t(&quot;ฝ่ายนี้ยังไม่มีแผนกในระบบ&quot;)"
          />
        </UiField>
      </fieldset>

      <!-- สัญญาและราคา -->
      <fieldset class="grid grid-cols-1 sm:grid-cols-2 gap-4" :class="grouped ? 'rounded-lg border border-line-soft bg-surface p-4' : 'pt-5 border-t border-line-soft'">
        <legend class="eyebrow" :class="grouped ? 'float-left w-full col-span-full' : 'mb-2'"> {{ t("สัญญาและราคา") }} </legend>

        <UiField :label="t(&quot;สัญญาที่ผูกอยู่&quot;)">
          <UiCombobox
            v-model="form.contract_id"
            :options="contractOptions"
            :placeholder="t(&quot;เลือกสัญญา&quot;)"
            :any-label="t(&quot;ไม่ผูกกับสัญญา&quot;)"
          />
        </UiField>

        <UiField
          :label="t(&quot;หมวดมิเตอร์&quot;)"
          :hint="t(&quot;ใช้เลือกราคาในสัญญา เช่น A4 เลเซอร์ หรือ A3 ขาวดำ&quot;)"
          :error="errors.meter_category_id"
        >
          <UiSelect v-model="form.meter_category_id" :options="primaryCategories" :placeholder="t(&quot;เลือกหมวด&quot;)" />
        </UiField>

        <UiField :label="t(&quot;มิเตอร์สี&quot;)" :hint="t(&quot;เครื่องที่ใบแจ้งหนี้แยกการพิมพ์สีเป็นอีกแถว&quot;)">
          <UiCheckbox v-model="form.has_color_meter" :label="t(&quot;เครื่องนี้มีมิเตอร์สี&quot;)" />
        </UiField>

        <UiField :label="t(&quot;ราคาพิเศษเฉพาะเครื่อง&quot;)" :hint="effectivePriceHint" :error="errors.price_override">
          <UiInput v-model="form.price_override" type="number" step="0.0001" min="0" :suffix="t(&quot;บาท&quot;)" />
        </UiField>

        <UiField
          v-if="isEdit"
          :label="t('เริ่มคิดเงินตามสัญญานี้ตั้งแต่วันที่')"
          :hint="t('ตรวจเอกสารก่อนใส่วันที่ — มีผลกับข้อมูลย้อนหลัง')"
          class="sm:col-span-2"
        >
          <UiInput v-model="form.billing_from" type="date" />
        </UiField>
      </fieldset>

      <UiAlert v-if="formError" tone="danger">{{ formError }}</UiAlert>

      <fieldset class="flow-root" :class="grouped ? 'rounded-lg border border-line-soft bg-surface p-4' : 'pt-5 border-t border-line-soft'">
        <legend class="eyebrow mb-2" :class="grouped && 'float-left w-full'">{{ t("สถานะ") }}</legend>
        <UiField :label="t('สถานะเครื่อง')">
          <UiSegmented v-model="form.status" :options="STATUS_OPTIONS" :label="t('สถานะของเครื่อง')" />
        </UiField>

        <template v-if="!isEdit">
          <UiField
            :label="t('สถานะการติดตั้ง')"
            :hint="t('ใช้กำหนดว่าเครื่องนี้ต้องบันทึกเดือนไหนบ้าง')"
            :error="errors.installation_status"
            required
            class="mt-4"
          >
            <UiSegmented
              v-model="form.installation_status"
              :options="INSTALLATION_OPTIONS"
              :label="t('สถานะการติดตั้งของเครื่อง')"
            />
          </UiField>

          <UiField
            v-if="form.installation_status === 'installed'"
            :label="t('ติดตั้งตั้งแต่วันที่')"
            :hint="t('เว้นว่างไว้ถ้าเพิ่งติดตั้งวันนี้ ระบุวันจริงถ้าเครื่องอยู่มาก่อนแล้ว')"
            class="mt-4"
          >
            <UiInput v-model="form.installed_on" type="date" />
          </UiField>
        </template>
      </fieldset>

      <button type="submit" class="hidden" tabindex="-1" aria-hidden="true"></button>
    </form>
  </div>
</template>
