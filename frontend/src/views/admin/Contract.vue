<script setup>
import { ref, onMounted, computed } from "vue"
import api from "../../services/api"
import DataTable from "../../components/DataTable.vue"
import { toastError } from "../../store/toast"
import { askConfirm } from "../../store/confirmDialog"

const contracts = ref([])
const fiscalYears = ref([])
const loading = ref(false)

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

// -------------------------------------------------------
// Modal เพิ่มข้อมูล (แทนแถวฟอร์มเดิมด้านบนตาราง — ให้เหมือนหน้า Master Data อื่นๆ)
// -------------------------------------------------------
const showAddModal = ref(false)
const form = ref({ contract_no: "", fiscal_year_id: "", price_per_page: "" })
const formError = ref(null)
const saving = ref(false)

function openAddModal() {
  form.value = { contract_no: "", fiscal_year_id: "", price_per_page: "" }
  formError.value = null
  showAddModal.value = true
}

function closeAddModal() {
  if (saving.value) return
  showAddModal.value = false
}

function validate(values) {
  if (!values.contract_no.trim()) return "กรุณากรอกเลขที่สัญญา"
  if (!values.fiscal_year_id) return "กรุณาเลือกปีงบประมาณ"
  return null
}

async function submitAdd() {
  const err = validate(form.value)
  if (err) {
    formError.value = err
    return
  }

  saving.value = true
  formError.value = null

  try {
    await api.post("/contracts", form.value)
    showAddModal.value = false
    await load()
  } catch (err) {
    console.error(err)
    formError.value = err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ"
  } finally {
    saving.value = false
  }
}

// Load
async function load() {
  loading.value = true
  try {
    const [contractRes, fiscalRes] = await Promise.all([
      api.get("/contracts"),
      api.get("/fiscal-years")
    ])

    contracts.value = contractRes.data
    fiscalYears.value = fiscalRes.data
  } catch (err) {
    console.error(err)
    toastError("โหลดข้อมูลไม่สำเร็จ")
  } finally {
    loading.value = false
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
  const err = validate(editForm.value)
  if (err) {
    toastError(err)
    return
  }

  try {
    await api.put(`/contracts/${id}`, editForm.value)
    editingId.value = null
    load()
  } catch (err) {
    console.error(err)
    toastError(err.response?.data?.error || "แก้ไขข้อมูลไม่สำเร็จ")
  }
}

// Cancel edit
function cancelEdit() {
  editingId.value = null
}

// Delete
async function deleteContract(id) {
  if (!(await askConfirm("ต้องการลบสัญญานี้ใช่หรือไม่?"))) return

  try {
    await api.delete(`/contracts/${id}`)
    load()
  } catch (err) {
    console.error(err)
    toastError("ลบข้อมูลไม่สำเร็จ")
  }
}

onMounted(load)
</script>

<template>
<div class="p-6">

  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold">Contract Management</h1>

    <button
      @click="openAddModal"
      class="bg-blue-600 text-white w-10 h-10 rounded-full text-xl leading-none hover:bg-blue-700"
      title="เพิ่มสัญญา"
    >
      +
    </button>
  </div>

  <div v-if="loading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูล...</div>

  <!-- Table -> DataTable (มี sort/ค้นหา/pagination/export CSV ในตัว เหมือนหน้าทรัพย์สิน) -->
  <DataTable
    v-else
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
        class="border px-2 rounded bg-gray-50"
      />
      <span v-else>{{ row.contract_no }}</span>
    </template>

    <template #cell-fiscal_year_id="{ row }">
      <select
        v-if="editingId === row.id"
        v-model="editForm.fiscal_year_id"
        class="border px-2 rounded bg-gray-50"
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
        class="border px-2 rounded w-28 text-right bg-gray-50"
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

  <!-- Modal: เพิ่มสัญญา -->
  <div
    v-if="showAddModal"
    class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
    @click.self="closeAddModal"
  >
    <div class="bg-gray-50 rounded-lg shadow-xl w-full max-w-sm">
      <div class="p-5 border-b flex items-center justify-between">
        <h2 class="text-lg font-bold">เพิ่มสัญญา</h2>
        <button @click="closeAddModal" class="text-gray-400 hover:text-gray-700 text-xl leading-none">
          &times;
        </button>
      </div>

      <div class="p-5 space-y-3">
        <div>
          <label class="block text-sm text-gray-500 mb-1">เลขที่สัญญา</label>
          <input
            v-model="form.contract_no"
            type="text"
            placeholder="เช่น SUTH 86-2567"
            class="border rounded px-3 py-2 w-full bg-gray-50"
            autofocus
          />
        </div>

        <div>
          <label class="block text-sm text-gray-500 mb-1">ปีงบประมาณ</label>
          <select v-model="form.fiscal_year_id" class="border rounded px-3 py-2 w-full bg-gray-50">
            <option value="">-- เลือกปีงบประมาณ --</option>
            <option v-for="f in fiscalYears" :key="f.id" :value="f.id">{{ f.year }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm text-gray-500 mb-1">ราคาต่อแผ่น</label>
          <input
            v-model="form.price_per_page"
            @keyup.enter="submitAdd"
            type="number"
            step="0.01"
            placeholder="เช่น 0.32"
            class="border rounded px-3 py-2 w-full bg-gray-50"
          />
        </div>

        <div v-if="formError" class="bg-red-100 text-red-700 p-2 rounded text-sm">
          {{ formError }}
        </div>
      </div>

      <div class="p-5 border-t flex justify-end gap-2">
        <button @click="closeAddModal" :disabled="saving" class="border px-4 py-2 rounded hover:bg-gray-50">
          ยกเลิก
        </button>
        <button
          @click="submitAdd"
          :disabled="saving"
          class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {{ saving ? "กำลังบันทึก..." : "บันทึก" }}
        </button>
      </div>
    </div>
  </div>

</div>
</template>