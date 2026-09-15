<script setup>
import { useTemplateRef } from "vue";
import { Maximize2, Minimize2 } from "lucide-vue-next";
import { t } from "../lib/locale";
import { useFullscreen } from "./use-fullscreen";
import UiButton from "./UiButton.vue";
import UiTooltip from "./UiTooltip.vue";

/**
 * UiExpandable — ห่อเนื้อหาที่ขยายเต็มจอได้ สำหรับรายงานที่ไม่ใช่ UiDataTable (เช่นต้นไม้
 * สัญญา → เครื่อง)
 *
 * รอบที่ 3 ของ #51: เดิมวาดแถวของตัวเองที่มีปุ่มตัวอักษรลอยชิดขวาอยู่ปุ่มเดียว ผู้ตรวจ
 * ประเมินว่า "แย่มากทั้งหน้า" ตอนนี้หน้าส่งแถบเครื่องมือของตัวเองเข้ามาทาง slot
 * "toolbar" แล้วปุ่มขยายเป็นไอคอนต่อท้ายแถวเดียวกัน ตอนขยายจะขึ้น title ไว้หน้าแถว
 * ให้รู้ว่ากำลังดูอะไรเมื่อหัวหน้าของหน้าถูกซ่อน
 */
defineProps({
  title: { type: String, default: "" },
});
const root = useTemplateRef("root");
const { expanded, expandError, toggleExpanded } = useFullscreen(root);
</script>

<template>
  <div ref="root" class="min-w-0" :class="expanded && 'bg-surface h-screen overflow-auto p-5'">
    <div class="flex flex-wrap items-center gap-2 mb-3" data-print="hide">
      <h2 v-if="expanded && title" class="text-lg font-semibold text-ink mr-2">{{ title }}</h2>
      <slot name="toolbar" />
      <UiTooltip :content="expanded ? t('ย่อตาราง') : t('ขยายตาราง')">
        <UiButton
          class="ml-auto"
          size="sm"
          variant="secondary"
          icon-only
          :label="expanded ? t('ย่อตาราง') : t('ขยายตาราง')"
          @click="toggleExpanded"
        >
          <component :is="expanded ? Minimize2 : Maximize2" :size="15" />
        </UiButton>
      </UiTooltip>
    </div>
    <p v-if="expandError" role="status">{{ expandError }}</p>
    <slot />
  </div>
</template>
