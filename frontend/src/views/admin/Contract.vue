<script setup>
import { ref, onMounted, computed } from "vue"
import api from "../../services/api"

const contracts = ref([])
const fiscalYears = ref([])

const form = ref({
  contract_no: "",
  fiscal_year_id: "",
  price_per_page: ""
})

const editingId = ref(null)

const editForm = ref({
  contract_no: "",
  fiscal_year_id: "",
  price_per_page: ""
})

const fiscalYearMap = computed(() => {
  return Object.fromEntries(
    fiscalYears.value.map(f => [f.id, f.year])
  )
})

// Load
async function load() {
  try {
    const [contractRes, fiscalRes] = await Promise.all([
      api.get("/contracts"),
      api.get("/fiscal-years")
    ])

    contracts.value = contractRes.data
    fiscalYears.value = fiscalRes.data
  } catch (err) {
    console.error(err)
    alert("โหลดข้อมูลไม่สำเร็จ")
  }
}

// Add
async function addContract() {
  try {
    await api.post("/contracts", form.value)

    form.value = {
      contract_no: "",
      fiscal_year_id: "",
      price_per_page: ""
    }

    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "เพิ่มข้อมูลไม่สำเร็จ")
  }
}

// Edit
function editContract(c) {
  editingId.value = c.id
  editForm.value = {
    contract_no: c.contract_no,
    fiscal_year_id: c.fiscal_year_id,
    price_per_page: c.price_per_page
  }
}

// Save
async function saveContract(id) {
  try {
    await api.put(`/contracts/${id}`, editForm.value)
    editingId.value = null
    load()
  } catch (err) {
    console.error(err)
    alert(err.response?.data?.error || "แก้ไขข้อมูลไม่สำเร็จ")
  }
}

// Cancel edit
function cancelEdit() {
  editingId.value = null
}

// Delete
async function deleteContract(id) {
  if (!confirm("ต้องการลบสัญญานี้ใช่หรือไม่?")) return

  try {
    await api.delete(`/contracts/${id}`)
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

  <h1 class="text-2xl font-bold mb-6">Contract Management</h1>

  <!-- Add Contract -->
  <div class="grid grid-cols-2 gap-3 mb-6">

    <input
      v-model="form.contract_no"
      placeholder="เลขที่สัญญา"
      class="border rounded px-3 py-2"
    />

    <select
      v-model="form.fiscal_year_id"
      class="border rounded px-3 py-2"
    >
      <option value="">เลือกปีงบประมาณ</option>
      <option
        v-for="f in fiscalYears"
        :key="f.id"
        :value="f.id"
      >
        {{ f.year }}
      </option>
    </select>

    <input
      v-model="form.price_per_page"
      placeholder="ราคาต่อแผ่น"
      type="number"
      step="0.01"
      class="border rounded px-3 py-2"
    />

    <button
      @click="addContract"
      class="bg-blue-600 text-white rounded px-4 py-2"
    >
      Add Contract
    </button>

  </div>

  <!-- Table -->
  <table class="w-full border-collapse border">
    <thead>
      <tr class="bg-gray-100">
        <th class="border p-2">ID</th>
        <th class="border p-2">Contract No</th>
        <th class="border p-2">Fiscal Year</th>
        <th class="border p-2">Price / Page</th>
        <th class="border p-2">Action</th>
      </tr>
    </thead>

    <tbody>
      <tr v-for="c in contracts" :key="c.id">

        <td class="border p-2">{{ c.id }}</td>

        <td class="border p-2">
          <input
            v-if="editingId === c.id"
            v-model="editForm.contract_no"
            class="border px-2"
          />
          <span v-else>{{ c.contract_no }}</span>
        </td>

        <td class="border p-2">
          <select
            v-if="editingId === c.id"
            v-model="editForm.fiscal_year_id"
            class="border px-2"
          >
            <option value="">เลือกปีงบประมาณ</option>
            <option
              v-for="f in fiscalYears"
              :key="f.id"
              :value="f.id"
            >
              {{ f.year }}
            </option>
          </select>
          <span v-else>{{ fiscalYearMap[c.fiscal_year_id] || "-" }}</span>
        </td>

        <td class="border p-2">
          <input
            v-if="editingId === c.id"
            v-model="editForm.price_per_page"
            type="number"
            step="0.01"
            class="border px-2"
          />
          <span v-else>{{ c.price_per_page }}</span>
        </td>

        <td class="border p-2">
          <template v-if="editingId !== c.id">
            <button
              @click="editContract(c)"
              class="bg-yellow-500 text-white px-3 py-1 rounded mr-2"
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

          <template v-else>
            <button
              @click="saveContract(c.id)"
              class="bg-green-600 text-white px-3 py-1 rounded mr-2"
            >
              Save
            </button>
            <button
              @click="cancelEdit"
              class="bg-gray-400 text-white px-3 py-1 rounded"
            >
              Cancel
            </button>
          </template>
        </td>

      </tr>
    </tbody>
  </table>

</div>
</template>