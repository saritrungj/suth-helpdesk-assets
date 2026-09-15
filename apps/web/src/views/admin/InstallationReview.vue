<script setup>
import { t } from "../../lib/locale";
import { formatMonth } from "../../lib/locale-format";

/**
 * InstallationReview — ตรวจยืนยันสถานะการติดตั้งของเครื่องเดิม (ADR-0018)
 *
 * ## หน้านี้มีไว้ทำไม
 *
 * เครื่องที่ย้ายมาจากข้อมูลเดิมและเครื่องที่มาจากไฟล์นำเข้า ไม่มีใครเคยตอบว่า
 * ติดตั้งแล้วหรือยัง ระบบจึงไม่รู้ว่าเดือนไหนเครื่องนั้นต้องบันทึกยอด และรายงาน
 * ความครบถ้วนทั้งระบบว่า "ยังยืนยันไม่ได้" จนกว่าจะตรวจครบ
 *
 * งานนี้ทำได้เฉพาะคนที่เดินไปดูของจริงหรือมีเอกสารในมือ ระบบจึงไม่เดาให้ (Q14)
 *
 * ## คำถามสองข้อที่ต้องถาม ห้ามรวบเป็นข้อเดียว
 *
 *   1. "ตอนนี้ติดตั้งแล้วหรือยัง" — ผู้ดูแลตอบได้ทันทีจากการไปดู
 *   2. "ย้อนหลังก่อนหน้านั้นล่ะ" — ตอบได้ต่อเมื่อมีเอกสาร
 *
 * ถ้าถามแค่ข้อแรก ระบบต้องเลือกเองว่าเดือนเก่าคือ "ไม่ต้องกรอก" (ทำให้ความครบถ้วน
 * ดูดีเกินจริง) หรือ "ค้าง" (สร้างงานที่อาจไม่มีอยู่) — ทั้งสองทางคือการสรุปแทน
 * ผู้ใช้ในเรื่องที่กระทบตัวเลขงบประมาณ ข้อสองจึงเป็นคำถามบังคับ ไม่ใช่ตัวเลือกเสริม
 *
 * ## ทำไมเรียงเครื่องที่มียอดพิมพ์แล้วขึ้นก่อน
 *
 * เครื่องที่มีคนกรอกยอดให้อยู่แล้วคือเครื่องที่กำลังกระทบตัวเลขค่าใช้จ่ายจริงตอนนี้
 * การตรวจเครื่องเหล่านั้นก่อนทำให้ตัวเลขที่คนใช้อยู่ทุกวันเชื่อถือได้เร็วที่สุด
 */
import { computed, onMounted, ref } from "vue";
import { ClipboardCheck } from "lucide-vue-next";
import api from "../../services/api";
import { toastSuccess } from "../../store/toast";
import { errorMessage } from "../../lib/api-error";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCheckbox,
  UiDataTable,
  UiEmpty,
  UiField,
  UiInput,
  UiModal,
  UiPageHeader,
  UiSelect,
} from "../../ui";

const devices = ref([]);
const loading = ref(true);
const loadError = ref("");

const dialogOpen = ref(false);
const target = ref(null);
const saving = ref(false);
const formError = ref("");

/**
 * ค่าเริ่มต้นของฟอร์ม
 *
 * `installation_status` ต้องเป็นค่าว่าง ไม่ใช่ "installed" — ค่าตั้งต้นใดๆ จะถูกกด
 * บันทึกผ่านไปโดยไม่มีใครอ่าน แล้วกลายเป็นคำตอบที่ไม่มีใครตั้งใจตอบ ซึ่งเป็นสิ่งที่
 * ADR ข้อ Q18 ห้ามไว้ตรงๆ
 */
const form = ref({ installation_status: "", effective_from: "", history_known: false, note: "" });

const STATUS_OPTIONS = [
  { value: "installed", label: t("ติดตั้งแล้ว") },
  { value: "not_installed", label: t("ยังไม่ได้ติดตั้ง") },
];

const columns = [
  { key: "serial_number", label: t("หมายเลขเครื่อง") },
  { key: "model", label: t("รุ่น"), value: (row) => row.model || "—" },
  { key: "building_name", label: t("อาคาร"), value: (row) => row.building_name || "—" },
  { key: "department_name", label: t("แผนก"), value: (row) => row.department_name || "—" },
  { key: "readings", label: t("ยอดที่บันทึกไว้แล้ว") },
  { key: "actions", label: "" },
];

const pending = computed(() => devices.value.length);

/** ช่วงเดือนที่เครื่องนี้มียอดบันทึกไว้ — หลักฐานชิ้นหนึ่งที่ช่วยผู้ดูแลตัดสินใจ */
function readingRange(row) {
  if (!Number(row.reading_count)) return t("ยังไม่มียอด");
  if (row.first_month === row.last_month) return formatMonth(row.first_month);
  return `${formatMonth(row.first_month)} – ${formatMonth(row.last_month)}`;
}

async function load() {
  loading.value = true;
  loadError.value = "";

  try {
    const { data } = await api.get("/devices/installation-review");
    devices.value = data.devices ?? [];
  } catch (err) {
    console.error(err);
    loadError.value = errorMessage(err, t("โหลดรายการเครื่องที่รอตรวจไม่สำเร็จ"));
  } finally {
    loading.value = false;
  }
}

function openReview(row) {
  target.value = row;
  formError.value = "";
  form.value = { installation_status: "", effective_from: "", history_known: false, note: "" };
  dialogOpen.value = true;
}

async function save() {
  if (!form.value.installation_status) {
    formError.value = t("กรุณาเลือกว่าเครื่องนี้ติดตั้งแล้วหรือยัง");
    return;
  }

  saving.value = true;
  formError.value = "";

  try {
    await api.put(`/devices/${target.value.id}/installation`, {
      installation_status: form.value.installation_status,
      // ไม่กรอกวันที่ = ยืนยันตั้งแต่วันนี้ ซึ่ง API เติมให้เอง
      effective_from: form.value.effective_from || undefined,
      history_known: form.value.history_known,
      note: form.value.note || undefined,
    });

    toastSuccess(t("บันทึกผลการตรวจยืนยันของ {0} แล้ว", [target.value.serial_number]));
    dialogOpen.value = false;
    await load();
  } catch (err) {
    console.error(err);
    formError.value = errorMessage(err, t("บันทึกผลการตรวจยืนยันไม่สำเร็จ"));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <UiPageHeader
      :eyebrow="t(&quot;ผู้ดูแลระบบ · ทะเบียนเครื่องพิมพ์&quot;)"
      :title="t(&quot;ตรวจยืนยันสถานะการติดตั้ง&quot;)"
      :description="t(&quot;ระบบไม่เดาให้ว่าเครื่องเดิมติดตั้งแล้วหรือยัง ความครบถ้วนของยอดพิมพ์จะยืนยันได้เมื่อตรวจครบทุกเครื่อง&quot;)"
    >
      <template #actions>
        <UiBadge v-if="!loading && pending" tone="warn" dot>
          {{ t("เหลืออีก {0} เครื่อง", [pending]) }}
        </UiBadge>
      </template>
    </UiPageHeader>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="load">{{ t("ลองใหม่") }}</UiButton>
      </template>
    </UiAlert>

    <UiEmpty
      v-else-if="!loading && !pending"
      :title="t(&quot;ตรวจยืนยันครบทุกเครื่องแล้ว&quot;)"
      :description="t(&quot;ตัวเลขความครบถ้วนของยอดพิมพ์บนแดชบอร์ดยืนยันได้แล้ว&quot;)"
    />

    <UiDataTable
      v-else
      :rows="devices"
      :columns="columns"
      :loading="loading"
      :caption="t(&quot;เครื่องที่รอตรวจยืนยันสถานะการติดตั้ง&quot;)"
      :show-fullscreen="false"
      row-key="id"
      export-filename="installation-review"
      :search-placeholder="t(&quot;ค้นหาหมายเลขเครื่อง…&quot;)"
      :empty-text="t(&quot;ไม่มีเครื่องที่รอตรวจ&quot;)"
    >
      <template #cell-serial_number="{ row }">
        <RouterLink :to="`/assets/${row.id}`" class="font-medium text-brand-ink underline">
          {{ row.serial_number }}
        </RouterLink>
      </template>

      <template #cell-readings="{ row }">
        <span class="text-ink-soft">{{ readingRange(row) }}</span>
      </template>

      <template #cell-actions="{ row }">
        <UiButton size="sm" variant="secondary" @click="openReview(row)">
          <template #icon><ClipboardCheck :size="14" /></template>
          {{ t("ตรวจยืนยัน") }}
        </UiButton>
      </template>
    </UiDataTable>

    <UiModal
      v-model:open="dialogOpen"
      :title="t(&quot;ตรวจยืนยันการติดตั้ง&quot;)"
      :description="target ? t(&quot;เครื่อง {0}&quot;, [target.serial_number]) : ''"
    >
      <div class="flex flex-col gap-4">
        <UiField :label="t(&quot;ตอนนี้เครื่องนี้ติดตั้งแล้วหรือยัง&quot;)" required>
          <UiSelect
            v-model="form.installation_status"
            :options="STATUS_OPTIONS"
            value-key="value"
            label-key="label"
            :placeholder="t(&quot;เลือกสถานะที่เห็นจริง&quot;)"
          />
        </UiField>

        <UiField
          :label="t(&quot;มีผลตั้งแต่วันที่&quot;)"
          :hint="t(&quot;เว้นว่างไว้ถ้าทราบแค่ว่าตอนนี้เป็นแบบนี้ ระบบจะใช้วันนี้&quot;)"
        >
          <UiInput v-model="form.effective_from" type="date" />
        </UiField>

        <UiCheckbox
          v-model="form.history_known"
          :label="t(&quot;ยืนยันข้อมูลก่อนหน้าวันดังกล่าวได้ด้วย&quot;)"
          :description="t(&quot;ติ๊กเฉพาะเมื่อมีเอกสารหรือทราบแน่ชัดว่าก่อนหน้านั้นเครื่องนี้ต้องบันทึกยอดหรือไม่ ถ้าไม่ติ๊ก ระบบจะรายงานเดือนก่อนหน้าว่ายังยืนยันไม่ได้ แทนการสรุปเอง&quot;)"
        />

        <UiField :label="t(&quot;หมายเหตุ&quot;)" :hint="t(&quot;เช่น เลขที่เอกสารที่ใช้อ้างอิง&quot;)">
          <UiInput v-model="form.note" :maxlength="255" />
        </UiField>

        <UiAlert v-if="formError" tone="danger">{{ formError }}</UiAlert>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="dialogOpen = false">{{ t("ยกเลิก") }}</UiButton>
        <UiButton variant="primary" :loading="saving" @click="save">{{ t("บันทึกผลการตรวจ") }}</UiButton>
      </template>
    </UiModal>
  </div>
</template>
