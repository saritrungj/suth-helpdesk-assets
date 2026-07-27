<script setup>
import { ref, onMounted, computed } from "vue"
import api from "../../services/api"
import DataTable from "../../components/DataTable.vue"

const departments = ref([])
const divisions = ref([])

const form = ref({
  division_id: "",
  name: "",
})

const editingId = ref(null)

const editForm = ref({
  division_id: "",
  name: "",
})

const divisionMap = computed(() => {
  return Object.fromEntries(
    divisions.value.map(d => [d.id, d.name])
  )
})

const columns = computed(() => [
  { key: "id", label: "ID", align: "right" },
  { key: "division_id", label: "Division", value: (d) => divisionMap.value[d.division_id] || "-" },
  { key: "name", label: "Department" },
])

// โหลดข้อมูล
async function load() {
  try {

    const [departmentRes, divisionRes] = await Promise.all([
      api.get("/departments"),
      api.get("/divisions"),
    ])

    departments.value = departmentRes.data
    divisions.value = divisionRes.data

  } catch (err) {

    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")

  }
}

// เพิ่ม
async function addDepartment() {

  if (!form.value.division_id || !form.value.name.trim()) {
    alert("กรุณากรอกข้อมูลให้ครบ")
    return
  }

  try {

    await api.post("/departments", form.value)

    form.value = {
      division_id: "",
      name: "",
    }

    load()

  } catch (err) {

    console.error(err)
    alert("เพิ่มข้อมูลไม่สำเร็จ")

  }

}

// เริ่มแก้ไข
function editDepartment(item) {

  editingId.value = item.id

  editForm.value = {
    division_id: item.division_id,
    name: item.name,
  }

}

// บันทึก
async function saveDepartment(id) {

  if (!editForm.value.division_id || !editForm.value.name.trim()) {
    alert("กรุณากรอกข้อมูลให้ครบ")
    return
  }

  try {

    await api.put(`/departments/${id}`, editForm.value)

    editingId.value = null

    load()

  } catch (err) {

    console.error(err)
    alert("แก้ไขข้อมูลไม่สำเร็จ")

  }

}

// ลบ
async function deleteDepartment(id) {

  if (!confirm("ต้องการลบแผนกนี้ใช่หรือไม่?")) return

  try {

    await api.delete(`/departments/${id}`)

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
Department Management
</h1>

<div class="flex gap-3 mb-6">

<select
v-model="form.division_id"
class="border rounded px-3 py-2">

<option value="">
เลือกฝ่าย
</option>

<option
v-for="d in divisions"
:key="d.id"
:value="d.id">

{{ d.name }}

</option>

</select>

<input
v-model="form.name"
placeholder="Department Name"
class="border rounded px-3 py-2"
/>

<button
@click="addDepartment"
class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">

Add

</button>

</div>

<DataTable
  :rows="departments"
  :columns="columns"
  row-key="id"
  export-filename="departments"
  empty-text="ยังไม่มีแผนก"
>
  <template #cell-division_id="{ row, value }">
    <template v-if="editingId !== row.id">{{ value }}</template>
    <select v-else v-model="editForm.division_id" class="border rounded px-2 py-1">
      <option v-for="div in divisions" :key="div.id" :value="div.id">{{ div.name }}</option>
    </select>
  </template>

  <template #cell-name="{ row, value }">
    <span v-if="editingId !== row.id">{{ value }}</span>
    <input v-else v-model="editForm.name" class="border rounded px-2 py-1 w-full" />
  </template>

  <template #actions="{ row }">
    <template v-if="editingId !== row.id">
      <button
        @click="editDepartment(row)"
        title="แก้ไข"
        class="bg-yellow-500 hover:bg-yellow-600 text-white p-1.5 rounded mr-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="M15 5l4 4" />
        </svg>
      </button>

      <button
        @click="deleteDepartment(row.id)"
        title="ลบ"
        class="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </template>

    <button
      v-else
      @click="saveDepartment(row.id)"
      class="bg-green-600 text-white px-3 py-1 rounded">
      Save
    </button>
  </template>
</DataTable>

</div>
</template>