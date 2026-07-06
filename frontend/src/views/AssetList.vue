<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'

import AssetTable from '../components/AssetTable.vue'
import SearchBar from '../components/SearchBar.vue'

const router = useRouter()

const search = ref('')

// ข้อมูลจาก API
const assets = ref([])

// ค้นหา
const filteredAssets = computed(() => {
  return assets.value.filter(a =>
    a.serial_number?.toLowerCase().includes(search.value.toLowerCase())
  )
})

// โหลดข้อมูลจาก Backend
async function loadAssets() {
  try {
    const response = await api.get('/devices')
    assets.value = response.data
  } catch (error) {
    console.error('Load devices failed:', error)
  }
}

// ลบ (ตอนนี้ยังเป็น Mock)
function deleteAsset(id) {
  assets.value = assets.value.filter(a => a.id !== id)
}

// โหลดข้อมูลเมื่อเปิดหน้า
onMounted(() => {
  loadAssets()
})
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">รายการทรัพย์สิน</h1>

    <div class="flex justify-between mb-4">
      <SearchBar @search="search = $event" />

      <button
        class="bg-blue-600 text-white px-4 py-2 rounded"
        @click="router.push('/add-asset')"
      >
        + เพิ่มทรัพย์สิน
      </button>
    </div>

    <AssetTable
      :assets="filteredAssets"
      @delete="deleteAsset"
    />
  </div>
</template>