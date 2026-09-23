<script setup>
/**
 * ImportAutoSummary — สิ่งที่ระบบตัดสินและสร้างให้เองในงานนำเข้า และเหตุผลที่หยุดถาม (#190, ADR-0030)
 */
import { computed } from "vue";
import { Sparkles } from "lucide-vue-next";
import { formatCount } from "../../lib/format";
import { t } from "../../lib/locale";
import { autoMadeLines } from "./import-session";

const props = defineProps({ auto: { type: Object, required: true } });

const lines = computed(() => autoMadeLines(props.auto.made));
const stopped = computed(() => props.auto.stopped ?? []);
</script>

<template>
  <div class="flex flex-col gap-2 text-sm" data-testid="import-auto">
    <p class="inline-flex items-center gap-2 font-semibold text-ink">
      <Sparkles :size="15" class="text-brand-ink" aria-hidden="true" />
      {{ lines.length ? t("ระบบสร้างและเลือกให้เอง") : t("ระบบไม่ได้เลือกอะไรให้") }}
    </p>
    <ul v-if="lines.length" class="list-disc pl-5 text-ink-soft">
      <li v-for="line in lines" :key="line">{{ line }}</li>
    </ul>
    <template v-if="stopped.length">
      <p class="font-semibold text-warn-ink mt-1">{{ t("หยุดให้คุณดูก่อนบันทึก {0} เรื่อง", [formatCount(stopped.length)]) }}</p>
      <ul class="list-disc pl-5 text-ink" data-testid="import-auto-stopped">
        <li v-for="reason in stopped" :key="reason">{{ reason }}</li>
      </ul>
    </template>
  </div>
</template>
