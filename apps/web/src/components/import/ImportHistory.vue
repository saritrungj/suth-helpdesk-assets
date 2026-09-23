<script setup>
/**
 * ImportHistory — ใครทำอะไรกับงานนำเข้านี้เมื่อไร (ADR-0027) ประวัติแก้หรือลบไม่ได้
 */
import { formatDateTime } from "../../lib/locale-format";
import { t } from "../../lib/locale";
import { eventDetail, eventLabel } from "./import-session";

defineProps({ events: { type: Array, default: () => [] } });
</script>

<template>
  <ol class="flex flex-col gap-1 text-sm" data-testid="import-history">
    <li v-for="event in events" :key="event.id" class="grid gap-x-3 sm:grid-cols-[11rem_7rem_1fr] border-b border-line-soft py-1">
      <span class="numeral text-ink-mute">{{ formatDateTime(event.created_at) }}</span>
      <span class="text-ink-soft">{{ event.actor_username ?? t("ระบบ") }}</span>
      <span class="text-ink">{{ eventLabel(event.event) }}<span v-if="eventDetail(event)" class="text-ink-soft"> — {{ eventDetail(event) }}</span></span>
    </li>
  </ol>
</template>
