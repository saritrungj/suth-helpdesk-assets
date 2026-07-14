<script setup>
import { ref, onMounted, computed } from "vue"
import api from "../../services/api"

const floors = ref([])
const buildings = ref([])

const form = ref({
  building_id: "",
  name: "",
})

const editingId = ref(null)

const editForm = ref({
  building_id: "",
  name: "",
})

// Mapping id -> building name
const buildingMap = computed(() => {
  return Object.fromEntries(
    buildings.value.map((b) => [b.id, b.name])
  )
})

// โหลดข้อมูล
async function load() {
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
  }
}

// เพิ่มข้อมูล
async function addFloor() {
  if (!form.value.building_id || !form.value.name.trim()) {
    alert("กรุณากรอกข้อมูลให้ครบ")
    return
  }

  try {
    await api.post("/floors", form.value)

    form.value = {
      building_id: "",
      name: "",
    }

    load()
  } catch (err) {
    console.error(err)
    alert("เพิ่มข้อมูลไม่สำเร็จ")
  }
}

// เริ่มแก้ไข
function editFloor(floor) {
  editingId.value = floor.id

  editForm.value = {
    building_id: floor.building_id,
    name: floor.name,
  }
}

// บันทึก
async function saveFloor(id) {
  if (!editForm.value.building_id || !editForm.value.name.trim()) {
    alert("กรุณากรอกข้อมูลให้ครบ")
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

// ลบ
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

    <h1 class="text-2xl font-bold mb-6">
      Floor Management
    </h1>

    <!-- Add -->
    <div class="flex gap-3 mb-6">

      <select
        v-model="form.building_id"
        class="border rounded px-3 py-2"
      >
        <option value="">
          เลือกอาคาร
        </option>

        <option
          v-for="b in buildings"
          :key="b.id"
          :value="b.id"
        >
          {{ b.name }}
        </option>
      </select>

      <input
        v-model="form.name"
        type="text"
        placeholder="Floor Name"
        class="border rounded px-3 py-2"
      />

      <button
        @click="addFloor"
        class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
      >
        Add
      </button>

    </div>

    <!-- Table -->
    <table class="w-full border-collapse border">

      <thead>

        <tr class="bg-gray-100">
          <th class="border p-2">ID</th>
          <th class="border p-2">Building</th>
          <th class="border p-2">Floor</th>
          <th class="border p-2">Action</th>
        </tr>

      </thead>

      <tbody>

        <tr
          v-for="f in floors"
          :key="f.id"
        >

          <td class="border p-2">
            {{ f.id }}
          </td>

          <td class="border p-2">

            <template v-if="editingId !== f.id">
              {{ buildingMap[f.building_id] || "-" }}
            </template>

            <select
              v-else
              v-model="editForm.building_id"
              class="border rounded px-2 py-1"
            >
              <option
                v-for="b in buildings"
                :key="b.id"
                :value="b.id"
              >
                {{ b.name }}
              </option>
            </select>

          </td>

          <td class="border p-2">

            <span v-if="editingId !== f.id">
              {{ f.name }}
            </span>

            <input
              v-else
              v-model="editForm.name"
              class="border rounded px-2 py-1 w-full"
            />

          </td>

          <td class="border p-2 space-x-2">

            <template v-if="editingId !== f.id">

              <button
                @click="editFloor(f)"
                class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded"
              >
                Edit
              </button>

              <button
                @click="deleteFloor(f.id)"
                class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
              >
                Delete
              </button>

            </template>

            <button
              v-else
              @click="saveFloor(f.id)"
              class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded"
            >
              Save
            </button>

          </td>

        </tr>

      </tbody>

    </table>

  </div>
</template>