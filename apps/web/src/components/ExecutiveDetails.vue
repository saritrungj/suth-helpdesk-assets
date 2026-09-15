<script setup>
import { computed, ref, watch } from 'vue';
import { t } from '../lib/locale';
import { formatMonth } from '../lib/locale-format';
import { formatBahtValue, formatCount } from '../lib/format';
import { exportSheet } from '../lib/export-xlsx';
import { errorMessage } from '../lib/api-error';
import { groupReport, reportTotals, scopeReport } from './executive-report';
import { UiAlert, UiButton, UiDrawer, UiEmpty, UiInput, UiMetric, UiSegmented } from '../ui';

const props = defineProps({ open: Boolean, rows: { type: Array, default: () => [] }, scope: { type: Object, default: null }, context: { type: String, default: '' }, initialGroup: { type: String, default: 'department' } });
const emit = defineEmits(['update:open']);
const group = ref('department');
const search = ref('');
const exporting = ref(false);
const exportError = ref('');
watch(() => props.open, open => { if (open) { group.value = props.initialGroup; search.value = ''; exportError.value = ''; } });
const options = computed(() => [
  { value: 'department', label: t('แผนก') }, { value: 'contract', label: t('สัญญา') },
  { value: 'device', label: t('เครื่อง') }, { value: 'month', label: t('เดือน') },
]);
const scoped = computed(() => scopeReport(props.rows, props.scope));
const label = row => group.value === 'month' ? formatMonth(row.key) : row.label || t('ไม่ระบุ');
const groups = computed(() => groupReport(scoped.value, group.value).filter(row => label(row).toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())));
const visibleRows = computed(() => groups.value.flatMap(row => row.rows));
const totals = computed(() => reportTotals(visibleRows.value));
const money = value => value === null ? '—' : formatBahtValue(value);
const title = computed(() => props.scope ? t('เจาะค่าใช้จ่าย · {0}', [props.scope.label]) : t('รายละเอียดค่าใช้จ่าย'));
async function exportRows() {
  exporting.value = true;
  exportError.value = '';
  try {
    await exportSheet({
      filename: 'dashboard-cost-details', sheetName: t('รายละเอียด'),
      header: [t('เดือน'), 'Serial', t('แผนก'), t('สัญญา'), t('หน้าสุทธิ'), t('ค่าใช้จ่ายสุทธิ (บาท)'), t('สถานะราคา')],
      rows: visibleRows.value.map(row => [row.month, row.serial_number, row.department_name, row.contract_no, Number(row.net_pages || 0), row.total_cost == null ? null : Number(row.total_cost), row.total_cost == null ? t('ยังยืนยันราคาไม่ได้') : t('ยืนยันแล้ว')]),
      context: [[t('ช่วงรายงาน'), props.context], [t('ขอบเขต'), props.scope?.label || t('ทั้งหมด')], [t('ค้นหา'), search.value], [t('รายการที่ยังยืนยันราคาไม่ได้'), totals.value.unpriced]],
    });
  } catch (error) { exportError.value = errorMessage(error, t('ส่งออกไม่สำเร็จ')); }
  finally { exporting.value = false; }
}
</script>

<template>
  <UiDrawer :open="open" size="lg" :title="title" :description="context" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="flex flex-col gap-5">
        <div class="grid grid-cols-2 gap-4 pb-5 border-b border-line-soft">
          <UiMetric :label="totals.unpriced ? t('ค่าใช้จ่ายที่ยืนยันแล้ว') : t('ค่าใช้จ่ายสุทธิ')" :value="money(totals.cost)" :unit="t('บาท')" />
          <UiMetric :label="t('ยอดพิมพ์สุทธิ')" :value="formatCount(totals.pages)" :unit="t('หน้า')" />
        </div>
        <p v-if="totals.unpriced" class="text-sm text-ink-soft">{{ t('ยังยืนยันราคาไม่ได้ {0} รายการ · ยอดเงินยังไม่ครบ', [formatCount(totals.unpriced)]) }}</p>
        <UiSegmented v-model="group" :options="options" :label="t('แยกรายละเอียดตาม')" size="sm" />
        <UiInput v-model="search" :placeholder="t('ค้นหาในรายละเอียด')" :aria-label="t('ค้นหาในรายละเอียด')" />
        <UiEmpty v-if="!groups.length" :title="t('ไม่มีข้อมูลตามตัวกรองนี้')" compact />
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <caption class="sr-only">{{ title }}</caption>
            <thead><tr class="border-b border-line text-ink-mute"><th scope="col" class="text-left py-3">{{ options.find(option => option.value === group)?.label }}</th><th scope="col" class="text-right px-3">{{ t('หน้าสุทธิ') }}</th><th scope="col" class="text-right">{{ t('บาท') }}</th></tr></thead>
            <tbody><tr v-for="row in groups" :key="row.key" class="border-b border-line-soft">
              <th scope="row" class="py-3 text-left font-medium text-ink"><RouterLink v-if="group === 'device' && row.key !== 'unassigned'" :to="`/assets/${row.key}`" class="underline text-brand-ink">{{ label(row) }}</RouterLink><span v-else>{{ label(row) }}</span><span class="block text-xs font-normal text-ink-mute mt-1">{{ t('{0} รายการ', [formatCount(row.rows.length)]) }}<template v-if="row.unpriced"> · {{ t('รอราคา {0}', [formatCount(row.unpriced)]) }}</template></span></th>
              <td class="text-right px-3 numeral">{{ formatCount(row.pages) }}</td><td class="text-right numeral whitespace-nowrap">{{ money(row.cost) }}<span v-if="row.unpriced && row.cost !== null" class="block text-xs text-ink-mute">{{ t('เฉพาะที่ยืนยันแล้ว') }}</span></td>
            </tr></tbody>
          </table>
        </div>
        <p class="text-xs text-ink-mute">{{ t('ยอดเงินจากรายการรายเครื่องรายเดือน · จำนวนหน้าหัก 2% แล้ว') }}</p>
        <UiAlert v-if="exportError" tone="danger">{{ exportError }}</UiAlert>
      </div>
    </template>
    <template #footer><span class="mr-auto text-xs text-ink-mute">{{ t('{0} รายการ', [formatCount(visibleRows.length)]) }}</span><UiButton :disabled="!visibleRows.length" :loading="exporting" @click="exportRows">{{ t('ส่งออก Excel') }}</UiButton></template>
  </UiDrawer>
</template>
