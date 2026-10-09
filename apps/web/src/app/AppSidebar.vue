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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Info, PanelLeftClose, PanelLeftOpen } from "lucide-vue-next";
import { ADMIN_GROUPS, NAV_GROUPS, findActiveGroup } from "./navigation";
import { APP_NAME, APP_TAGLINE, ORG_NAME, OWNER_TEAM } from "./brand";
import { authState } from "../store/auth";
import { NAV_WIDTH, closeMobileNav, isNavGroupOpen, resetNavWidth, setNavWidth, toggleNavCollapsed, toggleNavGroup, uiState } from "../store/ui";
import { UiButton, UiDrawer, UiModal, UiTooltip } from "../ui";
import AppNavigation from "./AppNavigation.vue";
import AppBrand from "./AppBrand.vue";

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
  async (path, previousPath) => {
    const navigatedFromMenu = uiState.mobileNavOpen && path.split("?")[0] !== previousPath?.split("?")[0];
    closeMobileNav();
    openActiveGroup();
    if (navigatedFromMenu) {
      await nextTick();
      mobileReturnFocus.value = document.querySelector("#main-content h1");
    }
  },
  { immediate: true }
);

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
const isDesktop = ref(window.matchMedia("(min-width: 1024px)").matches);
const aboutOpen = ref(false);
const aboutReturnFocus = ref(null);
const mobileReturnFocus = ref(null);
function openAbout(event) {
  aboutReturnFocus.value = event.currentTarget;
  aboutOpen.value = true;
}
function focusMain() { document.querySelector("#main-content h1")?.focus({ preventScroll: true }); }
watch(() => uiState.mobileNavOpen, open => {
  if (open) mobileReturnFocus.value = document.querySelector("[data-mobile-nav-trigger]");
});
let desktopQuery;
function updateDesktop(event) { isDesktop.value = event.matches; closeMobileNav(); }
onMounted(() => {
  window.addEventListener("keydown", onShortcut);
  desktopQuery = window.matchMedia("(min-width: 1024px)");
  desktopQuery.addEventListener("change", updateDesktop);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onShortcut);
  desktopQuery?.removeEventListener("change", updateDesktop);
});
</script>

<template>
  <aside
    ref="asideEl"
    class="hidden lg:flex sticky top-0 z-40 h-dvh shrink-0 flex-col bg-transparent"
    :class="[
      uiState.navCollapsed ? 'w-[var(--shell-sidebar-rail-width)]' : 'w-[var(--nav-width)]',
      dragging ? 'transition-none select-none' : 'transition-[width] duration-200 ease-out-quart',
    ]"
    :style="{ '--nav-width': `${uiState.navWidth}px` }"
    :aria-label="t(&quot;เมนูหลัก&quot;)"
  >
    <AppBrand class="h-[var(--shell-topbar-height)] px-2.5 shrink-0" :collapsed="uiState.navCollapsed" @about="openAbout" />

    <!-- รายการเมนู -->
    <AppNavigation :groups="visibleGroups" :open-groups="openGroups" :collapsed="uiState.navCollapsed" id-prefix="desktop" @toggle-group="toggleGroup" />

    <!-- ปุ่มพับ — เฉพาะจอใหญ่ที่แถบเมนูอยู่ประจำที่ -->
    <div class="hidden lg:block shrink-0 border-t border-chrome-line px-2.5 py-2">
      <UiTooltip
        :content="uiState.navCollapsed ? t(&quot;กางแถบเมนู (Ctrl+B)&quot;) : t(&quot;พับแถบเมนูให้เหลือไอคอน (Ctrl+B)&quot;)"
        side="right"
      >
        <button
          type="button"
          class="flex items-center gap-2.5 w-full h-9 rounded-md text-sm text-ink-mute
                 hover:bg-chrome-hover hover:text-ink transition-colors"
          :class="uiState.navCollapsed ? 'justify-center' : 'px-2.5'"
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
    <UiButton v-if="uiState.navCollapsed" variant="ghost" icon-only :label="t('ข้อมูลระบบ')" class="self-center mb-2" @click="openAbout"><Info :size="18" aria-hidden="true" /></UiButton>
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
  <UiDrawer v-if="!isDesktop" :open="uiState.mobileNavOpen" :title="t('เมนูหลัก')" size="sm" side="left" :return-focus="mobileReturnFocus" @update:open="closeMobileNav" @focus-fallback="focusMain">
    <AppBrand class="mb-3" @about="openAbout" />
    <AppNavigation :groups="visibleGroups" :open-groups="openGroups" id-prefix="mobile" @toggle-group="toggleGroup" />
  </UiDrawer>
  <UiModal v-model:open="aboutOpen" :title="APP_NAME" :description="APP_TAGLINE" size="sm" :return-focus="aboutReturnFocus">
    <p class="text-sm text-ink">{{ ORG_NAME }}</p>
    <p class="mt-3 text-sm text-ink-mute">{{ t('ดูแลโดย {0}', [OWNER_TEAM]) }}</p>
  </UiModal>
</template>
