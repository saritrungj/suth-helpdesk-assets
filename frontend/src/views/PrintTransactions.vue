<script setup>
import { ref, computed, onMounted, watch } from "vue";
import api from "../services/api";

const loading = ref(false);
const message = ref(null);
const messageType = ref("success"); // success | error

const search = ref("");
const departmentFilter = ref("");

const devices = ref([]); // [{ id, serial_number, model, brand_name, department_name, ... }]
const filledSummary = ref({}); // { [device_id]: filledCount }

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 4 + i); // -4 ถึง +1 ปีจากปัจจุบัน
const year = ref(currentYear);

const monthsTH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// -------------------------------------------------------
// โหลดรายการเครื่อง + สรุปจำนวนเดือนที่กรอกแล้วของปีที่เลือก
// -------------------------------------------------------
async function loadDevices() {
  const res = await api.get("/devices");
  devices.value = res.data;
}

async function loadSummary() {
  try {
    const res = await api.get("/print-transactions/summary", {
      params: { year: year.value },
    });
    filledSummary.value = Object.fromEntries(
      res.data.map((r) => [r.device_id, r.filled])
    );
  } catch (err) {
    console.error(err);
  }
}

async function init() {
  loading.value = true;
  try {
    await Promise.all([loadDevices(), loadSummary()]);
  } catch (err) {
    console.error(err);
    message.value = "โหลดข้อมูลไม่สำเร็จ";
    messageType.value = "error";
  } finally {
    loading.value = false;
  }
}

// เปลี่ยนปี → สรุปจำนวนเดือนที่กรอกแล้วต้องโหลดใหม่
watch(year, loadSummary);

// -------------------------------------------------------
// ค้นหา / กรองตามแผนก (ตัด "อาคาร" ออกแล้ว เหลือมิติเดียวคือเดือน — ใช้จัดการใน Modal)
// -------------------------------------------------------
const departmentOptions = computed(() => {
  const names = [...new Set(devices.value.map((d) => d.department_name).filter(Boolean))];
  return names.sort();
});

const filteredDevices = computed(() => {
  const keyword = search.value.trim().toLowerCase();

  return devices.value.filter((d) => {
    const matchKeyword =
      !keyword ||
      d.serial_number?.toLowerCase().includes(keyword) ||
      d.model?.toLowerCase().includes(keyword) ||
      d.department_name?.toLowerCase().includes(keyword);

    const matchDepartment = !departmentFilter.value || d.department_name === departmentFilter.value;

    return matchKeyword && matchDepartment;
  });
});

function filledCount(deviceId) {
  return filledSummary.value[deviceId] || 0;
}

// -------------------------------------------------------
// Modal กรอกข้อมูล 12 เดือน (Jan–Dec) ของเครื่องเดียว
// -------------------------------------------------------
const showModal = ref(false);
const modalDevice = ref(null);
const modalLoading = ref(false);
const modalSaving = ref(false);
const modalError = ref(null);

// state เป็น array ตาม index เดือน (0 = ม.ค. ... 11 = ธ.ค.)
const modalMonths = ref([]);

function buildMonthRows(targetYear) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return {
      month: `${targetYear}-${m}`,
      label: monthsTH[i],
      pages: null,
    };
  });
}

async function openModal(device) {
  modalDevice.value = device;
  modalError.value = null;
  modalMonths.value = buildMonthRows(year.value);
  showModal.value = true;

  modalLoading.value = true;
  try {
    const res = await api.get(`/print-transactions/by-device/${device.id}`, {
      params: { year: year.value },
    });

    const byMonth = Object.fromEntries(res.data.map((r) => [r.month, Number(r.pages)]));

    modalMonths.value = modalMonths.value.map((row) => ({
      ...row,
      pages: byMonth[row.month] ?? null,
    }));
  } catch (err) {
    console.error(err);
    modalError.value = "โหลดข้อมูลเดือนเดิมไม่สำเร็จ";
  } finally {
    modalLoading.value = false;
  }
}

function closeModal() {
  showModal.value = false;
  modalDevice.value = null;
  modalMonths.value = [];
  modalError.value = null;
}

function isFilled(pages) {
  return pages !== null && pages !== undefined && pages !== "";
}

async function saveModal() {
  modalError.value = null;

  // validate: ห้ามติดลบ
  const invalid = modalMonths.value.find((row) => isFilled(row.pages) && Number(row.pages) < 0);
  if (invalid) {
    modalError.value = `จำนวนหน้าของเดือน ${invalid.label} ต้องไม่ติดลบ`;
    return;
  }

  const items = modalMonths.value
    .filter((row) => isFilled(row.pages))
    .map((row) => ({ month: row.month, pages: Number(row.pages) }));

  if (items.length === 0) {
    modalError.value = "ยังไม่ได้กรอกเดือนไหนเลย";
    return;
  }

  modalSaving.value = true;
  try {
    await api.post("/print-transactions/bulk-device", {
      device_id: modalDevice.value.id,
      items,
    });

    message.value = `บันทึกยอดพิมพ์ของ ${modalDevice.value.serial_number} สำเร็จ ${items.length} เดือน`;
    messageType.value = "success";

    await loadSummary();
    closeModal();
  } catch (err) {
    console.error(err);
    modalError.value = err.response?.data?.error || "บันทึกไม่สำเร็จ กรุณาลองใหม่";
  } finally {
    modalSaving.value = false;
  }
}

onMounted(init);
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">บันทึกยอดพิมพ์รายเดือน</h1>

    <div class="bg-white shadow rounded-lg p-6">
      <!-- แถบควบคุมด้านบน -->
      <div class="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label class="block text-sm text-gray-500 mb-1">ปีที่จะกรอก</label>
          <select v-model.number="year" class="border rounded p-2">
            <option v-for="y in yearOptions" :key="y" :value="y">{{ y + 543 }}</option>
          </select>
        </div>

        <div class="flex-1 min-w-[200px]">
          <label class="block text-sm text-gray-500 mb-1">ค้นหา (SN / รุ่น / แผนก)</label>
          <input
            v-model="search"
            type="text"
            placeholder="พิมพ์เพื่อค้นหา..."
            class="border rounded p-2 w-full"
          />
        </div>

        <div>
          <label class="block text-sm text-gray-500 mb-1">แผนก</label>
          <select v-model="departmentFilter" class="border rounded p-2">
            <option value="">ทั้งหมด</option>
            <option v-for="d in departmentOptions" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
      </div>

      <!-- สถานะ -->
      <div
        v-if="message"
        class="mb-4 p-3 rounded text-sm"
        :class="messageType === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
      >
        {{ message }}
      </div>

      <div class="text-sm text-gray-500 mb-3">
        ทั้งหมด {{ filteredDevices.length }} เครื่อง — ปี {{ year + 543 }}
      </div>

      <div v-if="loading" class="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</div>

      <div v-else-if="!filteredDevices.length" class="text-center text-gray-400 py-10">
        ไม่พบเครื่องที่ตรงกับเงื่อนไขค้นหา
      </div>

      <!-- ตารางเครื่อง (ไม่แยกอาคาร) -->
      <table v-else class="w-full border text-sm">
        <thead>
          <tr class="bg-gray-100 text-left">
            <th class="border p-2">SN</th>
            <th class="border p-2">ยี่ห้อ</th>
            <th class="border p-2">รุ่น</th>
            <th class="border p-2">แผนก</th>
            <th class="border p-2 text-center">สถานะการกรอก</th>
            <th class="border p-2 text-center">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in filteredDevices" :key="d.id">
            <td class="border p-2">{{ d.serial_number }}</td>
            <td class="border p-2">{{ d.brand_name || "-" }}</td>
            <td class="border p-2">{{ d.model || "-" }}</td>
            <td class="border p-2">{{ d.department_name || "-" }}</td>
            <td class="border p-2 text-center">
              <span
                class="px-2 py-1 rounded text-xs font-medium"
                :class="
                  filledCount(d.id) === 12
                    ? 'bg-green-100 text-green-700'
                    : filledCount(d.id) > 0
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-gray-100 text-gray-500'
                "
              >
                {{ filledCount(d.id) }}/12 เดือน
              </span>
            </td>
            <td class="border p-2 text-center">
              <button
                @click="openModal(d)"
                class="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                กรอกข้อมูล
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal: กรอก 12 เดือน (Jan–Dec) ของเครื่องเดียว -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="p-5 border-b flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold">กรอกยอดพิมพ์รายเดือน</h2>
            <p class="text-sm text-gray-500">
              {{ modalDevice?.serial_number }} — {{ modalDevice?.brand_name }} {{ modalDevice?.model }}
              (ปี {{ year + 543 }})
            </p>
          </div>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-700 text-xl leading-none">
            &times;
          </button>
        </div>

        <div class="p-5">
          <div v-if="modalLoading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูลเดิม...</div>

          <table v-else class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-left text-gray-500">
                <th class="py-1">เดือน</th>
                <th class="py-1 text-right">จำนวนหน้า</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in modalMonths" :key="row.month" class="border-t">
                <td class="py-2">{{ row.label }}</td>
                <td class="py-2 text-right">
                  <input
                    type="number"
                    min="0"
                    v-model.number="modalMonths[i].pages"
                    placeholder="ยังไม่กรอก"
                    class="border rounded p-1 w-28 text-right"
                  />
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="modalError" class="mt-4 bg-red-100 text-red-700 p-3 rounded text-sm">
            {{ modalError }}
          </div>
        </div>

        <div class="p-5 border-t flex justify-end gap-2">
          <button
            @click="closeModal"
            :disabled="modalSaving"
            class="border px-4 py-2 rounded hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            @click="saveModal"
            :disabled="modalSaving || modalLoading"
            class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {{ modalSaving ? "กำลังบันทึก..." : "💾 บันทึกทั้ง 12 เดือน" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>