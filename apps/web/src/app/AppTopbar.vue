<script setup>
import { locale } from "../lib/locale";
import { yearLabel } from "../lib/locale-format";
import { changeLanguage } from "./change-language";
import { t } from "../lib/locale";

/**
 * AppTopbar — แถบบนสุดที่อยู่เหนือทุกหน้า
 *
 * เก็บของสามอย่างที่ "ไม่ได้เป็นของหน้าไหนหน้าหนึ่ง" แต่มีผลกับทุกหน้า
 *
 *   ปีงบประมาณ  ตัวกรองใหญ่ที่สุดของระบบ ทุกตัวเลขในทุกหน้าถูกจำกัดด้วยค่านี้
 *               จึงต้องเห็นตลอดเวลา ไม่ใช่ซ่อนอยู่ในเมนู — เดิมอยู่ในแถบข้าง
 *               ซึ่งพอพับเมนูแล้วจะหายไปทั้งที่ยังมีผลกับตัวเลขที่เห็นอยู่
 *   ค้นหาคำสั่ง  ทางลัดไปทุกหน้าด้วยการพิมพ์ ไม่ต้องกวาดตาหาในเมนู
 *   บัญชีผู้ใช้   ใครกำลังใช้อยู่ ปรับการแสดงผล และออกจากระบบ
 *
 * แถบนี้ปักหมุดอยู่บนสุดเสมอ (sticky) เพราะปีงบต้องเห็นได้ตลอดแม้เลื่อนดูตาราง
 * ยาวๆ อยู่ — พื้นหลังใช้ความโปร่งบวก backdrop-blur เพื่อให้ยังรู้ว่ามีเนื้อหา
 * เลื่อนอยู่ข้างใต้ แต่ตัวหนังสือบนแถบยังอ่านออก
 */
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  CalendarRange,
  ChevronRight,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Rows3,
  Search,
  Sun,
  UserRound,
} from "lucide-vue-next";
import { findActiveItem } from "./navigation";
import { APP_NAME_SHORT } from "./brand";
import { authState } from "../store/auth";
import { logout as endSession } from "../store/session";
import {
  activeFiscalYear,
  fiscalYearState,
  loadFiscalYears,
  resetFiscalYearState,
  setActiveFiscalYear,
} from "../store/fiscalYear";
import { modeState, setDensity, setMode } from "../store/theme";
import { openCommandPalette, openMobileNav } from "../store/ui";
import { UiBadge, UiButton, UiMenu, UiMenuItem, UiSegmented, UiSkeleton } from "../ui";

const route = useRoute();
const router = useRouter();

const activeItem = computed(() => findActiveItem(route));

const roleLabel = computed(
  () =>
    ({ admin: t("ผู้ดูแลระบบ"), staff: t("เจ้าหน้าที่"), viewer: t("ผู้อ่าน") })[authState.user?.role] ??
    authState.user?.role ??
    ""
);

const MODE_OPTIONS = [
  { value: "light", label: t("สว่าง"), icon: Sun },
  { value: "dark", label: t("มืด"), icon: Moon },
  { value: "system", label: t("ตามเครื่อง"), icon: Monitor },
];

const DENSITY_OPTIONS = [
  { value: "compact", label: t("แน่น") },
  { value: "default", label: t("ปกติ") },
  { value: "relaxed", label: t("โปร่ง") },
];

// แถบบนเป็นเจ้าของตัวเลือกปีงบแล้ว จึงเป็นที่ที่โหลดรายการปีงบด้วย
// (เดิมโหลดจาก Sidebar ซึ่งไม่ได้แสดงค่านี้อีกต่อไป) — component นี้อยู่ในทุกหน้า
// หลังล็อกอิน ทุกหน้าจึงมีปีงบพร้อมใช้เสมอโดยไม่ต้องเรียกซ้ำในแต่ละหน้า
onMounted(loadFiscalYears);

async function logout() {
  await endSession();
  resetFiscalYearState();
  await router.push("/login");
}
</script>

<template>
  <header
    class="sticky top-0 z-30 h-[var(--shell-topbar-height)] shrink-0 flex items-center gap-2 px-3 sm:px-4
           bg-chrome"
    data-print="hide"
  >
    <UiButton
      class="lg:hidden"
      variant="ghost"
      size="sm"
      icon-only
      :label="t(&quot;เปิดเมนู&quot;)"
      @click="openMobileNav"
    >
      <Menu :size="18" />
    </UiButton>

    <!-- ตำแหน่งปัจจุบัน — บอกว่าอยู่กลุ่มไหนและหน้าอะไร -->
    <nav class="min-w-0 flex items-center gap-1.5 text-sm" :aria-label="t(&quot;ตำแหน่งปัจจุบัน&quot;)">
      <span class="hidden sm:inline text-ink-mute truncate">
        {{ activeItem?.groupLabel ?? APP_NAME_SHORT }}
      </span>
      <ChevronRight :size="14" class="hidden sm:block text-ink-faint shrink-0" aria-hidden="true" />

      <!-- หน้าที่มี meta.breadcrumb เป็นหน้าลูก (เช่นรายละเอียดเครื่อง) ชื่อของ
           หน้าแม่จึงกลายเป็นลิงก์กลับ ไม่ใช่ข้อความตายอีกต่อไป -->
      <template v-if="route.meta.breadcrumb">
        <RouterLink
          v-if="activeItem"
          :to="activeItem.to"
          class="text-ink-mute hover:text-ink truncate rounded-xs"
        >
          {{ activeItem.label }}
        </RouterLink>
        <ChevronRight :size="14" class="text-ink-faint shrink-0" aria-hidden="true" />
        <span class="font-medium text-ink truncate">{{ route.meta.breadcrumb }}</span>
      </template>

      <span v-else class="font-medium text-ink truncate">
        {{ activeItem?.label ?? APP_NAME_SHORT }}
      </span>
    </nav>

    <div class="flex items-center gap-2 ml-auto">
      <!-- ช่องค้นหาคำสั่ง — บนจอใหญ่แสดงเป็นช่องจริงให้รู้ว่ามีอยู่ บนจอเล็กเหลือแค่ไอคอน -->
      <button
        type="button"
        class="hidden md:flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border border-line
               bg-surface text-ink-mute text-sm hover:border-line-strong hover:text-ink transition-colors"
        @click="openCommandPalette"
      >
        <Search :size="15" aria-hidden="true" />
        <span class="pr-6"> {{ t("ค้นหาหน้า…") }} </span>
        <kbd
          class="font-mono text-2xs px-1.5 py-0.5 rounded-xs bg-surface-2 border border-line-soft text-ink-mute"
        >
          Ctrl K
        </kbd>
      </button>

      <UiButton
        class="md:hidden"
        variant="ghost"
        size="sm"
        icon-only
        :label="t(&quot;ค้นหาหน้า&quot;)"
        @click="openCommandPalette"
      >
        <Search :size="17" />
      </UiButton>

      <!-- ปีงบประมาณ -->
      <UiMenu :label="t(&quot;ปีงบประมาณที่กำลังดู&quot;)">
        <template #trigger>
          <button
            type="button"
            class="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-brand-line
                   bg-brand-soft text-brand-ink text-sm font-semibold
                   hover:bg-brand-soft-hover transition-colors"
          >
            <CalendarRange :size="15" class="shrink-0" aria-hidden="true" />
            <!-- ไม่ใช้ opacity ลดความเด่น — ข้อความ 11px ที่จางลง 20% บนพื้น brand-soft
                 วัดได้ 4.14:1 ตกเกณฑ์ 1.4.3 (เจอตอนแถบบนเปลี่ยนเป็นพื้นทึบในรอบที่ 3 ของ #51
                 ซึ่งทำให้ตัววัดใน wcag.spec.js วัดข้อความตรงนี้ได้เป็นครั้งแรก) -->
            <span class="hidden sm:inline text-2xs font-medium"> {{ t("ปีงบ") }} </span>
            <UiSkeleton v-if="fiscalYearState.loading" width="2.5rem" height="0.9rem" />
            <span v-else-if="activeFiscalYear" class="numeral">
              {{ yearLabel(activeFiscalYear.year) }}
            </span>
            <span v-else class="text-2xs font-medium"> {{ t("ยังไม่มี") }} </span>
          </button>
        </template>

        <template v-if="fiscalYearState.list.length">
          <UiMenuItem
            v-for="fy in fiscalYearState.list"
            :key="fy.id"
            @select="setActiveFiscalYear(fy.id)"
          >
            <template #icon>
              <span
                class="w-1.5 h-1.5 rounded-full shrink-0"
                :class="fy.id === fiscalYearState.activeId ? 'bg-brand' : 'bg-transparent'"
                aria-hidden="true"
              ></span>
            </template>
            <span class="numeral">{{ yearLabel(fy.year) }}</span>
          </UiMenuItem>
        </template>

        <p v-else class="px-2.5 py-3 text-xs text-ink-mute"> {{ t("ยังไม่มีปีงบในระบบ") }} <br />
          <RouterLink to="/admin/fiscal-years" class="text-brand-ink hover:underline"> {{ t("ไปสร้างปีงบใหม่") }} </RouterLink>
        </p>
      </UiMenu>

      <!-- บัญชีผู้ใช้ -->
      <UiMenu>
        <template #trigger>
          <button
            type="button"
            class="flex items-center gap-2 h-8 pl-1 pr-2 rounded-lg hover:bg-chrome-hover transition-colors"
            :aria-label="t(&quot;บัญชีของ {0}&quot;, [authState.user?.username ?? ''])"
          >
            <span
              class="grid place-items-center shrink-0 w-7 h-7 rounded-lg bg-brand-soft text-brand-ink"
              aria-hidden="true"
            >
              <UserRound :size="15" />
            </span>
            <span class="hidden sm:block text-sm font-medium text-ink-soft truncate max-w-[8rem]">
              {{ authState.user?.username }}
            </span>
          </button>
        </template>

        <div class="px-2.5 py-2 border-b border-line-soft mb-1">
          <p class="text-sm font-medium text-ink truncate">{{ authState.user?.username }}</p>
          <UiBadge
            :tone="authState.user?.role === 'admin' ? 'accent' : 'neutral'"
            size="sm"
            class="mt-1"
          >
            {{ roleLabel }}
          </UiBadge>
        </div>

        <div class="px-2.5 py-2">
          <p class="text-2xs text-ink-mute mb-1.5"> {{ t("โทนสี") }} </p>
          <UiSegmented
            :model-value="modeState.pref"
            :options="MODE_OPTIONS"
            size="sm"
            :label="t(&quot;เลือกโทนสีของระบบ&quot;)"
            block
            @update:model-value="setMode"
          />
        </div>

        <div class="px-2.5 pb-2">
          <p class="flex items-center gap-1.5 text-2xs text-ink-mute mb-1.5">
            <Rows3 :size="12" aria-hidden="true" /> {{ t("ความหนาแน่นของตาราง") }} </p>
          <UiSegmented
            :model-value="modeState.density"
            :options="DENSITY_OPTIONS"
            size="sm"
            :label="t(&quot;เลือกความหนาแน่นของข้อมูล&quot;)"
            block
            @update:model-value="setDensity"
          />
        </div>

        <div class="px-2.5 pb-2">
          <p class="text-2xs text-ink-mute mb-1.5">Language / ภาษา</p>
          <UiSegmented :model-value="locale" :options="[{ value: 'th', label: 'ไทย' }, { value: 'en', label: 'English' }]" label="Language / ภาษา" block @update:model-value="changeLanguage" />
          <p class="text-2xs text-ink-mute mt-1">{{ t("เปลี่ยนภาษาแล้วโหลดหน้านี้ใหม่") }}</p>
        </div>
        <UiMenuItem tone="danger" separated @select="logout">
          <template #icon><LogOut :size="15" /></template> {{ t("ออกจากระบบ") }} </UiMenuItem>
      </UiMenu>
    </div>
  </header>
</template>
