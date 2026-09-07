<script setup>
/**
 * UiSkeleton — โครงร่างของเนื้อหาที่กำลังโหลด
 *
 * เหตุผลที่ไม่ใช้คำว่า "กำลังโหลด..." : ข้อความบอกแค่ว่ายังไม่เสร็จ แต่ไม่บอกว่า
 * กำลังจะมีอะไรมา พอข้อมูลมาถึงเลย์เอาต์จะกระโดดทั้งหน้า คนที่กำลังจะกดปุ่มอยู่
 * พอดีจะกดโดนของผิด โครงร่างเทาจองที่ไว้ล่วงหน้าให้ตรงขนาดจริง หน้าจึงนิ่ง
 *
 * ตั้ง aria-hidden ไว้เพราะโครงร่างไม่มีความหมายกับคนที่ฟังเสียง — ให้กล่องแม่
 * ประกาศสถานะด้วย aria-busy แทน
 */
defineProps({
  width: { type: String, default: "100%" },
  height: { type: String, default: "1rem" },
  /** ทำเป็นวงกลม สำหรับ avatar หรือไอคอน */
  circle: { type: Boolean, default: false },
  /** จำนวนบรรทัด ถ้ามากกว่า 1 จะย่อบรรทัดสุดท้ายให้สั้นลงเหมือนย่อหน้าจริง */
  lines: { type: Number, default: 1 },
});
</script>

<template>
  <div v-if="lines > 1" class="flex flex-col gap-2" aria-hidden="true">
    <div
      v-for="i in lines"
      :key="i"
      class="skeleton"
      :style="{ width: i === lines ? '62%' : width, height }"
    ></div>
  </div>

  <div
    v-else
    class="skeleton"
    :class="circle && 'rounded-full'"
    :style="{ width, height }"
    aria-hidden="true"
  ></div>
</template>
