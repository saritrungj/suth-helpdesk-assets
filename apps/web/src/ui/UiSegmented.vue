<script setup>
/**
 * UiSegmented — ปุ่มเลือกหนึ่งจากไม่กี่ตัวเลือก วางเรียงติดกันในราง
 *
 * ใช้แทน dropdown เมื่อมีตัวเลือก 2–4 ตัวและผู้ใช้ต้องสลับบ่อย (มุมมองรายเดือน/
 * รายปี, ทุกสถานะ/เฉพาะที่ใช้งาน) ข้อดีคือเห็นทุกตัวเลือกพร้อมกันโดยไม่ต้องกด
 * เปิดก่อน จึงประหยัดไปหนึ่งคลิกทุกครั้งที่สลับ
 *
 * ตัวบ่งชี้ตัวที่เลือกเป็นแผ่นสีที่ "เลื่อน" ไปตำแหน่งใหม่ ไม่ใช่กระพริบเปลี่ยน
 * — การเคลื่อนที่บอกสายตาว่าของสองอันนี้เป็นชุดเดียวกันและเพิ่งสลับกัน
 *
 * ใช้ role="radiogroup" ไม่ใช่ tablist เพราะนี่คือการ "เลือกค่า" ไม่ใช่การสลับ
 * แผงเนื้อหา (ถ้าเป็นอย่างหลังให้ใช้ UiTabs)
 */
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  /** [{ value, label, icon?, count? }] */
  options: { type: Array, required: true },
  size: { type: String, default: "md" },
  label: { type: String, default: "ตัวเลือก" },
  block: { type: Boolean, default: false },
});

defineEmits(["update:modelValue"]);

const sizing = computed(() =>
  props.size === "sm" ? "text-xs h-7 px-2.5 gap-1.5" : "text-sm h-8 px-3 gap-1.5"
);
</script>

<template>
  <div
    class="inline-flex items-center p-0.5 rounded-lg bg-surface-2 border border-line-soft"
    :class="block && 'flex w-full'"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      class="relative inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-200 ease-out-quart"
      :class="[
        sizing,
        block && 'flex-1',
        modelValue === option.value
          ? 'bg-surface text-ink shadow-e1'
          : 'text-ink-mute hover:text-ink',
      ]"
      @click="$emit('update:modelValue', option.value)"
    >
      <component v-if="option.icon" :is="option.icon" :size="14" aria-hidden="true" />
      {{ option.label }}
      <span
        v-if="option.count !== undefined"
        class="numeral text-2xs px-1 rounded-xs"
        :class="modelValue === option.value ? 'bg-brand-soft text-brand-ink' : 'bg-surface-3 text-ink-mute'"
      >
        {{ option.count }}
      </span>
    </button>
  </div>
</template>
