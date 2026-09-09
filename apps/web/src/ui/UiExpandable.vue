<script setup>
import { useTemplateRef } from "vue";
import { t } from "../lib/locale";
import { useFullscreen } from "./use-fullscreen";
import UiButton from "./UiButton.vue";

const root = useTemplateRef("root");
const { expanded, expandError, toggleExpanded } = useFullscreen(root);
</script>

<template>
  <div ref="root" class="min-w-0 bg-surface" :class="expanded && 'h-screen overflow-auto p-5'">
    <div class="flex justify-end mb-3">
      <UiButton size="sm" variant="secondary" @click="toggleExpanded">
        {{ expanded ? t("ย่อตาราง") : t("ขยายตาราง") }}
      </UiButton>
    </div>
    <p v-if="expandError" role="status">{{ expandError }}</p>
    <slot />
  </div>
</template>
