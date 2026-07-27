<template>
  <svg
    v-if="state === 'none'"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-3.5 h-3.5 text-gray-300 shrink-0"
  >
    <path d="M8.25 15 12 18.75 15.75 15M8.25 9 12 5.25 15.75 9" />
  </svg>
  <svg
    v-else
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-3.5 h-3.5 text-blue-600 shrink-0"
  >
    <path v-if="state === 'asc'" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    <path v-else d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
</template>

<script setup>
// ไอคอนบอกสถานะการเรียงคอลัมน์ในตาราง — แทนตัวอักษร ↕/▲/▼ เดิมใน DataTable.vue
// state: "none" (ยังไม่ได้เรียงคอลัมน์นี้) | "asc" | "desc"
defineProps({
  state: { type: String, default: "none" },
});
</script>
