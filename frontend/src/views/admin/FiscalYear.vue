<script setup>
import { ref, onMounted } from "vue"
import api from "../../services/api"

const fiscalYears = ref([])
const newYear = ref("")

const editingId = ref(null)
const editYear = ref("")

// โหลดข้อมูล
async function load() {
  try {
    const res = await api.get("/fiscal-years")
    fiscalYears.value = res.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  }
}

// เพิ่ม
async function addFiscalYear() {
  if (!newYear.value.trim()) {
    alert("กรุณากรอกปีงบประมาณ")
    return
  }

  try {
    await api.post("/fiscal-years", {
      year: newYear.value
    })

    newYear.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert("เพิ่มข้อมูลไม่สำเร็จ")
  }
}

// แก้ไข
function editFiscalYear(item) {
  editingId.value = item.id
  editYear.value = item.year
}

// บันทึก
async function saveFiscalYear(id) {
  if (!editYear.value.trim()) {
    alert("กรุณากรอกปีงบประมาณ")
    return
  }

  try {
    await api.put(`/fiscal-years/${id}`, {
      year: editYear.value
    })

    editingId.value = null
    editYear.value = ""

    load()
  } catch (err) {
    console.error(err)
    alert("แก้ไขข้อมูลไม่สำเร็จ")
  }
}

// ลบ
async function deleteFiscalYear(id) {
  if (!confirm("ต้องการลบปีงบประมาณนี้ใช่หรือไม่?")) return

  try {
    await api.delete(`/fiscal-years/${id}`)
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
      Fiscal Year Management
    </h1>

    <div class="flex gap-2 mb-6">

      <input
        v-model="newYear"
        placeholder="2569"
        class="border rounded px-3 py-2"
      />

      <button
        @click="addFiscalYear"
        class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
      >
        Add
      </button>

    </div>

    <table class="w-full border-collapse border">

      <thead>
        <tr class="bg-gray-100">
          <th class="border p-2">ID</th>
          <th class="border p-2">Fiscal Year</th>
          <th class="border p-2">Action</th>
        </tr>
      </thead>

      <tbody>

        <tr
          v-for="y in fiscalYears"
          :key="y.id"
        >

          <td class="border p-2">
            {{ y.id }}
          </td>

          <td class="border p-2">

            <span v-if="editingId !== y.id">
              {{ y.year }}
            </span>

            <input
              v-else
              v-model="editYear"
              class="border rounded px-2 py-1 w-full"
            />

          </td>

          <td class="border p-2 space-x-2">

            <template v-if="editingId !== y.id">

              <button
                @click="editFiscalYear(y)"
                class="bg-yellow-500 text-white px-3 py-1 rounded"
              >
                Edit
              </button>

              <button
                @click="deleteFiscalYear(y.id)"
                class="bg-red-600 text-white px-3 py-1 rounded"
              >
                Delete
              </button>

            </template>

            <button
              v-else
              @click="saveFiscalYear(y.id)"
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