<script setup>
import { ChevronDown, FileSpreadsheet, Table2 } from "lucide-vue-next";
import { t } from "../lib/locale";
import { UiButton, UiMenu, UiMenuItem } from "../ui";

/**
 * ExportExcelButton — ปุ่มส่งออกของรายงานเปรียบเทียบ ใช้ร่วมกันหน้าภาพรวมและหน้าเปรียบเทียบ
 *
 * ปุ่มหลักได้ไฟล์เดียวที่ใช้ต่อได้ทันที (กราฟ + ตาราง + ข้อมูลรายละเอียด + เงื่อนไข)
 * ส่วน "ข้อมูลดิบอย่างเดียว" เป็นทางเลือกรองในเมนูข้างๆ สำหรับคนที่จะวิเคราะห์เอง
 * — เดิมสองอย่างนี้เป็นสองรายการเท่ากันในเมนู แล้วคนต้องเดาว่าไฟล์ไหนมีกราฟ
 */
defineProps({
  disabled: { type: Boolean, default: false },
  rawDisabled: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  /** เหตุผลที่ปุ่มหลักกดไม่ได้ — เป็นคำอธิบายของปุ่มให้โปรแกรมอ่านหน้าจอด้วย */
  reason: { type: String, default: "" },
});
const emit = defineEmits(["report", "raw"]);
</script>

<template>
  <div class="inline-flex items-stretch" role="group" :aria-label="t('ส่งออก Excel')">
    <UiButton
      variant="primary"
      class="rounded-r-none"
      :disabled="disabled || busy"
      :loading="busy"
      :title="disabled && reason ? reason : undefined"
      @click="emit('report')"
    >
      <template #icon><FileSpreadsheet :size="16" /></template>
      {{ t("ส่งออก Excel") }}
    </UiButton>
    <UiMenu :label="t('ตัวเลือกการส่งออกอื่น')">
      <template #trigger>
        <UiButton variant="primary" icon-only class="rounded-l-none border-l border-l-brand-hover" :label="t('ตัวเลือกการส่งออกอื่น')" :disabled="busy">
          <ChevronDown :size="16" />
        </UiButton>
      </template>
      <UiMenuItem :disabled="rawDisabled" @select="emit('raw')">
        <template #icon><Table2 :size="15" /></template>{{ t("ข้อมูลดิบอย่างเดียว") }}
      </UiMenuItem>
    </UiMenu>
  </div>
</template>
