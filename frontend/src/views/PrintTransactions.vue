<script setup>
import { ref, computed, onMounted } from "vue";
import api from "../services/api";

const loading = ref(false);
const saving = ref(false);
const message = ref(null);
const messageType = ref("success"); // success | error

const search = ref("");
const buildingFilter = ref("");

const devices = ref([]); // [{ id, serial_number, model, building_name, floor_name, pages, original_pages }]
const monthOptions = ref([]);
const month = ref("");

// -------------------------------------------------------
// เดือน: สร้างตัวเลือกอัตโนมัติ (12 เดือนย้อนหลัง ถึง 2 เดือนล่วงหน้า)
// รวมกับเดือนที่เคยมีข้อมูลอยู่แล้ว จะได้ไม่ตกหล่น
// -------------------------------------------------------
function buildMonthOptions(existingMonths) {
  const set = new Set(existingMonths);

  const now = new Date();
  for (let offset = -12; offset <= 2; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    set.add(value);
  }

  return [...set].sort();
}

function formatMonth(value) {
  if (!value) return "";
  const monthsTH = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
    "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
    "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  const [y, m] = value.split("-");
  return `${monthsTH[Number(m) - 1]} ${Number(y) + 543}`;
}

function previousMonth(value) {
  const [y, m] = value.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // m-1 คือเดือนปัจจุบัน (0-index), -1 อีกทีคือเดือนก่อน
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// -------------------------------------------------------
// โหลดข้อมูลตั้งต้น
// -------------------------------------------------------
async function loadDevices() {
  const res = await api.get("/devices");
  return res.data;
}

async function loadTransactionsFor(targetMonth) {
  const res = await api.get("/print-transactions", { params: { month: targetMonth } });
  return res.data;
}

async function init() {
  loading.value = true;
  try {
    const [deviceList, existingMonths] = await Promise.all([
      loadDevices(),
      api.get("/print-transactions/months").then((r) => r.data),
    ]);

    monthOptions.value = buildMonthOptions(existingMonths);

    // ค่าเริ่มต้น: เดือนปัจจุบัน
    const now = new Date();
    month.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (!monthOptions.value.includes(month.value)) {
      monthOptions.value.push(month.value);
      monthOptions.value.sort();
    }

    devices.value = deviceList.map((d) => ({ ...d, pages: null, original_pages: null }));

    await loadMonthData();
  } catch (err) {
    console.error(err);
    message.value = "โหลดข้อมูลไม่สำเร็จ";
    messageType.value = "error";
  } finally {
    loading.value = false;
  }
}

// โหลดยอดพิมพ์ของเดือนที่เลือก มาใส่ในตาราง
async function loadMonthData() {
  loading.value = true;
  message.value = null;

  try {
    const rows = await loadTransactionsFor(month.value);

    devices.value = devices.value.map((d) => {
      const existing = rows.find((r) => r.device_id === d.id);
      const pages = existing ? Number(existing.pages) : null;
      return { ...d, pages, original_pages: pages };
    });
  } catch (err) {
    console.error(err);
    message.value = "โหลดข้อมูลของเดือนนี้ไม่สำเร็จ";
    messageType.value = "error";
  } finally {
    loading.value = false;
  }
}

// คัดลอกยอดพิมพ์จากเดือนก่อนหน้ามาเป็นค่าตั้งต้น (ช่วยกรณีเครื่องพิมพ์ใกล้เคียงเดิมทุกเดือน)
async function copyFromPreviousMonth() {
  const prev = previousMonth(month.value);

  loading.value = true;
  try {
    const rows = await loadTransactionsFor(prev);

    devices.value = devices.value.map((d) => {
      const existing = rows.find((r) => r.device_id === d.id);
      return { ...d, pages: existing ? Number(existing.pages) : d.pages };
    });

    message.value = `คัดลอกยอดพิมพ์จากเดือน ${formatMonth(prev)} แล้ว (ยังไม่ได้บันทึก กด "บันทึกทั้งหมด" เพื่อยืนยัน)`;
    messageType.value = "success";
  } catch (err) {
    console.error(err);
    message.value = "ไม่พบข้อมูลเดือนก่อนหน้า หรือโหลดไม่สำเร็จ";
    messageType.value = "error";
  } finally {
    loading.value = false;
  }
}

// -------------------------------------------------------
// ค้นหา / กรอง / จัดกลุ่มตามอาคาร
// -------------------------------------------------------
const buildingOptions = computed(() => {
  const names = [...new Set(devices.value.map((d) => d.building_name).filter(Boolean))];
  return names.sort();
});

const filteredDevices = computed(() => {
  const keyword = search.value.trim().toLowerCase();

  return devices.value.filter((d) => {
    const matchKeyword =
      !keyword ||
      d.serial_number?.toLowerCase().includes(keyword) ||
      d.model?.toLowerCase().includes(keyword) ||
      d.building_name?.toLowerCase().includes(keyword);

    const matchBuilding = !buildingFilter.value || d.building_name === buildingFilter.value;

    return matchKeyword && matchBuilding;
  });
});

// จัดกลุ่มตามอาคาร เพื่อให้กรอกง่ายกว่าตารางยาวๆ แบบ Excel
const groupedDevices = computed(() => {
  const groups = {};

  for (const d of filteredDevices.value) {
    const key = d.building_name || "ไม่ระบุอาคาร";
    if (!groups[key]) groups[key] = [];
    groups[key].push(d);
  }

  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], "th"));
});

// แถวที่ถือว่า "กรอกแล้ว" คือค่าไม่ใช่ null/undefined/ค่าว่าง (0 ที่พิมพ์เองถือว่ากรอกแล้ว)
function isFilled(pages) {
  return pages !== null && pages !== undefined && pages !== "";
}

// แถวที่ถูกแก้ไข (ต่างจากค่าที่โหลดมาตอนแรก) ไฮไลต์ให้เห็นชัด
function isChanged(device) {
  return Number(device.pages || 0) !== Number(device.original_pages || 0);
}

const changedCount = computed(
  () => devices.value.filter((d) => isChanged(d)).length
);

const totalPages = computed(() =>
  filteredDevices.value.reduce((sum, d) => sum + Number(d.pages || 0), 0)
);

// -------------------------------------------------------
// บันทึกทั้งหมดในครั้งเดียว (bulk)
// -------------------------------------------------------
async function saveAll() {
  saving.value = true;
  message.value = null;

  // เอาเฉพาะเครื่องที่ "กรอกจำนวนหน้าแล้วจริงๆ" เท่านั้น
  // เครื่องที่ไม่ได้แตะช่องกรอกเลย (pages เป็น null) จะไม่ถูกส่งไปบันทึกลง database
  const toSave = devices.value.filter((d) => isFilled(d.pages));

  if (toSave.length === 0) {
    message.value = "ยังไม่มีเครื่องไหนกรอกจำนวนหน้าเลย";
    messageType.value = "error";
    saving.value = false;
    return;
  }

  try {
    const items = toSave.map((d) => ({
      device_id: d.id,
      pages: Number(d.pages),
    }));

    await api.post("/print-transactions/bulk", {
      month: month.value,
      items,
    });

    devices.value = devices.value.map((d) =>
      isFilled(d.pages) ? { ...d, original_pages: Number(d.pages) } : d
    );

    const skipped = devices.value.length - toSave.length;

    message.value =
      `บันทึกสำเร็จ ${items.length} เครื่อง สำหรับเดือน ${formatMonth(month.value)}` +
      (skipped > 0 ? ` (ข้าม ${skipped} เครื่องที่ไม่ได้กรอกจำนวนหน้า)` : "");
    messageType.value = "success";
  } catch (err) {
    console.error(err);
    message.value = "บันทึกไม่สำเร็จ กรุณาลองใหม่";
    messageType.value = "error";
  } finally {
    saving.value = false;
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
          <label class="block text-sm text-gray-500 mb-1">เดือน</label>
          <select v-model="month" @change="loadMonthData" class="border rounded p-2">
            <option v-for="m in monthOptions" :key="m" :value="m">
              {{ formatMonth(m) }}
            </option>
          </select>
        </div>

        <div class="flex-1 min-w-[200px]">
          <label class="block text-sm text-gray-500 mb-1">ค้นหา (SN / รุ่น / อาคาร)</label>
          <input
            v-model="search"
            type="text"
            placeholder="พิมพ์เพื่อค้นหา..."
            class="border rounded p-2 w-full"
          />
        </div>

        <div>
          <label class="block text-sm text-gray-500 mb-1">อาคาร</label>
          <select v-model="buildingFilter" class="border rounded p-2">
            <option value="">ทั้งหมด</option>
            <option v-for="b in buildingOptions" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>

        <button
          @click="copyFromPreviousMonth"
          type="button"
          class="border border-blue-600 text-blue-600 px-4 py-2 rounded hover:bg-blue-50"
          title="เอายอดพิมพ์เดือนก่อนหน้ามาใส่เป็นค่าเริ่มต้น (ยังไม่บันทึกจนกว่าจะกดบันทึก)"
        >
          📋 คัดลอกจากเดือนก่อน
        </button>

        <button
          @click="saveAll"
          :disabled="saving || loading"
          class="ml-auto bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {{ saving ? "กำลังบันทึก..." : "💾 บันทึกทั้งหมด" }}
        </button>
      </div>

      <!-- สถานะ -->
      <div
        v-if="message"
        class="mb-4 p-3 rounded text-sm"
        :class="messageType === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
      >
        {{ message }}
      </div>

      <div class="flex justify-between text-sm text-gray-500 mb-3">
        <span>
          ทั้งหมด {{ filteredDevices.length }} เครื่อง
          <span v-if="changedCount > 0" class="text-orange-600 font-semibold">
            (แก้ไขแล้ว {{ changedCount }} เครื่อง ยังไม่ได้บันทึก)
          </span>
        </span>
        <span>รวมยอดพิมพ์: <b>{{ totalPages.toLocaleString() }}</b> หน้า</span>
      </div>

      <div v-if="loading" class="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</div>

      <div v-else-if="!filteredDevices.length" class="text-center text-gray-400 py-10">
        ไม่พบเครื่องที่ตรงกับเงื่อนไขค้นหา
      </div>

      <!-- ตารางกรอกข้อมูล จัดกลุ่มตามอาคาร -->
      <div v-else class="space-y-6">
        <div v-for="[buildingName, list] in groupedDevices" :key="buildingName">
          <h3 class="font-semibold text-gray-700 mb-2">
            🏢 {{ buildingName }}
            <span class="text-xs text-gray-400 font-normal">({{ list.length }} เครื่อง)</span>
          </h3>

          <table class="w-full border text-sm">
            <thead>
              <tr class="bg-gray-100 text-left">
                <th class="border p-2">SN</th>
                <th class="border p-2">รุ่น</th>
                <th class="border p-2">ชั้น</th>
                <th class="border p-2 text-right">จำนวนหน้า</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="d in list"
                :key="d.id"
                :class="isChanged(d) ? 'bg-orange-50' : ''"
              >
                <td class="border p-2">{{ d.serial_number }}</td>
                <td class="border p-2">{{ d.model || "-" }}</td>
                <td class="border p-2">{{ d.floor_name || "-" }}</td>
                <td class="border p-2">
                  <input
                    type="number"
                    min="0"
                    v-model.number="d.pages"
                    placeholder="ยังไม่กรอก"
                    class="border rounded p-1 w-32 text-right"
                    :class="isChanged(d) ? 'border-orange-400' : ''"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <button
          @click="saveAll"
          :disabled="saving || loading"
          class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {{ saving ? "กำลังบันทึก..." : "💾 บันทึกทั้งหมด" }}
        </button>
      </div>
    </div>
  </div>
</template>