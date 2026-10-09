<script setup>
import { useRoute } from "vue-router";
import { ChevronDown } from "lucide-vue-next";
import { isActiveNav } from "./navigation";
import { UiTooltip } from "../ui";
defineProps({
  groups: { type: Array, required: true },
  openGroups: { type: Object, required: true },
  collapsed: { type: Boolean, default: false },
  idPrefix: { type: String, required: true },
});
const emit = defineEmits(["toggle-group"]);
const route = useRoute();
const isPrintEntry = item => item.to === "/print-transactions";
/** สีประจำกลุ่มเมนู — ชื่อคลาสเต็มตัว Tailwind จึงสร้าง utility ให้ (ADR-0008: ใช้ semantic token ไม่ใช้สีดิบ) */
const GROUP_TONE = {
  overview: "bg-nav-overview-soft text-nav-overview-ink",
  routine: "bg-nav-routine-soft text-nav-routine-ink",
  reports: "bg-nav-reports-soft text-nav-reports-ink",
  settings: "bg-nav-settings-soft text-nav-settings-ink",
};

</script>
<template>
  <nav class="app-navigation flex-1 overflow-y-auto overscroll-contain px-2.5 py-3 flex flex-col gap-2">
    <section
      v-for="(group, index) in groups"
      :key="group.key"
      :class="index > 0 && (collapsed || group.admin) ? 'border-t border-chrome-line pt-2' : ''"
      :data-nav-group="group.key"
    >
      <button
        v-if="!collapsed"
        type="button"
        class="group flex items-center w-full h-8 px-2 rounded-md text-xs font-semibold text-ink-mute
               hover:bg-chrome-hover hover:text-ink transition-colors"
        :aria-expanded="Boolean(openGroups[group.key])"
        :aria-controls="`${idPrefix}-nav-group-${group.key}`"
        @click="emit('toggle-group', group.key)"
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
        v-show="collapsed || openGroups[group.key]"
        :id="`${idPrefix}-nav-group-${group.key}`"
        class="flex flex-col gap-0.5 list-none"
        :class="!collapsed && 'mt-0.5'"
      >
        <li v-for="item in group.items" :key="item.label">
          <UiTooltip :content="collapsed ? item.label : ''" side="right">
            <RouterLink
              :to="item.to"
              tabindex="0"
              class="group relative flex items-center gap-2.5 rounded-md px-1.5 h-9 text-sm transition-colors"
              :class="[
                collapsed ? 'justify-center' : '',
                isPrintEntry(item)
                  ? (isActiveNav(item, route)
                    ? 'bg-brand text-brand-on font-semibold'
                    : 'bg-brand-soft text-brand-ink font-medium hover:bg-brand-soft-hover')
                  : (isActiveNav(item, route)
                    ? 'bg-surface text-ink font-semibold shadow-[0_0_0_1px_var(--chrome-line)]'
                    : 'text-ink-soft hover:bg-chrome-hover hover:text-ink'),
              ]"
              :aria-current="isActiveNav(item, route) ? 'page' : undefined"
              :aria-label="collapsed ? item.label : undefined"
            >
              <!-- สถานะ active มีทั้งรูปทรง, aria-current และสี -->
              <span
                v-if="isActiveNav(item, route)"
                class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
                :class="isPrintEntry(item) ? 'bg-brand-on' : 'bg-brand'"
                aria-hidden="true"
              ></span>

              <!-- ไอคอนบนพื้นสีของกลุ่ม (#196) — พับเมนูแล้วยังบอกได้ว่าอยู่กลุ่มไหน -->
              <span class="grid place-items-center shrink-0 w-7 h-7 rounded-md" :class="isPrintEntry(item) ? 'bg-brand-soft text-brand-ink' : (GROUP_TONE[group.key] ?? GROUP_TONE.overview)">
                <component :is="item.icon" :size="16" aria-hidden="true" />
              </span>
              <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
            </RouterLink>
          </UiTooltip>
        </li>
      </ul>
    </section>
  </nav>
</template>
