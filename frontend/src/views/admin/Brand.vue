<script setup>
import { ref, onMounted } from "vue"
import api from "../../services/api"

const brands = ref([])
const newBrand = ref("")

// สำหรับแก้ไขข้อมูล
const editingId = ref(null)
const editName = ref("")

// โหลดข้อมูลทั้งหมด
async function load() {
  try {
    const res = await api.get("/brands")
    brands.value = res.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  }
}

// เพิ่มข้อมูล
async function addBrand() {
  if (!newBrand.value.trim()) {
    alert("กรุณากรอกชื่อ Brand")
    return
  }

  try {
    await api.post("/brands", {
      name: newBrand.value
    })

    newBrand.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert("เพิ่มข้อมูลไม่สำเร็จ")
  }
}

// เริ่มแก้ไข
function editBrand(brand) {
  editingId.value = brand.id
  editName.value = brand.name
}

// บันทึกการแก้ไข
async function saveBrand(id) {
  if (!editName.value.trim()) {
    alert("กรุณากรอกชื่อ Brand")
    return
  }

  try {
    await api.put(`/brands/${id}`, {
      name: editName.value
    })

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

    <h1 class="text-2xl font-bold mb-4">
      Brand Management
    </h1>

    <!-- เพิ่มข้อมูล -->
    <div class="flex gap-2 mb-6">
      <input
        v-model="newBrand"
        type="text"
        placeholder="Brand Name"
        class="border rounded px-3 py-2"
      />

      <button
        @click="addBrand"
        class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Add
      </button>
    </div>

    <!-- ตาราง -->
    <table class="w-full border-collapse border">

      <thead>
        <tr>
          <th class="border p-2">ID</th>
          <th class="border p-2">Name</th>
          <th class="border p-2">Action</th>
        </tr>
      </thead>

      <tbody>

        <tr
          v-for="b in brands"
          :key="b.id"
        >

          <td class="border p-2">
            {{ b.id }}
          </td>

          <td class="border p-2">

            <span v-if="editingId !== b.id">
              {{ b.name }}
            </span>

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

      </tbody>

    </table>

  </div>
</template>