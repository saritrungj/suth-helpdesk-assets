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

      <img
        src="/logo-suth.png"
        width="480"
        height="198"
        alt="โรงพยาบาลมหาวิทยาลัยเทคโนโลยีสุรนารี"
        class="hidden sm:block h-9 w-auto rounded-xl bg-white px-1.5 py-1 ring-1 ring-black/5 shrink-0"
      />
      <h2 class="text-base font-semibold text-gray-800 truncate">
        <!-- จอเล็กมาก (< sm) ตัดเหลือชื่อย่อ กันแถวนี้ต้องแบ่งหลายบรรทัดร่วมกับปุ่ม/ตัวควบคุมฝั่งขวา -->
        <span class="sm:hidden">ระบบทรัพย์สิน IT</span>
        <span class="hidden sm:inline">ระบบจัดการทรัพย์สิน IT โรงพยาบาล</span>
      </h2>
    </div>

    <div class="flex items-center gap-2 sm:gap-3 flex-wrap">

      <!-- ปีงบ (Global) — ทุกหน้า subscribe ค่านี้ร่วมกัน ค่านี้กระทบทุกหน้าที่เปิดอยู่
           จึงทำเป็น badge เน้นสีแทน dropdown เรียบๆ ให้เห็นชัดว่ากำลังดูข้อมูลปีไหนอยู่ -->
      <div
        class="flex items-center gap-1.5 rounded-lg pl-2.5 pr-1 py-1 border"
        style="background-color: color-mix(in srgb, var(--brand-500) 12%, transparent); border-color: color-mix(in srgb, var(--brand-500) 35%, transparent);"
      >
        <span class="text-xs font-semibold text-[var(--brand-text)] whitespace-nowrap">ปีงบ</span>

        <select
          v-if="fiscalYearState.list.length"
          :value="fiscalYearState.activeId ?? ''"
          @change="setActiveFiscalYear(Number($event.target.value))"
          class="border-0 bg-transparent rounded-md px-1.5 py-1 text-sm font-semibold text-[var(--brand-text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-400)] cursor-pointer"
        >
          <option
            v-for="fy in fiscalYearState.list"
            :key="fy.id"
            :value="fy.id"
          >
            {{ Number(fy.year)}}
          </option>
        </select>

        <span v-else-if="fiscalYearState.loading" class="text-sm text-gray-400 px-1.5 py-1">
          กำลังโหลด...
        </span>

        <RouterLink
          v-else
          to="/admin/fiscal-years"
          class="text-sm text-orange-600 hover:underline flex items-center gap-1 px-1.5 py-1"
          title="ยังไม่มีปีงบในระบบ กดเพื่อไปสร้างปีงบใหม่"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 shrink-0">
            <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span class="hidden sm:inline">ยังไม่มีปีงบ — กดเพื่อสร้าง</span>
          <span class="sm:hidden">สร้างปีงบ</span>
        </RouterLink>
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

      <!-- จอเล็ก: ปุ่ม logout เหลือแค่ไอคอน กันแถวควบคุมด้านขวาล้นจนขึ้นหลายบรรทัด -->
      <button
        @click="logout"
        class="text-sm text-red-700 border border-red-200 rounded-lg hover:bg-red-50 transition-colors p-2 sm:px-3.5 sm:py-1.5"
        title="Logout"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 sm:hidden">
          <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
        </svg>
        <span class="hidden sm:inline">Logout</span>
      </button>
    </div>
  </header>
</template>

<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { authState } from "../store/auth";
import { logout as endSession } from "../store/session";
import { fiscalYearState, loadFiscalYears, setActiveFiscalYear, resetFiscalYearState } from "../store/fiscalYear";
import { openMobileSidebar } from "../store/ui";
import ThemeSwitcher from "./ThemeSwitcher.vue";

const router = useRouter();

// endSession() ต้องทำก่อน router.push() เสมอ เพราะ router guard (router/index.js)
// เช็ค authState.user ก่อนอนุญาตให้เข้าหน้า /login — ถ้ายังมี user อยู่จะโดนเด้งกลับ
// /dashboard ทันที เส้นนี้ยังสั่งให้เซิร์ฟเวอร์ลบ cookie session ทิ้งด้วย
//
// แต่ resetFiscalYearState() ต้องรอ "หลัง" จากที่เปลี่ยนหน้าไป /login สำเร็จแล้ว (Dashboard
// unmount ไปแล้ว) เพราะเดิมเรียกก่อนหน้านี้ ทำให้หน้า Dashboard ที่ยังไม่ทัน unmount เห็นปีงบ
// ถูกเคลียร์ แล้วมี watch ใน DashboardFilter.vue ไปยิง API รีโหลดข้อมูลซ้ำ ทั้งที่ token ถูกลบ
// ไปแล้วตั้งแต่ clearAuth() ข้างบน เลยได้ 401 เต็มไปหมด พร้อม toast "เซสชันหมดอายุ" ที่ข้อความ
// ผิด (นี่คือ logout ตั้งใจ ไม่ใช่ session หมดอายุ)
const logout = async () => {
  await endSession();
  await router.push("/login");
  resetFiscalYearState();
};

onMounted(loadFiscalYears);
</script>