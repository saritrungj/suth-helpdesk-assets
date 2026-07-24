<script setup>
import { ref, onMounted } from "vue"
import api from "../../services/api"

const brands = ref([])
const loading = ref(false)

// สำหรับแก้ไขข้อมูล (ยังเป็น inline edit เหมือนเดิม — โจทย์ข้อ 6 พูดถึงแค่ flow "เพิ่ม")
const editingId = ref(null)
const editName = ref("")

// -------------------------------------------------------
// Modal เพิ่มข้อมูล
// -------------------------------------------------------
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

// validate ก่อน submit
function validate() {
  const name = form.value.name.trim()
  if (!name) return "กรุณากรอกชื่อ Brand"
  if (name.length > 100) return "ชื่อ Brand ยาวเกินไป (ไม่เกิน 100 ตัวอักษร)"
  if (brands.value.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
    return "มีชื่อ Brand นี้อยู่แล้ว"
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
    await api.post("/brands", { name: form.value.name.trim() })
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
// โหลด / แก้ไข / ลบ (เหมือนเดิม)
// -------------------------------------------------------
async function load() {
  loading.value = true
  try {
    const res = await api.get("/brands")
    brands.value = res.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  } finally {
    loading.value = false
  }
}

function editBrand(brand) {
  editingId.value = brand.id
  editName.value = brand.name
}

async function saveBrand(id) {
  if (!editName.value.trim()) {
    alert("กรุณากรอกชื่อ Brand")
    return
  }

  try {
    await api.put(`/brands/${id}`, { name: editName.value })
    editingId.value = null
    editName.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert("แก้ไขข้อมูลไม่สำเร็จ")
  }
}

async function deleteBrand(id) {
  const confirmDelete = confirm("ต้องการลบ Brand นี้ใช่หรือไม่?")
  if (!confirmDelete) return

  try {
    await api.delete(`/brands/${id}`)
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
      <h1 class="text-2xl font-bold">Brand Management</h1>

      <button
        @click="openAddModal"
        class="bg-blue-600 text-white w-10 h-10 rounded-full text-xl leading-none hover:bg-blue-700"
        title="เพิ่ม Brand"
      >
        +
      </button>
    </div>

    <div v-if="loading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูล...</div>

    <!-- ตาราง -->
    <table v-else class="w-full border-collapse border">
      <thead>
        <tr>
          <th class="border p-2">ID</th>
          <th class="border p-2">Name</th>
          <th class="border p-2">Action</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="b in brands" :key="b.id">
          <td class="border p-2">{{ b.id }}</td>

          <td class="border p-2">
            <span v-if="editingId !== b.id">{{ b.name }}</span>
            <input
              v-else
              v-model="editName"
              class="border rounded px-2 py-1 w-full"
            />
          </td>

          <td class="border p-2 space-x-2">
            <template v-if="editingId !== b.id">
              <button
                @click="editBrand(b)"
                class="bg-yellow-500 text-white px-3 py-1 rounded"
              >
                Edit
              </button>
              <button
                @click="deleteBrand(b.id)"
                class="bg-red-600 text-white px-3 py-1 rounded"
              >
                Delete
              </button>
            </template>

            <button
              v-else
              @click="saveBrand(b.id)"
              class="bg-green-600 text-white px-3 py-1 rounded"
            >
              Save
            </button>
          </td>
        </tr>

        <tr v-if="!brands.length">
          <td colspan="3" class="border p-4 text-center text-gray-400">ยังไม่มี Brand</td>
        </tr>
      </tbody>
    </table>

    <!-- Modal: เพิ่ม Brand -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="closeAddModal"
    >
      <div class="bg-gray-50 rounded-lg shadow-xl w-full max-w-sm">
        <div class="p-5 border-b flex items-center justify-between">
          <h2 class="text-lg font-bold">เพิ่ม Brand</h2>
          <button @click="closeAddModal" class="text-gray-400 hover:text-gray-700 text-xl leading-none">
            &times;
          </button>
        </div>

        <div class="p-5">
          <label class="block text-sm text-gray-500 mb-1">ชื่อ Brand</label>
          <input
            v-model="form.name"
            @keyup.enter="submitAdd"
            type="text"
            placeholder="เช่น Canon, Epson"
            class="border rounded px-3 py-2 w-full"
            autofocus
          />

          <div v-if="formError" class="mt-3 bg-red-100 text-red-700 p-2 rounded text-sm">
            {{ formError }}
          </div>
        </div>

        <div class="p-5 border-t flex justify-end gap-2">
          <button
            @click="closeAddModal"
            :disabled="saving"
            class="border px-4 py-2 rounded hover:bg-gray-50"
          >
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