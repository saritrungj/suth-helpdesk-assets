<script setup>
import { ref, onMounted } from "vue"
import api from "../../services/api"

const divisions = ref([])
const loading = ref(false)

const editingId = ref(null)
const editName = ref("")

const showAddModal = ref(false)
const form = ref({ name: "" })
const formError = ref(null)
const saving = ref(false)

function openAddModal() {
  form.value = { name: "" }
  formError.value = null
  showAddModal.value = true
}

function closeAddModal() {
  if (saving.value) return
  showAddModal.value = false
}

function validate() {
  const name = form.value.name.trim()
  if (!name) return "กรุณากรอกชื่อฝ่าย"
  if (name.length > 100) return "ชื่อฝ่ายยาวเกินไป (ไม่เกิน 100 ตัวอักษร)"
  if (divisions.value.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
    return "มีชื่อฝ่ายนี้อยู่แล้ว"
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
    await api.post("/divisions", { name: form.value.name.trim() })
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
    const res = await api.get("/divisions")
    divisions.value = res.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  } finally {
    loading.value = false
  }
}

function editDivision(item) {
  editingId.value = item.id
  editName.value = item.name
}

async function saveDivision(id) {
  if (!editName.value.trim()) {
    alert("กรุณากรอกชื่อฝ่าย")
    return
  }

  try {
    await api.put(`/divisions/${id}`, { name: editName.value })
    editingId.value = null
    editName.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert("แก้ไขข้อมูลไม่สำเร็จ")
  }
}

async function deleteDivision(id) {
  if (!confirm("ต้องการลบฝ่ายนี้ใช่หรือไม่?")) return

  try {
    await api.delete(`/divisions/${id}`)
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

    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">Division Management</h1>

      <button
        @click="openAddModal"
        class="bg-blue-600 text-white w-10 h-10 rounded-full text-xl leading-none hover:bg-blue-700"
        title="เพิ่มฝ่าย"
      >
        +
      </button>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูล...</div>

    <table v-else class="w-full border-collapse border">
      <thead>
        <tr class="bg-gray-100">
          <th class="border p-2">ID</th>
          <th class="border p-2">Division</th>
          <th class="border p-2">Action</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="d in divisions" :key="d.id">
          <td class="border p-2">{{ d.id }}</td>

          <td class="border p-2">
            <span v-if="editingId !== d.id">{{ d.name }}</span>
            <input v-else v-model="editName" class="border rounded px-2 py-1 w-full" />
          </td>

          <td class="border p-2 space-x-2">
            <template v-if="editingId !== d.id">
              <button @click="editDivision(d)" class="bg-yellow-500 text-white px-3 py-1 rounded">Edit</button>
              <button @click="deleteDivision(d.id)" class="bg-red-600 text-white px-3 py-1 rounded">Delete</button>
            </template>
            <button v-else @click="saveDivision(d.id)" class="bg-green-600 text-white px-3 py-1 rounded">Save</button>
          </td>
        </tr>

        <tr v-if="!divisions.length">
          <td colspan="3" class="border p-4 text-center text-gray-400">ยังไม่มีฝ่าย</td>
        </tr>
      </tbody>
    </table>

    <!-- Modal: เพิ่มฝ่าย -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="closeAddModal"
    >
      <div class="bg-gray-50 rounded-lg shadow-xl w-full max-w-sm">
        <div class="p-5 border-b flex items-center justify-between">
          <h2 class="text-lg font-bold">เพิ่มฝ่าย</h2>
          <button @click="closeAddModal" class="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>

        <div class="p-5">
          <label class="block text-sm text-gray-500 mb-1">ชื่อฝ่าย</label>
          <input
            v-model="form.name"
            @keyup.enter="submitAdd"
            type="text"
            placeholder="เช่น ฝ่ายการพยาบาล"
            class="border rounded px-3 py-2 w-full"
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