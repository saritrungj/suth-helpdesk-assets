<script setup>
/**
 * ImportChecklist — สิ่งที่ต้องทำก่อนบันทึก เรียงตามลำดับที่ผู้ใช้ต้องทำ (#180)
 *
 * รายการมาจาก API ทั้งหมด (session-service.js buildValidation) หน้าเว็บไม่ตัดสินเองว่าอะไรกันการบันทึก
 * ข้อที่มีปุ่ม: สร้างปีงบทำได้ทันที ข้ออื่นพาไปที่ส่วนของหน้านี้ที่ต้องแก้
 */
import { CircleAlert, CircleCheck, Clock, TriangleAlert } from "lucide-vue-next";
import { t } from "../../lib/locale";
import { UiButton } from "../../ui";

defineProps({
  items: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  editable: { type: Boolean, default: true },
});
const emit = defineEmits(["action"]);

const ICON = { ok: CircleCheck, warning: TriangleAlert, blocking: CircleAlert, waiting: Clock };
const TONE = { ok: "text-ok-ink", warning: "text-warn-ink", blocking: "text-danger-ink", waiting: "text-ink-mute" };
const ACTION = {
  create_contract: "สร้างสัญญาจากไฟล์",
  resolve_contract: "ดูความต่าง",
  decide_names: "เลือกชื่อ",
  decide_models: "เลือกหมวด",
  create_fiscal_years: "สร้างปีงบเมื่อยืนยัน",
};
</script>

<template>
  <ol class="flex flex-col gap-2" data-testid="import-checklist">
    <li
      v-for="item in items"
      :key="item.key"
      class="flex items-start gap-2 rounded-lg p-2"
      :class="item.state === 'blocking' ? 'bg-danger-soft' : item.state === 'warning' ? 'bg-warn-soft' : 'bg-surface-2'"
      :data-state="item.state"
      data-testid="checklist-item"
    >
      <component :is="ICON[item.state] ?? Clock" :size="16" class="mt-0.5 shrink-0" :class="TONE[item.state]" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-ink">{{ item.title }}</p>
        <p v-if="item.detail" class="text-xs text-ink-soft">{{ item.detail }}</p>
      </div>
      <UiButton
        v-if="editable && item.action && ACTION[item.action.type]"
        size="sm"
        variant="secondary"
        :disabled="busy"
        @click="emit('action', item)"
      >
        {{ t(ACTION[item.action.type]) }}
      </UiButton>
    </li>
  </ol>
</template>
