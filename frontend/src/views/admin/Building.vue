<script setup>
import { ref, computed, onMounted } from "vue"
import api from "../../services/api"

const buildings = ref([])
const floors = ref([])
const selectedBuildingId = ref(null)

// ฟอร์มอาคาร
const newBuilding = ref("")
const editingBuildingId = ref(null)
const editBuildingName = ref("")

// ฟอร์มชั้น
const newFloor = ref("")
const editingFloorId = ref(null)
const editFloorName = ref("")

const selectedBuilding = computed(() =>
  buildings.value.find((b) => b.id === selectedBuildingId.value)
)

const floorsOfSelected = computed(() =>
  floors.value.filter((f) => f.building_id === selectedBuildingId.value)
)

async function load() {
  try {
    const [bRes, fRes] = await Promise.all([
      api.get("/buildings"),
      api.get("/floors"),
    ])
    buildings.value = bRes.data
    floors.value = fRes.data

    if (!selectedBuildingId.value && buildings.value.length > 0) {
      selectedBuildingId.value = buildings.value[0].id
    }
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  }
}

// ---------- อาคาร ----------
async function addBuilding() {
  if (!newBuilding.value.trim()) {
    alert("กรุณากรอกชื่ออาคาร")
    return
  }
  try {
    await api.post("/buildings", { name: newBuilding.value })
    newBuilding.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ")
  }
}

function editBuilding(b) {
  editingBuildingId.value = b.id
  editBuildingName.value = b.name
}

async function saveBuilding(id) {
  if (!editBuildingName.value.trim()) {
    alert("กรุณากรอกชื่ออาคาร")
    return
  }
  try {
    await api.put(`/buildings/${id}`, { name: editBuildingName.value })
    editingBuildingId.value = null
    editBuildingName.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "แก้ไขข้อมูลไม่สำเร็จ")
  }
}

async function deleteBuilding(id) {
  if (!confirm("ต้องการลบอาคารนี้ใช่หรือไม่?")) return
  try {
    await api.delete(`/buildings/${id}`)
    if (selectedBuildingId.value === id) selectedBuildingId.value = null
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "ลบข้อมูลไม่สำเร็จ")
  }
}

// ---------- ชั้น ----------
async function addFloor() {
  if (!selectedBuildingId.value) {
    alert("กรุณาเลือกอาคารก่อน")
    return
  }
  if (!newFloor.value.trim()) {
    alert("กรุณากรอกชื่อชั้น")
    return
  }
  try {
    await api.post("/floors", {
      name: newFloor.value,
      building_id: selectedBuildingId.value,
    })
    newFloor.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ")
  }
}

function editFloor(f) {
  editingFloorId.value = f.id
  editFloorName.value = f.name
}

async function saveFloor(f) {
  if (!editFloorName.value.trim()) {
    alert("กรุณากรอกชื่อชั้น")
    return
  }
  try {
    await api.put(`/floors/${f.id}`, {
      name: editFloorName.value,
      building_id: f.building_id,
    })
    editingFloorId.value = null
    editFloorName.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "แก้ไขข้อมูลไม่สำเร็จ")
  }
}

async function deleteFloor(id) {
  if (!confirm("ต้องการลบชั้นนี้ใช่หรือไม่?")) return
  try {
    await api.delete(`/floors/${id}`)
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
    <h1 class="text-2xl font-bold mb-4">จัดการอาคารและชั้น</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- อาคาร -->
      <div>
        <h2 class="text-lg font-semibold mb-2">อาคาร (Building)</h2>

        <div class="flex gap-2 mb-4">
          <input
            v-model="newBuilding"
            type="text"
            placeholder="ชื่ออาคาร"
            class="border rounded px-3 py-2 flex-1"
            @keyup.enter="addBuilding"
          />
          <button
            @click="addBuilding"
            class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Add
          </button>
        </div>

        <table class="w-full border-collapse border">
          <thead>
            <tr>
              <th class="border p-2">ชื่ออาคาร</th>
              <th class="border p-2 w-40">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in buildings"
              :key="b.id"
              :class="selectedBuildingId === b.id ? 'bg-blue-50' : 'cursor-pointer hover:bg-gray-50'"
              @click="selectedBuildingId = b.id"
            >
              <td class="border p-2">
                <span v-if="editingBuildingId !== b.id">{{ b.name }}</span>
                <input
                  v-else
                  v-model="editBuildingName"
                  class="border rounded px-2 py-1 w-full"
                  @click.stop
                />
              </td>
              <td class="border p-2 space-x-2 text-center">
                <template v-if="editingBuildingId !== b.id">
                  <button
                    @click.stop="editBuilding(b)"
                    class="bg-yellow-500 text-white px-3 py-1 rounded"
                  >
                    Edit
                  </button>
                  <button
                    @click.stop="deleteBuilding(b.id)"
                    class="bg-red-600 text-white px-3 py-1 rounded"
                  >
                    Delete
                  </button>
                </template>
                <button
                  v-else
                  @click.stop="saveBuilding(b.id)"
                  class="bg-green-600 text-white px-3 py-1 rounded"
                >
                  Save
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ชั้นของอาคารที่เลือก -->
      <div>
        <h2 class="text-lg font-semibold mb-2">
          ชั้น (Floor)
          <span v-if="selectedBuilding" class="text-gray-500 font-normal">
            — {{ selectedBuilding.name }}
          </span>
        </h2>

        <p v-if="!selectedBuildingId" class="text-gray-500">
          คลิกเลือกอาคารทางซ้ายเพื่อจัดการชั้น
        </p>

        <template v-else>
          <div class="flex gap-2 mb-4">
            <input
              v-model="newFloor"
              type="text"
              placeholder="ชื่อชั้น เช่น ชั้น 1"
              class="border rounded px-3 py-2 flex-1"
              @keyup.enter="addFloor"
            />
            <button
              @click="addFloor"
              class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Add
            </button>
          </div>

          <table class="w-full border-collapse border">
            <thead>
              <tr>
                <th class="border p-2">ชื่อชั้น</th>
                <th class="border p-2 w-40">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in floorsOfSelected" :key="f.id">
                <td class="border p-2">
                  <span v-if="editingFloorId !== f.id">{{ f.name }}</span>
                  <input
                    v-else
                    v-model="editFloorName"
                    class="border rounded px-2 py-1 w-full"
                  />
                </td>
                <td class="border p-2 space-x-2 text-center">
                  <template v-if="editingFloorId !== f.id">
                    <button
                      @click="editFloor(f)"
                      class="bg-yellow-500 text-white px-3 py-1 rounded"
                    >
                      Edit
                    </button>
                    <button
                      @click="deleteFloor(f.id)"
                      class="bg-red-600 text-white px-3 py-1 rounded"
                    >
                      Delete
                    </button>
                  </template>
                  <button
                    v-else
                    @click="saveFloor(f)"
                    class="bg-green-600 text-white px-3 py-1 rounded"
                  >
                    Save
                  </button>
                </td>
              </tr>
              <tr v-if="floorsOfSelected.length === 0">
                <td colspan="2" class="border p-2 text-center text-gray-500">
                  ยังไม่มีชั้นในอาคารนี้
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>
    </div>
  </div>
</template>
