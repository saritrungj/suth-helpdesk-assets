<script setup>
import { computed, ref } from "vue";
import { Download, Upload } from "lucide-vue-next";
import api from "../services/api";
import { errorMessage } from "../lib/api-error";
import { formatCount } from "../lib/format";
import { toCsv } from "../lib/export-csv";
import { UiAlert, UiButton } from "../ui";
import FileDropzone from "./FileDropzone.vue";
import { t } from "../lib/locale";

const emit = defineEmits(["imported"]);
const file = ref(null);
const uploading = ref(false);
const preview = ref(null);
const result = ref(null);

const TEMPLATE_CSV = [
  "SN.,meter 10/67,meter 11/67,meter 12/67",
  "SN-HP-001,1200,1350,1420",
  "SN-CN-002,800,,950",
].join("\r\n");

const canCommit = computed(() =>
  preview.value?.valid
  && preview.value.preview_token
  && ((preview.value.new_rows?.length ?? 0) + (preview.value.overwrite_rows?.length ?? 0) > 0)
);

function downloadTemplate() {
  const blob = new Blob(["\ufeff" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "template-import-print-usage.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function downloadErrors() {
  const rows = [[t("แถว"), "Serial", t("เดือน"), t("สาเหตุ")]];
  for (const error of preview.value?.errors ?? []) {
    rows.push([error.row, error.serial_number, error.month || "", error.reason]);
  }
  // ค่าในไฟล์นี้มาจากไฟล์ที่ผู้ใช้อัปโหลด ต้องผ่าน toCsv ที่บังคับให้เป็นข้อความ (#87)
  const csv = toCsv(rows);
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "print-usage-import-errors.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function selectFile(value) {
  file.value = value;
  preview.value = null;
  result.value = null;
}

async function send(mode, previewToken = "") {
  const body = new FormData();
  body.append("file", file.value);
  body.append("mode", mode);
  if (previewToken) body.append("preview_token", previewToken);
  return api.post("/print-transactions/import", body, { headers: { "Content-Type": "multipart/form-data" } });
}

async function inspectFile() {
  if (!file.value) return;
  uploading.value = true;
  preview.value = null;
  result.value = null;
  try {
    const res = await send("preview");
    preview.value = res.data;
  } catch (err) {
    result.value = { error: errorMessage(err, t("ตรวจไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")) };
  } finally {
    uploading.value = false;
  }
}

async function commitImport() {
  if (!canCommit.value) return;
  uploading.value = true;
  result.value = null;
  try {
    const res = await send("commit", preview.value.preview_token);
    result.value = res.data;
    emit("imported", res.data);
  } catch (err) {
    result.value = { error: errorMessage(err, t("นำเข้าไม่สำเร็จ กรุณาตรวจไฟล์อีกครั้ง")) };
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <UiButton size="sm" variant="secondary" @click="downloadTemplate">
        <template #icon><Download :size="14" /></template>{{ t("ดาวน์โหลดไฟล์ตัวอย่าง") }}
      </UiButton>
      <span class="text-xs text-ink-mute">{{ t("หัวตารางต้องมี SN. และ meter M/YY เช่น meter 10/67") }}</span>
    </div>

    <FileDropzone :model-value="file" :disabled="uploading" @update:model-value="selectFile" />

    <div v-if="!preview" class="flex justify-end mt-3">
      <UiButton variant="primary" :disabled="!file" :loading="uploading" @click="inspectFile">
        {{ uploading ? t("กำลังตรวจไฟล์…") : t("ตรวจไฟล์") }}
      </UiButton>
    </div>

    <UiAlert v-if="result?.error" tone="danger" class="mt-3">{{ result.error }}</UiAlert>

    <template v-if="preview">
      <UiAlert v-if="preview.errors?.length" tone="danger" class="mt-3">
        <strong class="block">{{ t("ยังบันทึกไม่ได้ พบข้อมูลที่ต้องแก้ {0} จุด", [formatCount(preview.errors.length)]) }}</strong>
        <ul class="mt-2 list-disc pl-5 text-sm">
          <li v-for="(error, index) in preview.errors.slice(0, 10)" :key="index">
            {{ t("แถว {0}", [error.row]) }} · {{ error.serial_number }}<span v-if="error.month"> · {{ error.month }}</span> — {{ error.reason }}
          </li>
        </ul>
        <span v-if="preview.errors.length > 10" class="block mt-2 text-sm">{{ t("และอีก {0} จุด", [formatCount(preview.errors.length - 10)]) }}</span>
        <UiButton size="sm" variant="secondary" class="mt-3" @click="downloadErrors">
          <template #icon><Download :size="14" /></template>{{ t("ดาวน์โหลดรายการที่ต้องแก้") }}
        </UiButton>
      </UiAlert>

      <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4" role="status">
        <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("รายการใหม่") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(preview.new_rows?.length ?? 0) }}</strong></div>
        <div class="rounded-lg bg-warn-soft p-3"><span class="block text-xs text-warn-ink">{{ t("จะเขียนทับข้อมูลเดิม") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(preview.overwrite_rows?.length ?? 0) }}</strong></div>
        <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("ค่าเดิม ไม่เปลี่ยน") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(preview.unchanged_rows?.length ?? 0) }}</strong></div>
      </div>

      <div v-if="preview.overwrite_rows?.length" class="mt-4 overflow-x-auto">
        <p class="text-sm font-semibold text-ink mb-2">{{ t("ตัวอย่างข้อมูลที่จะเขียนทับ") }}</p>
        <table class="w-full text-sm">
          <thead><tr class="border-b border-line-soft text-left text-ink-mute"><th class="py-2">Serial</th><th>{{ t("เดือน") }}</th><th class="text-right">{{ t("ค่าเดิม") }}</th><th class="text-right">{{ t("ค่าใหม่") }}</th></tr></thead>
          <tbody><tr v-for="row in preview.overwrite_rows.slice(0, 10)" :key="`${row.device_id}-${row.month}`" class="border-b border-line-soft"><td class="py-2 font-mono">{{ row.serial_number }}</td><td>{{ row.month }}</td><td class="text-right numeral">{{ formatCount(row.previous_pages) }}</td><td class="text-right numeral font-semibold">{{ formatCount(row.pages) }}</td></tr></tbody>
        </table>
      </div>

      <div class="flex flex-wrap justify-end gap-2 mt-4">
        <UiButton variant="secondary" :disabled="uploading" @click="inspectFile">{{ t("ตรวจอีกครั้ง") }}</UiButton>
        <UiButton variant="primary" :disabled="!canCommit" :loading="uploading" @click="commitImport">
          <template #icon><Upload :size="15" /></template>{{ uploading ? t("กำลังบันทึก…") : t("ยืนยันบันทึก") }}
        </UiButton>
      </div>
    </template>
  </div>
</template>
