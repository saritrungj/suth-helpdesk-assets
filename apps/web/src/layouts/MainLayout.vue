<script setup>
import { t } from "../lib/locale";

/**
 * MainLayout — โครงหน้าจอของทุกหน้าหลังล็อกอิน
 *
 * แถบเมนูซ้าย + แถบบนที่ปักหมุด + พื้นที่เนื้อหา
 *
 * มีลิงก์ "ข้ามไปยังเนื้อหา" เป็นสิ่งแรกในลำดับ Tab สำหรับคนที่ใช้คีย์บอร์ด
 * ไม่งั้นทุกครั้งที่เปลี่ยนหน้า ต้องกด Tab ผ่านรายการเมนูทั้งหมดก่อนถึงจะถึง
 * เนื้อหาจริง (WCAG 2.4.1 Bypass Blocks)
 *
 * ความกว้างเนื้อหาถูกจำกัดที่ 1600px และจัดกลาง — จอกว้าง 4K ที่ปล่อยให้ตาราง
 * ยืดเต็มจอทำให้สายตาต้องกวาดไกลจนอ่านทีละแถวไม่ทัน
 */
import AppCommandPalette from "../app/AppCommandPalette.vue";
import AppSidebar from "../app/AppSidebar.vue";
import AppTopbar from "../app/AppTopbar.vue";
</script>

<template>
  <div class="flex min-h-dvh bg-canvas">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200]
             focus:w-auto focus:h-auto focus:m-0 focus:px-4 focus:py-2 focus:rounded-lg
             focus:bg-brand focus:text-brand-on focus:shadow-e3"
    > {{ t("ข้ามไปยังเนื้อหา") }} </a>

    <AppSidebar />

    <div class="flex-1 min-w-0 flex flex-col">
      <AppTopbar />

      <main id="main-content" class="flex-1 min-w-0 p-[var(--shell-content-padding)]" tabindex="-1">
        <div class="mx-auto w-full max-w-[var(--shell-content-max)]">
          <RouterView v-slot="{ Component, route }">
            <!-- key ตาม path เพื่อให้หน้าที่ใช้ component เดียวกันแต่คนละ route
                 (เช่น /expense กับ /by-department) ถูกสร้างใหม่จริง ไม่ใช้ state ค้างกัน -->
            <component :is="Component" :key="route.path" />
          </RouterView>
        </div>
      </main>
    </div>

    <AppCommandPalette />
  </div>
</template>
