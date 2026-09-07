<script setup>
/**
 * UiMenuItem — หนึ่งรายการในเมนูของ UiMenu
 *
 * แยกเป็นไฟล์ของตัวเองเพื่อให้ทุกรายการในทุกเมนูของระบบมีความสูง ระยะขอบ และ
 * ตำแหน่งไอคอนตรงกัน — เมนูที่รายการสูงไม่เท่ากันทำให้เมาส์เลื่อนพลาดง่าย
 */
import { computed } from "vue";
import { DropdownMenuItem, DropdownMenuSeparator } from "reka-ui";

const props = defineProps({
  tone: { type: String, default: "default" },
  disabled: { type: Boolean, default: false },
  /** วางเส้นคั่นเหนือรายการนี้ ใช้แยกกลุ่มการกระทำที่ความเสี่ยงต่างกัน */
  separated: { type: Boolean, default: false },
  /** ข้อความช่วยจำคีย์ลัด แสดงชิดขวา */
  shortcut: { type: String, default: "" },
});

defineEmits(["select"]);

const classes = computed(() => [
  "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm cursor-pointer select-none outline-none",
  "transition-colors duration-100",
  "data-[disabled]:opacity-45 data-[disabled]:pointer-events-none",
  props.tone === "danger"
    ? "text-danger-ink data-[highlighted]:bg-danger-soft"
    : "text-ink-soft data-[highlighted]:bg-surface-3 data-[highlighted]:text-ink",
]);
</script>

<template>
  <DropdownMenuSeparator v-if="separated" class="my-1 h-px bg-line-soft" />

  <DropdownMenuItem :disabled="disabled" :class="classes" @select="$emit('select', $event)">
    <slot name="icon" />
    <span class="flex-1 truncate text-left"><slot /></span>
    <kbd
      v-if="shortcut"
      class="shrink-0 font-mono text-2xs text-ink-mute px-1.5 py-0.5 rounded-xs bg-surface-2 border border-line-soft"
    >
      {{ shortcut }}
    </kbd>
  </DropdownMenuItem>
</template>
