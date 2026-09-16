<script setup>
import UiSkeleton from "./UiSkeleton.vue";

defineProps({
  label: { type: String, required: true },
  value: { type: String, default: "—" },
  unit: { type: String, default: "" },
  size: { type: String, default: "md" },
  loading: { type: Boolean, default: false },
});
</script>

<template>
  <div class="min-w-0">
    <h2 class="text-sm font-medium text-ink-mute tracking-normal">{{ label }}</h2>
    <UiSkeleton v-if="loading" width="9rem" :height="size === 'hero' ? '4rem' : '2.5rem'" class="mt-2" />
    <p v-else class="flex flex-wrap items-baseline gap-x-2 mt-2">
      <span class="font-semibold text-ink tracking-tight leading-tight break-all" :class="size === 'hero' ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl'">{{ value }}</span>
      <span v-if="unit" class="text-sm text-ink-mute">{{ unit }}</span>
    </p>
    <div v-if="$slots.default" class="mt-2 text-sm text-ink-mute"><slot /></div>
  </div>
</template>
