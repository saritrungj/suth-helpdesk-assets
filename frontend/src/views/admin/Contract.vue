<script setup>
import { ref, onMounted, computed } from "vue"
import api from "../../services/api"
import DataTable from "../../components/DataTable.vue"

const contracts = ref([])
const fiscalYears = ref([])

const form = ref({
  contract_no: "",
  fiscal_year_id: "",
  price_per_page: ""
})

const editingId = ref(null)

const editForm = ref({
  contract_no: "",
  fiscal_year_id: "",
  price_per_page: ""
})

const fiscalYearMap = computed(() => {
  return Object.fromEntries(
    fiscalYears.value.map(f => [f.id, f.year])
  )
})

// คอลัมน์ของ DataTable (เหมือนหน้าทรัพย์สิน)
const columns = computed(() => [
  { key: "id", label: "ID" },
  { key: "contract_no", label: "Contract No" },
  { key: "fiscal_year_id", label: "Fiscal Year", value: (c) => fiscalYearMap.value[c.fiscal_year_id] || "-" },
  { key: "price_per_page", label: "Price / Page", align: "right" },
])

// Load
async function load() {
  try {
    const [contractRes, fiscalRes] = await Promise.all([
      api.get("/contracts"),
      api.get("/fiscal-years")
    ])

    contracts.value = contractRes.data
    fiscalYears.value = fiscalRes.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  }
}

// Add
async function addContract() {
  try {
    await api.post("/contracts", form.value)

    form.value = {
      contract_no: "",
      fiscal_year_id: "",
      price_per_page: ""
    }

    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ")
  }
}

// Edit
function editContract(c) {
  editingId.value = c.id
  editForm.value = {
    contract_no: c.contract_no,
    fiscal_year_id: c.fiscal_year_id,
    price_per_page: c.price_per_page
  }
}

// Save
async function saveContract(id) {
  try {
    await api.put(`/contracts/${id}`, editForm.value)
    editingId.value = null
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "แก้ไขข้อมูลไม่สำเร็จ")
  }
}

// Cancel edit
function cancelEdit() {
  editingId.value = null
}

// Delete
async function deleteContract(id) {
  if (!confirm("ต้องการลบสัญญานี้ใช่หรือไม่?")) return

  try {
    await api.delete(`/contracts/${id}`)
    load()
  } catch (err) {
    console.error(err)
    alert("ลบข้อมูลไม่สำเร็จ")
  }
}

onMounted(load)
</script>

<template>
<div class="p-6">

  <h1 class="text-2xl font-bold mb-6">Contract Management</h1>

  <!-- Add Contract -->
  <div class="grid grid-cols-2 gap-3 mb-6">

    <input
      v-model="form.contract_no"
      placeholder="เลขที่สัญญา"
      class="border rounded px-3 py-2"
    />

    <select
      v-model="form.fiscal_year_id"
      class="border rounded px-3 py-2"
    >
      <option value="">เลือกปีงบประมาณ</option>
      <option
        v-for="f in fiscalYears"
        :key="f.id"
        :value="f.id"
      >
        {{ f.year }}
      </option>
    </select>

    <input
      v-model="form.price_per_page"
      placeholder="ราคาต่อแผ่น"
      type="number"
      step="0.01"
      class="border rounded px-3 py-2"
    />

    <button
      @click="addContract"
      class="bg-blue-600 text-white rounded px-4 py-2"
    >
      Add Contract
    </button>

  </div>

  <!-- Table -> DataTable (มี sort/ค้นหา/pagination/export CSV ในตัว เหมือนหน้าทรัพย์สิน) -->
  <DataTable
    :rows="contracts"
    :columns="columns"
    row-key="id"
    export-filename="contracts"
    search-placeholder="ค้นหาทุกคอลัมน์..."
    empty-text="ยังไม่มีสัญญาในระบบ"
  >
    <template #cell-contract_no="{ row }">
      <input
        v-if="editingId === row.id"
        v-model="editForm.contract_no"
        class="border px-2 rounded"
      />
      <span v-else>{{ row.contract_no }}</span>
    </template>

    <template #cell-fiscal_year_id="{ row }">
      <select
        v-if="editingId === row.id"
        v-model="editForm.fiscal_year_id"
        class="border px-2 rounded"
      >
        <option value="">เลือกปีงบประมาณ</option>
        <option
          v-for="f in fiscalYears"
          :key="f.id"
          :value="f.id"
        >
          {{ f.year }}
        </option>
      </select>
      <span v-else>{{ fiscalYearMap[row.fiscal_year_id] || "-" }}</span>
    </template>

    <template #cell-price_per_page="{ row }">
      <input
        v-if="editingId === row.id"
        v-model="editForm.price_per_page"
        type="number"
        step="0.01"
        class="border px-2 rounded w-28 text-right"
      />
      <span v-else>{{ row.price_per_page }}</span>
    </template>

    <template #actions="{ row }">
      <template v-if="editingId !== row.id">
        <button
          @click="editContract(row)"
          title="แก้ไข"
          class="bg-yellow-500 hover:bg-yellow-600 text-white p-1.5 rounded mr-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="M15 5l4 4" />
          </svg>
        </button>
        <button
          @click="deleteContract(row.id)"
          title="ลบ"
          class="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </template>

      <template v-else>
        <button
          @click="saveContract(row.id)"
          class="bg-green-600 text-white px-3 py-1 rounded mr-2"
        >
          Save
        </button>
        <button
          @click="cancelEdit"
          class="bg-gray-400 text-white px-3 py-1 rounded"
        >
          Cancel
        </button>
      </template>
    </template>
  </DataTable>

</div>
</template>