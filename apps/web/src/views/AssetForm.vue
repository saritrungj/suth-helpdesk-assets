<script setup>
import { t } from "../lib/locale";

/**
 * AssetForm — หน้าต่างแก้ไข/เพิ่มเครื่องหนึ่งเครื่อง
 *
 * เป็นแค่เปลือกหน้าต่างที่ครอบ DeviceFormFields ไว้ ตัวช่องกรอกและการบันทึกอยู่
 * ในนั้นทั้งหมด เพื่อให้หน้า "เพิ่มเครื่อง" แบบเต็มหน้าจอใช้ฟอร์มชุดเดียวกันได้
 *
 * เดิมไฟล์นี้ยาว 676 บรรทัดเพราะรวมทั้งฟอร์ม การนำเข้าไฟล์ และเปลือก modal ที่
 * เขียนเอง ไว้ด้วยกัน — การนำเข้าไฟล์ย้ายไป DeviceImportPanel แล้ว เพราะเป็นคนละ
 * งานกับการกรอกทีละเครื่อง แค่บังเอิญเคยอยู่ในหน้าต่างเดียวกัน
 */
import { computed, ref, useTemplateRef } from "vue";
import { useAssetDraftGuard } from "./use-asset-draft-guard";
import DeviceFormFields from "../components/DeviceFormFields.vue";
import { UiButton, UiDrawer } from "../ui";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  assetId: { type: [Number, String, null], default: null },
});

const emit = defineEmits(["update:modelValue", "saved"]);

const fields = useTemplateRef("fields");
const busy = ref(false);
const dirty = ref(false);
const pending = computed(() => busy.value || Boolean(fields.value?.saving));
const mayLeave = useAssetDraftGuard({
  open: () => props.modelValue,
  dirty: () => dirty.value,
  pending: () => pending.value,
  discard: () => { dirty.value = false; },
});
async function requestClose() {
  if (await mayLeave()) emit("update:modelValue", false);
}
function saved() {
  dirty.value = false;
  emit("saved");
  emit("update:modelValue", false);
}

async function save() {
  if (pending.value) return;
  busy.value = true;
  try {
    await fields.value?.submit();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UiDrawer
    :open="modelValue"
    :title="assetId ? t(&quot;แก้ไขข้อมูลเครื่อง&quot;) : t(&quot;เพิ่มเครื่องเข้าทะเบียน&quot;)"
    :description="t(&quot;ช่องที่มีเครื่องหมาย * ต้องกรอก ช่องอื่นเว้นไว้แล้วมาเติมทีหลังได้&quot;)"
    size="lg"
    :pending="pending"
    @update:open="requestClose"
  >
    <DeviceFormFields v-if="modelValue" :key="assetId" ref="fields" grouped :asset-id="assetId" @dirty="dirty = $event" @saved="saved" />

    <template #footer>
      <UiButton variant="secondary" :disabled="pending" @click="requestClose"> {{ t("ยกเลิก") }} </UiButton>
      <UiButton variant="primary" :loading="pending" :disabled="!fields?.ready" @click="save">
        {{ assetId ? t("บันทึกการแก้ไข") : t("เพิ่มเครื่อง") }}
      </UiButton>
    </template>
  </UiDrawer>
</template>
