<script setup>
/**
 * TopShareCard — อันดับต้นๆ พร้อมแถบสัดส่วน (#197)
 *
 * แท่งแนวนอนเรียงมาก→น้อย อ่านได้ทันทีว่าเงินไปที่ไหน — แท่งแนวนอนอ่านชื่อยาวภาษาไทยได้ครบ
 * ซึ่งกราฟวงกลมและแท่งแนวตั้งทำไม่ได้ ตัวเลขเต็มอยู่ในตารางเปรียบเทียบด้านล่างแล้ว การ์ดนี้บอกแค่ลำดับกับสัดส่วน
 */
import { t } from "../lib/locale";
import { formatCount } from "../lib/format";
import { UiButton, UiSkeleton } from "../ui";

defineProps({
  title: { type: String, required: true },
  /** ผลของ topShare() */
  data: { type: Object, required: true },
  format: { type: Function, required: true },
  loading: { type: Boolean, default: false },
  moreLabel: { type: String, default: "" },
  /** ลิงก์ไปแก้รายการ "ไม่ระบุ…" — มีแล้วแถวนั้นถูกเน้นเป็นคำเตือน ไม่ใช่อันดับปกติ (#212) */
  fixUnassigned: { type: [Object, String], default: null },
});
defineEmits(["more"]);

const percent = (share) => `${(share * 100).toLocaleString("th-TH", { maximumFractionDigits: share < 0.1 ? 1 : 0 })}%`;
</script>

<template>
  <section class="card p-4 flex flex-col gap-3 min-w-0" :aria-label="title" :aria-busy="loading">
    <div class="flex items-center gap-2">
      <h2 class="text-sm font-semibold text-ink mr-auto">{{ title }}</h2>
      <UiButton v-if="moreLabel && data.entries.length" variant="ghost" size="sm" @click="$emit('more')">{{ moreLabel }}</UiButton>
    </div>
    <div v-if="loading" class="flex flex-col gap-2.5"><UiSkeleton v-for="n in 5" :key="n" height="1.75rem" /></div>
    <p v-else-if="!data.entries.length" class="text-sm text-ink-mute">{{ t("ยังไม่มีข้อมูลในช่วงนี้") }}</p>
    <ol v-else class="flex flex-col gap-2.5 list-none" data-testid="top-share">
      <li v-for="entry in data.entries" :key="entry.key" class="min-w-0" :data-unassigned="entry.key === 'unassigned' || undefined">
        <div class="flex items-baseline gap-2 text-sm">
          <span class="truncate mr-auto" :class="entry.key === 'unassigned' && fixUnassigned ? 'text-warn-ink font-medium' : 'text-ink'" :title="entry.label">
            {{ entry.label }}
            <RouterLink v-if="entry.key === 'unassigned' && fixUnassigned" :to="fixUnassigned" class="ml-1 text-xs underline font-normal">{{ t("แก้ข้อมูล") }}</RouterLink>
          </span>
          <span class="numeral text-ink-soft shrink-0">{{ format(entry.value) }}</span>
          <span class="numeral text-xs text-ink-mute w-11 text-right shrink-0">{{ percent(entry.share) }}</span>
        </div>
        <div class="h-1.5 mt-1 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
          <div class="h-full rounded-full" :class="entry.key === 'unassigned' && fixUnassigned ? 'bg-warn' : 'bg-brand'" :style="{ width: `${Math.max(2, entry.share * 100)}%` }" />
        </div>
      </li>
    </ol>
    <p v-if="!loading && data.others" class="text-xs text-ink-mute">{{ t("และอีก {0} รายการ", [formatCount(data.others)]) }}</p>
  </section>
</template>
