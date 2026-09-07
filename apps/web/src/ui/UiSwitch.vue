<script setup>
/**
 * UiSwitch — สวิตช์เปิด/ปิดที่มีผลทันทีเมื่อกด
 *
 * ใช้เมื่อการกดมีผลเดี๋ยวนั้น (เปิดโหมดหนาแน่น, ซ่อนเครื่องที่จำหน่ายแล้ว)
 * ถ้าเป็นค่าที่ต้องกด "บันทึก" ก่อนถึงจะมีผล ให้ใช้ UiCheckbox แทน — คนคาดหวัง
 * ต่างกันจากรูปร่างของตัวควบคุม
 */
import { SwitchRoot, SwitchThumb } from "reka-ui";

defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: "" },
  description: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
});

defineEmits(["update:modelValue"]);
</script>

<template>
  <label class="flex items-start gap-3 cursor-pointer select-none" :class="disabled && 'opacity-50 cursor-not-allowed'">
    <SwitchRoot
      :model-value="modelValue"
      :disabled="disabled"
      class="relative shrink-0 mt-0.5 w-9 h-5 rounded-full border border-transparent
             bg-line transition-colors duration-200 ease-out-quart
             data-[state=checked]:bg-brand
             disabled:pointer-events-none"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <SwitchThumb
        class="block w-4 h-4 rounded-full bg-surface shadow-e1
               transition-transform duration-200 ease-out-quart translate-x-0.5
               data-[state=checked]:translate-x-[1.125rem]"
      />
    </SwitchRoot>

    <span v-if="label || description" class="min-w-0">
      <span v-if="label" class="block text-sm text-ink-soft leading-snug">{{ label }}</span>
      <span v-if="description" class="block text-xs text-ink-mute mt-0.5">{{ description }}</span>
    </span>
  </label>
</template>
