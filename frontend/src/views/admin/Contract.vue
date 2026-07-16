<script setup>
import { ref, onMounted } from "vue"
import api from "../../services/api"

const contracts = ref([])
const fiscalYears = ref([])

// ฟอร์มเพิ่มสัญญา
const newContract = ref({
  contract_no: "",
  fiscal_year_id: "",
  price_per_page: "",
})

// แก้ไขสัญญา
const editingId = ref(null)
const editForm = ref({
  contract_no: "",
  fiscal_year_id: "",
  price_per_page: "",
})

async function load() {
  try {
    const [cRes, fyRes] = await Promise.all([
      api.get("/contracts"),
      api.get("/fiscal-years"),
    ])
    contracts.value = cRes.data
    fiscalYears.value = fyRes.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  }
}

async function addContract() {
  if (!newContract.value.contract_no.trim()) {
    alert("กรุณากรอกเลขสัญญา")
    return
  }
  try {
    await api.post("/contracts", {
      contract_no: newContract.value.contract_no.trim(),
      fiscal_year_id: newContract.value.fiscal_year_id || null,
      price_per_page: newContract.value.price_per_page || null,
    })
    newContract.value = { contract_no: "", fiscal_year_id: "", price_per_page: "" }
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ")
  }
}

function startEdit(c) {
  editingId.value = c.id
  editForm.value = {
    contract_no: c.contract_no,
    fiscal_year_id: c.fiscal_year_id || "",
    price_per_page: c.price_per_page || "",
  }
}

async function saveContract(id) {
  if (!editForm.value.contract_no.trim()) {
    alert("กรุณากรอกเลขสัญญา")
    return
  }
  try {
    await api.put(`/contracts/${id}`, {
      contract_no: editForm.value.contract_no.trim(),
      fiscal_year_id: editForm.value.fiscal_year_id || null,
      price_per_page: editForm.value.price_per_page || null,
    })
    editingId.value = null
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "แก้ไขข้อมูลไม่สำเร็จ")
  }
}

async function deleteContract(id) {
  if (!confirm("ต้องการลบสัญญานี้ใช่หรือไม่?")) return
  try {
    await api.delete(`/contracts/${id}`)
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
    <h1 class="text-2xl font-bold mb-4">จัดการสัญญา</h1>

    <!-- ฟอร์มเพิ่มสัญญา -->
    <div class="flex flex-wrap gap-2 mb-6 items-end">
      <div>
        <label class="block text-sm text-gray-600 mb-1">เลขสัญญา</label>
        <input
          v-model="newContract.contract_no"
          type="text"
          placeholder="เลขสัญญา"
          class="border rounded px-3 py-2"
        />
      </div>

      <div>
        <label class="block text-sm text-gray-600 mb-1">ปีงบประมาณ</label>
        <select
          v-model="newContract.fiscal_year_id"
          class="border rounded px-3 py-2"
        >
          <option value="">- ไม่ระบุ -</option>
          <option v-for="fy in fiscalYears" :key="fy.id" :value="fy.id">
            {{ fy.year }}
          </option>
        </select>
      </div>

      <div>
        <label class="block text-sm text-gray-600 mb-1">ราคาต่อแผ่น (บาท)</label>
        <input
          v-model="newContract.price_per_page"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          class="border rounded px-3 py-2 w-36"
        />
      </div>

      <button
        @click="addContract"
        class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Add
      </button>
    </div>

    <!-- ตารางสัญญา -->
    <table class="w-full border-collapse border">
      <thead>
        <tr>
          <th class="border p-2">ID</th>
          <th class="border p-2">เลขสัญญา</th>
          <th class="border p-2">ปีงบประมาณ</th>
          <th class="border p-2">ราคาต่อแผ่น</th>
          <th class="border p-2 w-48">Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in contracts" :key="c.id">
          <td class="border p-2 text-center">{{ c.id }}</td>

          <td class="border p-2">
            <span v-if="editingId !== c.id">{{ c.contract_no }}</span>
            <input
              v-else
              v-model="editForm.contract_no"
              class="border rounded px-2 py-1 w-full"
            />
          </td>

          <td class="border p-2 text-center">
            <span v-if="editingId !== c.id">{{ c.fiscal_year || "-" }}</span>
            <select
              v-else
              v-model="editForm.fiscal_year_id"
              class="border rounded px-2 py-1"
            >
              <option value="">- ไม่ระบุ -</option>
              <option v-for="fy in fiscalYears" :key="fy.id" :value="fy.id">
                {{ fy.year }}
              </option>
            </select>
          </td>

          <td class="border p-2 text-right">
            <span v-if="editingId !== c.id">
              {{ c.price_per_page != null ? Number(c.price_per_page).toFixed(2) : "-" }}
            </span>
            <input
              v-else
              v-model="editForm.price_per_page"
              type="number"
              step="0.01"
              min="0"
              class="border rounded px-2 py-1 w-28"
            />
          </td>

          <td class="border p-2 space-x-2 text-center">
            <template v-if="editingId !== c.id">
              <button
                @click="startEdit(c)"
                class="bg-yellow-500 text-white px-3 py-1 rounded"
              >
                Edit
              </button>
              <button
                @click="deleteContract(c.id)"
                class="bg-red-600 text-white px-3 py-1 rounded"
              >
                Delete
              </button>
            </template>
            <button
              v-else
              @click="saveContract(c.id)"
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
