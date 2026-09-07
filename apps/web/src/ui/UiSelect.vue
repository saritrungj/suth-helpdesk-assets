<script setup>
/**
 * UiSelect — ช่องเลือกจากรายการ ใช้ <select> ของเบราว์เซอร์จริง
 *
 * ตั้งใจไม่ทำ dropdown เองสำหรับกรณีทั่วไป เพราะ <select> ของระบบปฏิบัติการ
 * ทำสิ่งที่ทำเองได้ยากมากให้ฟรี: พิมพ์ตัวอักษรแรกเพื่อกระโดด, เลื่อนด้วยลูกศร,
 * แสดงเป็นวงล้อเต็มจอบนมือถือ และทำงานได้แม้ JavaScript พัง
 *
 * ถ้ารายการยาวเกินกว่าจะกวาดตาหา (เช่น รายชื่อแผนกหลายร้อยรายการ) ให้ใช้
 * UiCombobox ที่พิมพ์ค้นหาได้แทน — ไม่ใช่ยัดทุกอย่างลง select
 *
 * options รับได้สองแบบ: อาเรย์ของ string หรืออาเรย์ของ object โดยระบุ
 * valueKey/labelKey ได้ เพื่อไม่ต้อง map ข้อมูลจาก API ใหม่ทุกที่ที่ใช้
 */
import { computed } from "vue";
import { useField } from "./field-context";

const props = defineProps({
  modelValue: { type: [String, Number, null], default: "" },
  options: { type: Array, default: () => [] },
  valueKey: { type: String, default: "id" },
  labelKey: { type: String, default: "name" },
  /** ตัวเลือกแรกที่เป็นค่าว่าง เช่น "ทุกอาคาร" — ไม่ใส่ = ไม่มีตัวเลือกว่าง */
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  size: { type: String, default: "md" },
});

defineEmits(["update:modelValue"]);

const field = useField();

const items = computed(() =>
  props.options.map((option) =>
    option !== null && typeof option === "object"
      ? { value: option[props.valueKey], label: String(option[props.labelKey] ?? "") }
      : { value: option, label: String(option) }
  )
);
</script>

<template>
  <select
    :id="field.id"
    :value="modelValue"
    :disabled="disabled"
    :required="field.required || undefined"
    :aria-invalid="field.invalid ? 'true' : undefined"
    :aria-describedby="field.describedBy"
    class="field field-select"
    :class="size === 'sm' && 'min-h-8 py-1 text-sm'"
    @change="$emit('update:modelValue', $event.target.value)"
  >
    <option v-if="placeholder" value="">{{ placeholder }}</option>
    <slot>
      <option v-for="item in items" :key="item.value" :value="item.value">
        {{ item.label }}
      </option>
    </slot>
  </select>
</template>
