<script setup>
/**
 * MoveDeviceModal — ย้ายเครื่องไปที่ตั้ง/หน่วยงานใหม่
 *
 * แยกจากการ "แก้ไขข้อมูลเครื่อง" เพราะการย้ายไม่ใช่การแก้ข้อมูลผิด แต่เป็น
 * เหตุการณ์ที่มีผลย้อนหลังกับการคิดเงิน: ฝั่ง API จะปิดช่วงการใช้งานเดิมและเปิด
 * ช่วงใหม่ ทำให้ยอดพิมพ์ก่อนย้ายยังคงเป็นของแผนกเดิม
 *
 * ด้วยเหตุนี้หน้าต่างนี้จึงแสดงสามอย่างที่หน้าต่างแก้ไขปกติไม่มี
 *
 *   1. ยอดพิมพ์สะสมของช่วงปัจจุบัน — ให้เห็นก่อนว่ากำลังจะปิดช่วงที่มียอดเท่าไหร่
 *   2. สรุป "จากที่ไหน ไปที่ไหน" ในกล่องยืนยัน ไม่ใช่แค่ถามว่าแน่ใจไหม
 *   3. ประวัติการย้ายทั้งหมด เปิดให้เห็นตั้งแต่แรกโดยไม่ต้องกด เพราะการย้ายซ้ำ
 *      ในเดือนเดียวกันเป็นเคสที่ทำให้ยอดเพี้ยนบ่อยที่สุด
 *
 * หลังย้ายสำเร็จหน้าต่างจะไม่ปิดทันที แต่รีโหลดประวัติให้เห็นกับตาว่าถูกบันทึกแล้ว
 */
import { computed, ref, watch } from "vue";
import { ArrowRight, History, MapPin } from "lucide-vue-next";
import { formatDateTH } from "@suth/domain";
import api from "../services/api";
import { askConfirm } from "../store/confirmDialog";
import { toastError, toastSuccess } from "../store/toast";
import { formatBahtValue, formatCount } from "../lib/format";
import {
  UiAlert,
  UiButton,
  UiCombobox,
  UiEmpty,
  UiField,
  UiInput,
  UiModal,
  UiSkeleton,
} from "../ui";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  assetId: { type: [Number, String, null], default: null },
});

const emit = defineEmits(["update:modelValue", "saved"]);

const emptyForm = () => ({
  building_id: "",
  floor_id: "",
  location: "",
  division_id: "",
  department_id: "",
});

const form = ref(emptyForm());
const serialNumber = ref("");

const buildings = ref([]);
const floors = ref([]);
const divisions = ref([]);
const departments = ref([]);
const masterLoaded = ref(false);

const loading = ref(false);
const saving = ref(false);
const formError = ref("");
const successMessage = ref("");

const currentUsage = ref(null);
const usageLoading = ref(false);

const historyRows = ref([]);
const historyLoading = ref(false);

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

function nameOf(list, id) {
  if (!id) return "ยังไม่ระบุ";
  return list.find((item) => Number(item.id) === Number(id))?.name ?? "ยังไม่ระบุ";
}

const destination = computed(() => {
  const parts = [
    nameOf(divisions.value, form.value.division_id),
    nameOf(departments.value, form.value.department_id),
  ];
  const place = [
    nameOf(buildings.value, form.value.building_id),
    form.value.floor_id ? nameOf(floors.value, form.value.floor_id) : "",
    form.value.location?.trim() ?? "",
  ]
    .filter((p) => p && p !== "ยังไม่ระบุ")
    .join(" · ");

  return `${parts.join(" / ")}${place ? ` — ${place}` : ""}`;
});

const origin = computed(() => {
  if (!currentUsage.value) return "ที่ตั้งปัจจุบัน";
  const usage = currentUsage.value;
  return `${usage.division_name || "ไม่ระบุฝ่าย"} / ${usage.department_name || "ไม่ระบุแผนก"}`;
});

async function loadMasterData() {
  if (masterLoaded.value) return;

  try {
    const [building, floor, division, department] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
      api.get("/divisions"),
      api.get("/departments"),
    ]);

    buildings.value = building.data ?? [];
    floors.value = floor.data ?? [];
    divisions.value = division.data ?? [];
    departments.value = department.data ?? [];
    masterLoaded.value = true;
  } catch (err) {
    console.error("Load master data error:", err);
    formError.value = "โหลดข้อมูลอ้างอิงไม่สำเร็จ";
  }
}

async function loadAsset(id) {
  loading.value = true;
  formError.value = "";

  try {
    const res = await api.get(`/devices/${id}`);
    const device = res.data.data ?? res.data;

    serialNumber.value = device.serial_number ?? "";
    form.value = {
      building_id: device.building_id ?? "",
      floor_id: device.floor_id ?? "",
      location: device.location ?? "",
      division_id: device.division_id ?? "",
      department_id: device.department_id ?? "",
    };
  } catch (err) {
    console.error("Load device error:", err);
    formError.value = "โหลดข้อมูลเครื่องไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

async function loadCurrentUsage(id) {
  usageLoading.value = true;
  currentUsage.value = null;

  try {
    const res = await api.get(`/devices/${id}/current-usage`);
    currentUsage.value = res.data.usage ?? res.data;
  } catch (err) {
    console.error("Load current usage error:", err);
  } finally {
    usageLoading.value = false;
  }
}

async function loadHistory(id) {
  historyLoading.value = true;

  try {
    const res = await api.get(`/devices/${id}/history`);
    historyRows.value = res.data.history ?? [];
  } catch (err) {
    console.error("Load move history error:", err);
  } finally {
    historyLoading.value = false;
  }
}

/**
 * mysql2 คืนคอลัมน์ DATE เป็น Date object พอผ่าน res.json() จะกลายเป็น ISO string
 * เต็มรูปแบบ ("2024-12-17T00:00:00.000Z") ไม่ใช่ "2024-12-17" เปล่าๆ จึงต้องตัด
 * ส่วนเวลาทิ้งก่อนเสมอ ไม่งั้นจะแปลงวันที่ผิดไปหนึ่งวันในเขตเวลาไทย
 */
function historyDate(value) {
  if (!value) return "—";
  return formatDateTH(String(value).split("T")[0]);
}

watch(
  () => [props.modelValue, props.assetId],
  ([open, assetId]) => {
    if (!open) return;

    formError.value = "";
    successMessage.value = "";
    historyRows.value = [];
    loadMasterData();

    if (assetId !== null && assetId !== undefined) {
      loadAsset(assetId);
      loadCurrentUsage(assetId);
      loadHistory(assetId);
    } else {
      form.value = emptyForm();
      serialNumber.value = "";
    }
  },
  { immediate: true }
);

async function submit() {
  const confirmed = await askConfirm(
    `ย้ายจาก\n${origin.value}\n\nไปที่\n${destination.value}\n\nยอดพิมพ์ที่บันทึกไว้ก่อนหน้านี้จะยังเป็นของหน่วยงานเดิม ระบบจะเปิดช่วงใหม่นับจากวันนี้`,
    { title: "ยืนยันการย้ายเครื่อง", confirmText: "ย้ายเครื่อง", danger: false }
  );
  if (!confirmed) return;

  saving.value = true;
  formError.value = "";
  successMessage.value = "";

  try {
    const res = await api.put(`/devices/${props.assetId}/move`, {
      building_id: form.value.building_id ? Number(form.value.building_id) : null,
      floor_id: form.value.floor_id ? Number(form.value.floor_id) : null,
      location: form.value.location?.trim() || null,
      division_id: form.value.division_id ? Number(form.value.division_id) : null,
      department_id: form.value.department_id ? Number(form.value.department_id) : null,
    });

    emit("saved", res.data);

    // ไม่ปิดหน้าต่างทันที — โหลดยอดและประวัติใหม่ให้ผู้ใช้เห็นกับตาว่าช่วงเดิมถูก
    // ปิดและบันทึกไว้จริง ของเดิมปิดทันทีจนไม่มีใครรู้ว่าประวัติถูกเขียนหรือไม่
    await Promise.all([loadCurrentUsage(props.assetId), loadHistory(props.assetId)]);
    successMessage.value = "ย้ายเรียบร้อย — ประวัติด้านล่างอัปเดตแล้ว";
    toastSuccess("ย้ายเครื่องเรียบร้อย");
  } catch (err) {
    console.error("Move device error:", err);
    const message = err.response?.data?.error || "ย้ายเครื่องไม่สำเร็จ";
    formError.value = message;
    toastError(message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UiModal
    :open="modelValue"
    title="ย้ายเครื่อง"
    :description="serialNumber ? `Serial ${serialNumber}` : ''"
    size="lg"
    @update:open="emit('update:modelValue', $event)"
  >
    <div v-if="loading" class="flex flex-col gap-4">
      <UiSkeleton v-for="n in 5" :key="n" height="2.5rem" />
    </div>

    <div v-else class="flex flex-col gap-5">
      <UiAlert v-if="successMessage" tone="ok">{{ successMessage }}</UiAlert>

      <!-- ที่ตั้งปัจจุบันและยอดสะสมของช่วงนี้ -->
      <section class="rounded-lg border border-line-soft bg-surface-2 px-4 py-3">
        <p class="eyebrow mb-2">ช่วงการใช้งานปัจจุบัน</p>

        <div v-if="usageLoading" class="flex flex-col gap-2">
          <UiSkeleton height="1rem" width="60%" />
          <UiSkeleton height="1rem" width="40%" />
        </div>

        <template v-else-if="currentUsage">
          <p class="flex items-center gap-1.5 text-sm text-ink">
            <MapPin :size="14" class="text-ink-mute shrink-0" aria-hidden="true" />
            {{ origin }}
          </p>

          <dl class="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs">
            <div class="flex items-baseline gap-1.5">
              <dt class="text-ink-mute">ยอดพิมพ์สะสม</dt>
              <dd class="numeral font-semibold text-ink">
                {{ formatCount(currentUsage.total_pages ?? currentUsage.net_pages) }} หน้า
              </dd>
            </div>
            <div v-if="currentUsage.total_cost !== undefined" class="flex items-baseline gap-1.5">
              <dt class="text-ink-mute">ค่าใช้จ่ายสะสม</dt>
              <dd class="numeral font-semibold text-ink">
                {{ formatBahtValue(currentUsage.total_cost) }} บาท
              </dd>
            </div>
          </dl>
        </template>

        <p v-else class="text-sm text-ink-mute">ยังไม่มียอดพิมพ์บันทึกไว้ในช่วงนี้</p>
      </section>

      <!-- ที่ตั้งใหม่ -->
      <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="submit">
        <UiField label="อาคาร" class="sm:col-span-1">
          <UiCombobox v-model="form.building_id" :options="buildingOptions" placeholder="เลือกอาคาร" any-label="ยังไม่ระบุ" />
        </UiField>

        <UiField label="ชั้น" :hint="form.building_id ? '' : 'เลือกอาคารก่อน'">
          <UiCombobox
            v-model="form.floor_id"
            :options="floorOptions"
            :disabled="!form.building_id"
            placeholder="เลือกชั้น"
            any-label="ยังไม่ระบุ"
          />
        </UiField>

        <UiField label="ตำแหน่งที่ตั้ง" class="sm:col-span-2">
          <UiInput v-model="form.location" placeholder="เช่น เคาน์เตอร์พยาบาล ฝั่งตะวันออก" />
        </UiField>

        <UiField label="ฝ่าย">
          <UiCombobox v-model="form.division_id" :options="divisionOptions" placeholder="เลือกฝ่าย" any-label="ยังไม่ระบุ" />
        </UiField>

        <UiField label="แผนก" :hint="form.division_id ? 'แผนกนี้จะรับผิดชอบค่าใช้จ่ายนับจากวันย้าย' : 'เลือกฝ่ายก่อน'">
          <UiCombobox
            v-model="form.department_id"
            :options="departmentOptions"
            :disabled="!form.division_id"
            placeholder="เลือกแผนก"
            any-label="ยังไม่ระบุ"
          />
        </UiField>
      </form>

      <!-- สรุปการย้าย -->
      <div class="flex flex-wrap items-center gap-2 rounded-lg border border-brand-line bg-brand-soft px-4 py-3 text-sm">
        <span class="text-brand-ink opacity-80">{{ origin }}</span>
        <ArrowRight :size="15" class="text-brand-ink shrink-0" aria-hidden="true" />
        <span class="font-medium text-brand-ink">{{ destination }}</span>
      </div>

      <UiAlert v-if="formError" tone="danger">{{ formError }}</UiAlert>

      <!-- ประวัติการย้าย -->
      <section>
        <h3 class="flex items-center gap-1.5 eyebrow mb-2">
          <History :size="13" aria-hidden="true" />
          ประวัติการย้ายของเครื่องนี้
        </h3>

        <div v-if="historyLoading" class="flex flex-col gap-2">
          <UiSkeleton v-for="n in 3" :key="n" height="2.25rem" />
        </div>

        <UiEmpty
          v-else-if="!historyRows.length"
          title="ยังไม่เคยย้ายเครื่องนี้"
          description="การย้ายครั้งแรกจะถูกบันทึกไว้ที่นี่"
          compact
        />

        <ol v-else class="flex flex-col list-none border border-line-soft rounded-lg overflow-hidden">
          <li
            v-for="(row, index) in historyRows"
            :key="row.id ?? index"
            class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3.5 py-2.5 text-sm
                   border-b border-line-soft last:border-0 odd:bg-surface-2"
          >
            <span class="text-xs text-ink-mute numeral shrink-0 w-24">
              {{ historyDate(row.start_date ?? row.moved_at ?? row.changed_at) }}
            </span>
            <span class="text-ink-soft min-w-0">
              {{ row.division_name || row.to_division || "ไม่ระบุฝ่าย" }} /
              {{ row.department_name || row.to_department || "ไม่ระบุแผนก" }}
            </span>
            <span class="text-xs text-ink-mute min-w-0">
              {{ row.building_name || row.to_building || "" }}
              {{ row.floor_name ? `· ${row.floor_name}` : "" }}
            </span>
          </li>
        </ol>
      </section>
    </div>

    <template #footer>
      <UiButton variant="secondary" :disabled="saving" @click="emit('update:modelValue', false)">
        ปิด
      </UiButton>
      <UiButton variant="primary" :loading="saving" @click="submit">ย้ายเครื่อง</UiButton>
    </template>
  </UiModal>
</template>
