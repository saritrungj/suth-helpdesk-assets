<script setup>
import { computed, ref, watch } from 'vue';
import { t } from '../lib/locale';
import { formatMonth } from '../lib/locale-format';
import { formatBahtValue, formatCount, formatNetPages } from '../lib/format';
import { errorMessage } from '../lib/api-error';
import { groupReport, reportTotals, scopeReport } from './executive-report';
import { conditionsSheet, detailSheet, exportFilename, saveWorkbook, standardNotes } from './comparison-export';
import { dashboardCsv, downloadCsv } from './dashboard-csv';
import ExportMenu from './ExportMenu.vue';
import { UiAlert, UiDrawer, UiEmpty, UiInput, UiMetric, UiSegmented } from '../ui';

const props = defineProps({ open: Boolean, rows: { type: Array, default: () => [] }, scope: { type: Object, default: null }, context: { type: String, default: '' }, initialGroup: { type: String, default: 'department' } });
const emit = defineEmits(['update:open']);
const group = ref('department');
const search = ref('');
const exporting = ref(false);
const exportError = ref('');
watch(() => props.open, open => { if (open) { group.value = props.initialGroup; search.value = ''; exportError.value = ''; } });
const options = computed(() => [
  { value: 'division', label: t('ฝ่าย') }, { value: 'department', label: t('แผนก') }, { value: 'contract', label: t('สัญญา') },
  { value: 'building', label: t('อาคาร') }, { value: 'device', label: t('เครื่อง') }, { value: 'month', label: t('เดือน') },
  // แถวของการเทียบข้ามปีงบมีปีงบกำกับ — แบ่งตามปีได้เฉพาะตอนนั้น
  ...(props.rows.some(row => row.fiscal_year) ? [{ value: 'fiscalYear', label: t('ปีงบ') }] : []),
]);
const scoped = computed(() => scopeReport(props.rows, props.scope));
const label = row => group.value === 'month' ? formatMonth(row.key) : row.label || t('ไม่ระบุ');
const groups = computed(() => groupReport(scoped.value, group.value).filter(row => label(row).toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())));
const visibleRows = computed(() => groups.value.flatMap(row => row.rows));
const totals = computed(() => reportTotals(visibleRows.value));
const money = value => value === null ? '—' : formatBahtValue(value);
// แผงนี้แสดงทั้งยอดพิมพ์และค่าใช้จ่าย — ชื่อ "เจาะค่าใช้จ่าย" ผิดเมื่อผู้ใช้กดมาจากยอดพิมพ์
const title = computed(() => props.scope ? t('รายละเอียดข้อมูล · {0}', [props.scope.label]) : t('รายละเอียดข้อมูล'));

/** ชื่อไฟล์และเงื่อนไขของแผงนี้ — ทั้ง Excel และ CSV ใช้ขอบเขตเดียวกับที่เห็นในลิ้นชัก */
const filename = computed(() => exportFilename(['print-usage-details', props.scope?.dimension, group.value]));

function exportCsv() {
  exportError.value = '';
  try { downloadCsv(`${filename.value}.csv`, dashboardCsv(visibleRows.value)); }
  catch (error) { exportError.value = errorMessage(error, t('ส่งออกไม่สำเร็จ')); }
}

/** ข้อมูลดิบของแผงนี้ — คอลัมน์ชุดเดียวกับแผ่น "ข้อมูลรายละเอียด" ของไฟล์รายงาน */
async function exportRows() {
  exporting.value = true;
  exportError.value = '';
  try {
    await saveWorkbook(filename.value, [
      detailSheet(visibleRows.value),
      conditionsSheet(filename.value, [
        [t('ช่วงรายงาน'), props.context],
        [t('ขอบเขต'), props.scope?.label || t('ทั้งหมด')],
        [t('แบ่งตาม'), options.value.find(option => option.value === group.value)?.label],
        [t('ค้นหา'), search.value],
        [t('จำนวนรายการ'), formatCount(visibleRows.value.length)],
        ...standardNotes(),
      ]),
    ]);
  } catch (error) { exportError.value = errorMessage(error, t('ส่งออกไม่สำเร็จ')); }
  finally { exporting.value = false; }
}
</script>

<template>
  <UiDrawer :open="open" size="lg" :title="title" :description="context" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="flex flex-col gap-5">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-5 border-b border-line-soft">
          <UiMetric :label="t('ค่าใช้จ่าย')" :value="money(totals.cost)" :unit="t('บาท')" />
          <UiMetric :label="t('ยอดพิมพ์')" :value="formatCount(totals.rawPages)" :unit="t('หน้า')" />
          <UiMetric :label="t('ยอดพิมพ์หลังหัก 2%')" :value="formatNetPages(totals.pages)" :unit="t('หน้า')" />
        </div>
        <UiSegmented v-model="group" :options="options" :label="t('แบ่งตาม')" size="sm" />
        <UiInput v-model="search" :placeholder="t('ค้นหาในรายละเอียด')" :aria-label="t('ค้นหาในรายละเอียด')" />
        <UiEmpty v-if="!groups.length" :title="t('ไม่มีข้อมูลตามตัวกรองนี้')" compact />
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <caption class="sr-only">{{ title }}</caption>
            <thead><tr class="border-b border-line text-ink-mute"><th scope="col" class="text-left py-3">{{ options.find(option => option.value === group)?.label }}</th><th scope="col" class="text-right px-3">{{ t('ยอดพิมพ์') }}</th><th scope="col" class="text-right px-3">{{ t('ยอดพิมพ์หลังหัก 2%') }}</th><th scope="col" class="text-right">{{ t('บาท') }}</th></tr></thead>
            <tbody><tr v-for="row in groups" :key="row.key" class="border-b border-line-soft">
              <th scope="row" class="py-3 text-left font-medium text-ink"><RouterLink v-if="group === 'device' && row.key !== 'unassigned'" :to="`/assets/${row.key}`" class="underline text-brand-ink">{{ label(row) }}</RouterLink><span v-else>{{ label(row) }}</span><span class="block text-xs font-normal text-ink-mute mt-1">{{ t('{0} รายการ', [formatCount(row.rows.length)]) }}</span></th>
              <td class="text-right px-3 numeral">{{ formatCount(row.rawPages) }}</td><td class="text-right px-3 numeral">{{ formatNetPages(row.pages) }}</td><td class="text-right numeral whitespace-nowrap">{{ money(row.cost) }}</td>
            </tr></tbody>
          </table>
        </div>
        <p class="text-xs text-ink-mute">{{ t('เงินคิดจากรายการรายเครื่องรายเดือน · คิดจากยอดพิมพ์หลังหัก 2%') }}</p>
        <UiAlert v-if="exportError" tone="danger">{{ exportError }}</UiAlert>
      </div>
    </template>
    <template #footer>
      <span class="mr-auto text-xs text-ink-mute">{{ t('{0} รายการ', [formatCount(visibleRows.length)]) }}</span>
      <ExportMenu :disabled="!visibleRows.length" :busy="exporting" :reason="t('ไม่มีรายการให้ส่งออก')" @excel="exportRows" @csv="exportCsv" />
    </template>
  </UiDrawer>
</template>
