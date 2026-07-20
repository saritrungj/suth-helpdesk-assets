<template>
  <div class="p-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-2xl font-bold">Import Devices (CSV / Excel)</h2>

      <RouterLink
        to="/assets"
        class="text-sm text-blue-600 hover:underline"
      >
        ← กลับไปหน้าจัดการอุปกรณ์
      </RouterLink>
    </div>

    <input 
      type="file" 
      accept=".csv,.xlsx,.xls" 
      @change="handleFile" 
    />

    <br /><br />

    <button 
      @click="uploadFile" 
      :disabled="!file || loading"
    >
      {{ loading ? "Uploading..." : "Upload File" }}
    </button>

    <p v-if="loading">
      กำลังอัปโหลด...
    </p>

    <div v-if="result && !result.error" class="mt-4 bg-green-50 border border-green-200 text-green-800 p-3 rounded text-sm">
      {{ result.message }} — พบทั้งหมด {{ result.total_rows }} แถว, บันทึกสำเร็จ {{ result.inserted }} เครื่อง
    </div>

    <div v-else-if="result && result.error" class="mt-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
      {{ result.error }}
    </div>
  </div>
</template>


<script setup>
import { ref } from "vue";
import { RouterLink } from "vue-router";
import api from "../services/api";


const file = ref(null);
const loading = ref(false);
const result = ref(null);


// เลือกไฟล์
const handleFile = (e) => {
  file.value = e.target.files[0];
};


// Upload
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

    // ใช้ api.js แทน fetch ตรงๆ เพื่อให้แนบ token และใช้ base URL เดียวกับหน้าอื่นๆ
    const res = await api.post(
      "/devices/import",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      }
    );

    result.value = res.data;


  } catch (err) {

    console.error("Upload error:", err);

    result.value = {
      error: err.response?.data?.error || "Upload failed"
    };

  } finally {

    loading.value = false;

  }

};

</script>