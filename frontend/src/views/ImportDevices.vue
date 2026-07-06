<template>
  <div class="p-5">
    <h2>Import Devices (CSV)</h2>

    <input type="file" accept=".csv" @change="handleFile" />

    <br /><br />

    <button @click="uploadFile" :disabled="!file">
      Upload CSV
    </button>

    <p v-if="loading">กำลังอัปโหลด...</p>

    <pre v-if="result">{{ result }}</pre>
  </div>
</template>

<script setup>
import { ref } from "vue";

const file = ref(null);
const loading = ref(false);
const result = ref(null);

const handleFile = (e) => {
  file.value = e.target.files[0];
};

const uploadFile = async () => {
  if (!file.value) {
    alert("กรุณาเลือกไฟล์ CSV");
    return;
  }

  loading.value = true;

  const formData = new FormData();
  formData.append("file", file.value);

  try {
    const res = await fetch("http://localhost:3000/api/import/devices", {
      method: "POST",
      body: formData
    });

    result.value = await res.json();
  } catch (err) {
    console.error(err);
    result.value = { error: "Upload failed" };
  }

  loading.value = false;
};
</script>