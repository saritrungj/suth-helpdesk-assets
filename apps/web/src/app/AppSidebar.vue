<script setup>
import { t } from "../lib/locale";

/**
 * AppSidebar — แถบเมนูหลักด้านซ้าย
 *
 * แบ่งเมนูเป็นสี่หมวดตามจังหวะงานจริง งานประจำเปิดไว้เสมอ และหมวดของ route
 * ปัจจุบันจะเปิดอัตโนมัติเมื่อเข้าผ่าน direct link เมื่อย่อเป็น rail รายการทุกอันยังคงเห็น
 * ผ่านไอคอน และมีทั้ง accessible name กับ tooltip ที่เปิดได้ด้วย hover/focus
 *
 * บนจอเล็กแถบนี้กลายเป็นลิ้นชักที่เลื่อนเข้ามาทับเนื้อหา และปิดเองทุกครั้งที่
 * เปลี่ยนหน้า
 */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from "lucide-vue-next";
import { ALL_NAV_GROUPS, ADMIN_GROUPS, NAV_GROUPS, findActiveGroup, isActiveNav } from "./navigation";
import { APP_NAME, APP_NAME_SHORT, BRAND_ASSETS, ORG_NAME_SHORT } from "./brand";
import { authState } from "../store/auth";
import { closeMobileNav, toggleNavCollapsed, uiState } from "../store/ui";
import { UiTooltip } from "../ui";

const route = useRoute();

const openGroups = ref(
  Object.fromEntries(ALL_NAV_GROUPS.filter((group) => group.defaultOpen).map((group) => [group.key, true]))
);
const visibleGroups = computed(() => [
  ...NAV_GROUPS,
  ...(authState.user?.role === "admin" ? ADMIN_GROUPS : []),
]);

function openActiveGroup() {
  const group = findActiveGroup(route);
  if (group) openGroups.value[group.key] = true;
}

function toggleGroup(key) {
  openGroups.value[key] = !openGroups.value[key];
}

// ปิดลิ้นชักทุกครั้งที่เปลี่ยนหน้า — กดเมนูแล้วลิ้นชักต้องหุบเอง
watch(
  () => route.fullPath,
  () => {
    closeMobileNav();
    openActiveGroup();
  },
  { immediate: true }
);
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
           bg-chrome border-r border-chrome-line lg:border-r-0
           transition-[width,transform] duration-200 ease-out-quart
           lg:translate-x-0"
    :class="[
      uiState.navCollapsed ? 'w-[var(--shell-sidebar-rail-width)]' : 'w-[var(--shell-sidebar-width)]',
      uiState.mobileNavOpen ? 'translate-x-0 shadow-e3' : '-translate-x-full',
    ]"
    :aria-label="t(&quot;เมนูหลัก&quot;)"
  >
    <!-- ตราสัญลักษณ์ -->
    <div class="flex items-center gap-2 h-[var(--shell-topbar-height)] px-2.5 shrink-0">
      <UiTooltip
        :content="uiState.navCollapsed ? `${APP_NAME} · ${ORG_NAME_SHORT}` : ''"
        side="right"
      >
        <RouterLink
          to="/dashboard"
          class="flex items-center gap-2 min-w-0 rounded-md p-1 -m-1 hover:bg-chrome-hover transition-colors"
          :aria-label="uiState.navCollapsed ? `${APP_NAME} · ${ORG_NAME_SHORT}` : undefined"
        >
          <span
            class="grid place-items-center shrink-0 h-9 rounded-md bg-brand-backdrop border border-line-soft overflow-hidden"
            :class="uiState.navCollapsed ? 'w-10 px-1' : 'w-[4.5rem] px-1.5'"
          >
            <img
              :src="BRAND_ASSETS.wordmark"
              alt=""
              class="block w-full h-auto"
              width="568"
              height="138"
              decoding="async"
            />
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
      </UiTooltip>

      <button
        type="button"
        class="lg:hidden ml-auto grid place-items-center w-8 h-8 rounded-md text-ink-mute hover:bg-chrome-hover hover:text-ink transition-colors"
        :aria-label="t(&quot;ปิดเมนู&quot;)"
        @click="closeMobileNav"
      >
        <X :size="18" aria-hidden="true" />
      </button>
    </div>

    <!-- รายการเมนู -->
    <nav class="flex-1 overflow-y-auto overscroll-contain px-2.5 py-3 flex flex-col gap-2">
      <section
        v-for="group in visibleGroups"
        :key="group.key"
        :class="group.admin ? 'border-t border-chrome-line pt-2' : ''"
      >
        <button
          v-if="!uiState.navCollapsed"
          type="button"
          class="group flex items-center w-full h-8 px-2 rounded-md text-xs font-semibold text-ink-mute
                 hover:bg-chrome-hover hover:text-ink transition-colors"
          :aria-expanded="Boolean(openGroups[group.key])"
          :aria-controls="`nav-group-${group.key}`"
          @click="toggleGroup(group.key)"
        >
          <span class="truncate">{{ group.label }}</span>
          <ChevronDown
            :size="15"
            class="ml-auto shrink-0 transition-transform duration-150"
            :class="openGroups[group.key] ? 'rotate-0' : '-rotate-90'"
            aria-hidden="true"
          />
        </button>

        <ul
          v-show="uiState.navCollapsed || openGroups[group.key]"
          :id="`nav-group-${group.key}`"
          class="flex flex-col gap-0.5 list-none"
          :class="!uiState.navCollapsed && 'mt-0.5'"
        >
          <li v-for="item in group.items" :key="item.label">
            <UiTooltip :content="uiState.navCollapsed ? item.label : ''" side="right">
              <RouterLink
                :to="item.to"
                class="group relative flex items-center gap-2.5 rounded-lg px-2.5 h-9 text-sm transition-colors"
                :class="[
                  uiState.navCollapsed ? 'justify-center' : '',
                  isActiveNav(item, route)
                    ? 'bg-surface text-ink font-semibold shadow-[0_0_0_1px_var(--chrome-line)]'
                    : 'text-ink-soft hover:bg-chrome-hover hover:text-ink',
                ]"
                :aria-current="isActiveNav(item, route) ? 'page' : undefined"
                :aria-label="uiState.navCollapsed ? item.label : undefined"
              >
                <!-- สถานะ active มีทั้งรูปทรง, aria-current และสี -->
                <span
                  v-if="isActiveNav(item, route)"
                  class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand"
                  aria-hidden="true"
                ></span>

                <component
                  :is="item.icon"
                  :size="17"
                  class="shrink-0"
                  :class="isActiveNav(item, route) && 'text-brand-ink'"
                  aria-hidden="true"
                />
                <span v-if="!uiState.navCollapsed" class="truncate">{{ item.label }}</span>
              </RouterLink>
            </UiTooltip>
          </li>
        </ul>
      </section>
    </nav>

    <!-- ปุ่มพับ — เฉพาะจอใหญ่ที่แถบเมนูอยู่ประจำที่ -->
    <div class="hidden lg:block shrink-0 border-t border-chrome-line p-2">
      <UiTooltip
        :content="uiState.navCollapsed ? t(&quot;กางแถบเมนู&quot;) : t(&quot;พับแถบเมนูให้เหลือไอคอน&quot;)"
        side="right"
      >
        <button
          type="button"
          class="flex items-center gap-2.5 w-full h-9 px-2.5 rounded-lg text-sm text-ink-mute
                 hover:bg-chrome-hover hover:text-ink transition-colors"
          :aria-pressed="uiState.navCollapsed"
          :aria-label="uiState.navCollapsed ? t(&quot;กางแถบเมนู&quot;) : undefined"
          @click="toggleNavCollapsed"
        >
          <component
            :is="uiState.navCollapsed ? PanelLeftOpen : PanelLeftClose"
            :size="17"
            class="shrink-0"
            aria-hidden="true"
          />
          <span v-if="!uiState.navCollapsed" class="truncate"> {{ t("พับเมนู") }} </span>
        </button>
      </UiTooltip>
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
