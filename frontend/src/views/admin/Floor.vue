<script setup>
import { ref, onMounted, computed } from "vue"
import api from "../../services/api"
import DataTable from "../../components/DataTable.vue"

const floors = ref([])
const buildings = ref([])
const loading = ref(false)

const editingId = ref(null)
const editForm = ref({ building_id: "", name: "" })

// Mapping id -> building name
const buildingMap = computed(() => Object.fromEntries(buildings.value.map((b) => [b.id, b.name])))

const columns = computed(() => [
  { key: "id", label: "ID", align: "right" },
  { key: "building_id", label: "Building", value: (f) => buildingMap.value[f.building_id] || "-" },
  { key: "name", label: "Floor" },
])

// -------------------------------------------------------
// Modal เพิ่มข้อมูล (แทนแถวฟอร์มเดิมด้านบนตาราง)
// -------------------------------------------------------
const showAddModal = ref(false)
const form = ref({ building_id: "", name: "" })
const formError = ref(null)
const saving = ref(false)

function openAddModal() {
  form.value = { building_id: "", name: "" }
  formError.value = null
  showAddModal.value = true
}

function closeAddModal() {
  if (saving.value) return
  showAddModal.value = false
}

function validate(values) {
  if (!values.building_id) return "กรุณาเลือกอาคาร"
  if (!values.name.trim()) return "กรุณากรอกชื่อชั้น"
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
    await api.post("/floors", form.value)
    showAddModal.value = false
    await load()
  } catch (err) {
    console.error(err)
    formError.value = err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ"
  } finally {
    saving.value = false
  }
}

// -------------------------------------------------------
// โหลด / แก้ไข (inline เหมือนเดิม) / ลบ
// -------------------------------------------------------
async function load() {
  loading.value = true
  try {
    const [floorRes, buildingRes] = await Promise.all([
      api.get("/floors"),
      api.get("/buildings"),
    ])

    floors.value = floorRes.data
    buildings.value = buildingRes.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  } finally {
    loading.value = false
  }
}

function editFloor(floor) {
  editingId.value = floor.id
  editForm.value = { building_id: floor.building_id, name: floor.name }
}

function cancelEdit() {
  editingId.value = null
}

async function saveFloor(id) {
  const err = validate(editForm.value)
  if (err) {
    alert(err)
    return
  }

  try {
    await api.put(`/floors/${id}`, editForm.value)
    editingId.value = null
    load()
  } catch (err) {
    console.error(err)
    alert("แก้ไขข้อมูลไม่สำเร็จ")
  }
}

async function deleteFloor(id) {
  if (!confirm("ต้องการลบชั้นนี้ใช่หรือไม่?")) return

  try {
    await api.delete(`/floors/${id}`)
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

    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Floor Management</h1>

      <button
        @click="openAddModal"
        class="bg-blue-600 text-white w-10 h-10 rounded-full text-xl leading-none hover:bg-blue-700"
        title="เพิ่มชั้น"
      >
        +
      </button>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูล...</div>

    <!-- ตาราง -> DataTable (sort/search/pagination/export ในตัว) -->
    <DataTable
      v-else
      :rows="floors"
      :columns="columns"
      row-key="id"
      export-filename="floors"
      empty-text="ยังไม่มีชั้น"
    >
      <template #cell-building_id="{ row, value }">
        <template v-if="editingId !== row.id">{{ value }}</template>
        <select v-else v-model="editForm.building_id" class="border rounded px-2 py-1">
          <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </template>

      <template #cell-name="{ row, value }">
        <span v-if="editingId !== row.id">{{ value }}</span>
        <input v-else v-model="editForm.name" class="border rounded px-2 py-1 w-full" />
      </template>

      <template #actions="{ row }">
        <template v-if="editingId !== row.id">
          <button @click="editFloor(row)" title="แก้ไข" class="bg-yellow-500 hover:bg-yellow-600 text-white p-1.5 rounded mr-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="M15 5l4 4" />
            </svg>
          </button>
          <button @click="deleteFloor(row.id)" title="ลบ" class="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded">
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
          <button @click="saveFloor(row.id)" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded mr-2">
            Save
          </button>
          <button @click="cancelEdit" class="border px-3 py-1 rounded hover:bg-gray-50">
            ยกเลิก
          </button>
        </template>
      </template>
    </DataTable>

    <!-- Modal: เพิ่มชั้น -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="closeAddModal"
    >
      <div class="bg-gray-50 rounded-lg shadow-xl w-full max-w-sm">
        <div class="p-5 border-b flex items-center justify-between">
          <h2 class="text-lg font-bold">เพิ่มชั้น</h2>
          <button @click="closeAddModal" class="text-gray-400 hover:text-gray-700 text-xl leading-none">
            &times;
          </button>
        </div>

        <div class="p-5 space-y-3">
          <div>
            <label class="block text-sm text-gray-500 mb-1">อาคาร</label>
            <select v-model="form.building_id" class="border rounded px-3 py-2 w-full">
              <option value="">-- เลือกอาคาร --</option>
              <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-gray-500 mb-1">ชื่อชั้น</label>
            <input
              v-model="form.name"
              @keyup.enter="submitAdd"
              type="text"
              placeholder="เช่น ชั้น 1"
              class="border rounded px-3 py-2 w-full"
              autofocus
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