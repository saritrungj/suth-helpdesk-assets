<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// 🧠 form state
const form = ref({
  sn: '',
  brand: '',
  model: '',
  department: 'OPD',
  status: 'ใช้งาน'
})

// 💾 save data (mock)
function saveAsset() {
  console.log('Saving asset:', form.value)

  // 👉 ตอนนี้ยังไม่ต่อ API
  // แต่อนาคตจะ POST ไป backend

  alert('บันทึกข้อมูลสำเร็จ')

  router.push('/assets')
}

// ❌ cancel
function cancel() {
  router.push('/assets')
}
</script>

<template>
  <div class="max-w-xl mx-auto bg-white p-6 shadow rounded">

    <h1 class="text-2xl font-bold mb-6">
      เพิ่ม / แก้ไข ทรัพย์สิน
    </h1>

    <!-- SN -->
    <div class="mb-4">
      <label class="block mb-1">SN</label>
      <input
        v-model="form.sn"
        class="border w-full p-2 rounded"
        placeholder="เช่น HP001"
      />
    </div>

    <!-- Brand -->
    <div class="mb-4">
      <label class="block mb-1">Brand</label>
      <input
        v-model="form.brand"
        class="border w-full p-2 rounded"
        placeholder="HP, Canon, Epson"
      />
    </div>

    <!-- Model -->
    <div class="mb-4">
      <label class="block mb-1">Model</label>
      <input
        v-model="form.model"
        class="border w-full p-2 rounded"
        placeholder="รุ่นอุปกรณ์"
      />
    </div>

    <!-- Department -->
    <div class="mb-4">
      <label class="block mb-1">Department</label>
      <select v-model="form.department" class="border w-full p-2 rounded">
        <option>OPD</option>
        <option>IPD</option>
        <option>LAB</option>
        <option>ICU</option>
      </select>
    </div>

    <!-- Status -->
    <div class="mb-4">
      <label class="block mb-1">Status</label>
      <select v-model="form.status" class="border w-full p-2 rounded">
        <option>ใช้งาน</option>
        <option>ซ่อม</option>
        <option>ชำรุด</option>
      </select>
    </div>

    <!-- Buttons -->
    <div class="flex gap-3">
      <button
        @click="saveAsset"
        class="bg-green-600 text-white px-4 py-2 rounded"
      >
        Save
      </button>

      <button
        @click="cancel"
        class="bg-gray-500 text-white px-4 py-2 rounded"
      >
        Cancel
      </button>
    </div>

  </div>
</template>