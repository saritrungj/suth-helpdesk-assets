<script setup>
import { ref, onMounted, computed } from "vue";
import api from "../services/api";

const loading = ref(false);
const error = ref(null);

const fiscalYears = ref([]);
const fiscalYearId = ref("");

const contracts = ref([]);

// เก็บสถานะเปิด/ปิดของแต่ละสัญญา และแต่ละเครื่อง
const openContracts = ref(new Set());
const openDevices = ref(new Set());

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMonth(value) {
  if (!value || typeof value !== "string") return value;

  const monthsTH = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
    "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
    "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];

  const [year, m] = value.split("-");
  const monthName = monthsTH[Number(m) - 1] || value;

  return `${monthName} ${Number(year) + 543}`;
}

async function loadFiscalYears() {
  try {
    const res = await api.get("/fiscal-years");
    fiscalYears.value = res.data;

    // เลือกปีงบล่าสุดเป็นค่าเริ่มต้น (ถ้ามี)
    if (res.data.length > 0) {
      fiscalYearId.value = res.data[res.data.length - 1].id;
      await loadExpense();
    }
  } catch (err) {
    console.error("Load fiscal years error:", err);
    error.value = "โหลดรายการปีงบประมาณไม่สำเร็จ";
  }
}

async function loadExpense() {
  if (!fiscalYearId.value) {
    contracts.value = [];
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const res = await api.get(`/expense/${fiscalYearId.value}`);

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
  contracts.value.reduce((sum, c) => sum + Number(c.total_cost || 0), 0)
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

onMounted(loadFiscalYears);
</script>

<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-6">ค่าใช้จ่ายแยกตามสัญญา</h1>

    <!-- เลือกปีงบประมาณ -->
    <div class="bg-white shadow rounded-lg p-4 mb-6 flex items-center gap-4">
      <label class="text-sm text-gray-500">ปีงบประมาณ</label>

      <select
        v-model="fiscalYearId"
        @change="loadExpense"
        class="border rounded px-3 py-2"
      >
        <option value="" disabled>เลือกปีงบประมาณ</option>
        <option v-for="fy in fiscalYears" :key="fy.id" :value="fy.id">
          {{ fy.year }}
        </option>
      </select>

      <div v-if="!loading && contracts.length" class="ml-auto text-right">
        <div class="text-sm text-gray-500">รวมค่าใช้จ่ายทั้งปีงบ</div>
        <div class="text-xl font-bold text-blue-700">{{ formatMoney(grandTotal) }} บาท</div>
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

    <!-- Hierarchy Tree -->
    <div v-else class="space-y-3">
      <div
        v-for="contract in contracts"
        :key="contract.id"
        class="bg-white shadow rounded-lg overflow-hidden"
      >
        <!-- ระดับ 1: สัญญา -->
        <button
          @click="toggleContract(contract.id)"
          class="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
        >
          <div class="flex items-center gap-2">
            <span class="text-lg">📄</span>
            <span class="font-semibold">สัญญา {{ contract.contract_no }}</span>
            <span class="text-xs text-gray-400">
              ({{ (contract.devices || []).length }} เครื่อง)
            </span>
          </div>

          <div class="flex items-center gap-4">
            <span class="font-bold text-blue-700">
              {{ formatMoney(contract.total_cost) }} บาท
            </span>
            <span>{{ openContracts.has(contract.id) ? "▲" : "▼" }}</span>
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
                <span>🖨️</span>
                <span class="font-medium">
                  {{ device.brand_name || "-" }} {{ device.model || "" }}
                </span>
                <span class="text-xs text-gray-400">S/N: {{ device.serial_number }}</span>
              </div>

              <div class="flex items-center gap-4">
                <span class="font-semibold text-gray-700">
                  {{ formatMoney(device.total_cost) }} บาท
                </span>
                <span>{{ openDevices.has(device.id) ? "▲" : "▼" }}</span>
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
                    <th class="py-1">💰 เดือน</th>
                    <th class="py-1 text-right">จำนวนหน้า</th>
                    <th class="py-1 text-right">ค่าใช้จ่าย</th>
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
  </div>
</template>