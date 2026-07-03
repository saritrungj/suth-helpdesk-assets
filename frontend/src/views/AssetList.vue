<script setup>
import { ref, computed } from 'vue'
import AssetTable from '../components/AssetTable.vue'
import SearchBar from '../components/SearchBar.vue'

const search = ref('')

const assets = ref([
  { id: 1, sn: 'HP001', brand: 'HP', model: 'Tank 750', department: 'OPD', status: 'ใช้งาน' },
  { id: 2, sn: 'CAN001', brand: 'Canon', model: 'G3010', department: 'LAB', status: 'ซ่อม' }
])

// 🔍 filter
const filteredAssets = computed(() => {
  return assets.value.filter(a =>
    a.sn.toLowerCase().includes(search.value.toLowerCase())
  )
})

// ❌ delete
function deleteAsset(id) {
  assets.value = assets.value.filter(a => a.id !== id)
}

// ➕ add (ชั่วคราว)
function addAsset() {
  const newId = Date.now()

  assets.value.push({
    id: newId,
    sn: 'NEW' + newId,
    brand: 'New Brand',
    model: 'New Model',
    department: 'OPD',
    status: 'ใช้งาน'
  })
}
</script>


<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">รายการทรัพย์สิน</h1>

    <div class="flex justify-between mb-4">
      <SearchBar @search="search = $event" />

      <!-- ✅ เพิ่ม event ตรงนี้ -->
      <button
            class="bg-blue-600 text-white px-4 py-2 rounded"
            @click="$router.push('/add-asset')"
>
            + เพิ่มทรัพย์สิน
        </button>
    </div>

    <!-- ✅ เพิ่ม @delete ตรงนี้ -->
    <AssetTable 
      :assets="filteredAssets"
      @delete="deleteAsset"
    />
  </div>
</template>