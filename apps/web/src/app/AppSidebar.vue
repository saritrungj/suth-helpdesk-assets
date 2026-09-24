<script setup>
import { t } from "../lib/locale";

/**
 * AppSidebar — แถบเมนูหลักด้านซ้าย
 *
 * แบ่งเมนูเป็นสี่หมวดตามจังหวะงานจริง ทุกหมวดเปิดเป็นค่าเริ่มต้น และจำการเปิด-ปิดที่ผู้ใช้
 * กดเองไว้ข้ามการโหลดหน้าและการล็อกอิน (store/ui.js) หมวดของ route ปัจจุบันจะเปิดอัตโนมัติ
 * เมื่อเข้าผ่าน direct link โดยไม่ทับค่าที่จำไว้ เมื่อย่อเป็น rail รายการทุกอันยังคงเห็น
 * ผ่านไอคอน และมีทั้ง accessible name กับ tooltip ที่เปิดได้ด้วย hover/focus
 *
 * บนจอเล็กแถบนี้กลายเป็นลิ้นชักที่เลื่อนเข้ามาทับเนื้อหา และปิดเองทุกครั้งที่
 * เปลี่ยนหน้า
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from "lucide-vue-next";
import { ADMIN_GROUPS, NAV_GROUPS, findActiveGroup, isActiveNav } from "./navigation";
import { APP_NAME, APP_NAME_SHORT, BRAND_ASSETS, ORG_NAME_SHORT } from "./brand";
import { authState } from "../store/auth";
import { NAV_WIDTH, closeMobileNav, isNavGroupOpen, resetNavWidth, setNavWidth, toggleNavCollapsed, toggleNavGroup, uiState } from "../store/ui";
import { UiTooltip } from "../ui";

const route = useRoute();

// รายการที่ติด admin ในหมวดทั่วไป (เช่นนำเข้าไฟล์ในงานประจำ) ซ่อนจากบทบาทอื่น — เหมือนช่องค้นหาคำสั่ง
// เป็นแค่ความสะดวก สิทธิ์จริงอยู่ที่ API
const visibleGroups = computed(() => {
  const isAdmin = authState.user?.role === "admin";
  return [
    ...NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => !item.admin || isAdmin) })),
    ...(isAdmin ? ADMIN_GROUPS : []),
  ];
});

// หมวดที่เปิดเพราะเข้าหน้าในหมวดนั้น — เปิดไว้ตลอดรอบนี้แต่ไม่จำลง store เพื่อไม่ทับสิ่งที่ผู้ใช้เลือก
const openedByRoute = ref({});
const openGroups = computed(() =>
  Object.fromEntries(
    visibleGroups.value.map((group) => [group.key, Boolean(openedByRoute.value[group.key]) || isNavGroupOpen(group.key)])
  )
);

function openActiveGroup() {
  const group = findActiveGroup(route);
  if (group) openedByRoute.value = { ...openedByRoute.value, [group.key]: true };
}

// กดหัวหมวดแล้วได้ตรงข้ามกับที่เห็นอยู่เสมอ และจำค่านั้นไว้
function toggleGroup(key) {
  const shown = openGroups.value[key];
  const { [key]: _opened, ...rest } = openedByRoute.value;
  openedByRoute.value = rest;
  if (isNavGroupOpen(key) === shown) toggleNavGroup(key);
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

/** สีประจำกลุ่มเมนู — ชื่อคลาสเต็มตัว Tailwind จึงสร้าง utility ให้ (ADR-0008: ใช้ semantic token ไม่ใช้สีดิบ) */
const GROUP_TONE = {
  overview: "bg-nav-overview-soft text-nav-overview-ink",
  routine: "bg-nav-routine-soft text-nav-routine-ink",
  reports: "bg-nav-reports-soft text-nav-reports-ink",
  settings: "bg-nav-settings-soft text-nav-settings-ink",
};

/* ---------- ปรับความกว้างและซ่อนแถบเมนู (#204) ---------- */
const asideEl = ref(null);
const dragging = ref(false);

function startDrag(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  dragging.value = true;
  const left = asideEl.value?.getBoundingClientRect().left ?? 0;
  const startWidth = uiState.navWidth;
  const move = (e) => setNavWidth(e.clientX - left, { persist: false });
  const up = (e) => {
    dragging.value = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    setNavWidth(e.clientX - left); // จำความกว้างสุดท้ายครั้งเดียวตอนปล่อย
    // ลากจนพับ = กางกลับมาที่ความกว้างก่อนลาก ไม่ใช่ความกว้างขั้นต่ำที่ผ่านระหว่างทาง
    if (uiState.navCollapsed) uiState.navWidth = startWidth;
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function onResizeKey(event) {
  const step = event.shiftKey ? 48 : 16;
  if (event.key === "ArrowLeft") {
    // แคบกว่าขั้นต่ำ = พับเหลือไอคอน
    if (!uiState.navCollapsed) setNavWidth(uiState.navWidth - step < NAV_WIDTH.min ? 0 : uiState.navWidth - step);
  } else if (event.key === "ArrowRight") {
    setNavWidth(uiState.navCollapsed ? NAV_WIDTH.min : uiState.navWidth + step);
  } else if (event.key === "Enter" || event.key === " ") {
    toggleNavCollapsed();
  } else {
    return;
  }
  event.preventDefault();
}

/** Ctrl+B (⌘B บน Mac) พับ/กางแถบเมนูจากทุกหน้า — ปุ่มลัดเดียวกับ VS Code และแอปทั่วไป */
function onShortcut(event) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b") {
    event.preventDefault();
    toggleNavCollapsed();
  }
}
onMounted(() => window.addEventListener("keydown", onShortcut));
onBeforeUnmount(() => window.removeEventListener("keydown", onShortcut));
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
    ref="asideEl"
    class="fixed lg:sticky top-0 z-50 h-dvh shrink-0 flex flex-col
           bg-chrome lg:bg-transparent border-r border-chrome-line lg:border-r-0
           duration-200 ease-out-quart
           lg:translate-x-0"
    :class="[
      uiState.navCollapsed ? 'w-[var(--shell-sidebar-rail-width)]' : 'w-[var(--shell-sidebar-width)] lg:w-[var(--nav-width)]',
      uiState.mobileNavOpen ? 'translate-x-0 shadow-e3' : '-translate-x-full',
      dragging ? 'transition-none select-none' : 'transition-[width,transform]',
    ]"
    :style="{ '--nav-width': `${uiState.navWidth}px` }"
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
        v-for="(group, index) in visibleGroups"
        :key="group.key"
        :class="index > 0 && (uiState.navCollapsed || group.admin) ? 'border-t border-chrome-line pt-2' : ''"
        :data-nav-group="group.key"
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
                class="group relative flex items-center gap-2.5 rounded-lg px-1.5 h-9 text-sm transition-colors"
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

                <!-- ไอคอนบนพื้นสีของกลุ่ม (#196) — พับเมนูแล้วยังบอกได้ว่าอยู่กลุ่มไหน -->
                <span class="grid place-items-center shrink-0 w-7 h-7 rounded-md" :class="GROUP_TONE[group.key] ?? GROUP_TONE.overview">
                  <component :is="item.icon" :size="16" aria-hidden="true" />
                </span>
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
        :content="uiState.navCollapsed ? t(&quot;กางแถบเมนู (Ctrl+B)&quot;) : t(&quot;พับแถบเมนูให้เหลือไอคอน (Ctrl+B)&quot;)"
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
    <!-- ลากเพื่อปรับความกว้าง (#204) — ลากแคบสุดพับเหลือไอคอน ดับเบิลคลิกคืนค่าเริ่มต้น ลูกศรซ้าย/ขวาปรับทีละ 16px -->
    <div
      class="hidden lg:block absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize z-10
             hover:bg-brand-line focus-visible:bg-brand-line outline-none transition-colors"
      :class="dragging && 'bg-brand-line'"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      :aria-label="t(&quot;ปรับความกว้างแถบเมนู&quot;)"
      :aria-valuemin="NAV_WIDTH.min"
      :aria-valuemax="NAV_WIDTH.max"
      :aria-valuenow="uiState.navCollapsed ? NAV_WIDTH.min : uiState.navWidth"
      data-testid="nav-resize"
      @pointerdown="startDrag"
      @dblclick="resetNavWidth"
      @keydown="onResizeKey"
    ></div>
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
