<template>
  <div class="p-5">
    <h2>Import Devices (CSV / Excel)</h2>

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

    <pre v-if="result">{{ result }}</pre>
  </div>
</template>


<script setup>
import { ref } from "vue";


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

    const res = await fetch(
      "http://localhost:3000/api/devices/import",
      {
        method: "POST",
        body: formData
      }
    );


    const data = await res.json();

    result.value = data;


  } catch (err) {

    console.error("Upload error:", err);

    result.value = {
      error: "Upload failed"
    };

  } finally {

    loading.value = false;

  }

};

</script>