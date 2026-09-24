<script setup>
/**
 * ImportDevices — เครื่องที่จะสร้าง เติม หรือข้าม และคำเตือนของทะเบียน (#180)
 */
import { computed, ref } from "vue";
import { TriangleAlert } from "lucide-vue-next";
import { formatCount } from "../../lib/format";
import { t } from "../../lib/locale";
import { UiAlert, UiButton } from "../../ui";
import { actionLabel } from "../device-import";

const props = defineProps({ registry: { type: Object, required: true } });

const summary = computed(() => props.registry.summary ?? {});
const showAll = ref(false);
const warnings = computed(() => props.registry.warnings ?? []);
const rows = computed(() => props.registry.attention_rows ?? []);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3" role="status">
      <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("สร้างใหม่") }}</span><strong class="numeral text-lg text-ink" data-testid="summary-create">{{ formatCount(summary.create) }}</strong></div>
      <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("เติมช่องที่ว่าง") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(summary.fill) }}</strong></div>
      <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("ไม่เปลี่ยน") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(summary.unchanged) }}</strong></div>
      <div class="rounded-lg p-3" :class="summary.skip ? 'bg-warn-soft' : 'bg-surface-2'"><span class="block text-xs" :class="summary.skip ? 'text-warn-ink' : 'text-ink-mute'">{{ t("ข้าม") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(summary.skip) }}</strong></div>
    </div>
    <p v-if="summary.create" class="text-sm text-ink-soft">
      {{ t("เครื่องใหม่: ติดตั้งแล้ว {0} · ยังไม่ติดตั้ง {1} · รอตรวจยืนยันการติดตั้ง {2}", [formatCount(summary.installed), formatCount(summary.not_installed), formatCount(summary.unverified)]) }}
      <template v-if="registry.new_floors?.length || registry.new_departments?.length">
        · {{ t("จะสร้างชั้นใหม่ {0} และแผนกใหม่ {1}", [formatCount(registry.new_floors.length), formatCount(registry.new_departments.length)]) }}
      </template>
    </p>

    <UiAlert v-if="warnings.length" tone="warn" data-testid="registry-warnings">
      <strong class="block">{{ t("คำเตือน {0} รายการ — บันทึกได้ แต่ควรตรวจ", [formatCount(registry.warning_count ?? warnings.length)]) }}</strong>
      <ul class="mt-2 list-disc pl-5 text-sm">
        <li v-for="(warning, index) in (showAll ? warnings : warnings.slice(0, 10))" :key="index">{{ [warning.sheet, warning.row && t("แถว {0}", [warning.row]), warning.serial_number].filter(Boolean).join(" · ") }} — {{ warning.reason }}</li>
      </ul>
      <UiButton v-if="warnings.length > 10" size="sm" variant="ghost" class="mt-2" @click="showAll = !showAll">
        {{ showAll ? t("ย่อ") : t("แสดงทั้งหมด") }}
      </UiButton>
    </UiAlert>

    <div v-if="rows.length" class="overflow-x-auto max-h-80 overflow-y-auto" tabindex="0" role="region" :aria-label="t('แถวที่ต้องดู')">
      <table class="w-full text-sm [&_th]:pr-4 [&_td]:pr-4">
        <thead class="sticky top-0 bg-surface">
          <tr class="border-b border-line-soft text-left text-ink-mute">
            <th class="py-2">{{ t("แผ่นงาน") }}</th><th>{{ t("แถว") }}</th><th>Serial</th><th>{{ t("อาคาร") }}</th><th>{{ t("ผล") }}</th><th>{{ t("เหตุผล") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="`${row.sheet}-${row.row}`" class="border-b border-line-soft align-top">
            <td class="py-2">{{ row.sheet }}</td>
            <td class="numeral">{{ row.row }}</td>
            <td class="font-mono text-xs">{{ row.serial_number }}</td>
            <td>{{ row.building || "—" }}</td>
            <td :class="row.action === 'skip' ? 'text-warn-ink font-medium' : 'text-ink'">
              <TriangleAlert v-if="row.action === 'skip'" :size="12" class="inline" aria-hidden="true" /> {{ actionLabel(row.action) }}
            </td>
            <td class="text-ink-soft">{{ [...(row.reasons ?? []), ...(row.notes ?? [])].join(" · ") || "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
