<script setup>
/**
 * UiBadge — ป้ายสถานะขนาดเล็ก
 *
 * สถานะของเครื่อง (ใช้งาน/ซ่อม/จำหน่าย) ปีงบ บทบาทผู้ใช้ ฯลฯ ล้วนแสดงด้วยป้ายนี้
 *
 * ป้ายทุกใบมี "จุดสี" นำหน้าได้ เพราะสีอย่างเดียวไม่พอสำหรับคนตาบอดสี —
 * ข้อความในป้ายคือสิ่งที่บอกความหมายจริง สีเป็นแค่ตัวช่วยให้กวาดตาหาเจอเร็วขึ้น
 * (WCAG 1.4.1 ห้ามใช้สีเป็นวิธีเดียวในการสื่อข้อมูล)
 */
import { computed } from "vue";

const props = defineProps({
  tone: { type: String, default: "neutral" },
  size: { type: String, default: "md" },
  /** แสดงจุดสีนำหน้าข้อความ */
  dot: { type: Boolean, default: false },
});

const TONES = {
  neutral: "bg-surface-3 text-ink-soft border-line-soft",
  brand: "bg-brand-soft text-brand-ink border-brand-line",
  accent: "bg-accent-soft text-accent-ink border-accent-line",
  ok: "bg-ok-soft text-ok-ink border-ok-line",
  warn: "bg-warn-soft text-warn-ink border-warn-line",
  danger: "bg-danger-soft text-danger-ink border-danger-line",
  info: "bg-info-soft text-info-ink border-info-line",
  /** ป้ายทึบ ใช้เมื่อต้องเด่นจริงๆ เช่น จำนวนที่ค้างอยู่ */
  solid: "bg-brand text-brand-on border-transparent",
};

const DOTS = {
  neutral: "bg-ink-faint",
  brand: "bg-brand",
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
  solid: "bg-brand-on",
};

const SIZES = {
  sm: "text-2xs px-1.5 py-0.5 gap-1 rounded-xs",
  md: "text-xs px-2 py-0.5 gap-1.5 rounded-sm",
  lg: "text-sm px-2.5 py-1 gap-1.5 rounded-md",
};

const classes = computed(() => [
  "inline-flex items-center border font-medium whitespace-nowrap align-middle",
  TONES[props.tone] ?? TONES.neutral,
  SIZES[props.size] ?? SIZES.md,
]);
</script>

<template>
  <span :class="classes">
    <span
      v-if="dot"
      class="w-1.5 h-1.5 rounded-full shrink-0"
      :class="DOTS[tone] ?? DOTS.neutral"
      aria-hidden="true"
    ></span>
    <slot />
  </span>
</template>
