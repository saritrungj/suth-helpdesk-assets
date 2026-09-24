<script setup>
import { reportContext } from "../components/report-context";
import { usePageState } from "../composables/use-page-state";
import { deviceLocationLabel } from "../lib/device-location";
import { formatDate, formatMonth } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * Expense — ค่าใช้จ่ายแยกตามสัญญา (แท็บหนึ่งของหน้ารายงานค่าใช้จ่าย)
 *
 * ใช้ตอนตรวจใบแจ้งหนี้จากผู้ให้เช่า: กางจากสัญญา -> เครื่องในสัญญา -> ยอดรายเดือน
 * ของเครื่องนั้น จนถึงตัวเลขที่เอาไปเทียบกับเอกสารได้ตรงบรรทัด
 *
 * ทุกยอดในหน้านี้เป็น "ยอดสุทธิหลังหัก 2%" ตามกฎธุรกิจที่ยืนยันแล้ว และเขียนกำกับไว้
 * ทุกที่ที่แสดง เพราะเป็นตัวเลขที่ถูกส่งต่อไปยังงานการเงิน การไม่บอกว่าหักแล้ว
 * ทำให้มีโอกาสถูกหักซ้ำอีกรอบ
 *
 * ยอดของแต่ละเดือนอยู่ใต้สัญญาที่คิดเงินเดือนนั้นจริง (ADR-0023) ยอดรวมของหน้าจึงเท่า
 * ค่าใช้จ่ายบนแดชบอร์ดเสมอ และแต่ละสัญญามียอดตามใบแจ้งหนี้รวมค่าเช่าคงที่และ VAT
 *
 * การรวมเงินทุกจุดบวกในหน่วยสตางค์ที่เป็นจำนวนเต็ม ไม่บวกทศนิยมของบาท —
 * ยอดรวมของสองร้อยเครื่องที่บวกด้วย float จะคลาดจากการคำนวณมือ (ดู ADR และ
 * packages/domain/money.cjs)
 */
import { computed, onActivated, onMounted, ref, watch } from "vue";
import { exportSheet } from "../lib/export-xlsx";
import { useExportTask } from "../composables/useExportTask";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Download, Printer, ReceiptText, Search, TriangleAlert } from "lucide-vue-next";
import api from "../services/api";
import { authState } from "../store/auth";
import { fiscalYearState } from "../store/fiscalYear";
import { formatBahtValue, formatCount, formatUnitPrice } from "../lib/format";
import PeriodPicker from "../components/PeriodPicker.vue";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiEmpty,
  UiField,
  UiInput,
  UiSkeleton,
  UiStat,
  UiTooltip,
} from "../ui";

const loading = ref(false);
const isAdmin = computed(() => authState.user?.role === "admin");
const loadError = ref("");
let loaded = false;
let requestId = 0;
let loadedContext = "";

const contracts = ref([]);
const unassignedDevices = ref([]);
const showUnassigned = ref(false);

/*
 * ยอดในปีงบนี้ที่ไม่มีสัญญาคิดเงิน — นับรวมในยอดรวมด้านบนแล้ว แต่แยกให้เห็นว่ามาจาก
 * เครื่องไหน ทางเขียนทุกทางปฏิเสธยอดแบบนี้แล้ว (ADR-0021) จึงเหลือเฉพาะข้อมูลเก่า
 */
const noContractDevices = ref([]);
const showNoContract = ref(false);

/** ยอดรวมจาก API ในหน่วยบาท — ค่าพิมพ์ทุกสัญญา และยอดตามใบแจ้งหนี้รวมค่าเช่า/VAT */
const printTotal = ref(0);
const invoiceTotal = ref(0);

const monthsWithData = ref([]);
const monthSelection = ref([]);
const search = ref("");

const openContracts = ref(new Set());
const openDevices = ref(new Set());

const month = computed(() =>
  monthSelection.value.length ? [...monthSelection.value].sort().join(",") : ""
);

/**
 * ค้นหาข้ามสองระดับ: ถ้าคำค้นตรงกับเลขที่สัญญา แสดงเครื่องทั้งหมดในสัญญานั้น
 * ถ้าตรงกับเครื่อง แสดงเฉพาะเครื่องที่ตรง — เพื่อให้พิมพ์เลข Serial แล้วเจอว่า
 * เครื่องนั้นอยู่ในสัญญาไหนได้ทันทีโดยไม่ต้องกางทีละสัญญา
 */
const filteredContracts = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return contracts.value;

  return contracts.value
    .map((contract) => {
      const contractMatches = contract.contract_no?.toLowerCase().includes(keyword);

      const devices = (contract.devices ?? []).filter(
        (d) =>
          d.serial_number?.toLowerCase().includes(keyword) ||
          d.model?.toLowerCase().includes(keyword) ||
          d.brand_name?.toLowerCase().includes(keyword)
      );

      if (contractMatches) return contract;
      if (devices.length) return { ...contract, devices };
      return null;
    })
    .filter(Boolean);
});

/** สัญญาที่ใบแจ้งหนี้มีค่าเช่าหรือ VAT — ยอดตามใบแจ้งหนี้จึงต่างจากค่าพิมพ์ */
const hasInvoiceExtras = (contract) => contract.monthly_rental != null || contract.vat_rate != null;
const anyInvoiceExtras = computed(() => contracts.value.some(hasInvoiceExtras));

const grandTotalPages = computed(() =>
  contracts.value.reduce(
    (sum, contract) =>
      sum +
      (contract.devices ?? []).reduce(
        (deviceSum, device) =>
          deviceSum + (device.monthly ?? []).reduce((s, m) => s + Number(m.pages || 0), 0),
        0
      ),
    0
  )
);

const totalDevices = computed(() =>
  contracts.value.reduce((sum, contract) => sum + (contract.devices ?? []).length, 0)
);

/*
 * ขอบเขตของผลค้นหา (#208) — ค้นเจอหนึ่งเครื่อง แต่ยอดเงินด้านบนและยอดของแต่ละสัญญายังเป็นยอดทั้งสัญญา
 * ต้องบอกให้ชัด ไม่งั้นคนอ่านยอดของสัญญาแล้วคิดว่าเป็นยอดของเครื่องที่ค้นเจอ ส่วน Excel ส่งออกเฉพาะเครื่องที่ค้นเจอ
 */
const searching = computed(() => search.value.trim().length > 0);
const foundDevices = computed(() =>
  filteredContracts.value.reduce((sum, contract) => sum + (contract.devices ?? []).length, 0)
);

/** ส่วนประกอบของยอดตามใบแจ้งหนี้ — ค่าพิมพ์ + ค่าเช่าคงที่ + VAT (#208) */
const invoiceParts = computed(() => ({
  rental: contracts.value.reduce((sum, c) => sum + Math.round(Number(c.rental || 0) * 100), 0) / 100,
  vat: contracts.value.reduce((sum, c) => sum + Math.round(Number(c.vat || 0) * 100), 0) / 100,
}));

function devicePages(device) {
  return (device.monthly ?? []).reduce((sum, m) => sum + Number(m.pages || 0), 0);
}

/** ราคาที่ใช้จริงของเครื่อง — เครื่องที่มีมิเตอร์สีมีสองราคา */
const devicePrices = (device) =>
  (device.effective_prices ?? []).map((price) => formatUnitPrice(price)).join(" / ") || "—";

function toggleContract(id) {
  const next = new Set(openContracts.value);
  next.has(id) ? next.delete(id) : next.add(id);
  openContracts.value = next;
}

function toggleDevice(id) {
  const next = new Set(openDevices.value);
  next.has(id) ? next.delete(id) : next.add(id);
  openDevices.value = next;
}

function expandAll() {
  openContracts.value = new Set(filteredContracts.value.map((c) => c.id));
}

function collapseAll() {
  openContracts.value = new Set();
  openDevices.value = new Set();
}

/*
 * ข้อมูลรองสองชุดนี้ล้มแล้วต้องบอก ไม่ใช่เงียบ (#50) — รายการเดือนที่ว่างทำให้ตัวเลือก
 * ช่วงเวลาดูเหมือน "ยังไม่มีข้อมูล" และแถบเครื่องที่ยังไม่ผูกสัญญาที่หายไปทำให้ดูเหมือน
 * ทุกเครื่องถูกนับในยอดแล้ว ทั้งที่แค่โหลดไม่สำเร็จ
 */
const monthsError = ref(false);
const unassignedError = ref(false);

async function loadMonths() {
  try {
    // รายการเดือนล้วน ไม่ใช่ยอดรายมิเตอร์ทุกเดือนทุกปี (#149)
    const res = await api.get("/print-transactions/months");
    monthsWithData.value = [...(res.data ?? [])].sort();
    monthsError.value = false;
  } catch (err) {
    console.error("Load months error:", err);
    monthsError.value = true;
  }
}

/** เครื่องที่ยังไม่ผูกสัญญา — ไม่ขึ้นกับปีงบ เพราะไม่มีสัญญาที่จะบอกปีงบได้ */
async function loadUnassignedDevices() {
  try {
    const res = await api.get("/expense/unassigned-devices");
    unassignedDevices.value = res.data.devices ?? res.data ?? [];
    unassignedError.value = false;
  } catch (err) {
    console.error("Load unassigned devices error:", err);
    unassignedDevices.value = [];
    unassignedError.value = true;
  }
}

async function loadExpense() {
  const request = ++requestId;
  const context = `${fiscalYearState.activeId}|${month.value}`;
  if (context !== loadedContext) contracts.value = [];
  if (!fiscalYearState.activeId) {
    contracts.value = [];
    return;
  }

  loading.value = true;
  loadError.value = "";

  try {
    const res = await api.get(`/expense/${fiscalYearState.activeId}`, {
      params: month.value ? { month: month.value } : {},
    });

    if (request !== requestId) return;
    contracts.value = res.data.contracts ?? [];
    noContractDevices.value = res.data.no_contract_devices ?? [];
    printTotal.value = Number(res.data.total_cost ?? 0);
    invoiceTotal.value = Number(res.data.invoice_total ?? 0);
    loadedContext = context;
  } catch (err) {
    if (request !== requestId) return;
    console.error("Load expense error:", err);
    loadError.value = t("โหลดข้อมูลค่าใช้จ่ายไม่สำเร็จ");
    contracts.value = [];
    noContractDevices.value = [];
    printTotal.value = 0;
    invoiceTotal.value = 0;
  } finally {
    if (request === requestId) { loading.value = false; loaded = true; }
  }
}

/**
 * ส่งออก Excel — หนึ่งแถวต่อหนึ่งเครื่อง ตามเดือนและคำค้นที่แสดงอยู่บนจอ
 * คำค้นถูกบันทึกไว้ในแผ่น "บริบทรายงาน" ด้วย คนที่เปิดไฟล์ทีหลังจึงรู้ว่าไม่ใช่ชุดเต็ม
 */
const { busy: exporting, error: exportError, run: runExport } = useExportTask();

async function exportExcel() {
  const header = [
    t("เลขที่สัญญา"),
    t("ราคาที่ใช้จริง (บาท/หน้า)"),
    t("แหล่งราคา"),
    "Serial",
    t("ยี่ห้อ"),
    t("รุ่น"),
    t("ยอดพิมพ์"),
    t("ค่าใช้จ่าย (หัก 2%)"),
  ];

  const rows = filteredContracts.value.flatMap((contract) =>
    (contract.devices ?? []).map((device) => [
      contract.contract_no,
      // เครื่องที่มีมิเตอร์สีมีสองราคา จึงเขียนเป็นข้อความทั้งชุด ไม่เลือกราคาหนึ่งแทน
      (device.effective_prices ?? []).map(Number).join(" / "),
      device.price_override != null ? t("ราคาพิเศษเฉพาะเครื่อง") : t("ราคาตามสัญญา"),
      device.serial_number || "",
      device.brand_name || "",
      device.model || "",
      devicePages(device),
      Number(device.total_cost || 0),
    ])
  );

  const suffix = month.value ? `-${month.value.replace(/,/g, "_")}` : "";

  await runExport(() => exportSheet({
    header,
    rows,
    sheetName: t("ค่าใช้จ่ายตามสัญญา"),
    filename: `expense-by-contract${suffix}`,
    columnWidths: [22, 20, 22, 16, 14, 20, 16, 20],
    context: reportContext({
      months: monthSelection.value,
      filters: { search: search.value },
      labels: { search: t("ค้นหา") },
    }),
  }));
}

// ปีงบเป็น state กลางที่แถบบนเป็นคนตั้ง หน้านี้แค่ตามไปโหลดใหม่เมื่อค่าเปลี่ยน
watch(() => fiscalYearState.activeId, (id) => id && loadExpense(), { immediate: true });
watch(monthSelection, loadExpense);
onActivated(() => {
  if (loaded) {
    loadExpense();
    loadMonths();
    loadUnassignedDevices();
  }
});

// คำค้น ช่วงเดือน สัญญาที่กางไว้ และส่วนที่เปิดดูไว้ ยังอยู่เมื่อกลับมาหน้านี้ (#115)
usePageState({ search, monthSelection, openContracts, showUnassigned, showNoContract }, { key: "contract" });

onMounted(() => {
  loadMonths();
  loadUnassignedDevices();
});
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end gap-2 mb-3" data-print="hide">
      <UiField :label="t(&quot;เดือน&quot;)" class="w-80">
        <PeriodPicker v-model="monthSelection" :options="monthsWithData" allow-empty inline />
      </UiField>

      <UiField :label="t(&quot;ค้นหาสัญญาหรือเครื่อง&quot;)" class="flex-1 min-w-[14rem] max-w-sm">
        <UiInput v-model="search" clearable :placeholder="t(&quot;เลขที่สัญญา, Serial, รุ่น…&quot;)">
          <template #icon><Search :size="15" /></template>
        </UiInput>
      </UiField>

      <div class="flex items-center gap-2 ml-auto">
        <UiTooltip :content="t(&quot;กางทั้งหมด&quot;)">
          <UiButton size="sm" variant="ghost" icon-only :label="t(&quot;กางทั้งหมด&quot;)" @click="expandAll"><ChevronsUpDown :size="15" /></UiButton>
        </UiTooltip>
        <UiTooltip :content="t(&quot;พับทั้งหมด&quot;)">
          <UiButton size="sm" variant="ghost" icon-only :label="t(&quot;พับทั้งหมด&quot;)" @click="collapseAll"><ChevronsDownUp :size="15" /></UiButton>
        </UiTooltip>
        <UiButton size="sm" variant="secondary" :disabled="!contracts.length || loading || !!loadError || (searching && !foundDevices)" :loading="exporting" data-testid="expense-export" @click="exportExcel">
          <template #icon><Download :size="15" /></template>
          {{ searching ? t("Excel เฉพาะผลค้นหา ({0} เครื่อง)", [formatCount(foundDevices)]) : "Excel" }}
        </UiButton>
      </div>
    </div>

    <!-- ยอดรวม — แถบเดียวแบ่งสามช่อง ไม่ใช่การ์ดสามใบ (รอบที่ 3 ของ #51) -->
    <div
      v-if="!loadError"
      class="card grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-line-soft mb-4"
      :class="anyInvoiceExtras ? 'sm:grid-cols-4' : 'sm:grid-cols-3'"
    >
      <UiStat plain :label="t('ค่าพิมพ์')" :unit="t(&quot;บาท&quot;)" :hint="t('หัก 2% แล้ว')" :loading="loading">
        {{ formatBahtValue(printTotal) }}
      </UiStat>

      <UiStat
        v-if="anyInvoiceExtras"
        plain
        :label="t('เงินตามใบแจ้งหนี้รวม VAT')"
        :unit="t(&quot;บาท&quot;)"
        :hint="t('รวมค่าเช่าคงที่และ VAT')"
        tone="ink"
        :loading="loading"
      >
        {{ formatBahtValue(invoiceTotal) }}
      </UiStat>

      <UiStat plain :label="t(&quot;ยอดพิมพ์&quot;)" :unit="t(&quot;หน้า&quot;)" :hint="t(&quot;ตามที่กรอก ยังไม่หัก 2%&quot;)" tone="ink" :loading="loading">
        {{ formatCount(grandTotalPages) }}
      </UiStat>

      <UiStat plain
        :label="t(&quot;เครื่องที่มีการพิมพ์&quot;)"
        :unit="t(&quot;เครื่อง&quot;)"
        :hint="t(&quot;{0} สัญญา&quot;, [formatCount(contracts.length)])"
        tone="ink"
        :loading="loading"
      >
        {{ formatCount(totalDevices) }}
      </UiStat>
    </div>

    <p v-if="!loadError && anyInvoiceExtras && !loading" class="text-xs text-ink-mute -mt-2 mb-4 numeral" data-testid="invoice-parts">
      {{ t("ตามใบแจ้งหนี้ = ค่าพิมพ์ {0} + ค่าเช่าคงที่ {1} + VAT {2} = {3} บาท", [formatBahtValue(printTotal), formatBahtValue(invoiceParts.rental), formatBahtValue(invoiceParts.vat), formatBahtValue(invoiceTotal)]) }}
    </p>

    <UiAlert v-if="searching && contracts.length && !loadError" tone="info" class="mb-4" data-testid="expense-search-scope">
      <strong class="block">{{ t("พบ {0} จาก {1} เครื่อง", [formatCount(foundDevices), formatCount(totalDevices)]) }}</strong>
      {{ t("ยอดเงินและยอดพิมพ์ด้านบน รวมทั้งยอดของแต่ละสัญญา เป็นยอดทั้งสัญญา ไม่ใช่เฉพาะเครื่องที่ค้นเจอ — Excel ส่งออกเฉพาะเครื่องที่ค้นเจอ") }}
    </UiAlert>

    <UiAlert v-if="exportError" tone="danger" class="mb-4">
      {{ exportError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" :loading="exporting" @click="exportExcel"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadExpense"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <UiAlert v-if="unassignedError" tone="warn" class="mb-4">
      {{ t("โหลดรายการเครื่องที่ยังไม่ผูกสัญญาไม่สำเร็จ ยังบอกไม่ได้ว่ามีเครื่องที่ไม่ถูกนับหรือไม่") }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadUnassignedDevices"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <UiAlert v-if="monthsError" tone="warn" class="mb-4">
      {{ t("โหลดรายการเดือนที่มีข้อมูลไม่สำเร็จ ตัวเลือกช่วงเวลาอาจแสดงว่ายังไม่มีข้อมูลทั้งที่มี") }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadMonths"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <div v-if="loading && !contracts.length" class="flex flex-col gap-2">
      <UiSkeleton v-for="n in 4" :key="n" height="3.5rem" />
    </div>

    <UiCard v-else-if="!loadError && !contracts.length">
      <UiEmpty
        :title="t(&quot;ยังไม่มีสัญญาในปีงบนี้&quot;)"
        :description="t(&quot;เพิ่มสัญญาและผูกเครื่องเข้ากับสัญญา ระบบจึงจะคิดค่าใช้จ่ายให้ได้&quot;)"
      >
        <template v-if="isAdmin" #actions>
          <UiButton to="/admin/contracts" variant="primary" size="sm"> {{ t("ไปหน้าจัดการสัญญา") }} </UiButton>
        </template>
      </UiEmpty>
    </UiCard>

    <UiCard v-else-if="!loadError && !filteredContracts.length">
      <UiEmpty
        variant="search"
        :title="t(&quot;ไม่พบรายการที่ตรงกับ “{0}”&quot;, [search])"
        :description="t(&quot;ลองใช้คำที่สั้นลง หรือค้นด้วยเลข Serial เพียงบางส่วน&quot;)"
      >
        <template #actions>
          <UiButton size="sm" variant="secondary" @click="search = ''"> {{ t("ล้างคำค้นหา") }} </UiButton>
        </template>
      </UiEmpty>
    </UiCard>

    <!-- โครงสร้างสามชั้น: สัญญา -> เครื่อง -> ยอดรายเดือน -->
    <div v-else-if="!loadError" class="flex flex-col gap-2">
      <section
        v-for="contract in filteredContracts"
        :key="contract.id"
        class="card overflow-hidden"
      >
        <h2>
          <button
            type="button"
            class="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2 transition-colors"
            :aria-expanded="openContracts.has(contract.id)"
            :aria-controls="`contract-${contract.id}`"
            @click="toggleContract(contract.id)"
          >
            <ChevronRight
              :size="16"
              class="shrink-0 text-ink-faint transition-transform duration-200"
              :class="openContracts.has(contract.id) && 'rotate-90'"
              aria-hidden="true"
            />

            <span class="grid place-items-center shrink-0 w-8 h-8 rounded-lg bg-surface-3 text-ink-mute" aria-hidden="true">
              <ReceiptText :size="15" />
            </span>

            <span class="min-w-0 flex-1">
              <span class="block font-medium text-ink truncate">{{ contract.contract_no }}</span>
              <span class="block text-xs text-ink-soft numeral">
                {{ formatCount((contract.devices ?? []).length) }} {{ t("เครื่องที่มีการพิมพ์") }}
                <template v-if="contract.effective_from">
                  · {{ formatDate(contract.effective_from) }} – {{ formatDate(contract.effective_to) }}
                </template>
              </span>
              <span v-if="hasInvoiceExtras(contract)" class="block text-xs text-ink-mute numeral">
                {{ t("ค่าเช่า {0} · VAT {1} · ตามใบแจ้งหนี้ {2} บาท", [
                  formatBahtValue(contract.rental),
                  formatBahtValue(contract.vat),
                  formatBahtValue(contract.invoice_total),
                ]) }}
              </span>
            </span>

            <span class="shrink-0 text-right">
              <span class="block font-semibold text-brand-ink numeral">
                {{ formatBahtValue(contract.total_cost) }}
                <span class="text-2xs font-normal text-ink-mute"> {{ t("บาท") }} </span>
              </span>
            </span>
          </button>
        </h2>

        <div
          v-if="openContracts.has(contract.id)"
          :id="`contract-${contract.id}`"
          class="border-t border-line-soft"
        >
          <p v-if="!(contract.devices ?? []).length" class="px-4 py-6 text-sm text-ink-mute text-center"> {{ t("ยังไม่มีเครื่องผูกกับสัญญานี้") }} </p>

          <div
            v-for="device in contract.devices"
            :key="device.id"
            class="border-b border-line-soft last:border-0"
          >
            <button
              type="button"
              class="w-full flex items-center gap-3 pl-10 pr-4 py-2.5 text-left hover:bg-surface-2 transition-colors"
              :aria-expanded="openDevices.has(device.id)"
              :aria-controls="`device-${device.id}`"
              @click="toggleDevice(device.id)"
            >
              <ChevronRight
                :size="14"
                class="shrink-0 text-ink-faint transition-transform duration-200"
                :class="openDevices.has(device.id) && 'rotate-90'"
                aria-hidden="true"
              />

              <Printer :size="14" class="shrink-0 text-ink-faint" aria-hidden="true" />

              <span class="min-w-0 flex-1">
                <span class="block text-sm text-ink-soft truncate">
                  {{ device.brand_name || "—" }} {{ device.model || "" }}
                </span>
                <span class="block text-xs text-ink-soft font-mono truncate">
                  {{ device.serial_number }}
                <span class="block text-xs text-ink-mute font-sans">{{ deviceLocationLabel(device.monthly) }}</span>
                </span>
                <span class="block text-xs text-ink-mute numeral">
                  {{ t("ราคาที่ใช้จริง") }} {{ devicePrices(device) }} {{ t("บาท/หน้า") }} ·
                  {{ device.price_override != null ? t("ราคาพิเศษเฉพาะเครื่อง") : t("ราคาตามสัญญา") }}
                </span>
              </span>

              <span class="shrink-0 text-right">
                <span class="block text-sm font-medium text-ink numeral">
                  {{ formatBahtValue(device.total_cost) }}
                </span>
                <span class="block text-xs text-ink-soft numeral">
                  {{ formatCount(devicePages(device)) }} {{ t("หน้า") }} </span>
              </span>
            </button>

            <div v-if="openDevices.has(device.id)" :id="`device-${device.id}`" class="pl-16 pr-4 pb-3">
              <RouterLink
                :to="`/assets/${device.id}`"
                class="inline-flex min-h-6 items-center text-xs text-brand-ink hover:underline"
              >
                {{ t("เปิดรายละเอียดเครื่อง") }} · {{ device.serial_number }}
              </RouterLink>
              <table v-if="(device.monthly ?? []).length" class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-ink-mute">
                    <th class="text-left font-medium py-1.5"> {{ t("เดือน") }} </th>
                    <th class="text-right font-medium py-1.5"> {{ t("จำนวนหน้า") }} </th>
                    <th class="text-right font-medium py-1.5"> {{ t("ค่าใช้จ่าย") }} </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in device.monthly" :key="row.month" class="border-t border-line-soft">
                    <td class="py-1.5 text-ink-soft">{{ formatMonth(row.month, { long: true }) }}</td>
                    <td class="py-1.5 text-right numeral text-ink-soft">{{ formatCount(row.pages) }}</td>
                    <!-- null = หาราคาไม่ได้ ไม่ใช่ศูนย์บาท — ทางเขียนปฏิเสธยอดแบบนี้แล้ว เหลือเฉพาะข้อมูลเก่า -->
                    <td v-if="row.cost == null" class="py-1.5 text-right text-xs text-warn-ink">{{ t("หาราคาไม่ได้") }}</td>
                    <td v-else class="py-1.5 text-right numeral text-ink">{{ formatBahtValue(row.cost) }}</td>
                  </tr>
                </tbody>
              </table>

              <p v-else class="text-sm text-ink-mute py-2"> {{ t("ยังไม่มีการบันทึกของเครื่องนี้") }} </p>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ยอดในปีงบนี้ที่ไม่มีสัญญาคิดเงิน — รวมในยอดด้านบนแล้ว แยกไว้ให้รู้ว่าต้องไปแก้เครื่องไหน -->
    <section v-if="noContractDevices.length" class="card overflow-hidden mt-4 border-warn-line">
      <h2>
        <button
          type="button"
          class="w-full flex items-center gap-3 px-4 py-3.5 text-left bg-warn-soft hover:brightness-[0.98] transition-all"
          :aria-expanded="showNoContract"
          aria-controls="no-contract-devices"
          @click="showNoContract = !showNoContract"
        >
          <ChevronRight
            :size="16"
            class="shrink-0 text-warn-ink transition-transform duration-200"
            :class="showNoContract && 'rotate-90'"
            aria-hidden="true"
          />
          <TriangleAlert :size="16" class="shrink-0 text-warn-ink" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-warn-ink"> {{ t("การพิมพ์ในปีงบนี้ที่ไม่มีสัญญาคิดเงิน") }} </span>
            <span class="block text-2xs text-warn-ink"> {{ t("ผูกสัญญาให้เครื่องเหล่านี้ จึงจะคิดเงินได้") }} </span>
          </span>
          <UiBadge tone="warn" size="lg">
            {{ formatCount(noContractDevices.length) }} {{ t("เครื่อง") }} </UiBadge>
        </button>
      </h2>

      <ul v-if="showNoContract" id="no-contract-devices" class="list-none border-t border-warn-line">
        <li
          v-for="device in noContractDevices"
          :key="device.id"
          class="flex items-center justify-between gap-3 px-4 py-2.5 pl-10 border-b border-line-soft last:border-0"
        >
          <span class="block font-mono text-sm text-ink">{{ device.serial_number }}</span>
          <span class="shrink-0 text-sm text-ink numeral">{{ formatCount(device.total_pages) }} {{ t("หน้า") }}</span>
        </li>
      </ul>
    </section>

    <!-- เครื่องที่ยังไม่ผูกสัญญา — เดิมมองไม่เห็นจากหน้านี้เลย ทั้งที่เป็นสาเหตุ
         อันดับหนึ่งที่ยอดรวมไม่ตรงกับใบแจ้งหนี้ -->
    <section v-if="unassignedDevices.length" class="card overflow-hidden mt-4 border-warn-line">
      <h2>
        <button
          type="button"
          class="w-full flex items-center gap-3 px-4 py-3.5 text-left bg-warn-soft hover:brightness-[0.98] transition-all"
          :aria-expanded="showUnassigned"
          aria-controls="unassigned-devices"
          @click="showUnassigned = !showUnassigned"
        >
          <ChevronRight
            :size="16"
            class="shrink-0 text-warn-ink transition-transform duration-200"
            :class="showUnassigned && 'rotate-90'"
            aria-hidden="true"
          />

          <TriangleAlert :size="16" class="shrink-0 text-warn-ink" aria-hidden="true" />

          <span class="min-w-0 flex-1">
            <span class="block font-medium text-warn-ink"> {{ t("เครื่องที่ยังไม่ได้ผูกสัญญา") }} </span>
            <span class="block text-2xs text-warn-ink"> {{ t("เครื่องเหล่านี้ไม่ถูกนับในค่าใช้จ่ายตามสัญญาด้านบน") }} </span>
          </span>

          <UiBadge tone="warn" size="lg">
            {{ formatCount(unassignedDevices.length) }} {{ t("เครื่อง") }} </UiBadge>
        </button>
      </h2>

      <ul v-if="showUnassigned" id="unassigned-devices" class="list-none border-t border-warn-line">
        <li
          v-for="device in unassignedDevices"
          :key="device.id"
          class="flex items-center justify-between gap-3 px-4 py-2.5 pl-10 border-b border-line-soft last:border-0"
        >
          <span class="min-w-0">
            <span class="block text-sm text-ink-soft truncate">
              {{ device.brand_name || "—" }} {{ device.model || "" }}
            </span>
            <span class="block text-xs text-ink-soft font-mono">{{ device.serial_number }}
                <span class="block text-xs text-ink-mute font-sans">{{ t("ที่ตั้งปัจจุบัน") + ": " + deviceLocationLabel([device]) }}</span></span>
          </span>

          <span class="shrink-0 text-sm numeral text-ink">
            {{ formatBahtValue(device.total_cost) }} {{ t("บาท") }} </span>
        </li>
      </ul>
    </section>
  </div>
</template>
