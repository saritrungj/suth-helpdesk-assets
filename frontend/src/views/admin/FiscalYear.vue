<script setup>
import { ref, onMounted, computed } from "vue"
import api from "../../services/api"
import DataTable from "../../components/DataTable.vue"
import { toastError } from "../../store/toast"
import { askConfirm } from "../../store/confirmDialog"

const fiscalYears = ref([])
const loading = ref(false)

const editingId = ref(null)
const editYear = ref("")

const columns = computed(() => [
  { key: "id", label: "ID", align: "right" },
  { key: "year", label: "Fiscal Year" },
])

const showAddModal = ref(false)
const form = ref({ year: "" })
const formError = ref(null)
const saving = ref(false)

function openAddModal() {
  form.value = { year: "" }
  formError.value = null
  showAddModal.value = true
}

function closeAddModal() {
  if (saving.value) return
  showAddModal.value = false
}

function validate() {
  const year = form.value.year.trim()
  if (!year) return "กรุณากรอกปีงบประมาณ"
  if (!/^\d{4}$/.test(year)) return "ปีงบประมาณต้องเป็นตัวเลข 4 หลัก (เช่น 2569)"
  if (fiscalYears.value.some((y) => String(y.year) === year)) {
    return "มีปีงบประมาณนี้อยู่แล้ว"
  }
  return null
}

async function submitAdd() {
  const err = validate()
  if (err) {
    formError.value = err
    return
  }

  saving.value = true
  formError.value = null

  try {
    await api.post("/fiscal-years", { year: form.value.year.trim() })
    showAddModal.value = false
    await load()
  } catch (err) {
    console.error(err)
    formError.value = err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ"
  } finally {
    saving.value = false
  }
}

async function load() {
  loading.value = true
  try {
    const res = await api.get("/fiscal-years")
    fiscalYears.value = res.data
  } catch (err) {
    console.error(err)
    toastError("โหลดข้อมูลไม่สำเร็จ")
  } finally {
    loading.value = false
  }
}

function editFiscalYear(item) {
  editingId.value = item.id
  editYear.value = item.year
}

async function saveFiscalYear(id) {
  if (!editYear.value.trim()) {
    toastError("กรุณากรอกปีงบประมาณ")
    return
  }

  try {
    await api.put(`/fiscal-years/${id}`, { year: editYear.value })
    editingId.value = null
    editYear.value = ""
    load()
  } catch (err) {
    console.error(err)
    toastError("แก้ไขข้อมูลไม่สำเร็จ")
  }
}

async function deleteFiscalYear(id) {
  if (!(await askConfirm("ต้องการลบปีงบประมาณนี้ใช่หรือไม่?"))) return

  try {
    await api.delete(`/fiscal-years/${id}`)
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

    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">Fiscal Year Management</h1>

      <button
        @click="openAddModal"
        class="bg-blue-600 text-white w-10 h-10 rounded-full text-xl leading-none hover:bg-blue-700"
        title="เพิ่มปีงบประมาณ"
      >
        +
      </button>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูล...</div>

    <DataTable
      v-else
      :rows="fiscalYears"
      :columns="columns"
      row-key="id"
      export-filename="fiscal-years"
      empty-text="ยังไม่มีปีงบประมาณ"
    >
      <template #cell-year="{ row, value }">
        <span v-if="editingId !== row.id">{{ value }}</span>
        <input v-else v-model="editYear" class="border rounded px-2 py-1 w-full bg-gray-50" />
      </template>

      <template #actions="{ row }">
        <template v-if="editingId !== row.id">
          <button @click="editFiscalYear(row)" title="แก้ไข" class="bg-yellow-500 hover:bg-yellow-600 text-white p-1.5 rounded mr-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="M15 5l4 4" />
            </svg>
          </button>
          <button @click="deleteFiscalYear(row.id)" title="ลบ" class="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </template>
        <button v-else @click="saveFiscalYear(row.id)" class="bg-green-600 text-white px-3 py-1 rounded">Save</button>
      </template>
    </DataTable>

    <!-- Modal: เพิ่มปีงบประมาณ -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="closeAddModal"
    >
      <div class="bg-gray-50 rounded-lg shadow-xl w-full max-w-sm">
        <div class="p-5 border-b flex items-center justify-between">
          <h2 class="text-lg font-bold">เพิ่มปีงบประมาณ</h2>
          <button @click="closeAddModal" class="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>

        <div class="p-5">
          <label class="block text-sm text-gray-500 mb-1">ปีงบประมาณ (พ.ศ.)</label>
          <input
            v-model="form.year"
            @keyup.enter="submitAdd"
            type="text"
            placeholder="2569"
            class="border rounded px-3 py-2 w-full bg-gray-50"
            autofocus
          />
          <div v-if="formError" class="mt-3 bg-red-100 text-red-700 p-2 rounded text-sm">{{ formError }}</div>
        </div>

        <div class="p-5 border-t flex justify-end gap-2">
          <button @click="closeAddModal" :disabled="saving" class="border px-4 py-2 rounded hover:bg-gray-50">ยกเลิก</button>
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