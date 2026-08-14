<script setup>
import { ref, onMounted, computed } from "vue"
import api from "../../services/api"
import DataTable from "../../components/DataTable.vue"
import { toastError, toastSuccess } from "../../store/toast"
import { askConfirm } from "../../store/confirmDialog"
import { authState } from "../../store/auth"

const users = ref([])
const loading = ref(false)

const ROLES = [
  { value: "admin", label: "ผู้ดูแลระบบ (Admin)", hint: "จัดการทุกอย่างในระบบ รวมถึงเมนู Admin" },
  { value: "staff", label: "เจ้าหน้าที่ (Staff)", hint: "กรอก/แก้ไขยอดพิมพ์รายเดือนได้ แต่เข้าเมนู Admin ไม่ได้" },
  { value: "viewer", label: "ดูอย่างเดียว (Viewer)", hint: "ดูข้อมูล/รายงานได้เท่านั้น กรอกยอดพิมพ์ไม่ได้" },
]
const roleHint = computed(() => ROLES.find((r) => r.value === form.value.role)?.hint || "")
const roleLabel = (role) => ROLES.find((r) => r.value === role)?.label || role || "-"

const columns = computed(() => [
  { key: "id", label: "ID", align: "right" },
  { key: "username", label: "Username" },
  { key: "role", label: "สิทธิ์การใช้งาน", value: (u) => roleLabel(u.role) },
  {
    key: "created_at",
    label: "สร้างเมื่อ",
    value: (u) => (u.created_at ? new Date(u.created_at).toLocaleDateString("th-TH") : "-"),
  },
])

function isSelf(user) {
  return authState.user?.id === user.id
}

// -------------------------------------------------------
// โหลดข้อมูล
// -------------------------------------------------------
async function load() {
  loading.value = true
  try {
    const res = await api.get("/users")
    users.value = res.data
  } catch (err) {
    console.error(err)
    toastError("โหลดข้อมูลผู้ใช้งานไม่สำเร็จ")
  } finally {
    loading.value = false
  }
}

// -------------------------------------------------------
// Modal เพิ่ม/แก้ไข ผู้ใช้งาน
// -------------------------------------------------------
const showModal = ref(false)
const modalMode = ref("add") // add | edit
const editingId = ref(null)
const form = ref({ username: "", password: "", role: "viewer" })
const formError = ref(null)
const saving = ref(false)

function openAddModal() {
  modalMode.value = "add"
  editingId.value = null
  form.value = { username: "", password: "", role: "viewer" }
  formError.value = null
  showModal.value = true
}

function openEditModal(user) {
  modalMode.value = "edit"
  editingId.value = user.id
  // password เว้นว่างไว้ — กรอกเฉพาะตอนต้องการเปลี่ยนรหัสผ่านใหม่เท่านั้น
  form.value = { username: user.username, password: "", role: user.role }
  formError.value = null
  showModal.value = true
}

function closeModal() {
  if (saving.value) return
  showModal.value = false
}

function validate(values) {
  if (!values.username.trim()) return "กรุณากรอก Username"
  if (modalMode.value === "add" && (!values.password || values.password.length < 6)) {
    return "กรุณากรอกรหัสผ่านอย่างน้อย 6 ตัวอักษร"
  }
  if (values.password && values.password.length < 6) {
    return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"
  }
  if (!values.role) return "กรุณาเลือกสิทธิ์การใช้งาน"
  return null
}

async function submit() {
  const err = validate(form.value)
  if (err) {
    formError.value = err
    return
  }

  saving.value = true
  formError.value = null

  try {
    if (modalMode.value === "add") {
      await api.post("/users", form.value)
      toastSuccess("เพิ่มผู้ใช้งานสำเร็จ")
    } else {
      // ถ้าไม่ได้กรอก password ใหม่ ไม่ต้องส่งไปเลย จะได้ไม่ไปเขียนทับของเดิม
      const payload = { username: form.value.username, role: form.value.role }
      if (form.value.password) payload.password = form.value.password
      await api.put(`/users/${editingId.value}`, payload)
      toastSuccess("บันทึกการแก้ไขสำเร็จ")
    }
    showModal.value = false
    await load()
  } catch (err) {
    console.error(err)
    formError.value = err.response?.data?.error || "บันทึกข้อมูลไม่สำเร็จ"
  } finally {
    saving.value = false
  }
}

// -------------------------------------------------------
// ลบผู้ใช้งาน
// -------------------------------------------------------
async function deleteUser(user) {
  if (isSelf(user)) {
    toastError("ไม่สามารถลบบัญชีของตัวเองได้")
    return
  }

  if (!(await askConfirm(`ต้องการลบผู้ใช้งาน "${user.username}" ใช่หรือไม่?`))) return

  try {
    await api.delete(`/users/${user.id}`)
    toastSuccess("ลบผู้ใช้งานสำเร็จ")
    load()
  } catch (err) {
    console.error(err)
    toastError(err.response?.data?.error || "ลบข้อมูลไม่สำเร็จ")
  }
}

onMounted(load)
</script>

<template>
<div class="p-6">

<div class="flex items-center justify-between mb-6">
  <div>
    <h1 class="text-2xl font-bold">จัดการผู้ใช้งานระบบ</h1>
    <p class="text-sm text-gray-500 mt-1">เพิ่ม / แก้ไข / ลบบัญชีผู้ใช้งาน และกำหนดสิทธิ์การเข้าถึง</p>
  </div>

  <button
    @click="openAddModal"
    class="bg-blue-600 text-white w-10 h-10 rounded-full text-xl leading-none hover:bg-blue-700"
    title="เพิ่มผู้ใช้งาน"
  >
    +
  </button>
</div>

<div v-if="loading" class="text-center text-gray-500 py-6">กำลังโหลดข้อมูล...</div>

<DataTable
  v-else
  :rows="users"
  :columns="columns"
  row-key="id"
  export-filename="users"
  empty-text="ยังไม่มีผู้ใช้งาน"
>
  <template #cell-role="{ row, value }">
    <span
      class="px-2 py-0.5 rounded text-xs font-medium"
      :class="{
        'bg-purple-100 text-purple-700': row.role === 'admin',
        'bg-blue-100 text-blue-700': row.role === 'staff',
        'bg-gray-100 text-gray-600': row.role === 'viewer',
      }"
    >
      {{ value }}
    </span>
    <span v-if="isSelf(row)" class="ml-1 text-xs text-gray-400">(คุณ)</span>
  </template>

  <template #actions="{ row }">
    <button
      @click="openEditModal(row)"
      title="แก้ไข"
      class="bg-yellow-500 hover:bg-yellow-600 text-white p-1.5 rounded mr-2">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        <path d="M15 5l4 4" />
      </svg>
    </button>

    <button
      @click="deleteUser(row)"
      :disabled="isSelf(row)"
      :title="isSelf(row) ? 'ไม่สามารถลบบัญชีของตัวเองได้' : 'ลบ'"
      class="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
      </svg>
    </button>
  </template>
</DataTable>

<!-- Modal: เพิ่ม/แก้ไข ผู้ใช้งาน -->
<div
  v-if="showModal"
  class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
  @click.self="closeModal"
>
  <div class="bg-gray-50 rounded-lg shadow-xl w-full max-w-sm">
    <div class="p-5 border-b flex items-center justify-between">
      <h2 class="text-lg font-bold">{{ modalMode === "add" ? "เพิ่มผู้ใช้งาน" : "แก้ไขผู้ใช้งาน" }}</h2>
      <button @click="closeModal" class="text-gray-400 hover:text-gray-700 text-xl leading-none">
        &times;
      </button>
    </div>

    <div class="p-5 space-y-3">
      <div>
        <label class="block text-sm text-gray-500 mb-1">Username</label>
        <input
          v-model="form.username"
          type="text"
          placeholder="เช่น somchai.it"
          class="border rounded px-3 py-2 w-full bg-gray-50"
          autofocus
        />
      </div>

      <div>
        <label class="block text-sm text-gray-500 mb-1">
          รหัสผ่าน
          <span v-if="modalMode === 'edit'" class="text-gray-400">(เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน)</span>
        </label>
        <input
          v-model="form.password"
          @keyup.enter="submit"
          type="password"
          placeholder="อย่างน้อย 6 ตัวอักษร"
          class="border rounded px-3 py-2 w-full bg-gray-50"
        />
      </div>

      <div>
        <label class="block text-sm text-gray-500 mb-1">สิทธิ์การใช้งาน</label>
        <select v-model="form.role" class="border rounded px-3 py-2 w-full bg-gray-50">
          <option v-for="r in ROLES" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
        <p v-if="roleHint" class="text-xs text-gray-400 mt-1">{{ roleHint }}</p>
      </div>

      <div v-if="formError" class="bg-red-100 text-red-700 p-2 rounded text-sm">
        {{ formError }}
      </div>
    </div>

    <div class="p-5 border-t flex justify-end gap-2">
      <button @click="closeModal" :disabled="saving" class="border px-4 py-2 rounded hover:bg-gray-50">
        ยกเลิก
      </button>
      <button
        @click="submit"
        :disabled="saving"
        class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {{ saving ? "กำลังบันทึก..." : "บันทึก" }}
      </button>
    </div>
  </div>
</div>

</div>
</template>
