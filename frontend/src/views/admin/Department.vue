<script setup>
import { ref, onMounted, computed } from "vue"
import api from "../../services/api"

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

<table class="w-full border-collapse border">

<thead>

<tr class="bg-gray-100">

<th class="border p-2">
ID
</th>

<th class="border p-2">
Division
</th>

<th class="border p-2">
Department
</th>

<th class="border p-2">
Action
</th>

</tr>

</thead>

<tbody>

<tr
v-for="d in departments"
:key="d.id">

<td class="border p-2">

{{ d.id }}

</td>

<td class="border p-2">

<template v-if="editingId !== d.id">

{{ divisionMap[d.division_id] || "-" }}

</template>

<select
v-else
v-model="editForm.division_id"
class="border rounded px-2 py-1">

<option
v-for="div in divisions"
:key="div.id"
:value="div.id">

{{ div.name }}

</option>

</select>

</td>

<td class="border p-2">

<span v-if="editingId !== d.id">

{{ d.name }}

</span>

<input
v-else
v-model="editForm.name"
class="border rounded px-2 py-1 w-full"
/>

</td>

<td class="border p-2 space-x-2">

<template v-if="editingId !== d.id">

<button
@click="editDepartment(d)"
class="bg-yellow-500 text-white px-3 py-1 rounded">

Edit

</button>

<button
@click="deleteDepartment(d.id)"
class="bg-red-600 text-white px-3 py-1 rounded">

Delete

</button>

</template>

<button
v-else
@click="saveDepartment(d.id)"
class="bg-green-600 text-white px-3 py-1 rounded">

Save

</button>

</td>

</tr>

</tbody>

</table>

</div>

</template>