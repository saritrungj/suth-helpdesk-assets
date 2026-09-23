<script setup>
/**
 * ImportReadings — ยอดมิเตอร์ที่จะเขียน และยอดตามใบแจ้งหนี้เทียบกับท้ายแผ่นของไฟล์ (#180)
 *
 * ตัวเลขทั้งหมดมาจากการลองเขียนจริงแล้วย้อนกลับ (ADR-0028) — ตรงกับที่รายงานจะแสดงหลังบันทึก
 */
import { computed, ref } from "vue";
import { formatCount } from "../../lib/format";
import { formatMonth } from "../../lib/locale-format";
import { toCsv } from "../../lib/export-csv";
import { t } from "../../lib/locale";
import { UiAlert, UiButton } from "../../ui";
import { overwriteCsv } from "../print-usage-import";
import { downloadCsv } from "./templates";

const props = defineProps({
  readings: { type: Object, required: true },
  reconciliation: { type: Array, default: () => [] },
});

const counts = computed(() => props.readings.counts ?? { new: 0, overwrite: 0, unchanged: 0 });
const showAllOverwrites = ref(false);
const overwrites = computed(() => props.readings.overwrite_rows ?? []);

function downloadErrors() {
  downloadCsv(
    toCsv([
      [t("แผ่นงาน"), t("แถว"), "Serial", t("เดือน"), t("เหตุผล")],
      ...(props.readings.errors ?? []).map((e) => [e.sheet ?? "", e.row ?? "", e.serial_number ?? "", e.month ?? "", e.reason ?? ""]),
    ]),
    "import-errors.csv"
  );
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="readings.status === 'waiting'" class="text-sm text-ink-mute">
      {{ t("ตรวจตัวเลขได้หลังเลือกชื่อ หมวดมิเตอร์ และสัญญาครบ") }}
    </p>
    <template v-else>
      <p v-if="readings.months?.length" class="text-sm text-ink-soft">
        {{ t("งวดในไฟล์: {0}", [readings.months.map((m) => formatMonth(m)).join(", ")]) }}
      </p>
      <div class="grid grid-cols-3 gap-3" role="status">
        <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("ตัวเลขใหม่") }}</span><strong class="numeral text-lg text-ink" data-testid="readings-new">{{ formatCount(counts.new) }}</strong></div>
        <div class="rounded-lg p-3" :class="counts.overwrite ? 'bg-warn-soft' : 'bg-surface-2'"><span class="block text-xs text-ink-mute">{{ t("เขียนทับค่าเดิม") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(counts.overwrite) }}</strong></div>
        <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("ไม่เปลี่ยน") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(counts.unchanged) }}</strong></div>
      </div>

      <UiAlert v-if="readings.error_count" tone="danger" data-testid="readings-errors">
        <strong class="block">{{ t("มี {0} รายการต้องแก้ก่อน — ทั้งไฟล์ยังบันทึกไม่ได้", [formatCount(readings.error_count)]) }}</strong>
        <ul class="mt-2 list-disc pl-5 text-sm">
          <li v-for="(error, index) in readings.errors.slice(0, 20)" :key="index">
            {{ [error.sheet, error.row && t("แถว {0}", [error.row]), error.serial_number, error.month].filter(Boolean).join(" · ") }} — {{ error.reason }}
          </li>
        </ul>
        <template #actions>
          <UiButton size="sm" variant="secondary" @click="downloadErrors">{{ t("ดาวน์โหลดรายการ (CSV)") }}</UiButton>
        </template>
      </UiAlert>

      <UiAlert v-if="readings.warning_count" tone="warn">
        <strong class="block">{{ t("คำเตือน {0} รายการ — บันทึกได้", [formatCount(readings.warning_count)]) }}</strong>
        <ul class="mt-2 list-disc pl-5 text-sm">
          <li v-for="(warning, index) in readings.warnings.slice(0, 10)" :key="index">{{ warning.serial_number }} · {{ warning.month }} — {{ warning.reason }}</li>
        </ul>
      </UiAlert>

      <div v-if="overwrites.length">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <p class="text-sm font-semibold text-ink mr-auto">{{ t("ค่าที่จะถูกเขียนทับ") }}</p>
          <UiButton size="sm" variant="ghost" @click="downloadCsv(overwriteCsv(overwrites), 'import-overwrites.csv')">{{ t("ดาวน์โหลด CSV") }}</UiButton>
        </div>
        <table class="w-full text-sm [&_th]:pr-4 [&_td]:pr-4">
          <thead><tr class="border-b border-line-soft text-left text-ink-mute"><th class="py-2">Serial</th><th>{{ t("เดือน") }}</th><th class="text-right">{{ t("ค่าเดิม") }}</th><th class="text-right">{{ t("ค่าใหม่") }}</th></tr></thead>
          <tbody>
            <tr v-for="row in (showAllOverwrites ? overwrites : overwrites.slice(0, 10))" :key="`${row.serial_number}-${row.meter}-${row.month}`" class="border-b border-line-soft" data-testid="overwrite-row">
              <td class="py-1 font-mono text-xs">{{ row.serial_number }}</td><td>{{ formatMonth(row.month) }}</td>
              <td class="text-right numeral">{{ formatCount(row.previous_pages) }}</td><td class="text-right numeral">{{ formatCount(row.pages) }}</td>
            </tr>
          </tbody>
        </table>
        <UiButton v-if="overwrites.length > 10" size="sm" variant="ghost" class="mt-1" data-testid="show-all-overwrites" @click="showAllOverwrites = !showAllOverwrites">
          {{ showAllOverwrites ? t("ย่อ") : t("แสดงทั้งหมด") }}
        </UiButton>
      </div>

      <div v-if="reconciliation.length" class="overflow-x-auto" data-testid="reconciliation">
        <p class="text-sm font-semibold text-ink mb-1">{{ t("เงินตามใบแจ้งหนี้เทียบกับท้ายรายงาน") }}</p>
        <p class="text-xs text-ink-mute mb-2">{{ t("ต่างกันไม่เกิน 1 สตางค์ต่องวดถือว่าตรง (ผู้ให้เช่าปัดเศษต่างวิธี)") }}</p>
        <table class="w-full text-sm [&_th]:pr-4 [&_td]:pr-4">
          <thead><tr class="border-b border-line-soft text-left text-ink-mute"><th class="py-2">{{ t("งวด") }}</th><th>{{ t("เทียบ") }}</th><th class="text-right">{{ t("ในไฟล์") }}</th><th class="text-right">{{ t("ในระบบ") }}</th><th class="text-right">{{ t("ต่าง") }}</th></tr></thead>
          <tbody>
            <tr v-for="line in reconciliation" :key="`${line.contract_no}-${line.month}`" class="border-b border-line-soft" :class="line.matches ? '' : 'bg-warn-soft'">
              <td class="py-1">{{ formatMonth(line.month) }}</td>
              <td class="text-ink-soft">{{ line.basis === "invoice" ? t("รวมค่าเช่าและ VAT") : t("ค่าพิมพ์") }}</td>
              <td class="text-right numeral">{{ line.file_total }}</td>
              <td class="text-right numeral">{{ line.system_total }}</td>
              <td class="text-right numeral" :class="line.matches ? 'text-ink-mute' : 'text-warn-ink font-medium'">{{ line.diff }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
