<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'

import AssetTable from '../components/AssetTable.vue'
import SearchBar from '../components/SearchBar.vue'

const router = useRouter()

const user = JSON.parse(localStorage.getItem('user') || 'null')
const isAdmin = user?.role === 'admin'

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

// ลบจริงผ่าน API
async function deleteAsset(id) {
  if (!confirm('ต้องการลบทรัพย์สินนี้ใช่หรือไม่?')) return

  try {
    await api.delete(`/devices/${id}`)
    loadAssets()
  } catch (error) {
    console.error('Delete device failed:', error)
    alert(error.response?.data?.error || 'ลบข้อมูลไม่สำเร็จ')
  }
}

function editAsset(id) {
  router.push(`/edit-asset/${id}`)
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
        v-if="isAdmin"
        class="bg-blue-600 text-white px-4 py-2 rounded"
        @click="router.push('/add-asset')"
      >
        + เพิ่มทรัพย์สิน
      </button>
    </div>

    <AssetTable
      :assets="filteredAssets"
      :can-manage="isAdmin"
      @delete="deleteAsset"
      @edit="editAsset"
    />
  </div>
</template>
