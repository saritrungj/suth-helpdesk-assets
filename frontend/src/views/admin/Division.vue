<script setup>
import { ref, onMounted } from "vue"
import api from "../../services/api"

const divisions = ref([])
const newDivision = ref("")

const editingId = ref(null)
const editName = ref("")

// โหลดข้อมูล
async function load() {
  try {
    const res = await api.get("/divisions")
    divisions.value = res.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  }
}

// เพิ่ม
async function addDivision() {
  if (!newDivision.value.trim()) {
    alert("กรุณากรอกชื่อฝ่าย")
    return
  }

  try {
    await api.post("/divisions", {
      name: newDivision.value,
    })

    newDivision.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert("เพิ่มข้อมูลไม่สำเร็จ")
  }
}

// เริ่มแก้ไข
function editDivision(item) {
  editingId.value = item.id
  editName.value = item.name
}

// บันทึก
async function saveDivision(id) {
  if (!editName.value.trim()) {
    alert("กรุณากรอกชื่อฝ่าย")
    return
  }

  try {
    await api.put(`/divisions/${id}`, {
      name: editName.value,
    })

    editingId.value = null
    editName.value = ""

    load()
  } catch (err) {
    console.error(err)
    alert("แก้ไขข้อมูลไม่สำเร็จ")
  }
}

// ลบ
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

    <h1 class="text-2xl font-bold mb-6">
      Division Management
    </h1>

    <div class="flex gap-2 mb-6">

      <input
        v-model="newDivision"
        placeholder="Division Name"
        class="border rounded px-3 py-2"
      />

      <button
        @click="addDivision"
        class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
      >
        Add
      </button>

    </div>

    <table class="w-full border-collapse border">

      <thead>

        <tr class="bg-gray-100">
          <th class="border p-2">ID</th>
          <th class="border p-2">Division</th>
          <th class="border p-2">Action</th>
        </tr>

      </thead>

      <tbody>

        <tr
          v-for="d in divisions"
          :key="d.id"
        >

          <td class="border p-2">
            {{ d.id }}
          </td>

          <td class="border p-2">

            <span v-if="editingId !== d.id">
              {{ d.name }}
            </span>

            <input
              v-else
              v-model="editName"
              class="border rounded px-2 py-1 w-full"
            />

          </td>

          <td class="border p-2 space-x-2">

            <template v-if="editingId !== d.id">

              <button
                @click="editDivision(d)"
                class="bg-yellow-500 text-white px-3 py-1 rounded"
              >
                Edit
              </button>

              <button
                @click="deleteDivision(d.id)"
                class="bg-red-600 text-white px-3 py-1 rounded"
              >
                Delete
              </button>

            </template>

            <button
              v-else
              @click="saveDivision(d.id)"
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