<template>
  <div class="max-w-3xl">
    <h1 class="text-3xl font-bold mb-4">Import Devices (CSV / Excel)</h1>

    <div class="bg-white shadow rounded-lg p-6 mb-6">
      <p class="text-gray-600 mb-4">
        คอลัมน์ที่รองรับ: <strong>serial_number, brand (ยี่ห้อ), building (อาคาร)</strong> จำเป็น
        — model (รุ่น), floor (ชั้น), division (ฝ่าย), department (แผนก), contract_no (เลขสัญญา) ไม่บังคับ
        <br />
        Serial ที่มีอยู่แล้วจะเป็นการอัปเดตข้อมูลแทน
      </p>

      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        @change="handleFile"
        class="mb-4 block"
      />

      <button
        @click="uploadFile"
        :disabled="!file || loading"
        class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {{ loading ? "กำลังอัปโหลด..." : "Upload File" }}
      </button>
    </div>

    <!-- ผลลัพธ์ -->
    <div v-if="result" class="bg-white shadow rounded-lg p-6">
      <p v-if="result.error" class="text-red-600 font-semibold">
        ❌ {{ result.error }}
      </p>

      <template v-else>
        <p class="text-green-700 font-semibold mb-2">✅ {{ result.message }}</p>
        <p class="text-gray-600 mb-4">
          ทั้งหมด {{ result.total_rows }} แถว — นำเข้าสำเร็จ {{ result.inserted }} แถว
        </p>

        <template v-if="result.skipped && result.skipped.length > 0">
          <h3 class="font-semibold mb-2">⚠️ รายการที่ถูกข้าม / มีข้อควรตรวจสอบ</h3>
          <table class="w-full border-collapse border text-sm">
            <thead>
              <tr class="bg-gray-100">
                <th class="border p-2 w-20">แถวที่</th>
                <th class="border p-2">Serial</th>
                <th class="border p-2">เหตุผล</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, i) in result.skipped" :key="i">
                <td class="border p-2 text-center">{{ s.row }}</td>
                <td class="border p-2">{{ s.serial_number || "-" }}</td>
                <td class="border p-2">{{ s.reason }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import api from "../services/api";

const file = ref(null);
const loading = ref(false);
const result = ref(null);

// เลือกไฟล์
const handleFile = (e) => {
  file.value = e.target.files[0];
};

// Upload — ใช้ api instance เพื่อให้แนบ token อัตโนมัติ (endpoint นี้ต้องเป็น admin)
const uploadFile = async () => {
  if (!file.value) {
    alert("กรุณาเลือกไฟล์");
    return;
  }

  loading.value = true;
  result.value = null;

  const formData = new FormData();
  formData.append("file", file.value);

  try {
    const res = await api.post("/devices/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    result.value = res.data;
  } catch (err) {
    console.error("Upload error:", err);
    result.value = {
      error: err.response?.data?.error || err.response?.data?.message || "Upload failed",
    };
  } finally {
    loading.value = false;
  }
};
</script>
