<script setup>
/**
 * DeviceAuditCard — ประวัติการแก้ไขของเครื่องหนึ่ง: ตัวเครื่อง + ยอดพิมพ์ของเครื่องนั้น (ADR-0035)
 * ผู้ดูแลเท่านั้น (API บังคับ) แสดง 20 รายการล่าสุด ดูทั้งหมดที่หน้าประวัติการแก้ไข
 */
import { onMounted, ref, watch } from "vue";
import api from "../services/api";
import { errorMessage } from "../lib/api-error";
import { formatCount } from "../lib/format";
import { formatDateTime } from "../lib/locale-format";
import { t } from "../lib/locale";
import { UiBadge, UiButton, UiCard, UiSkeleton } from "../ui";
import { auditActionOf, auditValueText } from "./audit-log";

const props = defineProps({ deviceId: { type: Number, required: true } });

const rows = ref([]);
const total = ref(0);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const { data } = await api.get("/audit-log", { params: { device_id: props.deviceId, per_page: 20 } });
    rows.value = data.rows;
    total.value = data.total;
  } catch (err) {
    error.value = errorMessage(err, t("โหลดประวัติการแก้ไขไม่สำเร็จ"));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.deviceId, load);
defineExpose({ load });
</script>

<template>
  <UiCard class="mt-4" :eyebrow="t('ประวัติ')" :title="t('การแก้ไขข้อมูลและยอดพิมพ์')" data-testid="device-audit">
    <template v-if="total > rows.length" #actions>
      <UiButton size="sm" variant="ghost" to="/admin/audit-log">{{ t("ดูทั้งหมด {0} รายการ", [formatCount(total)]) }}</UiButton>
    </template>
    <div v-if="loading" class="flex flex-col gap-2"><UiSkeleton v-for="n in 3" :key="n" height="2.5rem" /></div>
    <p v-else-if="error" class="text-sm text-danger-ink">{{ error }}</p>
    <p v-else-if="!rows.length" class="text-sm text-ink-mute">{{ t("ยังไม่มีการแก้ไขตั้งแต่เริ่มบันทึกประวัติ") }}</p>
    <ol v-else class="flex flex-col divide-y divide-line-soft list-none">
      <li v-for="row in rows" :key="row.id" class="py-2.5 flex flex-col gap-0.5">
        <p class="flex flex-wrap items-center gap-2 text-sm">
          <UiBadge :tone="auditActionOf(row.action).tone" size="sm">{{ auditActionOf(row.action).label }}</UiBadge>
          <span class="text-ink">{{ row.summary }}</span>
        </p>
        <p class="text-xs text-ink-mute">
          {{ formatDateTime(row.occurred_at) }} · {{ row.username ?? t("ระบบ") }}
        </p>
        <p v-if="row.entity === 'device' && row.action === 'update'" class="text-xs text-ink-soft whitespace-pre-line">{{ auditValueText(row.before, row.after) }}</p>
      </li>
    </ol>
  </UiCard>
</template>
