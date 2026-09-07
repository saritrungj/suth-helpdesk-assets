<script setup>
/**
 * UiCheckbox — ช่องติ๊กเลือก
 *
 * ใช้ <input type="checkbox"> จริงแล้วซ่อนไว้ใต้กล่องที่วาดเอง เพื่อให้ได้
 * พฤติกรรมของเบราว์เซอร์ครบ (Space เพื่อติ๊ก, อยู่ในลำดับ Tab, ส่งค่าไปกับ form
 * ตอน submit) แต่ยังคุมหน้าตาได้ตามธีม
 *
 * indeterminate ใช้กับหัวตารางที่เลือกบางแถว — สื่อว่า "เลือกบางส่วน" ซึ่ง
 * ต่างจากติ๊กครบและไม่ติ๊กเลย
 */
import { computed, useId } from "vue";
import { Check, Minus } from "lucide-vue-next";

const props = defineProps({
  modelValue: { type: [Boolean, Array], default: false },
  /** ค่าที่จะใส่/ถอดออกจาก array เมื่อ modelValue เป็น array */
  value: { type: [String, Number], default: undefined },
  label: { type: String, default: "" },
  description: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  indeterminate: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);

const id = `c-${useId()}`;

const checked = computed(() =>
  Array.isArray(props.modelValue) ? props.modelValue.includes(props.value) : Boolean(props.modelValue)
);

function toggle() {
  if (!Array.isArray(props.modelValue)) {
    emit("update:modelValue", !checked.value);
    return;
  }
  const next = checked.value
    ? props.modelValue.filter((v) => v !== props.value)
    : [...props.modelValue, props.value];
  emit("update:modelValue", next);
}
</script>

<template>
  <div class="flex items-start gap-2.5" :class="disabled && 'opacity-50'">
    <span class="relative grid place-items-center shrink-0 mt-0.5">
      <input
        :id="id"
        type="checkbox"
        class="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        :checked="checked"
        :disabled="disabled"
        :aria-checked="indeterminate ? 'mixed' : checked"
        @change="toggle"
      />
      <span
        class="grid place-items-center w-[1.125rem] h-[1.125rem] rounded-xs border transition-[background-color,border-color] duration-150"
        :class="
          checked || indeterminate
            ? 'bg-brand border-brand text-brand-on'
            : 'bg-surface border-line peer-hover:border-line-strong'
        "
      >
        <Minus v-if="indeterminate" :size="12" stroke-width="3" aria-hidden="true" />
        <Check v-else-if="checked" :size="12" stroke-width="3.2" aria-hidden="true" />
      </span>
    </span>

    <label v-if="label || description" :for="id" class="min-w-0 cursor-pointer select-none">
      <span v-if="label" class="block text-sm text-ink-soft leading-snug">{{ label }}</span>
      <span v-if="description" class="block text-xs text-ink-mute mt-0.5">{{ description }}</span>
    </label>
  </div>
</template>
