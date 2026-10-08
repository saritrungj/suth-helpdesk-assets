<script setup>
import { ChevronDown, Download, FileSpreadsheet, Table2 } from "lucide-vue-next";
import { t } from "../lib/locale";
import { UiButton, UiMenu, UiMenuItem } from "../ui";
import { computed, useId } from "vue";

/**
 * ExportMenu — ปุ่มส่งออกปุ่มเดียวของทั้งระบบรายงาน
 *
 * บนหน้าจอมีคำว่า "ส่งออก" คำเดียว แล้วค่อยเลือกรูปแบบตอนกด — เดิมหน้าภาพรวมมีปุ่ม
 * "ส่งออก Excel" (พร้อมเมนู "ข้อมูลดิบอย่างเดียว" ซึ่งก็เป็น .xlsx) และปุ่ม "ส่งออก CSV"
 * อีกปุ่มแยกกัน รวมเป็นสามทางออกในสองปุ่มที่เนื้อในซ้ำกันสองอัน คนต้องเดาว่าอันไหน
 * มีกราฟและอันไหนเอาไปคำนวณต่อได้
 *
 * เหลือสองอย่างที่ต่างกันจริง และเขียนบอกไว้ในเมนูว่าต่างกันอย่างไร
 *
 *   Excel  รายงานหลายแผ่น — สรุป รายเดือน เปรียบเทียบ อันดับ รายละเอียด เงื่อนไข
 *   CSV    ตารางแบนแผ่นเดียวของแถวรายเครื่องรายเดือน สำหรับเอาไปคำนวณต่อ
 *
 * ทั้งสองแบบใช้ตัวกรองชุดเดียวกับที่เห็นบนหน้าจอเสมอ
 */
const props = defineProps({
  /** ยังส่งออกไม่ได้ พร้อมเหตุผลที่อ่านออก (ไม่ใช่ปุ่มจางๆ ที่ไม่บอกอะไร) */
  disabled: { type: Boolean, default: false },
  reason: { type: String, default: "" },
  busy: { type: Boolean, default: false },
  scope: { type: String, default: "" },
});
const descriptionId = useId();
const message = computed(() => props.busy ? t("กำลังสร้างไฟล์ส่งออก") : props.disabled ? props.reason : "");
const described = computed(() => Boolean(message.value || props.scope));
const emit = defineEmits(["excel", "csv"]);
</script>

<template>
  <div class="flex flex-col items-start gap-1 min-w-0 max-w-xs">
  <UiMenu :label="t('รูปแบบไฟล์')">
    <template #trigger>
      <UiButton variant="primary" :disabled="disabled || busy" :loading="busy" :aria-describedby="described ? descriptionId : undefined">
        <template #icon><Download :size="16" /></template>
        {{ t("ส่งออก") }}
        <template #trailing><ChevronDown :size="15" /></template>
      </UiButton>
    </template>

    <UiMenuItem @select="emit('excel')">
      <template #icon><FileSpreadsheet :size="15" /></template>
      {{ t("Excel — รายงานหลายแผ่น") }}
    </UiMenuItem>
    <UiMenuItem @select="emit('csv')">
      <template #icon><Table2 :size="15" /></template>
      {{ t("CSV — ข้อมูลรายละเอียด") }}
    </UiMenuItem>
  </UiMenu>
    <p v-if="described" :id="descriptionId" :tabindex="disabled || busy ? 0 : undefined" class="text-xs text-ink-soft break-words max-w-full" aria-live="polite">
      <span v-if="message" class="block font-medium">{{ message }}</span>
      <span v-if="scope">{{ t("ขอบเขตไฟล์: {0}", [scope]) }}</span>
    </p>
  </div>
</template>
