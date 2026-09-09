<script setup>
import { formatDate } from "../../lib/locale-format";
import { t } from "../../lib/locale";

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
import { errorMessage } from "../../lib/api-error";
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
    label: t("ผู้ดูแลระบบ"),
    tone: "accent",
    hint: t("ทำได้ทุกอย่าง รวมถึงแก้ข้อมูลอ้างอิง สัญญา และจัดการผู้ใช้งาน"),
  },
  {
    value: "staff",
    label: t("เจ้าหน้าที่"),
    tone: "brand",
    hint: t("บันทึกและแก้ไขยอดพิมพ์รายเดือนได้ แต่เข้าเมนูผู้ดูแลระบบไม่ได้"),
  },
  {
    value: "viewer",
    label: t("ดูอย่างเดียว"),
    tone: "neutral",
    hint: t("เปิดดูรายงานและทะเบียนได้ แต่แก้ไขอะไรไม่ได้เลย"),
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
  { key: "username", label: t("ชื่อผู้ใช้") },
  { key: "role", label: t("สิทธิ์การใช้งาน"), value: (u) => roleOf(u.role)?.label ?? u.role },
  {
    key: "created_at",
    label: t("สร้างเมื่อ"),
    value: (u) => (u.created_at ? formatDate(u.created_at) : "—"),
  },
  { key: "id", label: t("รหัส"), align: "right", width: "6rem" },
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
    loadError.value = t("โหลดรายชื่อผู้ใช้งานไม่สำเร็จ");
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

  if (!username.trim()) return t("กรอกชื่อผู้ใช้ก่อน");
  if (!isEditing.value && (!password || password.length < 6)) {
    return t("ตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร");
  }
  if (password && password.length < 6) return t("รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร");
  if (!role) return t("เลือกสิทธิ์การใช้งานก่อน");
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
      toastSuccess(t("บันทึกการแก้ไขเรียบร้อย"));
    } else {
      await api.post("/users", { ...form.value, username: form.value.username.trim() });
      toastSuccess(t("เพิ่มผู้ใช้งานเรียบร้อย"));
    }

    dialogOpen.value = false;
    await load();
  } catch (err) {
    console.error(err);
    formError.value = errorMessage(err, t("บันทึกข้อมูลไม่สำเร็จ"));
  } finally {
    saving.value = false;
  }
}

async function remove(user) {
  if (isSelf(user)) {
    toastError(t("ลบบัญชีของตัวเองไม่ได้ ให้ผู้ดูแลระบบคนอื่นเป็นคนลบให้"));
    return;
  }

  const confirmed = await askConfirm(
    t("บัญชี “{0}” จะเข้าระบบไม่ได้อีก และประวัติการบันทึกที่ทำไว้จะยังคงอยู่", [user.username]),
    { title: t("ลบผู้ใช้งานนี้"), confirmText: t("ลบผู้ใช้งาน"), danger: true }
  );
  if (!confirmed) return;

  try {
    await api.delete(`/users/${user.id}`);
    toastSuccess(t("ลบผู้ใช้งานเรียบร้อย"));
    await load();
  } catch (err) {
    console.error(err);
    toastError(errorMessage(err, t("ลบผู้ใช้งานไม่สำเร็จ")));
  }
}

onMounted(load);
</script>

<template>
  <div>
    <UiPageHeader
      :eyebrow="t(&quot;ผู้ดูแลระบบ · บัญชีผู้ใช้&quot;)"
      :title="t(&quot;จัดการผู้ใช้งานระบบ&quot;)"
      :description="t(&quot;เพิ่ม แก้ไข และกำหนดสิทธิ์ของผู้ที่เข้าใช้งานระบบ&quot;)"
    >
      <template #actions>
        <UiButton variant="primary" @click="openCreate">
          <template #icon><UserPlus :size="16" /></template> {{ t("เพิ่มผู้ใช้งาน") }} </UiButton>
      </template>
    </UiPageHeader>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="load"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <UiDataTable
      :rows="users"
      :columns="columns"
      :loading="loading"
      row-key="id"
      export-filename="users"
      :search-placeholder="t(&quot;ค้นหาชื่อผู้ใช้…&quot;)"
      :empty-text="t(&quot;ยังไม่มีผู้ใช้งานในระบบ&quot;)"
    >
      <template #cell-username="{ row }">
        <span class="flex items-center gap-2">
          <span class="font-medium text-ink">{{ row.username }}</span>
          <UiBadge v-if="isSelf(row)" size="sm" tone="brand"> {{ t("บัญชีของคุณ") }} </UiBadge>
        </span>
      </template>

      <template #cell-role="{ row }">
        <UiBadge :tone="roleOf(row.role)?.tone ?? 'neutral'" dot>
          {{ roleOf(row.role)?.label ?? row.role }}
        </UiBadge>
      </template>

      <template #actions="{ row }">
        <UiTooltip :content="t(&quot;แก้ไขบัญชีและสิทธิ์&quot;)">
          <UiButton size="sm" variant="ghost" icon-only :label="t(&quot;แก้ไข {0}&quot;, [row.username])" @click="openEdit(row)">
            <Pencil :size="15" />
          </UiButton>
        </UiTooltip>

        <UiTooltip :content="isSelf(row) ? t(&quot;ลบบัญชีของตัวเองไม่ได้&quot;) : t(&quot;ลบผู้ใช้งาน&quot;)">
          <UiButton
            size="sm"
            variant="danger-ghost"
            icon-only
            :label="t(&quot;ลบ {0}&quot;, [row.username])"
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
      :title="isEditing ? t(&quot;แก้ไขผู้ใช้งาน&quot;) : t(&quot;เพิ่มผู้ใช้งาน&quot;)"
      :description="isEditing ? t(&quot;เว้นช่องรหัสผ่านว่างไว้ถ้าไม่ต้องการเปลี่ยน&quot;) : ''"
      size="sm"
    >
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <UiField :label="t(&quot;ชื่อผู้ใช้&quot;)" required>
          <UiInput v-model="form.username" autocomplete="off" :placeholder="t(&quot;เช่น somchai.it&quot;)" />
        </UiField>

        <UiField
          :label="isEditing ? t(&quot;รหัสผ่านใหม่&quot;) : t(&quot;รหัสผ่าน&quot;)"
          :required="!isEditing"
          :hint="isEditing ? t(&quot;เว้นว่างไว้ = ใช้รหัสผ่านเดิมต่อ&quot;) : t(&quot;อย่างน้อย 6 ตัวอักษร&quot;)"
        >
          <UiInput v-model="form.password" type="password" autocomplete="new-password">
            <template #icon><KeyRound :size="15" /></template>
          </UiInput>
        </UiField>

        <UiField :label="t(&quot;สิทธิ์การใช้งาน&quot;)" required :hint="selectedRoleHint">
          <UiSelect v-model="form.role" :options="ROLES" value-key="value" label-key="label" />
        </UiField>

        <UiAlert v-if="formError" tone="danger">{{ formError }}</UiAlert>

        <button type="submit" class="hidden" tabindex="-1" aria-hidden="true"></button>
      </form>

      <template #footer>
        <UiButton variant="secondary" :disabled="saving" @click="dialogOpen = false"> {{ t("ยกเลิก") }} </UiButton>
        <UiButton variant="primary" :loading="saving" @click="submit">
          {{ isEditing ? t("บันทึกการแก้ไข") : t("เพิ่มผู้ใช้งาน") }}
        </UiButton>
      </template>
    </UiModal>
  </div>
</template>
