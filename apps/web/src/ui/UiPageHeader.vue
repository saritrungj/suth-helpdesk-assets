<script setup>
/**
 * UiPageHeader — หัวเรื่องมาตรฐานที่ทุกหน้าต้องใช้
 *
 * ทุกหน้าตอบสามอย่างเดียวกันเสมอ: อยู่ตรงไหน (eyebrow), หน้านี้คืออะไร (title),
 * และทำอะไรได้จากที่นี่ (slot actions) การรวมไว้ที่เดียวทำให้ระยะขอบและขนาด
 * ตัวอักษรของทุกหน้าตรงกัน คนจึงจำตำแหน่งปุ่มได้โดยไม่ต้องมองหาใหม่ทุกหน้า
 *
 * รอบที่ 3 ของ #51 (Primer PageHeader): ชื่อหน้า 20px อยู่แถวเดียวกับป้ายจำนวน
 * (slot "badge") และปุ่มหลัก ไม่ใช่หัวหน้าสี่บรรทัดที่ดันตารางลงไปใต้เส้นพับ
 */
defineProps({
  title: { type: String, required: true },
  eyebrow: { type: String, default: "" },
  description: { type: String, default: "" },
});
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 mb-4">
    <div class="min-w-0">
      <p v-if="eyebrow" class="eyebrow mb-1">{{ eyebrow }}</p>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 class="text-xl font-semibold text-ink tracking-tight">
          {{ title }}
        </h1>
        <slot name="badge" />
      </div>

      <p v-if="description" class="text-sm text-ink-mute mt-1 max-w-2xl">
        {{ description }}
      </p>

      <slot name="meta" />
    </div>

    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2" data-print="hide">
      <slot name="actions" />
    </div>
  </header>
</template>
