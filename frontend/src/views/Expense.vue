<script setup>
import { ref, computed, onMounted } from "vue"
import api from "../services/api"

const tree = ref([])
const loading = ref(true)
const selectedYearIndex = ref(0)

// เก็บสถานะ expand/collapse
const openContracts = ref(new Set())
const openDevices = ref(new Set())

const selectedYear = computed(() => tree.value[selectedYearIndex.value] || null)

function toggleContract(id) {
  openContracts.value.has(id)
    ? openContracts.value.delete(id)
    : openContracts.value.add(id)
  openContracts.value = new Set(openContracts.value)
}

function toggleDevice(id) {
  openDevices.value.has(id)
    ? openDevices.value.delete(id)
    : openDevices.value.add(id)
  openDevices.value = new Set(openDevices.value)
}

function selectYear(index) {
  selectedYearIndex.value = index
  openContracts.value = new Set()
  openDevices.value = new Set()
}

function baht(n) {
  return Number(n).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function pages(n) {
  return Number(n).toLocaleString("th-TH", { maximumFractionDigits: 1 })
}

async function load() {
  loading.value = true
  try {
    const res = await api.get("/expenses/tree")
    tree.value = res.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="p-6">
    <h1 class="text-3xl font-bold mb-4">ค่าใช้จ่ายแยกตามสัญญา</h1>

    <p v-if="loading" class="text-gray-500">กำลังโหลดข้อมูล...</p>

    <p v-else-if="tree.length === 0" class="text-gray-500">
      ยังไม่มีข้อมูลปีงบประมาณ
    </p>

    <template v-else>
      <!-- เลือกปีงบประมาณ -->
      <div class="flex flex-wrap gap-2 mb-6">
        <button
          v-for="(y, i) in tree"
          :key="y.id ?? 'none'"
          @click="selectYear(i)"
          class="px-4 py-2 rounded border"
          :class="
            i === selectedYearIndex
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white hover:bg-gray-50'
          "
        >
          📅 {{ y.year }}
        </button>
      </div>

      <div v-if="selectedYear">
        <!-- สรุประดับปีงบ -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex flex-wrap gap-8">
          <div>
            <p class="text-sm text-gray-500">สัญญาทั้งหมด</p>
            <p class="text-xl font-bold">{{ selectedYear.contract_count }} ฉบับ</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">ยอดพิมพ์สุทธิรวม</p>
            <p class="text-xl font-bold">{{ pages(selectedYear.total_net_pages) }} แผ่น</p>
          </div>
          <div>
            <p class="text-sm text-gray-500">ค่าใช้จ่ายรวม</p>
            <p class="text-xl font-bold text-blue-700">{{ baht(selectedYear.total_cost) }} บาท</p>
          </div>
        </div>

        <p v-if="selectedYear.contracts.length === 0" class="text-gray-500">
          ยังไม่มีสัญญาในปีงบประมาณนี้
        </p>

        <!-- ระดับสัญญา -->
        <div
          v-for="c in selectedYear.contracts"
          :key="c.id"
          class="border rounded-lg mb-3 overflow-hidden"
        >
          <button
            @click="toggleContract(c.id)"
            class="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 text-left"
          >
            <div class="flex items-center gap-3">
              <span>{{ openContracts.has(c.id) ? "▼" : "▶" }}</span>
              <span class="font-semibold">📄 สัญญา {{ c.contract_no }}</span>
              <span class="text-sm text-gray-500">
                {{ c.device_count }} เครื่อง
                <template v-if="c.price_per_page != null">
                  · {{ baht(c.price_per_page) }} บาท/แผ่น
                </template>
              </span>
            </div>
            <div class="text-right">
              <p class="text-sm text-gray-500">{{ pages(c.total_net_pages) }} แผ่น</p>
              <p class="font-bold text-blue-700">{{ baht(c.total_cost) }} บาท</p>
            </div>
          </button>

          <!-- ระดับเครื่อง -->
          <div v-if="openContracts.has(c.id)" class="border-t bg-gray-50 p-3 space-y-2">
            <p v-if="c.devices.length === 0" class="text-gray-500 px-2">
              ยังไม่มีเครื่องในสัญญานี้
            </p>

            <div
              v-for="d in c.devices"
              :key="d.id"
              class="border rounded bg-white overflow-hidden"
            >
              <button
                @click="toggleDevice(d.id)"
                class="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
              >
                <div class="flex items-center gap-3">
                  <span>{{ openDevices.has(d.id) ? "▼" : "▶" }}</span>
                  <span>🖨️ {{ d.serial_number }}</span>
                  <span class="text-sm text-gray-500">
                    {{ d.brand_name || "-" }} {{ d.model || "" }}
                    · {{ baht(d.cost_per_page) }} บาท/แผ่น
                  </span>
                </div>
                <div class="text-right">
                  <p class="text-sm text-gray-500">{{ pages(d.total_net_pages) }} แผ่น</p>
                  <p class="font-semibold text-blue-700">{{ baht(d.total_cost) }} บาท</p>
                </div>
              </button>

              <!-- ระดับรายเดือน -->
              <div v-if="openDevices.has(d.id)" class="border-t p-3">
                <p v-if="d.months.length === 0" class="text-gray-500">
                  ยังไม่มียอดพิมพ์ของเครื่องนี้
                </p>

                <table v-else class="w-full border-collapse border text-sm">
                  <thead>
                    <tr class="bg-gray-100">
                      <th class="border p-2">เดือน</th>
                      <th class="border p-2 text-right">ยอดพิมพ์</th>
                      <th class="border p-2 text-right">ยอดสุทธิ (×0.8)</th>
                      <th class="border p-2 text-right">💰 ค่าใช้จ่าย (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="m in d.months" :key="m.month">
                      <td class="border p-2">{{ m.month }}</td>
                      <td class="border p-2 text-right">{{ pages(m.pages) }}</td>
                      <td class="border p-2 text-right">{{ pages(m.net_pages) }}</td>
                      <td class="border p-2 text-right">{{ baht(m.total_cost) }}</td>
                    </tr>
                    <tr class="font-semibold bg-gray-50">
                      <td class="border p-2">รวม</td>
                      <td class="border p-2"></td>
                      <td class="border p-2 text-right">{{ pages(d.total_net_pages) }}</td>
                      <td class="border p-2 text-right">{{ baht(d.total_cost) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
