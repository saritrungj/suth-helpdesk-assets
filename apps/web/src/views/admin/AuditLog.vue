<script setup>
/**
 * AuditLog — ประวัติการแก้ไขทั้งระบบ (/admin/audit-log) ผู้ดูแลเท่านั้น (ADR-0035)
 *
 * ตอบคำถาม "ใครแก้อะไร เมื่อไร จากค่าอะไรเป็นค่าอะไร" — ยอดพิมพ์ เครื่อง สัญญา ปีงบ ข้อมูลอ้างอิง ผู้ใช้
 * และงานนำเข้าที่บันทึกแล้ว เดิมระบบตอบได้เฉพาะงานนำเข้า (audit 2026-09-24 F05)
 *
 * ตัวกรองส่งไปที่เซิร์ฟเวอร์ (ประวัติโตได้ไม่จำกัด) แล้วโหลดทีละ 200 แถว — ตารางค้นหา/เรียงในชุดที่โหลดแล้ว
 * ค่าเริ่มต้นดู 30 วันล่าสุด
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { History } from "lucide-vue-next";
import api from "../../services/api";
import { errorMessage } from "../../lib/api-error";
import { formatCount } from "../../lib/format";
import { formatDateTime } from "../../lib/locale-format";
import { t } from "../../lib/locale";
import { UiAlert, UiBadge, UiButton, UiDataTable, UiField, UiFilterBar, UiInput, UiPageHeader, UiSelect } from "../../ui";
import { auditActionOf, auditEntityOptions, auditValueText } from "../../components/audit-log";
import { usePageState } from "../../composables/use-page-state";

const bangkokDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(Date.now() + offsetDays * 86400000));

const defaults = { entity: "", user_id: "", q: "", from: bangkokDate(-30), to: bangkokDate() };
const filters = ref({ ...defaults });
// คืนก่อนติด watcher โหลดข้อมูล — จำเฉพาะตัวกรอง ไม่จำประวัติหรือหน้าตาราง (#283)
usePageState({ filters });
const saved = filters.value;
const validDate = (value) => {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
// sessionStorage เป็น input ที่เชื่อไม่ได้: allow-list และเลือกออกมาเพียงห้าคีย์
filters.value = {
  entity: auditEntityOptions().some(({ value }) => value === saved?.entity) ? saved.entity : "",
  user_id: typeof saved?.user_id === "string" && /^[1-9]\d*$/.test(saved.user_id) && Number.isSafeInteger(Number(saved.user_id)) ? saved.user_id : "",
  q: typeof saved?.q === "string" && saved.q.trim().length <= 100 ? saved.q : "",
  from: validDate(saved?.from) ? saved.from : defaults.from,
  to: validDate(saved?.to) ? saved.to : defaults.to,
};
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const error = ref("");
const users = ref([]);

const PER_PAGE = 200;

async function load({ append = false } = {}) {
  loading.value = true;
  error.value = "";
  try {
    const nextPage = append ? page.value + 1 : 1;
    const { data } = await api.get("/audit-log", {
      params: {
        entity: filters.value.entity || undefined,
        user_id: filters.value.user_id || undefined,
        q: filters.value.q.trim() || undefined,
        from: filters.value.from || undefined,
        to: filters.value.to || undefined,
        page: nextPage,
        per_page: PER_PAGE,
      },
    });
    rows.value = append ? [...rows.value, ...data.rows] : data.rows;
    total.value = data.total;
    page.value = nextPage;
  } catch (err) {
    error.value = errorMessage(err, t("โหลดประวัติการแก้ไขไม่สำเร็จ"));
  } finally {
    loading.value = false;
  }
}

let timer = null;
onBeforeUnmount(() => clearTimeout(timer));
watch(filters, () => {
  clearTimeout(timer);
  timer = setTimeout(() => load(), 350);
}, { deep: true });

onMounted(async () => {
  load();
  try {
    const { data } = await api.get("/users");
    users.value = data.map((user) => ({ id: String(user.id), name: user.username }));
  } catch {
    // ตัวกรองผู้ใช้เป็นตัวช่วย — โหลดไม่ได้ก็ยังดูประวัติได้
  }
});

const hasMore = computed(() => rows.value.length < total.value);

const columns = [
  { key: "occurred_at", label: t("เวลา"), width: "11rem", value: (row) => formatDateTime(row.occurred_at) },
  { key: "username", label: t("ผู้ทำ"), width: "8rem", value: (row) => row.username ?? t("ระบบ") },
  { key: "action", label: t("การกระทำ"), width: "6rem", value: (row) => auditActionOf(row.action).label },
  { key: "summary", label: t("รายละเอียด") },
  { key: "change", label: t("ค่าเดิม → ค่าใหม่"), value: (row) => auditValueText(row.before, row.after, row.names), sortable: false },
];
</script>

<template>
  <div>
    <UiPageHeader :title="t('ประวัติการแก้ไข')" :description="t('ใครแก้อะไร เมื่อไร จากค่าอะไรเป็นค่าอะไร — จำนวนพิมพ์ เครื่อง สัญญา ข้อมูลอ้างอิง ผู้ใช้ และงานนำเข้าที่บันทึกแล้ว ชื่อฝ่าย แผนก อาคาร และสัญญาที่แสดงเป็นชื่อปัจจุบันของรายการนั้น')">
      <template #badge>
        <UiBadge tone="neutral">{{ t("{0} รายการ", [formatCount(total)]) }}</UiBadge>
      </template>
    </UiPageHeader>

    <UiFilterBar role="region" :aria-label="t('ตัวกรองประวัติ')" :collapsible="false" class="mb-3">
      <template #primary>
        <UiField :label="t('ตั้งแต่วันที่')" class="w-44"><UiInput v-model="filters.from" type="date" /></UiField>
        <UiField :label="t('ถึงวันที่')" class="w-44"><UiInput v-model="filters.to" type="date" /></UiField>
        <UiField :label="t('ประเภท')" class="w-48">
          <UiSelect v-model="filters.entity" :options="auditEntityOptions()" value-key="value" label-key="label" :placeholder="t('ทุกประเภท')" />
        </UiField>
        <UiField :label="t('ผู้ทำ')" class="w-44">
          <UiSelect v-model="filters.user_id" :options="users" :placeholder="t('ทุกคน')" />
        </UiField>
        <UiField :label="t('ค้นหา')" class="flex-1 min-w-[14rem]">
          <UiInput v-model="filters.q" clearable :placeholder="t('Serial, เลขที่สัญญา, ชื่อ…')" />
        </UiField>
      </template>
    </UiFilterBar>

    <UiAlert v-if="error" tone="danger" class="mb-3">
      {{ error }}
      <template #actions><UiButton size="sm" variant="secondary" @click="load()">{{ t("ลองใหม่") }}</UiButton></template>
    </UiAlert>

    <UiDataTable
      :rows="rows"
      :columns="columns"
      :loading="loading && !rows.length"
      :searchable="false"
      :caption="t('ประวัติการแก้ไข')"
      :show-fullscreen="false"
      export-filename="audit-log"
      :empty-text="t('ไม่มีการแก้ไขในช่วงที่เลือก')"
      :empty-hint="t('ลองขยายช่วงวันที่ หรือเอาตัวกรองบางตัวออก')"
      :default-page-size="50"
      data-testid="audit-log-table"
    >
      <template #cell-action="{ row }">
        <UiBadge :tone="auditActionOf(row.action).tone" size="sm">{{ auditActionOf(row.action).label }}</UiBadge>
      </template>
      <template #cell-change="{ row }">
        <span class="text-xs text-ink-soft whitespace-pre-line">{{ auditValueText(row.before, row.after, row.names) || "—" }}</span>
      </template>
    </UiDataTable>

    <div v-if="hasMore" class="flex justify-center mt-3">
      <UiButton variant="secondary" :loading="loading" @click="load({ append: true })">
        <template #icon><History :size="15" /></template>
        {{ t("โหลดเพิ่ม ({0} จาก {1})", [formatCount(rows.length), formatCount(total)]) }}
      </UiButton>
    </div>
  </div>
</template>
