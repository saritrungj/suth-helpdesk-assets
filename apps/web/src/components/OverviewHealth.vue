<script setup>
/**
 * OverviewHealth — ข้อมูลของหน้าภาพรวมเชื่อได้แค่ไหน (#212)
 *
 * สามคำถามที่ต้องตอบก่อนอ่านตัวเลข: กรอกครบทุกเดือนหรือยัง · ยังมีเครื่องที่ไม่รู้ว่าติดตั้งแล้วหรือไม่ ·
 * ยังมีเครื่องที่ไม่รู้ว่าอยู่ฝ่าย/อาคารไหน — เดิมเรื่องเหล่านี้อยู่ในกระดิ่งซึ่งคนแทบไม่เปิด ตัวเลขบนการ์ดจึงถูก
 * อ่านเหมือนครบแล้วทั้งที่ยังไม่ครบ แต่ละข้อมีปุ่มพาไปแก้ที่หน้าที่แก้ได้จริง
 */
import { computed } from "vue";
import { CircleAlert, CircleCheck } from "lucide-vue-next";
import { formatCount } from "../lib/format";
import { formatMonth } from "../lib/locale-format";
import { t } from "../lib/locale";
import { UiButton } from "../ui";

const props = defineProps({
  /** คำตอบของ /dashboard/overview */
  overview: { type: Object, default: null },
  currentMonth: { type: String, default: "" },
  fiscalYearId: { type: [Number, String], default: null },
  isAdmin: { type: Boolean, default: false },
});

const items = computed(() => {
  const o = props.overview;
  if (!o) return [];
  const past = (o.coverage?.months ?? []).filter((m) => m.required_devices > 0 && (!props.currentMonth || m.month < props.currentMonth));
  const incomplete = past.filter((m) => m.filled_devices < m.required_devices);
  const oldest = incomplete[0];
  const list = [
    {
      key: "months",
      ok: !incomplete.length,
      text: incomplete.length
        ? t("กรอกยอดครบ {0} จาก {1} เดือนที่ผ่านมา", [formatCount(past.length - incomplete.length), formatCount(past.length)])
        : t("กรอกยอดครบทุกเดือนที่ผ่านมา ({0} เดือน)", [formatCount(past.length)]),
      detail: oldest ? t("{0} ขาดอีก {1} เครื่อง", [formatMonth(oldest.month), formatCount(oldest.required_devices - oldest.filled_devices)]) : "",
      action: oldest ? { label: t("ไปกรอก"), to: { path: "/print-transactions", query: { month: oldest.month, fill: "empty", fy: props.fiscalYearId || undefined } } } : null,
    },
  ];
  const unreviewed = Number(o.coverage?.unreviewed_devices) || 0;
  if (unreviewed) {
    list.push({
      key: "installation",
      ok: false,
      text: t("{0} เครื่องยังไม่ได้ตรวจยืนยันการติดตั้ง", [formatCount(unreviewed)]),
      detail: t("ยืนยันความครบของยอดไม่ได้จนกว่าจะตรวจ"),
      action: props.isAdmin ? { label: t("ไปตรวจ"), to: "/admin/installation-review" } : null,
    });
  }
  const noLocation = Number(o.missing_location_devices) || 0;
  if (noLocation) {
    list.push({
      key: "location",
      ok: false,
      text: t("{0} เครื่องยังไม่ระบุฝ่ายหรืออาคาร", [formatCount(noLocation)]),
      detail: t("ยอดของเครื่องกลุ่มนี้ไปอยู่ที่ \"ไม่ระบุฝ่าย\""),
      action: { label: t("ดูเครื่อง"), to: { path: "/assets", query: { missing: "location", status: "active" } } },
    });
  }
  return list;
});
</script>

<template>
  <section v-if="items.length" class="card mb-4 grid gap-px overflow-hidden sm:grid-cols-3 bg-line-soft" :aria-label="t('ความครบถ้วนของข้อมูล')" data-testid="overview-health">
    <div v-for="item in items" :key="item.key" class="bg-surface p-3 flex items-start gap-2.5 min-w-0" :data-testid="`health-${item.key}`">
      <component :is="item.ok ? CircleCheck : CircleAlert" :size="18" class="shrink-0 mt-0.5" :class="item.ok ? 'text-ok-ink' : 'text-warn-ink'" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-ink">{{ item.text }}</p>
        <p v-if="item.detail" class="text-xs text-ink-mute mt-0.5">{{ item.detail }}</p>
      </div>
      <UiButton v-if="item.action" size="sm" variant="secondary" :to="item.action.to" class="shrink-0">{{ item.action.label }}</UiButton>
    </div>
  </section>
</template>
