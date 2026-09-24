<script setup>
/**
 * UiPageHeader — หัวเรื่องมาตรฐานที่ทุกหน้าต้องใช้
 *
 * ทุกหน้าตอบสามอย่างเดียวกันเสมอ: อยู่ตรงไหน (eyebrow), หน้านี้คืออะไร (title),
 * และทำอะไรได้จากที่นี่ (slot actions) การรวมไว้ที่เดียวทำให้ระยะขอบและขนาด
 * ตัวอักษรของทุกหน้าตรงกัน คนจึงจำตำแหน่งปุ่มได้โดยไม่ต้องมองหาใหม่ทุกหน้า
 *
 * รอบที่ 3 ของ #51 (Primer PageHeader): ชื่อหน้าอยู่แถวเดียวกับป้ายจำนวน
 * (slot "badge") และปุ่มหลัก ไม่ใช่หัวหน้าสี่บรรทัดที่ดันตารางลงไปใต้เส้นพับ
 *
 * ขนาดชื่อหน้า 24px บนมือถือ / 30px (--text-3xl "หัวข้อหน้า") ตั้งแต่ sm ขึ้นไป
 * เดิม 20px ซึ่งเท่ากับหัวการ์ด (text-xl) ชื่อหน้าจึงไม่เด่นกว่าหัวข้อย่อยในหน้า
 * ช่วงที่ระบบออกแบบหลักใช้กับหัวเรื่องระดับหน้า: Material 3 headline 24–32px,
 * Fluent 2 title3–title1 24–32px, Carbon heading-04/05 28–32px,
 * Primer title large 32px
 * ตัวหนาเท่าเดิม (semibold) เพราะทุกระบบข้างบนใช้ 600 กับหัวเรื่องขนาดนี้
 *
 * ## กฎของ eyebrow — ใส่เมื่อ sidebar ตอบ "อยู่ตรงไหน" ให้ไม่ได้เท่านั้น
 *
 * หน้าที่มีรายการในเมนู มี sidebar ไฮไลต์บอกอยู่แล้วว่าอยู่หมวดไหน eyebrow
 * บนหน้าเหล่านั้นจึงเป็นการพูดซ้ำ และกินความสูงของหัวหน้าไปหนึ่งบรรทัดครึ่ง
 *
 * ที่เคยเป็นปัญหาจริงคือมันไม่ได้แค่ซ้ำ แต่ซ้ำด้วย**คำคนละคำ** — หน้าอ้างอิง
 * เจ็ดหน้าเขียนว่า "ข้อมูลอ้างอิง · สถานที่" ขณะที่ sidebar ไฮไลต์คำว่า
 * "ตั้งค่าระบบ" อยู่ข้างๆ กัน คนอ่านได้สองชื่อสำหรับที่เดียวกัน และหน้าสามหน้า
 * ในหมวด "รายงาน" เดียวกัน (ค่าใช้จ่าย / เปรียบเทียบ / รายงานสรุป) มีสองหน้า
 * ที่ขึ้น eyebrow และหนึ่งหน้าที่ไม่ขึ้น หัวหน้าจึงสูงไม่เท่ากัน 73px กับ 29px
 *
 * ตอนนี้เหลือ eyebrow เฉพาะหน้าที่ไม่มีรายการในเมนู (ดู HIDDEN_NAV_ITEMS ใน
 * app/navigation.js) ซึ่ง sidebar ไม่ไฮไลต์อะไรเลยตอนเปิดอยู่ — และใช้ชื่อหมวด
 * ตามที่เมนูเรียก ไม่ใช่คำใหม่ที่ไม่มีอยู่ในเมนู
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
        <h1 class="text-2xl sm:text-3xl font-semibold text-ink tracking-tight">
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
