<template>
  <header class="sticky top-0 z-20 bg-gray-50/95 backdrop-blur border-b border-gray-200 px-6 py-3.5 flex flex-wrap justify-between items-center gap-3">
    <div class="flex items-center gap-3 min-w-0">
      <!-- ปุ่มเปิดเมนู — เฉพาะจอมือถือ/แท็บเล็ต (< md) sidebar ปกติซ่อนอยู่นอกจอ -->
      <button
        type="button"
        class="md:hidden shrink-0 p-2 -ml-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100"
        @click="openMobileSidebar"
        aria-label="เปิดเมนู"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
          <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
        </svg>
      </button>

      <span class="hidden sm:flex w-9 h-9 rounded-xl bg-blue-600 text-white items-center justify-center font-bold text-sm shrink-0">
        IT
      </span>
      <h2 class="text-base font-semibold text-gray-800 truncate">
        ระบบจัดการทรัพย์สิน IT โรงพยาบาล
      </h2>
    </div>

    <div class="flex items-center gap-3 flex-wrap">

      <!-- ปีงบ (Global) — ทุกหน้า subscribe ค่านี้ร่วมกัน -->
      <div class="flex items-center gap-2">
        <label class="text-sm text-gray-500 hidden md:inline">ปีงบ</label>
        <select
          :value="fiscalYearState.activeId ?? ''"
          @change="setActiveFiscalYear(Number($event.target.value))"
          class="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-gray-100 hover:border-gray-300 transition-colors"
        >
          <option
            v-for="fy in fiscalYearState.list"
            :key="fy.id"
            :value="fy.id"
          >
            {{ Number(fy.year)}}
          </option>
        </select>
      </div>

      <ThemeSwitcher />

      <div class="hidden sm:flex items-center gap-2 pl-3 border-l border-gray-200">
        <span class="w-8 h-8 rounded-full bg-blue-100 text-[var(--brand-text)] flex items-center justify-center text-sm font-semibold shrink-0">
          {{ (authState.user?.username || "?").charAt(0).toUpperCase() }}
        </span>
        <div class="leading-tight">
          <p class="text-sm font-medium text-gray-700">{{ authState.user?.username }}</p>
          <p class="text-xs text-gray-400">{{ authState.user?.role }}</p>
        </div>
      </div>

      <button
        @click="logout"
        class="text-sm text-red-700 border border-red-200 px-3.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
      >
        Logout
      </button>
    </div>
  </header>
</template>

<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { authState, clearAuth } from "../store/auth";
import { fiscalYearState, loadFiscalYears, setActiveFiscalYear } from "../store/fiscalYear";
import { openMobileSidebar } from "../store/ui";
import ThemeSwitcher from "./ThemeSwitcher.vue";

const router = useRouter();

const logout = () => {
  clearAuth();
  router.push("/login");
};

onMounted(loadFiscalYears);
</script>