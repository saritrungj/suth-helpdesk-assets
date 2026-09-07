<script setup>
/**
 * UiSpinner — ตัวหมุนบอกว่ากำลังทำงานอยู่
 *
 * ใช้เฉพาะกับการกระทำที่ผู้ใช้เพิ่งกดเอง (กดปุ่มบันทึกแล้วรอ) เท่านั้น
 * สำหรับการโหลดข้อมูลของทั้งหน้าให้ใช้ UiSkeleton แทน เพราะโครงร่างเทาบอก
 * "รูปร่างของสิ่งที่กำลังจะมา" ทำให้หน้าจอไม่กระโดดตอนข้อมูลมาถึง ส่วนตัวหมุน
 * บอกได้แค่ว่ายังไม่เสร็จ
 */
defineProps({
  size: { type: [Number, String], default: 16 },
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    class="animate-spin shrink-0"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.22" />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
    />
  </svg>
</template>
