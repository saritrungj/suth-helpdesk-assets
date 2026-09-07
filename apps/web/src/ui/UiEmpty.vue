<script setup>
/**
 * UiEmpty — สถานะ "ยังไม่มีข้อมูล"
 *
 * หน้าจอว่างเปล่าคือจุดที่ผู้ใช้ใหม่สับสนมากที่สุด และเป็นจุดที่ระบบส่วนใหญ่
 * ปล่อยผ่านด้วยคำว่า "ไม่พบข้อมูล" เฉยๆ ที่นี่บังคับให้ทุกที่ตอบสามคำถามเสมอ
 *
 *   1. ตอนนี้เป็นอะไร        title
 *   2. ทำไมถึงว่าง            description
 *   3. แล้วต้องทำอะไรต่อ      slot actions
 *
 * มีสองบริบทที่ต้องแยกกัน: "ยังไม่เคยมีข้อมูล" (ชวนให้สร้าง) กับ "ค้นหาแล้วไม่เจอ"
 * (ชวนให้ล้างตัวกรอง) — ส่ง variant="search" เมื่อเป็นอย่างหลัง
 */
import { computed } from "vue";
import { Inbox, SearchX } from "lucide-vue-next";

const props = defineProps({
  title: { type: String, default: "ยังไม่มีข้อมูล" },
  description: { type: String, default: "" },
  variant: { type: String, default: "empty" },
  /** ย่อขนาดลงสำหรับใช้ในกล่องเล็ก เช่น ในการ์ดกราฟ */
  compact: { type: Boolean, default: false },
});

const icon = computed(() => (props.variant === "search" ? SearchX : Inbox));
</script>

<template>
  <div
    class="flex flex-col items-center justify-center text-center"
    :class="compact ? 'py-8 px-4 gap-2' : 'py-14 px-6 gap-3'"
  >
    <div
      class="grid place-items-center rounded-2xl bg-surface-2 border border-line-soft text-ink-faint"
      :class="compact ? 'w-10 h-10' : 'w-14 h-14'"
    >
      <component :is="icon" :size="compact ? 18 : 24" aria-hidden="true" />
    </div>

    <div class="max-w-sm">
      <p class="font-semibold text-ink" :class="compact ? 'text-sm' : 'text-md'">{{ title }}</p>
      <p v-if="description" class="text-ink-mute mt-1" :class="compact ? 'text-xs' : 'text-sm'">
        {{ description }}
      </p>
    </div>

    <div v-if="$slots.actions" class="flex flex-wrap items-center justify-center gap-2 mt-1">
      <slot name="actions" />
    </div>
  </div>
</template>
