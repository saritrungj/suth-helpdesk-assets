<script setup>
/**
 * AppSidebar — แถบเมนูหลักด้านซ้าย
 *
 * โครงสร้างต่างจากเดิมสามเรื่อง และแต่ละเรื่องมาจากพฤติกรรมการใช้งานจริง
 *
 *   1. เมนูไม่พับเป็นกลุ่มอีกแล้ว — ทั้งระบบมีหน้าไม่ถึงสิบห้าหน้า การพับกลุ่ม
 *      ทำให้ต้องกดสองครั้งเพื่อไปหน้าที่ใช้ทุกวัน แลกกับพื้นที่ที่ประหยัดได้
 *      ไม่กี่บรรทัด ตอนนี้ทุกหน้าอยู่ในสายตาและกดครั้งเดียวถึง
 *
 *   2. บริบทงาน (ปีงบ) และบัญชีผู้ใช้ย้ายขึ้นไปอยู่แถบบนแทน เพราะเป็นของที่
 *      "อยู่เหนือทุกหน้า" ไม่ใช่รายการหนึ่งในเมนู และการวางไว้บนสุดของเมนูเดิม
 *      ทำให้เมนูจริงถูกดันลงไปจนบางหน้าจอต้องเลื่อนถึงจะเห็นครบ
 *
 *   3. พับเหลือเฉพาะไอคอนได้ — หน้าตารางในระบบนี้กว้างมาก คนที่ทำงานกับตาราง
 *      ทั้งวันจะได้พื้นที่คืน 10rem (224px -> 64px) โดยยังกดเมนูได้ผ่าน tooltip
 *
 * บนจอเล็กแถบนี้กลายเป็นลิ้นชักที่เลื่อนเข้ามาทับเนื้อหา และปิดเองทุกครั้งที่
 * เปลี่ยนหน้า
 */
import { watch } from "vue";
import { useRoute } from "vue-router";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-vue-next";
import { ADMIN_GROUPS, ADMIN_ICON, NAV_GROUPS, isActiveNav } from "./navigation";
import { APP_NAME, APP_NAME_SHORT, ORG_NAME_SHORT } from "./brand";
import { authState } from "../store/auth";
import { closeMobileNav, toggleNavCollapsed, uiState } from "../store/ui";
import { UiTooltip } from "../ui";

// โลโก้อยู่ใน public/ จึงอ้างด้วย URL ตรงๆ ไม่ผ่าน import — ไฟล์ใน public
// ถูกคัดลอกไปที่รากของ build ตามเดิมโดยไม่ผ่านการ hash ชื่อ
const logoUrl = "/logo-suthnews.png";

const route = useRoute();

// ปิดลิ้นชักทุกครั้งที่เปลี่ยนหน้า — กดเมนูแล้วลิ้นชักต้องหุบเอง
watch(() => route.fullPath, closeMobileNav);
</script>

<template>
  <!-- ฉากหลังของลิ้นชักบนจอเล็ก -->
  <Transition name="scrim">
    <div
      v-if="uiState.mobileNavOpen"
      class="fixed inset-0 z-40 bg-scrim backdrop-blur-[1px] lg:hidden"
      @click="closeMobileNav"
    ></div>
  </Transition>

  <aside
    class="fixed lg:sticky top-0 z-50 h-dvh shrink-0 flex flex-col
           bg-surface border-r border-line-soft
           transition-[width,transform] duration-200 ease-out-quart
           lg:translate-x-0"
    :class="[
      uiState.navCollapsed ? 'w-16' : 'w-56',
      uiState.mobileNavOpen ? 'translate-x-0 shadow-e3' : '-translate-x-full',
    ]"
    :aria-label="'เมนูหลัก'"
  >
    <!-- ตราสัญลักษณ์ -->
    <div class="flex items-center gap-2.5 h-14 px-3 shrink-0 border-b border-line-soft">
      <RouterLink
        to="/dashboard"
        class="flex items-center gap-2.5 min-w-0 rounded-md p-1 -m-1 hover:bg-surface-2 transition-colors"
        :title="uiState.navCollapsed ? `${APP_NAME} · ${ORG_NAME_SHORT}` : undefined"
      >
        <!-- โลโก้ต้นฉบับเป็นภาพพื้นขาวทึบ จึงต้องวางบนแผ่นขาวเสมอ ไม่ใช่พื้นตามธีม
             (ดู brand/README.md) — ที่นี่ใช้แผ่นขาวมุมมนคุมขนาดไว้ให้พอดี -->
        <span class="grid place-items-center shrink-0 w-9 h-9 rounded-lg bg-white border border-line-soft overflow-hidden">
          <img :src="logoUrl" alt="" class="w-7" />
        </span>

        <span v-if="!uiState.navCollapsed" class="min-w-0">
          <span class="block text-sm font-semibold text-ink leading-tight truncate">
            {{ APP_NAME_SHORT }}
          </span>
          <span class="block text-2xs text-ink-mute leading-tight truncate">
            {{ ORG_NAME_SHORT }}
          </span>
        </span>
      </RouterLink>

      <button
        type="button"
        class="lg:hidden ml-auto grid place-items-center w-8 h-8 rounded-md text-ink-mute hover:bg-surface-3 hover:text-ink transition-colors"
        aria-label="ปิดเมนู"
        @click="closeMobileNav"
      >
        <X :size="18" aria-hidden="true" />
      </button>
    </div>

    <!-- รายการเมนู -->
    <nav class="flex-1 overflow-y-auto overscroll-contain px-2.5 py-3 flex flex-col gap-4">
      <section v-for="group in NAV_GROUPS" :key="group.key">
        <p
          v-if="!uiState.navCollapsed"
          class="eyebrow px-2 mb-1"
        >
          {{ group.label }}
        </p>

        <ul class="flex flex-col gap-0.5 list-none">
          <li v-for="item in group.items" :key="item.label">
            <UiTooltip :content="uiState.navCollapsed ? item.label : ''" side="right">
              <RouterLink
                :to="item.to"
                class="group relative flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-sm font-medium transition-colors"
                :class="[
                  uiState.navCollapsed ? 'justify-center' : '',
                  isActiveNav(item, route)
                    ? 'bg-brand-soft text-brand-ink'
                    : 'text-ink-mute hover:bg-surface-3 hover:text-ink',
                ]"
                :aria-current="isActiveNav(item, route) ? 'page' : undefined"
              >
                <!-- ขีดสีด้านซ้ายของรายการที่เปิดอยู่ — อ่านออกแม้ในโหมดพับ -->
                <span
                  v-if="isActiveNav(item, route)"
                  class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand"
                  aria-hidden="true"
                ></span>

                <component :is="item.icon" :size="17" class="shrink-0" aria-hidden="true" />
                <span v-if="!uiState.navCollapsed" class="truncate">{{ item.label }}</span>
              </RouterLink>
            </UiTooltip>
          </li>
        </ul>
      </section>

      <!-- ส่วนของผู้ดูแลระบบ — คั่นด้วยเส้นให้ชัดว่าคนละระดับความรับผิดชอบ
           แบนเป็นชั้นเดียว ไม่มีหัวข้อย่อยอีกแล้ว (ดูเหตุผลใน navigation.js) -->
      <template v-if="authState.user?.role === 'admin'">
        <section v-for="group in ADMIN_GROUPS" :key="group.key" class="border-t border-line-soft pt-3">
          <p
            v-if="!uiState.navCollapsed"
            class="eyebrow flex items-center gap-1.5 px-2 mb-1"
          >
            <component :is="ADMIN_ICON" :size="12" aria-hidden="true" />
            {{ group.label }}
          </p>

          <ul class="flex flex-col gap-0.5 list-none">
            <li v-for="item in group.items" :key="item.label">
              <UiTooltip :content="uiState.navCollapsed ? item.label : ''" side="right">
                <RouterLink
                  :to="item.to"
                  class="group relative flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-sm transition-colors"
                  :class="[
                    uiState.navCollapsed ? 'justify-center' : '',
                    isActiveNav(item, route)
                      ? 'bg-brand-soft text-brand-ink font-medium'
                      : 'text-ink-mute hover:bg-surface-3 hover:text-ink',
                  ]"
                  :aria-current="isActiveNav(item, route) ? 'page' : undefined"
                >
                  <span
                    v-if="isActiveNav(item, route)"
                    class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand"
                    aria-hidden="true"
                  ></span>

                  <component :is="item.icon" :size="16" class="shrink-0" aria-hidden="true" />
                  <span v-if="!uiState.navCollapsed" class="truncate">{{ item.label }}</span>
                </RouterLink>
              </UiTooltip>
            </li>
          </ul>
        </section>
      </template>
    </nav>

    <!-- ปุ่มพับ — เฉพาะจอใหญ่ที่แถบเมนูอยู่ประจำที่ -->
    <div class="hidden lg:block shrink-0 border-t border-line-soft p-2">
      <button
        type="button"
        class="flex items-center gap-2.5 w-full h-9 px-2.5 rounded-lg text-sm text-ink-mute
               hover:bg-surface-3 hover:text-ink transition-colors"
        :aria-pressed="uiState.navCollapsed"
        :title="uiState.navCollapsed ? 'กางแถบเมนู' : 'พับแถบเมนูให้เหลือไอคอน'"
        @click="toggleNavCollapsed"
      >
        <component
          :is="uiState.navCollapsed ? PanelLeftOpen : PanelLeftClose"
          :size="17"
          class="shrink-0"
          aria-hidden="true"
        />
        <span v-if="!uiState.navCollapsed" class="truncate">พับเมนู</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.scrim-enter-active,
.scrim-leave-active {
  transition: opacity 0.2s var(--ease-out-quart);
}
.scrim-enter-from,
.scrim-leave-to {
  opacity: 0;
}
</style>
