<script setup>
import { t } from "../lib/locale";

/**
 * UiAlert — กล่องข้อความแจ้งสถานะที่อยู่ติดกับเนื้อหา (ไม่ใช่ toast ที่ลอยแล้วหาย)
 *
 * ใช้กับเรื่องที่ผู้ใช้ต้องเห็นทุกครั้งที่เปิดหน้านั้น เช่น "ยังไม่ได้ตั้งปีงบประมาณ"
 * หรือ "โหลดข้อมูลไม่สำเร็จ" — ต่างจาก toast ที่ใช้กับผลของการกระทำที่เพิ่งทำไป
 *
 * ตัว error มี role="alert" ให้โปรแกรมอ่านหน้าจอประกาศทันทีโดยไม่ต้องรอผู้ใช้
 * เลื่อนไปเจอ ส่วนระดับอื่นใช้ role="status" ซึ่งประกาศแบบไม่ขัดจังหวะ
 */
import { computed } from "vue";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-vue-next";

const props = defineProps({
  tone: { type: String, default: "info" },
  title: { type: String, default: "" },
  /** แสดงปุ่มปิด และ emit "close" เมื่อกด */
  dismissible: { type: Boolean, default: false },
});

defineEmits(["close"]);

const TONES = {
  info: { box: "bg-info-soft border-info-line text-info-ink", icon: Info },
  ok: { box: "bg-ok-soft border-ok-line text-ok-ink", icon: CircleCheck },
  warn: { box: "bg-warn-soft border-warn-line text-warn-ink", icon: TriangleAlert },
  danger: { box: "bg-danger-soft border-danger-line text-danger-ink", icon: CircleAlert },
};

const tone = computed(() => TONES[props.tone] ?? TONES.info);
</script>

<template>
  <div
    class="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm"
    :class="tone.box"
    :role="props.tone === 'danger' ? 'alert' : 'status'"
  >
    <component :is="tone.icon" :size="18" class="shrink-0 mt-px" aria-hidden="true" />

    <div class="min-w-0 flex-1">
      <p v-if="title" class="font-semibold leading-snug">{{ title }}</p>
      <div :class="title && 'mt-0.5 opacity-90'">
        <slot />
      </div>
    </div>

    <div v-if="$slots.actions" class="shrink-0">
      <slot name="actions" />
    </div>

    <button
      v-if="dismissible"
      type="button"
      class="shrink-0 -mr-1 -mt-1 p-1 rounded-sm opacity-60 hover:opacity-100 transition-opacity"
      :aria-label="t(&quot;ปิดข้อความนี้&quot;)"
      @click="$emit('close')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
