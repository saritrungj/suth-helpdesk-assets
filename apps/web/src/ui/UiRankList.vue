<script setup>
import { computed } from "vue";
import { percentOf } from "../lib/format";

const props = defineProps({
  items: { type: Array, default: () => [] },
  label: { type: String, required: true },
});
const maximum = computed(() => Math.max(1, ...props.items.map(item => Number(item.value || 0))));
</script>

<template>
  <ol class="flex flex-col gap-2 list-none" :aria-label="label">
    <li v-for="(item, index) in items" :key="item.key" class="relative isolate overflow-hidden rounded-md px-3 py-3">
      <span class="absolute inset-y-0 left-0 -z-10 bg-brand-soft rounded-md" :style="{ width: `${percentOf(item.value, maximum)}%` }" aria-hidden="true"></span>
      <div class="flex items-baseline gap-2.5">
        <span class="w-3 shrink-0 text-xs text-ink-mute numeral">{{ index + 1 }}</span>
        <div class="min-w-0 flex-1">
          <p class="text-base text-ink font-medium break-words">{{ item.label }}</p>
          <p v-if="item.detail" class="text-xs text-ink-mute break-words mt-0.5">{{ item.detail }}</p>
        </div>
        <span class="shrink-0 text-sm font-semibold text-ink numeral">{{ item.displayValue }}</span>
      </div>
    </li>
  </ol>
</template>
