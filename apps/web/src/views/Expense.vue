<script setup>
/**
 * Expense — ค่าใช้จ่ายแยกตามสัญญา (แท็บหนึ่งของหน้ารายงานค่าใช้จ่าย)
 *
 * ใช้ตอนตรวจใบแจ้งหนี้จากผู้ให้เช่า: กางจากสัญญา -> เครื่องในสัญญา -> ยอดรายเดือน
 * ของเครื่องนั้น จนถึงตัวเลขที่เอาไปเทียบกับเอกสารได้ตรงบรรทัด
 *
 * ทุกยอดในหน้านี้เป็น "ยอดสุทธิหลังหัก 20%" ตามเงื่อนไขสัญญา และเขียนกำกับไว้
 * ทุกที่ที่แสดง เพราะเป็นตัวเลขที่ถูกส่งต่อไปยังงานการเงิน การไม่บอกว่าหักแล้ว
 * ทำให้มีโอกาสถูกหักซ้ำอีกรอบ
 *
 * การรวมเงินทุกจุดบวกในหน่วยสตางค์ที่เป็นจำนวนเต็ม ไม่บวกทศนิยมของบาท —
 * ยอดรวมของสองร้อยเครื่องที่บวกด้วย float จะคลาดจากการคำนวณมือ (ดู ADR และ
 * packages/domain/money.cjs)
 */
import { computed, onMounted, ref, watch } from "vue";
import * as XLSX from "xlsx";
import { ChevronRight, Download, Printer, ReceiptText, Search, TriangleAlert } from "lucide-vue-next";
import { formatMonthTH, fromSatang, sumSatang, toSatang } from "@suth/domain";
import api from "../services/api";
import { fiscalYearState } from "../store/fiscalYear";
import { formatBahtValue, formatCount } from "../lib/format";
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
} from "../ui";

function sumCost(rows) {
  return fromSatang(sumSatang((rows ?? []).map((r) => r.total_cost_satang ?? toSatang(r.total_cost))));
}

const loading = ref(false);
const loadError = ref("");

const contracts = ref([]);
const unassignedDevices = ref([]);
const showUnassigned = ref(false);

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

const grandTotal = computed(() => sumCost(contracts.value));

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

function devicePages(device) {
  return (device.monthly ?? []).reduce((sum, m) => sum + Number(m.pages || 0), 0);
}

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

async function loadMonths() {
  try {
    const res = await api.get("/dashboard/monthly-kpi");
    monthsWithData.value = [...new Set((res.data ?? []).map((r) => r.month))].sort();
  } catch (err) {
    console.error("Load months error:", err);
  }
}

/** เครื่องที่ยังไม่ผูกสัญญา — ไม่ขึ้นกับปีงบ เพราะไม่มีสัญญาที่จะบอกปีงบได้ */
async function loadUnassignedDevices() {
  try {
    const res = await api.get("/expense/unassigned-devices");
    unassignedDevices.value = res.data.devices ?? res.data ?? [];
  } catch (err) {
    console.error("Load unassigned devices error:", err);
  }
}

async function loadExpense() {
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

    contracts.value = res.data.contracts ?? [];
    collapseAll();
  } catch (err) {
    console.error("Load expense error:", err);
    loadError.value = "โหลดข้อมูลค่าใช้จ่ายไม่สำเร็จ";
    contracts.value = [];
  } finally {
    loading.value = false;
  }
}

/**
 * ส่งออก Excel — หนึ่งแถวต่อหนึ่งเครื่อง ตามตัวกรองเดือนที่เลือกอยู่
 * ใช้ข้อมูลทั้งหมดไม่ตัดตามคำค้นหา เพราะคนที่กด export มักต้องการชุดเต็มไปทำต่อ
 */
function exportExcel() {
  const header = [
    "เลขที่สัญญา",
    "ราคาต่อแผ่น (บาท)",
    "Serial",
    "ยี่ห้อ",
    "รุ่น",
    "จำนวนหน้ารวม",
    "ค่าใช้จ่ายสุทธิ (หัก 20%)",
  ];

  const rows = contracts.value.flatMap((contract) =>
    (contract.devices ?? []).map((device) => [
      contract.contract_no,
      Number(contract.price_per_page || 0),
      device.serial_number || "",
      device.brand_name || "",
      device.model || "",
      devicePages(device),
      Number(device.total_cost || 0),
    ])
  );

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  worksheet["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 20 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ค่าใช้จ่ายตามสัญญา");

  const suffix = month.value ? `-${month.value.replace(/,/g, "_")}` : "";
  XLSX.writeFile(workbook, `expense-by-contract${suffix}.xlsx`);
}

// ปีงบเป็น state กลางที่แถบบนเป็นคนตั้ง หน้านี้แค่ตามไปโหลดใหม่เมื่อค่าเปลี่ยน
watch(() => fiscalYearState.activeId, (id) => id && loadExpense(), { immediate: true });
watch(monthSelection, loadExpense);

onMounted(() => {
  loadMonths();
  loadUnassignedDevices();
});
</script>

<template>
  <div>
    <!-- แถบเครื่องมือ -->
    <div class="card p-3 mb-4 flex flex-wrap items-end gap-3" data-print="hide">
      <UiField label="เดือน" class="w-56">
        <PeriodPicker v-model="monthSelection" :options="monthsWithData" />
      </UiField>

      <UiField label="ค้นหาสัญญาหรือเครื่อง" class="flex-1 min-w-[14rem] max-w-sm">
        <UiInput v-model="search" clearable placeholder="เลขที่สัญญา, Serial, รุ่น…">
          <template #icon><Search :size="15" /></template>
        </UiInput>
      </UiField>

      <div class="flex items-center gap-2 ml-auto">
        <UiButton size="sm" variant="ghost" @click="expandAll">กางทั้งหมด</UiButton>
        <UiButton size="sm" variant="ghost" @click="collapseAll">พับทั้งหมด</UiButton>
        <UiButton size="sm" variant="secondary" :disabled="!contracts.length" @click="exportExcel">
          <template #icon><Download :size="15" /></template>
          Excel
        </UiButton>
      </div>
    </div>

    <!-- ยอดรวม -->
    <div class="grid-fit mb-4">
      <UiStat
        label="ค่าใช้จ่ายสุทธิรวม"
        unit="บาท"
        :hint="month ? 'เฉพาะเดือนที่เลือก · หัก 20% แล้ว' : 'ทั้งปีงบ · หัก 20% แล้ว'"
        emphasis
        :loading="loading"
      >
        {{ formatBahtValue(grandTotal) }}
      </UiStat>

      <UiStat label="จำนวนหน้ารวม" unit="หน้า" tone="ink" :loading="loading">
        {{ formatCount(grandTotalPages) }}
      </UiStat>

      <UiStat
        label="เครื่องในสัญญา"
        unit="เครื่อง"
        :hint="`${formatCount(contracts.length)} สัญญา`"
        tone="ink"
        :loading="loading"
      >
        {{ formatCount(totalDevices) }}
      </UiStat>
    </div>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="loadExpense">ลองใหม่</UiButton>
      </template>
    </UiAlert>

    <div v-if="loading" class="flex flex-col gap-2">
      <UiSkeleton v-for="n in 4" :key="n" height="3.5rem" />
    </div>

    <UiCard v-else-if="!contracts.length">
      <UiEmpty
        title="ยังไม่มีสัญญาในปีงบนี้"
        description="เพิ่มสัญญาและผูกเครื่องเข้ากับสัญญา ระบบจึงจะคิดค่าใช้จ่ายให้ได้"
      >
        <template #actions>
          <UiButton to="/admin/contracts" variant="primary" size="sm">ไปหน้าจัดการสัญญา</UiButton>
        </template>
      </UiEmpty>
    </UiCard>

    <UiCard v-else-if="!filteredContracts.length">
      <UiEmpty
        variant="search"
        :title="`ไม่พบรายการที่ตรงกับ “${search}”`"
        description="ลองใช้คำที่สั้นลง หรือค้นด้วยเลข Serial เพียงบางส่วน"
      >
        <template #actions>
          <UiButton size="sm" variant="secondary" @click="search = ''">ล้างคำค้นหา</UiButton>
        </template>
      </UiEmpty>
    </UiCard>

    <!-- โครงสร้างสามชั้น: สัญญา -> เครื่อง -> ยอดรายเดือน -->
    <div v-else class="flex flex-col gap-2">
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
              <span class="block text-2xs text-ink-mute numeral">
                {{ formatCount((contract.devices ?? []).length) }} เครื่อง ·
                {{ formatBahtValue(contract.price_per_page) }} บาท/แผ่น
              </span>
            </span>

            <span class="shrink-0 text-right">
              <span class="block font-semibold text-brand-ink numeral">
                {{ formatBahtValue(contract.total_cost) }}
                <span class="text-2xs font-normal text-ink-mute">บาท</span>
              </span>
            </span>
          </button>
        </h2>

        <div
          v-if="openContracts.has(contract.id)"
          :id="`contract-${contract.id}`"
          class="border-t border-line-soft"
        >
          <p v-if="!(contract.devices ?? []).length" class="px-4 py-6 text-sm text-ink-mute text-center">
            ยังไม่มีเครื่องผูกกับสัญญานี้
          </p>

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
                <span class="block text-2xs text-ink-mute font-mono truncate">
                  {{ device.serial_number }}
                </span>
              </span>

              <span class="shrink-0 text-right">
                <span class="block text-sm font-medium text-ink numeral">
                  {{ formatBahtValue(device.total_cost) }}
                </span>
                <span class="block text-2xs text-ink-mute numeral">
                  {{ formatCount(devicePages(device)) }} หน้า
                </span>
              </span>
            </button>

            <div v-if="openDevices.has(device.id)" :id="`device-${device.id}`" class="pl-16 pr-4 pb-3">
              <table v-if="(device.monthly ?? []).length" class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-ink-mute">
                    <th class="text-left font-medium py-1.5">เดือน</th>
                    <th class="text-right font-medium py-1.5">จำนวนหน้า</th>
                    <th class="text-right font-medium py-1.5">ค่าใช้จ่ายสุทธิ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in device.monthly" :key="row.month" class="border-t border-line-soft">
                    <td class="py-1.5 text-ink-soft">{{ formatMonthTH(row.month, { long: true }) }}</td>
                    <td class="py-1.5 text-right numeral text-ink-soft">{{ formatCount(row.pages) }}</td>
                    <td class="py-1.5 text-right numeral text-ink">{{ formatBahtValue(row.cost) }}</td>
                  </tr>
                </tbody>
              </table>

              <p v-else class="text-sm text-ink-mute py-2">ยังไม่มีการบันทึกยอดพิมพ์ของเครื่องนี้</p>
            </div>
          </div>
        </div>
      </section>
    </div>

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
            <span class="block font-medium text-warn-ink">
              เครื่องที่ยังไม่ได้ผูกสัญญา
            </span>
            <span class="block text-2xs text-warn-ink opacity-80">
              ยอดของเครื่องเหล่านี้ไม่ถูกนับรวมในค่าใช้จ่ายตามสัญญาด้านบน
            </span>
          </span>

          <UiBadge tone="warn" size="lg">
            {{ formatCount(unassignedDevices.length) }} เครื่อง
          </UiBadge>
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
            <span class="block text-2xs text-ink-mute font-mono">{{ device.serial_number }}</span>
          </span>

          <span class="shrink-0 text-sm numeral text-ink">
            {{ formatBahtValue(device.total_cost) }} บาท
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
