<script setup>
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Bell } from "lucide-vue-next";
import { useOverview } from "../api/queries";
import { activeFiscalYear } from "../store/fiscalYear";
import { uiState } from "../store/ui";
import { t } from "../lib/locale";
import { yearLabel } from "../lib/locale-format";
import AttentionPanel from "../components/AttentionPanel.vue";
import { UiAlert, UiButton, UiDrawer, UiTooltip } from "../ui";

const route = useRoute();
const open = ref(false);
// งานติดตามเป็นภาพรวมทั้งปีงบ ไม่เปลี่ยนตามตัวกรองเฉพาะหน้า Dashboard
const params = computed(() => ({ fiscal_year_id: activeFiscalYear.value?.id || undefined }));
const { data, isPending, isPlaceholderData, isError, refetch } = useOverview(params);
const loading = computed(() => isPending.value || isPlaceholderData.value);
const items = computed(() => data.value?.attention ?? []);
const label = computed(() => isError.value ? t("โหลดการแจ้งเตือนไม่สำเร็จ") : t("งานที่ต้องติดตาม"));

function showNotifications() {
  open.value = true;
}

watch(() => route.fullPath, () => { open.value = false; });
</script>

<template>
  <UiTooltip :content="uiState.navCollapsed ? label : ''" side="right">
    <button
      type="button"
      class="relative flex items-center gap-2.5 w-full min-h-10 rounded-lg px-2.5 text-sm text-ink-soft hover:bg-chrome-hover hover:text-ink transition-colors"
      :class="uiState.navCollapsed && 'justify-center'"
      :aria-label="label"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="showNotifications"
    >
      <Bell :size="18" class="shrink-0" aria-hidden="true" />
      <span v-if="!uiState.navCollapsed" class="flex-1 text-left">{{ label }}</span>
      <span v-if="isError" class="text-danger-ink" aria-hidden="true">!</span>
      <span v-else-if="!loading && items.length" class="rounded-full bg-brand text-brand-on px-1.5 text-xs font-semibold" :class="uiState.navCollapsed && 'absolute right-0 top-0'">
        {{ items.length }}<span class="sr-only"> {{ t("หัวข้อ") }}</span>
      </span>
    </button>
  </UiTooltip>
  <UiDrawer v-model:open="open" :title="t('งานที่ต้องติดตาม')" :description="`${t('ปีงบประมาณ')} ${yearLabel(activeFiscalYear?.year)} · ${t('ทุกสัญญา')}`">
    <template #body>
      <UiAlert v-if="isError" tone="danger">
        {{ t("โหลดการแจ้งเตือนไม่สำเร็จ") }}
        <template #actions><UiButton variant="secondary" size="sm" @click="refetch()">{{ t("ลองใหม่") }}</UiButton></template>
      </UiAlert>
      <AttentionPanel v-else :items="items" :loading="loading" />
    </template>
  </UiDrawer>
</template>
