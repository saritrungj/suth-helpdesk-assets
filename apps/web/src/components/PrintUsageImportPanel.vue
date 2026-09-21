<script setup>
import { computed, ref } from "vue";
import { currentMonth } from "@suth/domain";
import { Download, Upload } from "lucide-vue-next";
import api from "../services/api";
import { errorMessage } from "../lib/api-error";
import { formatBahtValue, formatCount, formatNetPages } from "../lib/format";
import { toCsv } from "../lib/export-csv";
import { UiAlert, UiButton } from "../ui";
import FileDropzone from "./FileDropzone.vue";
import { t } from "../lib/locale";
import { formatDate, formatMonth } from "../lib/locale-format";
import { meterHeader, overwriteCsv, recentMonths, templateCsv } from "./print-usage-import";

const emit = defineEmits(["imported"]);
const file = ref(null);
const uploading = ref(false);
const preview = ref(null);
const result = ref(null);

/** เดือนของไฟล์ตัวอย่าง — สามเดือนล่าสุด ผู้ใช้เปลี่ยนหัวคอลัมน์เป็นเดือนที่จะนำเข้าเอง */
const templateMonths = recentMonths(currentMonth(), 3);
const templateExample = meterHeader(templateMonths.at(-1));

/**
 * รายการที่จะเขียนทับแสดง 10 แถวแรกก่อน แล้วกดดูครบได้ในหน้าเดียวกัน (#106)
 *
 * เดิมเห็นได้แค่ 10 แถวแรกโดยไม่มีทางดูที่เหลือ ทั้งที่การยืนยันคือการเขียนทับ "ทุกแถว"
 * ผู้ใช้จึงยืนยันค่าที่ไม่เคยเห็น
 */
const OVERWRITE_PREVIEW = 10;
const showAllOverwrites = ref(false);
const overwriteRows = computed(() => preview.value?.overwrite_rows ?? []);
const visibleOverwrites = computed(() =>
  showAllOverwrites.value ? overwriteRows.value : overwriteRows.value.slice(0, OVERWRITE_PREVIEW)
);
const monthsFound = computed(() => (preview.value?.months_found ?? []).map((month) => formatMonth(month)).join(", "));

const canCommit = computed(() =>
  preview.value?.valid
  && preview.value.preview_token
  && ((preview.value.new_rows?.length ?? 0) + (preview.value.overwrite_rows?.length ?? 0) > 0)
);

function downloadCsv(content, filename) {
  const url = URL.createObjectURL(new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadTemplate() {
  downloadCsv(templateCsv(templateMonths), "template-import-print-usage.csv");
}

function downloadOverwrites() {
  downloadCsv(overwriteCsv(overwriteRows.value), "print-usage-import-overwrites.csv");
}

function downloadErrors() {
  const rows = [[t("แผ่นงาน"), t("แถว"), "Serial", t("เดือน"), t("สาเหตุ")]];
  for (const error of preview.value?.errors ?? []) {
    rows.push([error.sheet || "", error.row, error.serial_number, error.month || "", error.reason]);
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
  showAllOverwrites.value = false;
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
  showAllOverwrites.value = false;
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
      <span class="text-xs text-ink-mute">{{ t("หัวตารางต้องมี SN. และ meter M/YY ปี พ.ศ. เช่น {0} — เปลี่ยนหัวคอลัมน์ในไฟล์ตัวอย่างเป็นเดือนที่จะนำเข้า", [templateExample]) }}</span>
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
            <template v-if="error.sheet">{{ error.sheet }} · </template><template v-if="error.row">{{ t("แถว {0}", [error.row]) }} · </template>{{ error.serial_number }}<span v-if="error.month"> · {{ formatMonth(error.month) }}</span> — {{ error.reason }}
          </li>
        </ul>
        <span v-if="preview.errors.length > 10" class="block mt-2 text-sm">{{ t("และอีก {0} จุด", [formatCount(preview.errors.length - 10)]) }}</span>
        <UiButton size="sm" variant="secondary" class="mt-3" @click="downloadErrors">
          <template #icon><Download :size="14" /></template>{{ t("ดาวน์โหลดรายการที่ต้องแก้") }}
        </UiButton>
      </UiAlert>

      <p v-if="monthsFound" class="mt-4 text-sm text-ink-soft">
        {{ t("เดือนในไฟล์") }}: <strong class="text-ink">{{ monthsFound }}</strong>
      </p>

      <div v-if="preview.sheets?.length" class="mt-4 overflow-x-auto">
        <p class="mb-2 text-sm font-semibold text-ink">{{ t("แผ่นงานที่พบ") }}</p>
        <table class="w-full text-sm">
          <thead><tr class="border-b border-line-soft text-left text-ink-mute"><th class="py-2">{{ t("แผ่นงาน") }}</th><th>{{ t("งวด") }}</th><th>{{ t("เดือน") }}</th><th>{{ t("เลขที่สัญญา") }}</th></tr></thead>
          <tbody><tr v-for="sheet in preview.sheets" :key="sheet.sheet" data-testid="source-sheet" class="border-b border-line-soft"><td class="py-2 font-medium text-ink">{{ sheet.sheet }}</td><td>{{ formatDate(sheet.period_start) }} – {{ formatDate(sheet.period_end) }}</td><td>{{ formatMonth(sheet.month) }}</td><td>{{ sheet.contract_no || "—" }}</td></tr></tbody>
        </table>
      </div>

      <UiAlert v-if="preview.warnings?.length" tone="warn" class="mt-4" data-testid="import-warning">
        <strong class="block">{{ t("พบคำเตือน {0} รายการ", [formatCount(preview.warnings.length)]) }}</strong>
        <ul class="mt-2 list-disc pl-5 text-sm">
          <li v-for="(warning, index) in preview.warnings" :key="index"><template v-if="warning.sheet">{{ warning.sheet }} · </template><template v-if="warning.row">{{ t("แถว {0}", [warning.row]) }} · </template>{{ warning.serial_number }}<span v-if="warning.month"> · {{ formatMonth(warning.month) }}</span> — {{ warning.reason }}</li>
        </ul>
      </UiAlert>

      <div v-if="preview.invoice?.length" class="mt-4 overflow-x-auto">
        <p class="mb-2 text-sm font-semibold text-ink">{{ t("ยอดตามใบแจ้งหนี้") }}</p>
        <table class="w-full text-sm">
          <thead><tr class="border-b border-line-soft text-left text-ink-mute"><th class="py-2">{{ t("เดือน") }}</th><th>{{ t("เลขที่สัญญา") }}</th><th>{{ t("หมวดมิเตอร์") }}</th><th class="text-right">{{ t("ราคาต่อหน้า") }}</th><th class="text-right">{{ t("ยอดพิมพ์จริง") }}</th><th class="text-right">{{ t("ยอดพิมพ์สุทธิ") }}</th><th class="text-right">{{ t("ยอดตามใบแจ้งหนี้") }}</th></tr></thead>
          <tbody><tr v-for="(line, index) in preview.invoice" :key="`${line.month}-${line.contract_no}-${line.category}-${index}`" data-testid="invoice-line" class="border-b border-line-soft"><td class="py-2">{{ formatMonth(line.month) }}</td><td>{{ line.contract_no || "—" }}</td><td>{{ line.category }}</td><td class="text-right numeral">{{ Number(line.price_per_page).toFixed(4) }}</td><td class="text-right numeral">{{ formatCount(line.pages) }}</td><td class="text-right numeral">{{ formatNetPages(line.net_pages) }}</td><td class="text-right numeral font-semibold text-ink">{{ formatBahtValue(line.line_total) }}</td></tr></tbody>
        </table>
      </div>

      <div v-if="!preview.errors?.length" class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4" role="status">
        <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("รายการใหม่") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(preview.new_rows?.length ?? 0) }}</strong></div>
        <div class="rounded-lg bg-warn-soft p-3"><span class="block text-xs text-warn-ink">{{ t("จะเขียนทับข้อมูลเดิม") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(preview.overwrite_rows?.length ?? 0) }}</strong></div>
        <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("ค่าเดิม ไม่เปลี่ยน") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(preview.unchanged_rows?.length ?? 0) }}</strong></div>
      </div>

      <div v-if="overwriteRows.length" class="mt-4">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <p class="text-sm font-semibold text-ink mr-auto">{{ t("ข้อมูลที่จะเขียนทับ {0} รายการ", [formatCount(overwriteRows.length)]) }}</p>
          <UiButton
            v-if="overwriteRows.length > OVERWRITE_PREVIEW"
            size="sm"
            variant="ghost"
            data-testid="show-all-overwrites"
            :aria-expanded="showAllOverwrites"
            @click="showAllOverwrites = !showAllOverwrites"
          >
            {{ showAllOverwrites ? t("แสดงแค่ {0} รายการแรก", [OVERWRITE_PREVIEW]) : t("แสดงทั้งหมด {0} รายการ", [formatCount(overwriteRows.length)]) }}
          </UiButton>
          <UiButton size="sm" variant="secondary" @click="downloadOverwrites">
            <template #icon><Download :size="14" /></template>{{ t("ดาวน์โหลดรายการที่จะเขียนทับ") }}
          </UiButton>
        </div>
        <div class="overflow-x-auto max-h-80 overflow-y-auto" tabindex="0" role="region" :aria-label="t('ข้อมูลที่จะเขียนทับ {0} รายการ', [formatCount(overwriteRows.length)])">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-line-soft text-left text-ink-mute"><th class="py-2">Serial</th><th>{{ t("เดือน") }}</th><th class="text-right">{{ t("ค่าเดิม") }}</th><th class="text-right">{{ t("ค่าใหม่") }}</th></tr></thead>
            <tbody><tr v-for="row in visibleOverwrites" :key="`${row.device_id}-${row.month}`" data-testid="overwrite-row" class="border-b border-line-soft"><td class="py-2 font-mono">{{ row.serial_number }}</td><td>{{ formatMonth(row.month) }}</td><td class="text-right numeral">{{ formatCount(row.previous_pages) }}</td><td class="text-right numeral font-semibold">{{ formatCount(row.pages) }}</td></tr></tbody>
          </table>
        </div>
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
