<script setup>
/**
 * UiTextarea — ช่องกรอกข้อความหลายบรรทัด (หมายเหตุ, เหตุผลการย้ายเครื่อง)
 *
 * ยืดความสูงตามเนื้อหาอัตโนมัติจนถึงเพดานที่กำหนด เพื่อไม่ให้ผู้ใช้ต้องเลื่อน
 * อ่านข้อความของตัวเองในกล่องสูงสามบรรทัด แต่ก็ไม่ปล่อยให้ยืดจนดันเนื้อหาอื่น
 * ตกจอ
 */
import { nextTick, onMounted, ref, watch } from "vue";
import { useField } from "./field-context";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  rows: { type: Number, default: 3 },
  maxRows: { type: Number, default: 10 },
  /** แสดงตัวนับตัวอักษรมุมขวาล่าง ใช้เมื่อฝั่งเซิร์ฟเวอร์จำกัดความยาวจริง */
  maxlength: { type: Number, default: undefined },
});

const emit = defineEmits(["update:modelValue"]);

const field = useField();
const el = ref(null);

function autosize() {
  const node = el.value;
  if (!node) return;
  node.style.height = "auto";
  const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 22;
  const max = lineHeight * props.maxRows;
  node.style.height = `${Math.min(node.scrollHeight, max)}px`;
  node.style.overflowY = node.scrollHeight > max ? "auto" : "hidden";
}

onMounted(autosize);
watch(() => props.modelValue, () => nextTick(autosize));
</script>

<template>
  <div class="relative">
    <textarea
      ref="el"
      :id="field.id"
      :value="modelValue"
      :rows="rows"
      :placeholder="placeholder || undefined"
      :disabled="disabled"
      :maxlength="maxlength"
      :required="field.required || undefined"
      :aria-invalid="field.invalid ? 'true' : undefined"
      :aria-describedby="field.describedBy"
      class="field resize-none leading-relaxed"
      :class="maxlength && 'pb-6'"
      @input="emit('update:modelValue', $event.target.value); autosize()"
    ></textarea>

    <span
      v-if="maxlength"
      class="absolute bottom-2 right-3 text-2xs text-ink-mute numeral pointer-events-none"
      aria-hidden="true"
    >
      {{ modelValue.length }}/{{ maxlength }}
    </span>
  </div>
</template>
