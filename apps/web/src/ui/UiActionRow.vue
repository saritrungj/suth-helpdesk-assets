<script setup>
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { ArrowRight } from "lucide-vue-next";

const props = defineProps({
  /** Route target for an actionable row; omit it to render a non-interactive row. */
  to: { type: [String, Object], default: null },
});

const tag = computed(() => props.to ? RouterLink : "div");
</script>

<template>
  <component
    :is="tag"
    :to="to || undefined"
    class="block rounded-r-lg py-2.5 pl-3 pr-3"
    :class="to && 'transition-shadow hover:shadow-e1 focus-visible:outline-2 focus-visible:outline-brand-ring'"
  >
    <slot />
    <span v-if="to" class="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink">
      <slot name="action" />
      <ArrowRight class="size-3.5" aria-hidden="true" />
    </span>
  </component>
</template>
