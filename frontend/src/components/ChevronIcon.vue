<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    :class="['w-3.5 h-3.5 transition-transform shrink-0', open ? 'rotate-180' : '']"
  >
    <path
      fill-rule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
      clip-rule="evenodd"
    />
  </svg>
</template>

<script setup>
// ไอคอนลูกศรพับ/กาง แบบเดียวกับที่ใช้ใน Sidebar.vue — ใช้ร่วมกันทุกจุดที่มี
// accordion หรือ dropdown เพื่อให้หน้าตาเหมือนกันทั้งระบบ แทนตัวอักษร ▲/▼ เดิม
defineProps({
  open: { type: Boolean, default: false },
});
</script>
