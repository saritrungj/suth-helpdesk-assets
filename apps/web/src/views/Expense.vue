<script setup>
import { ref, onMounted, watch, computed } from "vue";
import * as XLSX from "xlsx";
import api from "../services/api";
import { fiscalYearState } from "../store/fiscalYear";
import ChevronIcon from "../components/ChevronIcon.vue";
import AppIcon from "../components/AppIcon.vue";
import MonthPicker from "../components/MonthPicker.vue";
import { formatMonthTH, fromSatang, sumSatang, toSatang } from "@suth/domain";

// รวมเงินหลายรายการ — บวกในหน่วยสตางค์ที่เป็นจำนวนเต็ม ไม่บวก float ของบาท
// ใช้ total_cost_satang ที่ API ส่งมาก่อน ถ้าไม่มีก็แปลงจาก total_cost แบบไม่ผ่านทศนิยมลอยตัว
// ดูเหตุผลใน packages/domain/money.cjs
function sumCost(rows) {
  return fromSatang(
    sumSatang(
      (rows || []).map((r) => r.total_cost_satang ?? toSatang(r.total_cost))
    )
  );
}


const loading = ref(false);
const error = ref(null);

const contracts = ref([]);
const unassignedDevices = ref([]);
const showUnassigned = ref(false);

// Filter เดือน — ใช้ MonthPicker แบบเดียวกับหน้า "ค่าใช้จ่ายและยอดพิมพ์แยกตามฝ่าย/แผนก"
// ไม่จำกัด max จึงกดเลือกด่วนเป็น "ไตรมาส"/"ครึ่งปี" ได้เหมือนหน้าอื่นๆ นอกจากเลือกทีละเดือนก็ยังทำได้
const months = ref([]); // เดือนทั้งหมดที่เคยมีข้อมูล (สำหรับ MonthPicker ใช้ enable/disable ตัวเลือก)
const monthSelection = ref([]);
const month = computed(() =>
  monthSelection.value.length ? [...monthSelection.value].sort().join(",") : ""
);

async function loadMonths() {
  try {
    const res = await api.get("/dashboard/monthly-kpi");
    const unique = [...new Set(res.data.map((r) => r.month))].sort();
    months.value = unique;
  } catch (err) {
    console.error("Load months error:", err);
  }
}

// เก็บสถานะเปิด/ปิดของแต่ละสัญญา และแต่ละเครื่อง
const openContracts = ref(new Set());
const openDevices = ref(new Set());

// -------------------------------------------------------
// ค้นหา — กรองสัญญา/เครื่อง ตามคำค้น (เลขที่สัญญา, รุ่น, S/N) เหมือนแท็บ
// "ค่าใช้จ่ายและยอดพิมพ์แยกตามฝ่าย/แผนก" (ByDepartment.vue) ที่มีอยู่แล้ว
// -------------------------------------------------------
const search = ref("");

const filteredContracts = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return contracts.value;

  return contracts.value
    .map((contract) => {
      const contractMatches = contract.contract_no?.toLowerCase().includes(keyword);

      const devices = (contract.devices || []).filter(
        (d) =>
          d.serial_number?.toLowerCase().includes(keyword) ||
          d.model?.toLowerCase().includes(keyword) ||
          d.brand_name?.toLowerCase().includes(keyword)
      );

      if (contractMatches || devices.length > 0) {
        return { ...contract, devices: contractMatches ? contract.devices : devices };
      }
      return null;
    })
    .filter(Boolean);
});

// -------------------------------------------------------
// ขยายทั้งหมด / ย่อทั้งหมด
// -------------------------------------------------------
function expandAll() {
  const ids = new Set();
  for (const contract of filteredContracts.value) {
    ids.add(contract.id);
  }
  openContracts.value = ids;
}

function collapseAll() {
  openContracts.value = new Set();
  openDevices.value = new Set();
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMonth(value) {
  if (!value || typeof value !== "string") return value;

  return formatMonthTH(value, { long: true });
}

// เครื่องที่ยังไม่ได้ผูกสัญญา — ไม่ขึ้นกับปีงบ เพราะไม่มีสัญญาที่จะบอกปีงบได้
async function loadUnassignedDevices() {
  try {
    const res = await api.get("/expense/unassigned-devices");
    unassignedDevices.value = res.data.devices || [];
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
  error.value = null;

  try {
    const params = {};
    if (month.value) params.month = month.value;

    const res = await api.get(`/expense/${fiscalYearState.activeId}`, { params });

    contracts.value = res.data.contracts || [];

    // ปิด accordion ทั้งหมดใหม่ทุกครั้งที่เปลี่ยนปีงบ
    openContracts.value = new Set();
    openDevices.value = new Set();
  } catch (err) {
    console.error("Load expense error:", err);
    error.value = "โหลดข้อมูลค่าใช้จ่ายไม่สำเร็จ";
    contracts.value = [];
  } finally {
    loading.value = false;
  }
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

// รวมค่าใช้จ่ายทั้งปีงบ (รวมทุกสัญญา)
const grandTotal = computed(() =>
  sumCost(contracts.value)
);

const grandTotalPages = computed(() =>
  contracts.value.reduce(
    (sum, c) =>
      sum +
      (c.devices || []).reduce(
        (s, d) => s + (d.monthly || []).reduce((ss, m) => ss + Number(m.pages || 0), 0),
        0
      ),
    0
  )
);

function toggleUnassigned() {
  showUnassigned.value = !showUnassigned.value;
}

// -------------------------------------------------------
// Export Excel — 1 แถวต่อเครื่อง (รวมยอดตามตัวกรองเดือนที่เลือกอยู่ตอนนี้) เหมือนที่เห็นใน
// accordion เป๊ะๆ — ใช้ contracts.value ทั้งหมด (ไม่ตัดตามคำค้นหา ผู้ใช้มักอยากได้ข้อมูลครบไป export)
// -------------------------------------------------------
function exportExcel() {
  const header = [
    "เลขที่สัญญา",
    "ราคา/แผ่น (บาท)",
    "S/N",
    "ยี่ห้อ",
    "รุ่น",
    "จำนวนหน้ารวม",
    "ค่าใช้จ่ายสุทธิรวม (หัก 20%)",
  ];

  const rows = [];
  for (const contract of contracts.value) {
    for (const device of contract.devices || []) {
      const totalPages = (device.monthly || []).reduce((s, m) => s + Number(m.pages || 0), 0);
      rows.push([
        contract.contract_no,
        Number(contract.price_per_page || 0),
        device.serial_number || "",
        device.brand_name || "",
        device.model || "",
        totalPages,
        Number(device.total_cost || 0),
      ]);
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ค่าใช้จ่ายแยกตามสัญญา");

  const suffix = month.value ? `-${month.value.replace(/,/g, "_")}` : "";
  XLSX.writeFile(workbook, `expense-by-contract${suffix}.xlsx`);
}

// ปีงบตอนนี้เป็น global state (Navbar เป็นคนโหลด/เซ็ตค่าเริ่มต้นให้)
// หน้านี้แค่ "subscribe" — พอ activeId เปลี่ยน (ไม่ว่าจะเปลี่ยนจาก Navbar, URL, หรือ back/forward) ให้โหลดข้อมูลใหม่ทันที
watch(
  () => fiscalYearState.activeId,
  (id) => {
    if (id) loadExpense();
  },
  { immediate: true }
);

// เปลี่ยนเดือนที่กรอง -> โหลดข้อมูลใหม่ (MonthPicker เองจะเคลียร์ค่าให้อัตโนมัติเมื่อเปลี่ยนปีงบ)
watch(monthSelection, () => loadExpense());

onMounted(() => {
  loadUnassignedDevices();
  loadMonths();
});
</script>

<template>
  <div class="p-6">
    <!-- ไม่มี h1 ซ้ำแล้ว — ชื่อหน้านี้ขึ้นเป็นแท็บ "ค่าใช้จ่ายแยกตามสัญญา" ใน UsageReport.vue อยู่แล้ว -->
    <p class="text-sm text-gray-500 mb-6">ยอดค่าใช้จ่ายทั้งหมดเป็นยอดสุทธิหลังหัก 20%</p>

    <!-- Filter เดือน — วางไว้ก่อนสรุปยอดรวม (control ก่อนผลลัพธ์) ให้เรียงลำดับแบบเดียวกับ
         Dashboard/Compare/Report: เลือกตัวกรองก่อน แล้วค่อยเห็นตัวเลขที่กรองแล้ว ไม่ใช่เห็นยอดรวม
         ก่อนแล้วค่อยมาเจอตัวกรองด้านล่างที่ทำให้ยอดด้านบน "กระโดด" เปลี่ยนโดยไม่ทันสังเกต -->
    <div class="bg-gray-50 shadow rounded-lg p-4 mb-6 flex items-center gap-4 flex-wrap">
      <div class="w-64">
        <label class="block text-xs text-gray-500 mb-1">เดือน</label>
        <MonthPicker v-model="monthSelection" :options="months" />
      </div>

      <div class="flex-1 min-w-[200px]">
        <label class="block text-xs text-gray-500 mb-1">ค้นหา (เลขที่สัญญา/รุ่น/S-N)</label>
        <input
          v-model="search"
          type="text"
          placeholder="พิมพ์เพื่อค้นหา..."
          class="border rounded p-2 w-full bg-gray-50"
        />
      </div>

      <div class="flex gap-2">
        <button
          @click="expandAll"
          type="button"
          class="border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50 text-sm"
        >
          ขยายทั้งหมด
        </button>
        <button
          @click="collapseAll"
          type="button"
          class="border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50 text-sm"
        >
          ย่อทั้งหมด
        </button>
        <button
          v-if="contracts.length"
          @click="exportExcel"
          type="button"
          class="border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50 text-sm whitespace-nowrap"
          title="ดาวน์โหลดเป็นไฟล์ Excel (.xlsx)"
        >
          ⬇ Export Excel
        </button>
      </div>
    </div>

    <!-- สรุปยอดรวม — ตัว selector ปีงบย้ายไปอยู่ที่ Navbar แล้ว (global state) -->
    <div
      v-if="!loading && contracts.length"
      class="bg-gray-50 shadow rounded-lg p-4 mb-6 flex items-center justify-end"
    >
      <div class="text-right">
        <div class="text-sm text-gray-500">
          {{ month ? "รวมค่าใช้จ่ายสุทธิตามเดือนที่เลือก (หัก 20% แล้ว)" : "รวมค่าใช้จ่ายสุทธิทั้งปีงบ (หัก 20% แล้ว)" }}
        </div>
        <div class="text-xl font-bold text-[var(--brand-text)]">{{ formatMoney(grandTotal) }} บาท</div>
        <div class="text-xs text-gray-400">รวม {{ grandTotalPages.toLocaleString() }} หน้า</div>
      </div>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</div>
    <div v-else-if="error" class="bg-red-100 text-red-700 p-4 rounded">{{ error }}</div>

    <div
      v-else-if="!contracts.length"
      class="text-center text-gray-400 border border-dashed rounded-lg py-10"
    >
      ไม่พบสัญญาในปีงบประมาณนี้
    </div>

    <div
      v-else-if="!filteredContracts.length"
      class="text-center text-gray-400 border border-dashed rounded-lg py-10"
    >
      ไม่พบรายการที่ตรงกับคำค้นหา
    </div>

    <!-- Hierarchy Tree -->
    <div v-else class="space-y-3">
      <div
        v-for="contract in filteredContracts"
        :key="contract.id"
        class="bg-gray-50 shadow rounded-lg overflow-hidden"
      >
        <!-- ระดับ 1: สัญญา -->
        <button
          @click="toggleContract(contract.id)"
          class="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
        >
          <div class="flex items-center gap-2">
            <AppIcon name="document" class="w-4 h-4 text-gray-400 shrink-0" />
            <span class="font-semibold">สัญญา {{ contract.contract_no }}</span>
            <span class="text-xs text-gray-400">
              ({{ (contract.devices || []).length }} เครื่อง)
            </span>
          </div>

          <div class="flex items-center gap-4">
            <span class="font-bold text-[var(--brand-text)]">
              {{ formatMoney(contract.total_cost) }} บาท
            </span>
            <ChevronIcon :open="openContracts.has(contract.id)" />
          </div>
        </button>

        <!-- ระดับ 2: เครื่อง -->
        <div v-if="openContracts.has(contract.id)" class="border-t divide-y">
          <div v-if="!(contract.devices || []).length" class="p-4 text-gray-400 text-sm">
            ไม่มีเครื่องในสัญญานี้
          </div>

          <div v-for="device in contract.devices" :key="device.id">
            <button
              @click="toggleDevice(device.id)"
              class="w-full flex items-center justify-between p-3 pl-8 hover:bg-gray-50 text-left"
            >
              <div class="flex items-center gap-2">
                <AppIcon name="printer" class="w-4 h-4 text-gray-400 shrink-0" />
                <span class="font-medium">
                  {{ device.brand_name || "-" }} {{ device.model || "" }}
                </span>
                <span class="text-xs text-gray-400">S/N: {{ device.serial_number }}</span>
              </div>

              <div class="flex items-center gap-4">
                <span class="font-semibold text-gray-700">
                  {{ formatMoney(device.total_cost) }} บาท
                </span>
                <ChevronIcon :open="openDevices.has(device.id)" />
              </div>
            </button>

            <!-- ระดับ 3: ค่าใช้จ่ายรายเดือน -->
            <div v-if="openDevices.has(device.id)" class="pl-14 pr-4 pb-3">
              <table
                v-if="(device.monthly || []).length"
                class="w-full text-sm border-collapse"
              >
                <thead>
                  <tr class="text-gray-500 text-left">
                    <th class="py-1">
                      <span class="inline-flex items-center gap-1">
                        <AppIcon name="currency" class="w-3.5 h-3.5" />
                        เดือน
                      </span>
                    </th>
                    <th class="py-1 text-right">จำนวนหน้า</th>
                    <th class="py-1 text-right">ค่าใช้จ่ายสุทธิ (หัก 20%)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in device.monthly" :key="m.month" class="border-t">
                    <td class="py-1">{{ formatMonth(m.month) }}</td>
                    <td class="py-1 text-right">{{ Number(m.pages).toLocaleString() }}</td>
                    <td class="py-1 text-right">{{ formatMoney(m.cost) }} บาท</td>
                  </tr>
                </tbody>
              </table>

              <div v-else class="text-gray-400 text-sm py-2">
                ยังไม่มีข้อมูลยอดพิมพ์สำหรับเครื่องนี้
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- เครื่องที่ยังไม่ได้ผูกสัญญา (เดิมมองไม่เห็นในหน้านี้เลย) -->
    <div v-if="unassignedDevices.length" class="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg overflow-hidden">
      <button
        @click="toggleUnassigned"
        class="w-full flex items-center justify-between p-4 hover:bg-yellow-100 text-left"
      >
        <div class="flex items-center gap-2">
          <AppIcon name="warning" class="w-4 h-4 text-yellow-600 shrink-0" />
          <span class="font-semibold text-yellow-800">
            เครื่องที่ยังไม่ได้ผูกสัญญา ({{ unassignedDevices.length }} เครื่อง)
          </span>
        </div>
        <div class="flex items-center gap-4">
          <span class="font-bold text-yellow-800">
            {{ formatMoney(sumCost(unassignedDevices)) }} บาท
          </span>
          <ChevronIcon :open="showUnassigned" class="text-yellow-700" />
        </div>
      </button>

      <div v-if="showUnassigned" class="border-t divide-y bg-gray-50">
        <div v-for="device in unassignedDevices" :key="device.id" class="p-3 pl-8 flex items-center justify-between">
          <div>
            <span class="font-medium">{{ device.brand_name || "-" }} {{ device.model || "" }}</span>
            <span class="text-xs text-gray-400 ml-2">S/N: {{ device.serial_number }}</span>
          </div>
          <span class="text-gray-700">{{ formatMoney(device.total_cost) }} บาท</span>
        </div>
      </div>
    </div>
  </div>
</template>
