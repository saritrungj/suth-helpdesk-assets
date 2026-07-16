<script setup>
import { ref, onMounted } from "vue"
import api from "../../services/api"

const years = ref([])
const newYear = ref("")

const editingId = ref(null)
const editYear = ref("")

async function load() {
  try {
    const res = await api.get("/fiscal-years")
    years.value = res.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  }
}

async function addYear() {
  if (!newYear.value.trim()) {
    alert("กรุณากรอกปีงบประมาณ")
    return
  }
  try {
    await api.post("/fiscal-years", { year: newYear.value })
    newYear.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ")
  }
}

function startEdit(y) {
  editingId.value = y.id
  editYear.value = y.year
}

async function saveYear(id) {
  if (!editYear.value.trim()) {
    alert("กรุณากรอกปีงบประมาณ")
    return
  }
  try {
    await api.put(`/fiscal-years/${id}`, { year: editYear.value })
    editingId.value = null
    editYear.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "แก้ไขข้อมูลไม่สำเร็จ")
  }
}

async function deleteYear(id) {
  if (!confirm("ต้องการลบปีงบประมาณนี้ใช่หรือไม่?")) return
  try {
    await api.delete(`/fiscal-years/${id}`)
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "ลบข้อมูลไม่สำเร็จ")
  }
}

onMounted(load)
</script>

<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-4">จัดการปีงบประมาณ</h1>

    <div class="flex gap-2 mb-6">
      <input
        v-model="newYear"
        type="text"
        placeholder="ปีงบประมาณ เช่น 2568"
        class="border rounded px-3 py-2"
        @keyup.enter="addYear"
      />
      <button
        @click="addYear"
        class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Add
      </button>
    </div>

    <table class="w-full border-collapse border">
      <thead>
        <tr>
          <th class="border p-2">ID</th>
          <th class="border p-2">ปีงบประมาณ</th>
          <th class="border p-2 w-48">Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="y in years" :key="y.id">
          <td class="border p-2 text-center">{{ y.id }}</td>
          <td class="border p-2">
            <span v-if="editingId !== y.id">{{ y.year }}</span>
            <input
              v-else
              v-model="editYear"
              class="border rounded px-2 py-1 w-full"
            />
          </td>
          <td class="border p-2 space-x-2 text-center">
            <template v-if="editingId !== y.id">
              <button
                @click="startEdit(y)"
                class="bg-yellow-500 text-white px-3 py-1 rounded"
              >
                Edit
              </button>
              <button
                @click="deleteYear(y.id)"
                class="bg-red-600 text-white px-3 py-1 rounded"
              >
                Delete
              </button>
            </template>
            <button
              v-else
              @click="saveYear(y.id)"
              class="bg-green-600 text-white px-3 py-1 rounded"
            >
              Save
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
