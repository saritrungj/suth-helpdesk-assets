<script setup>
import { Info } from "lucide-vue-next";
import { t } from "../lib/locale";
import { UiButton, UiTooltip } from "../ui";
import { APP_NAME, APP_NAME_SHORT, BRAND_ASSETS, ORG_NAME_SHORT } from "./brand";
defineProps({ collapsed: { type: Boolean, default: false } });
defineEmits(["about"]);
</script>

<template>
  <div class="app-brand" :class="collapsed && 'app-brand--rail'">
    <UiTooltip :content="collapsed ? `${APP_NAME} · ${ORG_NAME_SHORT}` : ''" side="right">
      <RouterLink to="/dashboard" class="app-brand__home" tabindex="0" :aria-label="`${APP_NAME} · ${ORG_NAME_SHORT}`">
        <span class="app-brand__mark">
          <img :src="BRAND_ASSETS.wordmark" alt="" width="568" height="138" decoding="async" />
        </span>
        <span v-if="!collapsed" class="app-brand__name">
          <span class="block text-sm font-semibold text-ink leading-tight truncate">{{ APP_NAME_SHORT }}</span>
          <span class="block text-2xs text-ink-mute leading-tight truncate">{{ ORG_NAME_SHORT }}</span>
        </span>
      </RouterLink>
    </UiTooltip>
    <UiButton v-if="!collapsed" variant="ghost" size="sm" icon-only :label="t('ข้อมูลระบบ')" @click="$emit('about', $event)">
      <Info :size="16" aria-hidden="true" />
    </UiButton>
  </div>
</template>
