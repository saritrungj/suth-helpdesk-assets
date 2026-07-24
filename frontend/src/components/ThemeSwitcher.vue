<template>
  <button
    type="button"
    @click="toggleMode"
    class="flex items-center gap-2 border border-gray-200 rounded-full pl-2.5 pr-3 py-1.5 bg-gray-100 hover:bg-gray-200 transition-colors"
    :title="modeState.current === 'dark' ? 'สลับเป็นโทนสว่าง' : 'สลับเป็นโทนมืด'"
  >
    <!-- ไอคอนพระจันทร์ — แสดงตอนอยู่โหมดมืด (สื่อสถานะปัจจุบัน ตรงกับข้อความข้างๆ) -->
    <svg
      v-if="modeState.current === 'dark'"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      class="w-4 h-4 text-gray-500"
    >
      <path
        fill-rule="evenodd"
        d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"
        clip-rule="evenodd"
      />
    </svg>
    <!-- ไอคอนพระอาทิตย์ — แสดงตอนอยู่โหมดสว่าง (สื่อสถานะปัจจุบัน ตรงกับข้อความข้างๆ) -->
    <svg
      v-else
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="w-4 h-4 text-gray-500"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
    <span class="text-sm text-gray-600 hidden md:inline">
      {{ modeState.current === "dark" ? "โทนมืด" : "โทนสว่าง" }}
    </span>
  </button>
</template>

<script setup>
import { modeState, toggleMode } from "../store/theme";
</script>