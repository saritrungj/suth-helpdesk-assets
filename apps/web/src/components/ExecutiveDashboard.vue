<script setup>
import { computed, ref, watch } from 'vue';
import { ArrowDownToLine, ArrowUpRight, ChevronRight, FileImage, RefreshCw } from 'lucide-vue-next';
import { useContracts, useMonthlyKpi, useOverview } from '../api/queries';
import { activeFiscalYear, activeFiscalYearRange, fiscalYearMonths } from '../store/fiscalYear';
import { t } from '../lib/locale';
import { formatMonth, yearLabel } from '../lib/locale-format';
import { formatBahtValue, formatCompact, formatCount, percentOf } from '../lib/format';
import { errorMessage } from '../lib/api-error';
import { exportSummaryCard } from '../ui/export-summary-card';
import { UiAlert, UiButton, UiCard, UiChart, UiEmpty, UiSegmented, UiSkeleton, UiPageHeader, UiStat } from '../ui';
import DashboardFilter from './DashboardFilter.vue';
import ExecutiveDetails from './ExecutiveDetails.vue';
import AttentionPanel from './AttentionPanel.vue';
import { groupReport, reportTotals } from './executive-report';

const root = ref(null);
const filter = ref({ contract_id: '', month: '' });
const metric = ref('cost');
const detailOpen = ref(false);
const detailScope = ref(null);
const detailGroup = ref('department');
const exportBusy = ref(false);
const exportError = ref('');
const params = computed(() => ({
  contract_id: filter.value.contract_id || undefined,
  month: filter.value.month || (activeFiscalYearRange.value ? fiscalYearMonths(activeFiscalYearRange.value).join(',') : undefined),
}));
const overviewParams = computed(() => ({ ...params.value, fiscal_year_id: activeFiscalYear.value?.id }));
const report = useMonthlyKpi(params);
const overview = useOverview(overviewParams);
const { data: contracts } = useContracts();
const loading = computed(() => report.isPending.value || report.isPlaceholderData.value || overview.isPending.value || overview.isPlaceholderData.value);
const failed = computed(() => report.isError.value || overview.isError.value);
const ready = computed(() => !loading.value && !failed.value);
// Never display placeholder data beneath a newly selected reporting period.
const rows = computed(() => loading.value || report.isError.value ? [] : (report.data.value || []).filter(row => !params.value.month || params.value.month.split(',').includes(row.month)));
const totals = computed(() => reportTotals(rows.value));
const months = computed(() => groupReport(rows.value, 'month'));
const departments = computed(() => groupReport(rows.value, 'department'));
const contractGroups = computed(() => groupReport(rows.value, 'contract'));
const fleet = computed(() => overview.data.value?.totals || {});
const coverage = computed(() => overview.data.value?.coverage || {});
const comparison = computed(() => overview.data.value?.comparison || {});
const change = computed(() => totals.value.unpriced ? null : comparison.value.cost_change_percent);
const previousLabel = computed(() => {
  const list = comparison.value.previous_months || [];
  return list.length ? t('เทียบกับ {0}', [list.length === 1 ? formatMonth(list[0]) : `${formatMonth(list[0])} – ${formatMonth(list.at(-1))}`]) : t('ยังไม่มีข้อมูลช่วงเปรียบเทียบ');
});
const contractLabel = computed(() => filter.value.contract_id ? (contracts.value || []).find(row => String(row.id) === String(filter.value.contract_id))?.contract_no || filter.value.contract_id : t('ทุกสัญญา'));
const period = computed(() => {
  const list = (params.value.month || '').split(',').filter(Boolean);
  const labels = list.length === 12 ? t('ทั้งปีงบ') : list.map(month => formatMonth(month)).join(', ');
  return `${t('ปีงบ')} ${yearLabel(activeFiscalYear.value?.year)} · ${labels} · ${contractLabel.value}`;
});
const money = value => value == null ? '—' : formatBahtValue(value);
const costTitle = computed(() => totals.value.unpriced ? t('ค่าใช้จ่ายที่ยืนยันแล้ว') : t('ค่าใช้จ่ายสุทธิ'));
const peak = computed(() => [...months.value].filter(row => row.cost !== null).sort((a, b) => b.cost - a.cost)[0]);
const topDepartment = computed(() => departments.value[0]);
const topShare = computed(() => percentOf(topDepartment.value?.cost, totals.value.cost));
const groupLabel = row => row.label || t('ไม่ระบุ');
const monthLabel = row => `${formatMonth(row.key)}${row.unpriced ? ` · ${t('รอราคา {0}', [formatCount(row.unpriced)])}` : ''}`;
const monthlySeries = computed(() => [{ key: metric.value, label: metric.value === 'cost' ? costTitle.value : t('จำนวนหน้าสุทธิ'), data: months.value.map(row => metric.value === 'cost' ? row.cost : row.pages), slot: 1 }]);
const coverageLabel = computed(() => coverage.value.verifiable === false ? t('รอยืนยันข้อมูล') : `${formatCount(coverage.value.annual_complete_months)} / ${formatCount(coverage.value.total_months)}`);

/**
 * งานที่ต้องลงมือทำ — วางไว้เหนือตัวเลขทั้งหมด
 *
 * คนเปิดแดชบอร์ดมาถามว่า "วันนี้ต้องทำอะไร" ก่อนถามว่า "ตัวเลขเป็นเท่าไหร่" เสมอ
 * และตัวเลขบนหน้านี้จะเชื่อได้ก็ต่อเมื่องานค้างเหล่านี้ถูกเคลียร์แล้ว (เครื่องที่
 * ยังไม่ตรวจยืนยันทำให้ความครบถ้วนสรุปไม่ได้ สัญญาที่ยังไม่ยืนยันทำให้ยอดเงินไม่ครบ)
 * การวางตัวเลขไว้ก่อนจึงเป็นการนำเสนอข้อสรุปก่อนบอกว่ามันยังไม่สมบูรณ์
 */
const attention = computed(() => overview.data.value?.attention ?? []);
function onFilter(next) { filter.value = { ...next }; }
watch(params, () => { detailOpen.value = false; exportError.value = ''; });
function openDetails(dimension = 'department', item = null) {
  if (!ready.value) return;
  detailScope.value = item ? { dimension, key: item.key, label: dimension === 'month' ? formatMonth(item.key) : groupLabel(item) } : null;
  detailGroup.value = item ? (dimension === 'device' ? 'month' : 'device') : dimension;
  detailOpen.value = true;
}
function selectMonth({ index }) { if (months.value[index]) openDetails('month', months.value[index]); }
function reload() { report.refetch(); overview.refetch(); }
async function exportCard() {
  if (!ready.value || !rows.value.length) return;
  exportBusy.value = true;
  exportError.value = '';
  // Capture one consistent report before awaiting fonts or image encoding.
  const style = getComputedStyle(root.value);
  const color = name => style.getPropertyValue(name).trim();
  const spec = {
    title: t('ภาพรวมการพิมพ์'), context: period.value,
    metrics: [{ label: costTitle.value, value: money(totals.value.cost), unit: t('บาท') }, { label: t('จำนวนหน้าสุทธิ'), value: formatCount(totals.value.pages), unit: t('หน้า') }, { label: t('เครื่องที่มีข้อมูล'), value: formatCount(totals.value.devices), unit: t('เครื่อง') }],
    chartTitle: totals.value.unpriced ? t('ค่าใช้จ่ายที่ยืนยันแล้วรายเดือน') : t('ค่าใช้จ่ายสุทธิรายเดือน'),
    bars: months.value.map(row => ({ label: monthLabel(row), value: row.cost, displayValue: money(row.cost) })),
    footnote: `${t('ข้อมูลเฉพาะเดือนที่บันทึกแล้ว')} · ${t('ยังยืนยันราคาไม่ได้ {0} รายการ', [formatCount(totals.value.unpriced)])} · ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date())} (Asia/Bangkok)`,
    filename: 'executive-print-summary',
    colors: { surface: color('--surface'), ink: color('--ink'), hero: color('--surface'), onHero: color('--ink'), accent: color('--brand') },
  };
  try { await exportSummaryCard(spec); }
  catch (error) { exportError.value = errorMessage(error, t('ส่งออกไม่สำเร็จ')); }
  finally { exportBusy.value = false; }
}
</script>

<template>
  <div ref="root">
    <UiPageHeader :title="t('ภาพรวมการพิมพ์')">
      <template #actions>
        <UiButton variant="secondary" :disabled="!ready || !rows.length" :loading="exportBusy" @click="exportCard">
          <template #icon><FileImage :size="16" /></template>{{ t('ส่งออกการ์ด') }}
        </UiButton>
        <UiButton variant="secondary" :disabled="!ready || !rows.length" @click="openDetails()">
          <template #icon><ArrowDownToLine :size="16" /></template>{{ t('รายละเอียด / Excel') }}
        </UiButton>
      </template>
    </UiPageHeader>

    <!-- แถวตัวกรอง: ทุกชิ้นนั่งบนเส้นฐานเดียวกัน (items-end) รวมข้อความบอกเดือน
         ล่าสุดและปุ่มโหลดใหม่ ซึ่งเดิมลอยอยู่คนละระดับกับช่องกรอง -->
    <div class="flex flex-wrap items-end gap-x-3 gap-y-2 mb-4" data-print="hide">
      <DashboardFilter bare @filter="onFilter" />
      <p class="text-xs text-ink-mute ml-auto pb-2">{{ months.length ? t('ข้อมูลล่าสุด {0}', [formatMonth(months.at(-1).key)]) : '' }}</p>
      <UiButton variant="ghost" icon-only :label="t('โหลดข้อมูลใหม่')" :loading="report.isFetching.value || overview.isFetching.value" @click="reload"><RefreshCw :size="16" /></UiButton>
    </div>

    <UiAlert v-if="failed" tone="danger" class="mb-4">
      {{ errorMessage(report.error.value || overview.error.value, t('โหลดภาพรวมไม่สำเร็จ')) }}
      <template #actions><UiButton variant="secondary" @click="reload">{{ t('ลองใหม่') }}</UiButton></template>
    </UiAlert>
    <UiAlert v-if="exportError" tone="danger" class="mb-4">{{ exportError }}</UiAlert>

    <!-- งานที่ต้องลงมือทำมาก่อนตัวเลขเสมอ — ดูเหตุผลที่ตัวแปร attention ด้านบน -->
    <AttentionPanel v-if="!failed" :items="attention" :loading="loading" class="mb-4" />

    <section class="card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line-soft mb-4" :aria-label="t('สรุปตัวเลขสำคัญ')" :aria-busy="loading">
      <button class="text-left min-w-0 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ring rounded-l-lg" :disabled="!ready || !rows.length" :aria-label="t('ดูที่มาของค่าใช้จ่าย')" @click="openDetails()">
        <UiStat plain :label="costTitle" :value="failed ? '—' : money(totals.cost)" :unit="t('บาท')" :loading="loading" :delta="ready ? change ?? null : null" delta-inverse
          :hint="totals.unpriced ? t('ยังยืนยันราคาไม่ได้ {0} รายการ', [formatCount(totals.unpriced)]) : previousLabel">
          <template #icon><ArrowUpRight :size="16" class="text-brand-ink" /></template>
        </UiStat>
      </button>
      <button class="text-left min-w-0 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ring" :disabled="!ready || !rows.length" :aria-label="t('วิเคราะห์รายเครื่อง')" @click="openDetails('device')">
        <UiStat plain tone="ink" :label="t('จำนวนหน้าสุทธิ')" :value="ready ? formatCount(totals.pages) : '—'" :unit="t('หน้า')" :hint="t('หน้า · หลังหัก 2%')" :loading="loading">
          <template #icon><ArrowUpRight :size="16" class="text-brand-ink" /></template>
        </UiStat>
      </button>
      <UiStat plain tone="ink" :label="t('เครื่องพิมพ์ทั้งหมด')" :value="ready ? formatCount(fleet.total_devices) : '—'" :unit="t('เครื่อง')" :loading="loading"
        :hint="`${t('ใช้งานอยู่ {0} เครื่อง', [ready ? formatCount(fleet.active_devices) : '—'])} · ${t('เดือนที่บันทึกครบ')} ${ready ? coverageLabel : '—'}`" />
    </section>

    <UiCard class="mb-4" :title="metric === 'cost' ? (totals.unpriced ? t('ค่าใช้จ่ายที่ยืนยันแล้วรายเดือน') : t('ค่าใช้จ่ายสุทธิรายเดือน')) : t('ยอดพิมพ์รายเดือน')" :description="period">
      <template #actions>
        <UiSegmented v-model="metric" :options="[{ value: 'cost', label: t('ค่าใช้จ่าย') }, { value: 'pages', label: t('ยอดพิมพ์') }]" :label="t('ข้อมูลที่แสดงในกราฟ')" size="sm" />
      </template>
      <div>
        <UiSkeleton v-if="loading" height="17rem" />
        <UiEmpty v-else-if="!months.length" :title="failed ? t('โหลดข้อมูลไม่สำเร็จ') : t('ยังไม่มียอดพิมพ์ในช่วงที่เลือก')" compact />
        <UiChart v-else :kind="metric === 'cost' ? 'bar' : 'line'" :labels="months.map(monthLabel)" :series="monthlySeries" height="17rem"
          :format-value="metric === 'cost' ? formatBahtValue : formatCount" :format-axis="formatCompact" :unit="metric === 'cost' ? t('บาท') : t('หน้า')" :category-label="t('เดือน')" selectable @select="selectMonth" />
      </div>
      <p v-if="totals.unpriced" class="mt-3 text-sm text-ink-soft">{{ t('ยังยืนยันราคาไม่ได้ {0} รายการ · ยอดเงินยังไม่ครบ', [formatCount(totals.unpriced)]) }}</p>
      <template #footer>
        <div class="flex flex-wrap justify-between gap-2 text-xs text-ink-mute">
          <span>{{ t('กดแท่งกราฟหรือชื่อเดือนในตารางเพื่อเจาะรายละเอียด') }}</span>
          <span>{{ t('แสดง {0} เดือนที่มีข้อมูล', [formatCount(months.length)]) }}</span>
        </div>
      </template>
    </UiCard>

    <div v-if="ready && months.length && !totals.unpriced" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      <UiButton v-if="peak" variant="secondary" class="justify-between" @click="openDetails('month', peak)">
        {{ t('เดือนที่ใช้จ่ายสูงสุด') }} · {{ formatMonth(peak.key) }} · {{ money(peak.cost) }} {{ t('บาท') }}
        <template #trailing><ArrowUpRight :size="15" /></template>
      </UiButton>
      <UiButton v-if="topDepartment && totals.cost > 0" variant="secondary" class="justify-between" @click="openDetails('department', topDepartment)">
        {{ t('สัดส่วนแผนกอันดับหนึ่ง') }} · {{ groupLabel(topDepartment) }} · {{ topShare.toFixed(1) }}%
        <template #trailing><ArrowUpRight :size="15" /></template>
      </UiButton>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 items-start gap-4 mb-4">
      <UiCard flush :title="t('ค่าใช้จ่ายตามแผนก')">
        <template #actions><UiButton size="sm" variant="ghost" :disabled="!ready || !rows.length" @click="openDetails('department')">{{ t('ดูทุกแผนก') }}<template #trailing><ArrowUpRight :size="15" /></template></UiButton></template>
        <UiSkeleton v-if="loading" height="14rem" />
        <UiEmpty v-else-if="!departments.length" :title="t('ไม่มีข้อมูลในช่วงที่เลือก')" compact />
        <ul v-else class="list-none divide-y divide-line-soft">
          <li v-for="(row, index) in departments.slice(0, 5)" :key="row.key">
            <button class="w-full flex items-center gap-3 text-left px-4 py-3 sm:px-5 hover:bg-brand-soft" @click="openDetails('department', row)">
              <span v-if="!totals.unpriced" class="text-xs text-ink-mute">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm text-ink"><strong class="font-medium">{{ groupLabel(row) }}</strong><span class="numeral">{{ money(row.cost) }} <small class="text-xs text-ink-mute">{{ t('บาท') }}</small></span></span>
                <span class="block h-1 rounded-full bg-surface-3 my-2 overflow-hidden"><span class="block h-full rounded-full bg-brand" :style="{ width: `${percentOf(row.cost, Math.max(1, ...departments.map(item => item.cost || 0)))}%` }"></span></span>
                <span class="text-xs text-ink-mute">{{ row.cost === null ? t('ยังยืนยันราคาไม่ได้') : totals.cost ? t('{0}% ของยอดที่ยืนยันแล้ว', [percentOf(row.cost, totals.cost).toFixed(1)]) : t('ไม่มีค่าใช้จ่าย') }}<span v-if="row.unpriced"> · {{ t('รอราคา {0}', [formatCount(row.unpriced)]) }}</span></span>
              </span>
              <ChevronRight :size="15" class="text-ink-mute shrink-0" />
            </button>
          </li>
        </ul>
      </UiCard>
      <UiCard flush :title="t('ค่าใช้จ่ายตามสัญญา')">
        <template #actions><UiButton size="sm" variant="ghost" :disabled="!ready || !rows.length" @click="openDetails('contract')">{{ t('ดูทุกสัญญา') }}<template #trailing><ArrowUpRight :size="15" /></template></UiButton></template>
        <UiSkeleton v-if="loading" height="14rem" />
        <UiEmpty v-else-if="!contractGroups.length" :title="t('ไม่มีข้อมูลสัญญาในช่วงที่เลือก')" compact />
        <ul v-else class="list-none divide-y divide-line-soft">
          <li v-for="row in contractGroups.slice(0, 4)" :key="row.key">
            <button class="w-full flex flex-wrap items-center gap-3 text-left px-4 py-3 sm:px-5 hover:bg-brand-soft" @click="openDetails('contract', row)">
              <span class="min-w-0 flex-1"><strong class="text-sm text-ink font-medium break-words">{{ groupLabel(row) }}</strong><span class="block text-xs text-ink-mute mt-1">{{ t('{0} เครื่องที่มีข้อมูล', [formatCount(row.devices)]) }}<template v-if="row.unpriced"> · {{ t('รอราคา {0}', [formatCount(row.unpriced)]) }}</template></span></span>
              <span class="text-sm font-semibold text-brand-ink numeral">{{ money(row.cost) }} <small class="text-xs text-ink-mute font-normal">{{ t('บาท') }}</small></span>
              <ChevronRight :size="15" class="text-ink-mute shrink-0" />
            </button>
          </li>
        </ul>
        <template #footer><p class="text-xs text-ink-mute">{{ t('เลือกแผนกหรือสัญญาเพื่อดูรายการรายเครื่อง ค้นหา และส่งออก Excel ตามขอบเขตที่เลือก') }}</p></template>
      </UiCard>
    </div>
    <!-- หมายเหตุขอบเขตของตัวเลขบนหน้านี้
         งานค้างไม่อยู่ตรงนี้แล้ว — ย้ายขึ้นไปเป็นรายการแรกของหน้า (AttentionPanel)
         การบอกว่า "ยืนยันไม่ได้" ไว้ใต้สุดหลังตัวเลขทั้งหมด คือการให้คนอ่านข้อสรุป
         จนจบก่อนแล้วค่อยบอกว่ามันยังไม่สมบูรณ์ -->
    <footer class="text-xs text-ink-mute leading-relaxed">
      <p>{{ t('ข้อมูลเฉพาะเดือนที่บันทึกแล้ว') }} · {{ t('เดือนที่บันทึกเป็นศูนย์ยังแสดงในรายงาน') }}</p>
    </footer>
    <ExecutiveDetails v-model:open="detailOpen" :rows="rows" :scope="detailScope" :context="period" :initial-group="detailGroup" />
  </div>
</template>
