<template>
  <div class="max-w-3xl">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-2xl font-bold">นำเข้าอุปกรณ์ (CSV / Excel)</h2>

      <RouterLink
        to="/assets"
        class="text-sm text-gray-500 hover:text-gray-700 underline whitespace-nowrap"
      >
        ← กลับไปหน้าจัดการอุปกรณ์
      </RouterLink>
    </div>

    <!-- Dropzone / เลือกไฟล์ -->
    <label
      class="block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
      :class="dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="handleDrop"
    >
      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        class="hidden"
        @change="handleFile"
      />

      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-10 h-10 mx-auto text-gray-400 mb-2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>

      <p v-if="!file" class="text-sm text-gray-600">
        ลากไฟล์มาวางตรงนี้ หรือ <span class="text-blue-600 font-medium">คลิกเพื่อเลือกไฟล์</span>
      </p>
      <p v-else class="text-sm text-gray-800 font-medium">
        {{ file.name }}
        <span class="text-gray-400 font-normal">({{ formatSize(file.size) }})</span>
      </p>

      <p class="text-xs text-gray-400 mt-1">รองรับ .csv .xlsx .xls</p>
    </label>

    <div class="flex items-center gap-3 mt-4">
      <button
        type="button"
        @click="uploadFile"
        :disabled="!file || loading"
        class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-2"
      >
        <svg v-if="loading" class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        {{ loading ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์" }}
      </button>

      <button
        v-if="file && !loading"
        type="button"
        @click="clearFile"
        class="text-sm text-gray-500 hover:text-gray-700"
      >
        ยกเลิก
      </button>
    </div>

    <!-- ผลลัพธ์ -->
    <div v-if="result && !result.error" class="mt-6">
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-gray-50 border rounded-lg p-4 text-center">
          <p class="text-2xl font-bold text-gray-700">{{ result.total_rows }}</p>
          <p class="text-xs text-gray-500 mt-1">แถวทั้งหมดในไฟล์</p>
        </div>
        <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p class="text-2xl font-bold text-green-700">{{ result.inserted }}</p>
          <p class="text-xs text-green-700 mt-1">บันทึกสำเร็จ</p>
        </div>
        <div
          class="border rounded-lg p-4 text-center"
          :class="skippedCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50'"
        >
          <p class="text-2xl font-bold" :class="skippedCount > 0 ? 'text-amber-700' : 'text-gray-700'">
            {{ skippedCount }}
          </p>
          <p class="text-xs mt-1" :class="skippedCount > 0 ? 'text-amber-700' : 'text-gray-500'">ข้ามไป</p>
        </div>
      </div>

      <!-- รายการที่ข้ามไป พร้อมเหตุผล — ให้แก้ไฟล์/master data แล้วอัปโหลดใหม่ได้ตรงจุด -->
      <div v-if="skippedCount > 0" class="mt-4 border border-amber-200 rounded-lg overflow-hidden">
        <div class="bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
          {{ skippedCount }} แถวที่ยังไม่ได้บันทึก — ชื่อยี่ห้อ/อาคารในไฟล์ไม่ตรงกับข้อมูลในระบบ
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-500 border-b bg-gray-50">
              <th class="p-2">เลขซีเรียล</th>
              <th class="p-2">ยี่ห้อ (ในไฟล์)</th>
              <th class="p-2">อาคาร (ในไฟล์)</th>
              <th class="p-2">สาเหตุ</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in result.skipped" :key="i" class="border-b last:border-0">
              <td class="p-2">{{ row.serial_number }}</td>
              <td class="p-2">{{ row.brand || "-" }}</td>
              <td class="p-2">{{ row.building || "-" }}</td>
              <td class="p-2 text-amber-700">{{ row.reason }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-4 py-2.5 text-xs text-gray-500 bg-gray-50">
          แก้ชื่อในไฟล์ให้ตรงกับที่มีอยู่ในระบบ (หรือเพิ่มยี่ห้อ/อาคารใหม่ในหน้า Admin ก่อน) แล้วอัปโหลดไฟล์เฉพาะแถวเหล่านี้ใหม่อีกครั้ง
        </p>
      </div>

      <div v-else class="mt-3 text-sm text-green-700">
        นำเข้าครบทุกแถวเรียบร้อย ไม่มีรายการที่ต้องแก้ไข
      </div>
    </div>

    <div v-else-if="result && result.error" class="mt-6 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
      {{ result.error }}
    </div>
  </div>
</template>


<script setup>
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import api from "../services/api";


const file = ref(null);
const loading = ref(false);
const result = ref(null);
const dragOver = ref(false);

const skippedCount = computed(() => result.value?.skipped?.length || 0);

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setFile(f) {
  if (!f) return;
  file.value = f;
  result.value = null; // ไฟล์ใหม่ = ล้างผลลัพธ์เก่าทิ้ง กันสับสนว่าผลลัพธ์เป็นของไฟล์ไหน
}

const handleFile = (e) => {
  setFile(e.target.files[0]);
};

const handleDrop = (e) => {
  dragOver.value = false;
  setFile(e.dataTransfer.files[0]);
};

function clearFile() {
  file.value = null;
  result.value = null;
}

// Upload
const uploadFile = async () => {
  if (!file.value) return;

  loading.value = true;
  result.value = null;

  const formData = new FormData();
  formData.append("file", file.value);

  try {
    // ใช้ api.js แทน fetch ตรงๆ เพื่อให้แนบ token และใช้ base URL เดียวกับหน้าอื่นๆ
    const res = await api.post("/devices/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    result.value = res.data;
  } catch (err) {
    console.error("Upload error:", err);

    result.value = {
      error: err.response?.data?.error || "อัปโหลดไม่สำเร็จ กรุณาลองใหม่",
    };
  } finally {
    loading.value = false;
  }
};
</script>
