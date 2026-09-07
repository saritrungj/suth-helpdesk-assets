<script setup>
/**
 * Users — จัดการบัญชีผู้ใช้งานและสิทธิ์
 *
 * ไม่ได้ใช้ MasterDataPage เหมือนหน้าข้อมูลอ้างอิงอื่น เพราะมีกฎเฉพาะสามข้อที่
 * เป็นเรื่องความปลอดภัย ไม่ใช่แค่รูปแบบฟอร์ม
 *
 *   1. รหัสผ่านตอน "แก้ไข" เว้นว่างได้ = ไม่เปลี่ยน — ถ้าส่งค่าว่างไปด้วยจะกลาย
 *      เป็นเขียนทับรหัสผ่านเดิมด้วยค่าว่าง
 *   2. ห้ามลบบัญชีของตัวเอง — ผู้ดูแลคนสุดท้ายที่ลบตัวเองแล้วจะไม่มีใครเข้าไป
 *      แก้อะไรได้อีกเลย
 *   3. อธิบายสิทธิ์แต่ละระดับด้วยประโยคที่บอก "ทำอะไรได้" ไม่ใช่ชื่อ role เปล่าๆ
 *      คนที่ตั้งสิทธิ์ให้คนอื่นต้องเห็นผลของสิ่งที่กำลังเลือกก่อนกดบันทึก
 */
import { computed, onMounted, ref } from "vue";
import { KeyRound, Pencil, Trash2, UserPlus } from "lucide-vue-next";
import api from "../../services/api";
import { authState } from "../../store/auth";
import { askConfirm } from "../../store/confirmDialog";
import { toastError, toastSuccess } from "../../store/toast";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiDataTable,
  UiField,
  UiInput,
  UiModal,
  UiPageHeader,
  UiSelect,
  UiTooltip,
} from "../../ui";

const ROLES = [
  {
    value: "admin",
    label: "ผู้ดูแลระบบ",
    tone: "accent",
    hint: "ทำได้ทุกอย่าง รวมถึงแก้ข้อมูลอ้างอิง สัญญา และจัดการผู้ใช้งาน",
  },
  {
    value: "staff",
    label: "เจ้าหน้าที่",
    tone: "brand",
    hint: "บันทึกและแก้ไขยอดพิมพ์รายเดือนได้ แต่เข้าเมนูผู้ดูแลระบบไม่ได้",
  },
  {
    value: "viewer",
    label: "ดูอย่างเดียว",
    tone: "neutral",
    hint: "เปิดดูรายงานและทะเบียนได้ แต่แก้ไขอะไรไม่ได้เลย",
  },
];

const roleOf = (value) => ROLES.find((r) => r.value === value);

const users = ref([]);
const loading = ref(true);
const loadError = ref("");

const dialogOpen = ref(false);
const editingId = ref(null);
const form = ref({ username: "", password: "", role: "viewer" });
const formError = ref("");
const saving = ref(false);

const isEditing = computed(() => editingId.value !== null);
const selectedRoleHint = computed(() => roleOf(form.value.role)?.hint ?? "");

const columns = [
  { key: "username", label: "ชื่อผู้ใช้" },
  { key: "role", label: "สิทธิ์การใช้งาน", value: (u) => roleOf(u.role)?.label ?? u.role },
  {
    key: "created_at",
    label: "สร้างเมื่อ",
    value: (u) => (u.created_at ? new Date(u.created_at).toLocaleDateString("th-TH") : "—"),
  },
  { key: "id", label: "รหัส", align: "right", width: "6rem" },
];

function isSelf(user) {
  return authState.user?.id === user.id;
}

async function load() {
  loading.value = true;
  loadError.value = "";

  try {
    const res = await api.get("/users");
    users.value = res.data ?? [];
  } catch (err) {
    console.error("Load users error:", err);
    loadError.value = "โหลดรายชื่อผู้ใช้งานไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  form.value = { username: "", password: "", role: "viewer" };
  formError.value = "";
  dialogOpen.value = true;
}

function openEdit(user) {
  editingId.value = user.id;
  // เว้นรหัสผ่านว่างไว้เสมอ — กรอกเฉพาะตอนที่ตั้งใจจะเปลี่ยนจริงๆ
  form.value = { username: user.username, password: "", role: user.role };
  formError.value = "";
  dialogOpen.value = true;
}

function validate() {
  const { username, password, role } = form.value;

  if (!username.trim()) return "กรอกชื่อผู้ใช้ก่อน";
  if (!isEditing.value && (!password || password.length < 6)) {
    return "ตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร";
  }
  if (password && password.length < 6) return "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร";
  if (!role) return "เลือกสิทธิ์การใช้งานก่อน";
  return "";
}

async function submit() {
  const problem = validate();
  if (problem) {
    formError.value = problem;
    return;
  }

  saving.value = true;
  formError.value = "";

  try {
    if (isEditing.value) {
      // ไม่ส่ง password ไปเลยถ้าไม่ได้กรอก จะได้ไม่เขียนทับของเดิม
      const body = { username: form.value.username.trim(), role: form.value.role };
      if (form.value.password) body.password = form.value.password;

      await api.put(`/users/${editingId.value}`, body);
      toastSuccess("บันทึกการแก้ไขเรียบร้อย");
    } else {
      await api.post("/users", { ...form.value, username: form.value.username.trim() });
      toastSuccess("เพิ่มผู้ใช้งานเรียบร้อย");
    }

    dialogOpen.value = false;
    await load();
  } catch (err) {
    console.error(err);
    formError.value = err.response?.data?.error || "บันทึกข้อมูลไม่สำเร็จ";
  } finally {
    saving.value = false;
  }
}

async function remove(user) {
  if (isSelf(user)) {
    toastError("ลบบัญชีของตัวเองไม่ได้ ให้ผู้ดูแลระบบคนอื่นเป็นคนลบให้");
    return;
  }

  const confirmed = await askConfirm(
    `บัญชี “${user.username}” จะเข้าระบบไม่ได้อีก และประวัติการบันทึกที่ทำไว้จะยังคงอยู่`,
    { title: "ลบผู้ใช้งานนี้", confirmText: "ลบผู้ใช้งาน", danger: true }
  );
  if (!confirmed) return;

  try {
    await api.delete(`/users/${user.id}`);
    toastSuccess("ลบผู้ใช้งานเรียบร้อย");
    await load();
  } catch (err) {
    console.error(err);
    toastError(err.response?.data?.error || "ลบผู้ใช้งานไม่สำเร็จ");
  }
}

onMounted(load);
</script>

<template>
  <div>
    <UiPageHeader
      eyebrow="ผู้ดูแลระบบ · บัญชีผู้ใช้"
      title="จัดการผู้ใช้งานระบบ"
      description="เพิ่ม แก้ไข และกำหนดสิทธิ์ของผู้ที่เข้าใช้งานระบบ"
    >
      <template #actions>
        <UiButton variant="primary" @click="openCreate">
          <template #icon><UserPlus :size="16" /></template>
          เพิ่มผู้ใช้งาน
        </UiButton>
      </template>
    </UiPageHeader>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="load">ลองใหม่</UiButton>
      </template>
    </UiAlert>

    <UiDataTable
      :rows="users"
      :columns="columns"
      :loading="loading"
      row-key="id"
      export-filename="users"
      search-placeholder="ค้นหาชื่อผู้ใช้…"
      empty-text="ยังไม่มีผู้ใช้งานในระบบ"
    >
      <template #cell-username="{ row }">
        <span class="flex items-center gap-2">
          <span class="font-medium text-ink">{{ row.username }}</span>
          <UiBadge v-if="isSelf(row)" size="sm" tone="brand">บัญชีของคุณ</UiBadge>
        </span>
      </template>

      <template #cell-role="{ row }">
        <UiBadge :tone="roleOf(row.role)?.tone ?? 'neutral'" dot>
          {{ roleOf(row.role)?.label ?? row.role }}
        </UiBadge>
      </template>

      <template #actions="{ row }">
        <UiTooltip content="แก้ไขบัญชีและสิทธิ์">
          <UiButton size="sm" variant="ghost" icon-only :label="`แก้ไข ${row.username}`" @click="openEdit(row)">
            <Pencil :size="15" />
          </UiButton>
        </UiTooltip>

        <UiTooltip :content="isSelf(row) ? 'ลบบัญชีของตัวเองไม่ได้' : 'ลบผู้ใช้งาน'">
          <UiButton
            size="sm"
            variant="danger-ghost"
            icon-only
            :label="`ลบ ${row.username}`"
            :disabled="isSelf(row)"
            @click="remove(row)"
          >
            <Trash2 :size="15" />
          </UiButton>
        </UiTooltip>
      </template>
    </UiDataTable>

    <UiModal
      v-model:open="dialogOpen"
      :title="isEditing ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'"
      :description="isEditing ? 'เว้นช่องรหัสผ่านว่างไว้ถ้าไม่ต้องการเปลี่ยน' : ''"
      size="sm"
    >
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <UiField label="ชื่อผู้ใช้" required>
          <UiInput v-model="form.username" autocomplete="off" placeholder="เช่น somchai.it" />
        </UiField>

        <UiField
          :label="isEditing ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'"
          :required="!isEditing"
          :hint="isEditing ? 'เว้นว่างไว้ = ใช้รหัสผ่านเดิมต่อ' : 'อย่างน้อย 6 ตัวอักษร'"
        >
          <UiInput v-model="form.password" type="password" autocomplete="new-password">
            <template #icon><KeyRound :size="15" /></template>
          </UiInput>
        </UiField>

        <UiField label="สิทธิ์การใช้งาน" required :hint="selectedRoleHint">
          <UiSelect v-model="form.role" :options="ROLES" value-key="value" label-key="label" />
        </UiField>

        <UiAlert v-if="formError" tone="danger">{{ formError }}</UiAlert>

        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true"></button>
      </form>

      <template #footer>
        <UiButton variant="secondary" :disabled="saving" @click="dialogOpen = false">ยกเลิก</UiButton>
        <UiButton variant="primary" :loading="saving" @click="submit">
          {{ isEditing ? "บันทึกการแก้ไข" : "เพิ่มผู้ใช้งาน" }}
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
