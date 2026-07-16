<script setup>
import { ref, computed, onMounted } from "vue"
import api from "../../services/api"

const divisions = ref([])
const departments = ref([])
const selectedDivisionId = ref(null)

// ฟอร์มฝ่าย
const newDivision = ref("")
const editingDivisionId = ref(null)
const editDivisionName = ref("")

// ฟอร์มแผนก
const newDepartment = ref("")
const editingDepartmentId = ref(null)
const editDepartmentName = ref("")

const selectedDivision = computed(() =>
  divisions.value.find((d) => d.id === selectedDivisionId.value)
)

const departmentsOfSelected = computed(() =>
  departments.value.filter((d) => d.division_id === selectedDivisionId.value)
)

async function load() {
  try {
    const [divRes, depRes] = await Promise.all([
      api.get("/divisions"),
      api.get("/departments"),
    ])
    divisions.value = divRes.data
    departments.value = depRes.data

    if (!selectedDivisionId.value && divisions.value.length > 0) {
      selectedDivisionId.value = divisions.value[0].id
    }
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  }
}

// ---------- ฝ่าย ----------
async function addDivision() {
  if (!newDivision.value.trim()) {
    alert("กรุณากรอกชื่อฝ่าย")
    return
  }
  try {
    await api.post("/divisions", { name: newDivision.value })
    newDivision.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ")
  }
}

function editDivision(d) {
  editingDivisionId.value = d.id
  editDivisionName.value = d.name
}

async function saveDivision(id) {
  if (!editDivisionName.value.trim()) {
    alert("กรุณากรอกชื่อฝ่าย")
    return
  }
  try {
    await api.put(`/divisions/${id}`, { name: editDivisionName.value })
    editingDivisionId.value = null
    editDivisionName.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "แก้ไขข้อมูลไม่สำเร็จ")
  }
}

async function deleteDivision(id) {
  if (!confirm("ต้องการลบฝ่ายนี้ใช่หรือไม่?")) return
  try {
    await api.delete(`/divisions/${id}`)
    if (selectedDivisionId.value === id) selectedDivisionId.value = null
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "ลบข้อมูลไม่สำเร็จ")
  }
}

// ---------- แผนก ----------
async function addDepartment() {
  if (!selectedDivisionId.value) {
    alert("กรุณาเลือกฝ่ายก่อน")
    return
  }
  if (!newDepartment.value.trim()) {
    alert("กรุณากรอกชื่อแผนก")
    return
  }
  try {
    await api.post("/departments", {
      name: newDepartment.value,
      division_id: selectedDivisionId.value,
    })
    newDepartment.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ")
  }
}

function editDepartment(d) {
  editingDepartmentId.value = d.id
  editDepartmentName.value = d.name
}

async function saveDepartment(d) {
  if (!editDepartmentName.value.trim()) {
    alert("กรุณากรอกชื่อแผนก")
    return
  }
  try {
    await api.put(`/departments/${d.id}`, {
      name: editDepartmentName.value,
      division_id: d.division_id,
    })
    editingDepartmentId.value = null
    editDepartmentName.value = ""
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "แก้ไขข้อมูลไม่สำเร็จ")
  }
}

async function deleteDepartment(id) {
  if (!confirm("ต้องการลบแผนกนี้ใช่หรือไม่?")) return
  try {
    await api.delete(`/departments/${id}`)
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
    <h1 class="text-2xl font-bold mb-4">จัดการฝ่ายและแผนก</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- ฝ่าย -->
      <div>
        <h2 class="text-lg font-semibold mb-2">ฝ่าย (Division)</h2>

        <div class="flex gap-2 mb-4">
          <input
            v-model="newDivision"
            type="text"
            placeholder="ชื่อฝ่าย"
            class="border rounded px-3 py-2 flex-1"
            @keyup.enter="addDivision"
          />
          <button
            @click="addDivision"
            class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Add
          </button>
        </div>

        <table class="w-full border-collapse border">
          <thead>
            <tr>
              <th class="border p-2">ชื่อฝ่าย</th>
              <th class="border p-2 w-40">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in divisions"
              :key="d.id"
              :class="selectedDivisionId === d.id ? 'bg-blue-50' : 'cursor-pointer hover:bg-gray-50'"
              @click="selectedDivisionId = d.id"
            >
              <td class="border p-2">
                <span v-if="editingDivisionId !== d.id">{{ d.name }}</span>
                <input
                  v-else
                  v-model="editDivisionName"
                  class="border rounded px-2 py-1 w-full"
                  @click.stop
                />
              </td>
              <td class="border p-2 space-x-2 text-center">
                <template v-if="editingDivisionId !== d.id">
                  <button
                    @click.stop="editDivision(d)"
                    class="bg-yellow-500 text-white px-3 py-1 rounded"
                  >
                    Edit
                  </button>
                  <button
                    @click.stop="deleteDivision(d.id)"
                    class="bg-red-600 text-white px-3 py-1 rounded"
                  >
                    Delete
                  </button>
                </template>
                <button
                  v-else
                  @click.stop="saveDivision(d.id)"
                  class="bg-green-600 text-white px-3 py-1 rounded"
                >
                  Save
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- แผนกของฝ่ายที่เลือก -->
      <div>
        <h2 class="text-lg font-semibold mb-2">
          แผนก (Department)
          <span v-if="selectedDivision" class="text-gray-500 font-normal">
            — {{ selectedDivision.name }}
          </span>
        </h2>

        <p v-if="!selectedDivisionId" class="text-gray-500">
          คลิกเลือกฝ่ายทางซ้ายเพื่อจัดการแผนก
        </p>

        <template v-else>
          <div class="flex gap-2 mb-4">
            <input
              v-model="newDepartment"
              type="text"
              placeholder="ชื่อแผนก"
              class="border rounded px-3 py-2 flex-1"
              @keyup.enter="addDepartment"
            />
            <button
              @click="addDepartment"
              class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Add
            </button>
          </div>

          <table class="w-full border-collapse border">
            <thead>
              <tr>
                <th class="border p-2">ชื่อแผนก</th>
                <th class="border p-2 w-40">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in departmentsOfSelected" :key="d.id">
                <td class="border p-2">
                  <span v-if="editingDepartmentId !== d.id">{{ d.name }}</span>
                  <input
                    v-else
                    v-model="editDepartmentName"
                    class="border rounded px-2 py-1 w-full"
                  />
                </td>
                <td class="border p-2 space-x-2 text-center">
                  <template v-if="editingDepartmentId !== d.id">
                    <button
                      @click="editDepartment(d)"
                      class="bg-yellow-500 text-white px-3 py-1 rounded"
                    >
                      Edit
                    </button>
                    <button
                      @click="deleteDepartment(d.id)"
                      class="bg-red-600 text-white px-3 py-1 rounded"
                    >
                      Delete
                    </button>
                  </template>
                  <button
                    v-else
                    @click="saveDepartment(d)"
                    class="bg-green-600 text-white px-3 py-1 rounded"
                  >
                    Save
                  </button>
                </td>
              </tr>
              <tr v-if="departmentsOfSelected.length === 0">
                <td colspan="2" class="border p-2 text-center text-gray-500">
                  ยังไม่มีแผนกในฝ่ายนี้
                </td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>
    </div>
  </div>
</template>
