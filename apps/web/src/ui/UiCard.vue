<script setup>
/**
 * UiCard — แผ่นเนื้อหาที่ยกขึ้นจากพื้นหน้าจอหนึ่งชั้น
 *
 * ระบบนี้มีเนื้อหาหลายก้อนอยู่บนหน้าเดียวกันเกือบทุกหน้า (ตัวกรอง + สรุป + กราฟ
 * + ตาราง) ถ้าแต่ละก้อนลอยอยู่บนพื้นเปล่าโดยไม่มีขอบเขต สายตาจะแยกไม่ออกว่า
 * ปุ่มไหนคุมอะไร การ์ดคือเส้นแบ่งความรับผิดชอบที่มองเห็นได้
 *
 * ใช้ slot header/actions แทนการเขียนหัวการ์ดเองทุกครั้ง เพื่อให้ระยะขอบและ
 * ขนาดหัวข้อของทุกการ์ดในระบบตรงกันหมด
 */
defineProps({
  title: { type: String, default: "" },
  /** ป้ายเล็กเหนือหัวข้อ ใช้บอกบริบท เช่น "ปีงบ 2568" */
  eyebrow: { type: String, default: "" },
  description: { type: String, default: "" },
  /** ตัดระยะขอบในเนื้อหาออก ใช้เมื่อเนื้อในเป็นตารางที่ต้องชนขอบการ์ด */
  flush: { type: Boolean, default: false },
  /** ยกสูงขึ้นอีกชั้น ใช้กับการ์ดที่เป็นจุดสนใจหลักของหน้า */
  raised: { type: Boolean, default: false },
  as: { type: String, default: "section" },
});
</script>

<template>
  <component
    :is="as"
    class="card flex flex-col min-w-0"
    :class="raised && 'shadow-e2'"
  >
    <header
      v-if="title || eyebrow || $slots.header || $slots.actions"
      class="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5"
      :class="($slots.default || description) && 'border-b border-line-soft'"
    >
      <div class="min-w-0 flex-1">
        <slot name="header">
          <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
          <h2 v-if="title" class="text-lg font-semibold text-ink truncate">{{ title }}</h2>
          <p v-if="description" class="text-xs text-ink-mute mt-0.5">{{ description }}</p>
        </slot>
      </div>

      <div v-if="$slots.actions" class="flex items-center gap-2 shrink-0">
        <slot name="actions" />
      </div>
    </header>

    <div v-if="$slots.default" :class="flush ? 'min-w-0' : 'px-4 py-4 sm:px-5 min-w-0'">
      <slot />
    </div>

    <footer
      v-if="$slots.footer"
      class="px-4 py-3 sm:px-5 border-t border-line-soft bg-surface-2 rounded-b-lg"
    >
      <slot name="footer" />
    </footer>
  </component>
</template>
