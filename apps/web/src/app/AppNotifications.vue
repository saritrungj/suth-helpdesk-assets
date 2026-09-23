<script setup>
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Bell } from "lucide-vue-next";
import { useOverview } from "../api/queries";
import { authState } from "../store/auth";
import { activeFiscalYear } from "../store/fiscalYear";
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
const items = computed(() => (data.value?.attention ?? []).map((item) => {
  const adminOnly = item.action?.to?.startsWith("/admin/");
  return adminOnly && authState.user?.role !== "admin" ? { ...item, action: null } : item;
}));
const label = computed(() => isError.value ? t("โหลดการแจ้งเตือนไม่สำเร็จ") : t("งานที่ต้องติดตาม"));

/**
 * ป้ายบนกระดิ่งต้องบอกความด่วน ไม่ใช่บอกแค่จำนวน
 *
 * ตั้งแต่ #83 รายการงานที่ต้องติดตามอยู่ในลิ้นชักนี้ที่เดียว ป้ายนี้จึงเป็นสัญญาณเดียว
 * ที่เหลืออยู่บนหน้าจอ — Carbon เตือนว่า notification panel ปกติใช้คู่กับ toast เพื่อ
 * บอกว่ามีของใหม่เข้ามา ระบบนี้ไม่มี toast ถ้าป้ายบอกแต่จำนวน เรื่องระดับ "ต้องแก้ทันที"
 * กับเรื่องระดับ "น่าตรวจสอบ" จะหน้าตาเหมือนกันทุกประการจนกว่าจะมีคนเปิดดู
 */
const critical = computed(() => items.value.some((item) => item.severity === "critical"));

function showNotifications() {
  open.value = true;
}

watch(() => route.fullPath, () => { open.value = false; });
</script>

<template>
  <!-- ปุ่มกระดิ่งบนแถบบน (#196) — ตำแหน่งที่คนมองหาการแจ้งเตือนในแอปทั่วไป เดิมอยู่ท้ายแถบเมนูซึ่งคนมองข้าม -->
  <UiTooltip :content="label" side="bottom">
    <button
      type="button"
      class="relative grid place-items-center w-9 h-9 rounded-lg text-ink-soft hover:bg-chrome-hover hover:text-ink transition-colors"
      :aria-label="label"
      aria-haspopup="dialog"
      :aria-expanded="open"
      data-testid="app-notifications"
      @click="showNotifications"
    >
      <Bell :size="18" aria-hidden="true" />
      <span v-if="isError" class="absolute -top-0.5 -right-0.5 grid place-items-center min-w-4 h-4 rounded-full bg-danger text-danger-on text-2xs font-bold" aria-hidden="true">!</span>
      <span
        v-else-if="!loading && items.length"
        class="absolute -top-0.5 -right-0.5 grid place-items-center min-w-4 h-4 px-1 rounded-full text-2xs font-semibold"
        :class="critical ? 'bg-danger text-danger-on' : 'bg-accent text-accent-on'"
      >
        {{ items.length }}<span class="sr-only"> {{ critical ? t("หัวข้อ รวมเรื่องที่ต้องแก้ทันที") : t("หัวข้อ") }}</span>
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
