<script setup>
/**
 * ChangePasswordDialog — ผู้ใช้เปลี่ยนรหัสผ่านของตัวเองจากเมนูบัญชี
 *
 * เดิมมีแต่ผู้ดูแลตั้งรหัสให้ รหัสที่ผู้ดูแลรู้จึงเป็นรหัสถาวรของทุกคน และผู้ใช้ที่สงสัยว่ารหัสหลุด
 * ทำอะไรเองไม่ได้ ต้องกรอกรหัสปัจจุบันเสมอ — session ที่เปิดค้างบนเครื่องใช้ร่วมกันต้องเปลี่ยนรหัสของ
 * เจ้าของบัญชีไม่ได้ (API เป็นคนบังคับ)
 *
 * เปลี่ยนสำเร็จแล้ว API ออก session ใหม่ให้หน้านี้ทันที ผู้ใช้จึงทำงานต่อได้ ส่วนเครื่องอื่นที่ล็อกอินค้างไว้
 * ต้องล็อกอินใหม่ด้วยรหัสใหม่
 */
import { computed, ref, watch } from "vue";
import { KeyRound } from "lucide-vue-next";
import { PASSWORD_MIN_LENGTH } from "@suth/domain";
import api from "../services/api";
import { errorMessage, fieldErrors } from "../lib/api-error";
import { t } from "../lib/locale";
import { toastSuccess } from "../store/toast";
import { UiAlert, UiButton, UiField, UiInput, UiModal } from "../ui";

const props = defineProps({
  /** v-model:open */
  open: { type: Boolean, default: false },
});
const emit = defineEmits(["update:open"]);

const emptyForm = () => ({ current: "", next: "", confirm: "" });
const form = ref(emptyForm());
const errors = ref({});
const formError = ref("");
const saving = ref(false);

// เปิดใหม่ทุกครั้งเริ่มจากช่องว่าง — รหัสที่พิมพ์ค้างไว้ต้องไม่อยู่ในหน้าหลังปิดหน้าต่าง
watch(
  () => props.open,
  () => {
    form.value = emptyForm();
    errors.value = {};
    formError.value = "";
  }
);

const mismatch = computed(() => form.value.confirm !== "" && form.value.confirm !== form.value.next);

function validate() {
  const problems = {};
  if (!form.value.current) problems.current_password = t("กรอกรหัสผ่านปัจจุบัน");
  if (form.value.next.length < PASSWORD_MIN_LENGTH) problems.new_password = t("รหัสผ่านใหม่ต้องมีอย่างน้อย {0} ตัวอักษร", [PASSWORD_MIN_LENGTH]);
  if (form.value.confirm !== form.value.next) problems.confirm = t("รหัสผ่านใหม่สองช่องไม่ตรงกัน");
  return problems;
}

async function submit() {
  if (saving.value) return;
  formError.value = "";
  errors.value = validate();
  if (Object.keys(errors.value).length) return;

  saving.value = true;
  try {
    await api.put("/auth/password", { current_password: form.value.current, new_password: form.value.next });
    toastSuccess(t("เปลี่ยนรหัสผ่านแล้ว — เครื่องอื่นที่ล็อกอินค้างไว้ต้องเข้าสู่ระบบใหม่"));
    emit("update:open", false);
  } catch (err) {
    errors.value = fieldErrors(err);
    // ข้อผิดพลาดที่ชี้ช่องได้อยู่ใต้ช่องนั้นแล้ว ไม่ต้องขึ้นซ้ำด้านล่าง
    formError.value = Object.keys(errors.value).length ? "" : errorMessage(err, t("เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่"));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UiModal
    :open="open"
    :title="t('เปลี่ยนรหัสผ่านของฉัน')"
    :description="t('เปลี่ยนแล้วใช้รหัสใหม่ในการเข้าสู่ระบบครั้งถัดไป')"
    size="sm"
    :persistent="saving"
    @update:open="emit('update:open', $event)"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <UiField :label="t('รหัสผ่านปัจจุบัน')" required :error="errors.current_password">
        <UiInput v-model="form.current" type="password" autocomplete="current-password">
          <template #icon><KeyRound :size="15" /></template>
        </UiInput>
      </UiField>

      <UiField
        :label="t('รหัสผ่านใหม่')"
        required
        :hint="t('อย่างน้อย 6 ตัวอักษร')"
        :error="errors.new_password"
      >
        <UiInput v-model="form.next" type="password" autocomplete="new-password" />
      </UiField>

      <UiField
        :label="t('ยืนยันรหัสผ่านใหม่')"
        required
        :error="errors.confirm || (mismatch ? t('รหัสผ่านใหม่สองช่องไม่ตรงกัน') : '')"
      >
        <UiInput v-model="form.confirm" type="password" autocomplete="new-password" />
      </UiField>

      <UiAlert v-if="formError" tone="danger">{{ formError }}</UiAlert>

      <button type="submit" class="hidden" tabindex="-1" aria-hidden="true"></button>
    </form>

    <template #footer>
      <UiButton variant="secondary" :disabled="saving" @click="emit('update:open', false)">{{ t("ยกเลิก") }}</UiButton>
      <UiButton variant="primary" :loading="saving" @click="submit">{{ t("บันทึกรหัสผ่านใหม่") }}</UiButton>
    </template>
  </UiModal>
</template>
