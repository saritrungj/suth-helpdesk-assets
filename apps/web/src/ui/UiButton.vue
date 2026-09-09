<script setup>
import { t } from "../lib/locale";

/**
 * UiButton — ปุ่มเดียวของทั้งระบบ
 *
 * ทุกปุ่มในแอปต้องมาจากที่นี่ ไม่ใช่ <button class="..."> ที่เขียนสไตล์เอง เพราะ
 * ปุ่มคือจุดที่ผู้ใช้ตัดสินใจ ถ้าปุ่มลบในหน้าหนึ่งกับอีกหน้าหนึ่งหน้าตาไม่เหมือนกัน
 * คนจะลังเลทุกครั้ง — และความลังเลในระบบที่ใช้ทุกวันคือต้นทุนที่จ่ายซ้ำไม่รู้จบ
 *
 * ลำดับความสำคัญของ variant (หนึ่งหน้าจอควรมีปุ่ม primary ได้ปุ่มเดียว)
 *   primary    การกระทำหลักของหน้า/ของกล่อง — บันทึก, ยืนยัน, ค้นหา
 *   secondary  การกระทำรองที่ยังใช้บ่อย — ยกเลิก, ย้อนกลับ, export
 *   ghost      การกระทำในตาราง/แถบเครื่องมือ ที่ไม่ควรแย่งสายตาจากข้อมูล
 *   soft       เน้นด้วยสีแบรนด์แบบเบา ใช้กับ toggle หรือ filter ที่ถูกเลือกอยู่
 *   danger     การกระทำที่ย้อนกลับไม่ได้ — ลบ
 *
 * ปุ่มไอคอนล้วน (ไม่มีข้อความ) ต้องส่ง label เสมอ ไม่งั้นคนที่ใช้โปรแกรมอ่าน
 * หน้าจอจะได้ยินแค่คำว่า "ปุ่ม" — component จะเตือนใน console ตอน dev ถ้าลืม
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import UiSpinner from "./UiSpinner.vue";

const props = defineProps({
  variant: { type: String, default: "secondary" },
  size: { type: String, default: "md" },
  /** เป็นปุ่มไอคอนล้วนแบบจัตุรัส — ต้องมี label คู่กันเสมอ */
  iconOnly: { type: Boolean, default: false },
  /** ข้อความสำหรับโปรแกรมอ่านหน้าจอ ใช้เป็น title ของ tooltip ระบบด้วย */
  label: { type: String, default: "" },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  /** ยืดเต็มความกว้างของกล่องแม่ */
  block: { type: Boolean, default: false },
  /** ถ้าใส่ จะ render เป็น <RouterLink> แทน <button> */
  to: { type: [String, Object], default: null },
  /** ถ้าใส่ จะ render เป็น <a> ออกนอกระบบ */
  href: { type: String, default: "" },
  type: { type: String, default: "button" },
});

if (import.meta.env.DEV && props.iconOnly && !props.label) {
  console.warn(t("[UiButton] ปุ่มไอคอนล้วนต้องมี prop label เพื่อให้โปรแกรมอ่านหน้าจออ่านออก"));
}

const tag = computed(() => {
  if (props.to) return RouterLink;
  if (props.href) return "a";
  return "button";
});

const VARIANTS = {
  primary:
    "bg-brand text-brand-on border-transparent hover:bg-brand-hover active:bg-brand-active shadow-e1",
  secondary:
    "bg-surface text-ink-soft border-line hover:bg-surface-2 hover:border-line-strong active:bg-surface-3",
  ghost:
    "bg-transparent text-ink-mute border-transparent hover:bg-surface-3 hover:text-ink active:bg-surface-3",
  soft: "bg-brand-soft text-brand-ink border-transparent hover:bg-brand-soft-hover",
  danger:
    "bg-danger text-danger-on border-transparent hover:bg-danger-hover active:bg-danger-hover shadow-e1",
  "danger-ghost":
    "bg-transparent text-danger-ink border-transparent hover:bg-danger-soft active:bg-danger-soft",
};

const SIZES = {
  xs: "h-7 text-xs gap-1.5 rounded-sm",
  sm: "h-8 text-sm gap-1.5 rounded-md",
  md: "h-[var(--field-h)] text-base gap-2 rounded-md",
  lg: "h-11 text-md gap-2 rounded-lg",
};

const PADDING = {
  xs: "px-2",
  sm: "px-2.5",
  md: "px-3.5",
  lg: "px-5",
};

const SQUARE = {
  xs: "w-7",
  sm: "w-8",
  md: "w-[var(--field-h)]",
  lg: "w-11",
};

const classes = computed(() => [
  "relative inline-flex items-center justify-center shrink-0 border font-medium select-none",
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-quart",
  "active:translate-y-px",
  "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
  VARIANTS[props.variant] ?? VARIANTS.secondary,
  SIZES[props.size] ?? SIZES.md,
  props.iconOnly ? SQUARE[props.size] ?? SQUARE.md : PADDING[props.size] ?? PADDING.md,
  props.block && "w-full",
  props.loading && "cursor-progress",
]);

const isInert = computed(() => props.disabled || props.loading);
</script>

<template>
  <component
    :is="tag"
    :to="to || undefined"
    :href="href || undefined"
    :type="tag === 'button' ? type : undefined"
    :disabled="tag === 'button' ? isInert : undefined"
    :aria-disabled="tag !== 'button' && isInert ? 'true' : undefined"
    :aria-busy="loading ? 'true' : undefined"
    :aria-label="iconOnly ? label : undefined"
    :title="label || undefined"
    :class="classes"
  >
    <!-- ตอนกำลังโหลด เนื้อในถูกซ่อนด้วย opacity ไม่ใช่ v-if เพื่อให้ปุ่มไม่หดขนาด
         แล้วทำให้ปุ่มข้างๆ ขยับตำแหน่งขณะที่ผู้ใช้ยังจ่อเมาส์อยู่ -->
    <span
      v-if="loading"
      class="absolute inset-0 grid place-items-center"
      aria-hidden="true"
    >
      <UiSpinner :size="size === 'lg' ? 18 : 15" />
    </span>

    <span
      class="inline-flex items-center justify-center gap-[inherit] whitespace-nowrap"
      :class="loading && 'opacity-0'"
    >
      <slot name="icon" />
      <slot />
      <slot name="trailing" />
    </span>
  </component>
</template>
