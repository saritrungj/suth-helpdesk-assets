<script setup>
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
import { ref, useTemplateRef, watch } from "vue";
import DeviceFormFields from "../components/DeviceFormFields.vue";
import { UiButton, UiModal } from "../ui";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  assetId: { type: [Number, String, null], default: null },
});

const emit = defineEmits(["update:modelValue", "saved"]);

const fields = useTemplateRef("fields");
const busy = ref(false);

watch(
  () => [props.modelValue, props.assetId],
  ([open]) => {
    if (open) fields.value?.reset();
  }
);

async function save() {
  busy.value = true;
  const ok = await fields.value?.submit();
  busy.value = false;

  if (ok) {
    emit("saved");
    emit("update:modelValue", false);
  }
}
</script>

<template>
  <UiModal
    :open="modelValue"
    :title="assetId ? 'แก้ไขข้อมูลเครื่อง' : 'เพิ่มเครื่องเข้าทะเบียน'"
    description="ช่องที่มีเครื่องหมาย * ต้องกรอก ช่องอื่นเว้นไว้แล้วมาเติมทีหลังได้"
    size="lg"
    @update:open="emit('update:modelValue', $event)"
  >
    <DeviceFormFields ref="fields" :asset-id="assetId" />

    <template #footer>
      <UiButton variant="secondary" :disabled="busy" @click="emit('update:modelValue', false)">
        ยกเลิก
      </UiButton>
      <UiButton variant="primary" :loading="busy" @click="save">
        {{ assetId ? "บันทึกการแก้ไข" : "เพิ่มเครื่อง" }}
      </UiButton>
    </template>
  </UiModal>
</template>
