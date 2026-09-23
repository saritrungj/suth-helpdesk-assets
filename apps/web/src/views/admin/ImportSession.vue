<script setup>
/**
 * ImportSession — หน้าตรวจและบันทึกงานนำเข้าหนึ่งไฟล์ (/admin/import/:id) (#180)
 *
 * ## ทำไมงานไม่หายเมื่อออกจากหน้า
 *
 * ไฟล์ การตัดสินใจ และผลตรวจอยู่ใน import session บนเซิร์ฟเวอร์ (ADR-0027) หน้านี้เป็นแค่มุมมองของมัน
 * ทุกครั้งที่เลือก ระบบบันทึกการตัดสินใจเข้า session แล้วตรวจใหม่ (หน่วงเล็กน้อยเพื่อรวมการเลือกหลายช่อง)
 * ถ้ากดออกระหว่างที่ยังไม่ได้ส่ง หน้าส่งให้เสร็จก่อนค่อยออก — กลับมาจากรายการงานค้างหรือรีเฟรชจึงได้ทุกอย่างเดิม
 * และผู้ดูแลคนอื่นเปิดทำต่อได้ (ADR-0029)
 *
 * ## ลำดับของหน้า
 *
 * checklist จาก API บอกว่าเหลืออะไร ส่วนด้านล่างเรียงตามลำดับที่ต้องทำ: สัญญา → ชื่อและหมวดมิเตอร์ → เครื่อง
 * → ยอดมิเตอร์และยอดตามใบแจ้งหนี้ → บันทึก
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { ArrowLeft, CircleCheck, Download, RefreshCw, Upload, XCircle, Sparkles } from "lucide-vue-next";
import api from "../../services/api";
import { keys, useImportSession } from "../../api/queries";
import { invalidateAfterWrites } from "../../api/invalidate";
import { errorMessage, fieldErrors } from "../../lib/api-error";
import { formatCount } from "../../lib/format";
import { formatDateTime } from "../../lib/locale-format";
import { t } from "../../lib/locale";
import { askConfirm } from "../../store/confirmDialog";
import { authState } from "../../store/auth";
import { fiscalYearState, refreshFiscalYears } from "../../store/fiscalYear";
import { toastError, toastSuccess } from "../../store/toast";
import { UiAlert, UiBadge, UiButton, UiCard, UiPageHeader, UiSkeleton } from "../../ui";
import { initialChoices } from "../../components/device-import";
import ImportChecklist from "../../components/import/ImportChecklist.vue";
import ImportAutoSummary from "../../components/import/ImportAutoSummary.vue";
import ImportContracts from "../../components/import/ImportContracts.vue";
import ImportDecisions from "../../components/import/ImportDecisions.vue";
import ImportDevices from "../../components/import/ImportDevices.vue";
import ImportHistory from "../../components/import/ImportHistory.vue";
import ImportReadings from "../../components/import/ImportReadings.vue";
import { EDITABLE, decisionsPayload, fiscalYearForMonths, statusOf } from "../../components/import/import-session";

const route = useRoute();
const queryClient = useQueryClient();
const id = computed(() => Number(route.params.id));

const query = useImportSession(id);
const session = computed(() => query.data.value ?? null);
const validation = computed(() => session.value?.validation ?? null);
const registry = computed(() => validation.value?.registry ?? null);
const editable = computed(() => Boolean(session.value && EDITABLE.has(session.value.status)));
const busy = ref(false);
const actionError = ref("");
const contractErrors = ref({});

// ถ้ามีคนอื่นกำลังตรวจหรือบันทึกงานนี้อยู่ ถามใหม่เรื่อยๆ จนจบ
watch(
  () => session.value?.status,
  (status) => {
    if (status === "validating" || status === "processing") setTimeout(() => query.refetch(), 2000);
  }
);

// ---------- การตัดสินใจ ----------

const choices = reactive({ names: {}, models: {}, renames: {} });
const acknowledged = reactive({});
let loadedFor = null;
let saveTimer = null;
let pendingSave = null;
let lastSent = "";

/** ใส่ค่าจาก session ลงกล่องเลือก — ค่าที่ผู้ใช้เลือกไว้ในหน้านี้ชนะเสมอ */
function applySession(data) {
  if (!data) return;
  if (data.validation?.registry) {
    const next = initialChoices(data.validation.registry, loadedFor === data.id ? choices : { names: {}, models: {}, renames: {} });
    choices.names = next.names;
    choices.models = next.models;
    choices.renames = next.renames;
  }
  if (loadedFor !== data.id) {
    for (const key of Object.keys(acknowledged)) delete acknowledged[key];
    Object.assign(acknowledged, data.decisions?.acknowledged ?? {});
    loadedFor = data.id;
    lastSent = JSON.stringify(decisionsPayload(choices, acknowledged));
  }
}
watch(session, applySession, { immediate: true });

const payload = computed(() => JSON.stringify(decisionsPayload(choices, acknowledged)));

async function saveDecisions() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const body = payload.value;
  if (!editable.value || body === lastSent) return;
  lastSent = body;
  busy.value = true;
  actionError.value = "";
  pendingSave = api.put(`/import-sessions/${id.value}/decisions`, { decisions: JSON.parse(body) });
  try {
    const { data } = await pendingSave;
    // คำตอบของคำขอเก่าที่มาถึงหลังผู้ใช้เลือกต่อแล้ว ไม่ทับกล่องเลือก (applySession เก็บค่าในหน้าไว้)
    queryClient.setQueryData(keys.importSession(id.value), data);
  } catch (err) {
    lastSent = "";
    actionError.value = errorMessage(err, t("บันทึกการตัดสินใจไม่สำเร็จ"));
  } finally {
    pendingSave = null;
    busy.value = false;
  }
}

watch(payload, (next) => {
  if (!loadedFor || next === lastSent || !editable.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDecisions, 700);
});

/** ออกจากหน้าระหว่างที่ยังไม่ได้ส่ง — ส่งให้เสร็จก่อน งานจะรออยู่เมื่อกลับมา */
async function flushPending() {
  if (saveTimer) await saveDecisions();
  if (pendingSave) await pendingSave.catch(() => {});
}
onBeforeRouteLeave(async () => {
  await flushPending();
  return true;
});
function beforeUnload(event) {
  if (saveTimer || pendingSave) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", beforeUnload);
  clearTimeout(saveTimer);
});

// ---------- การกระทำ ----------

let lastFieldErrors = {};
async function run(label, request, after) {
  lastFieldErrors = {};
  await flushPending();
  busy.value = true;
  actionError.value = "";
  try {
    const { data } = await request();
    queryClient.setQueryData(keys.importSession(id.value), data);
    queryClient.invalidateQueries({ queryKey: ["import-sessions"], exact: false, refetchType: "none" });
    if (after) await after(data);
    return data;
  } catch (err) {
    lastFieldErrors = fieldErrors(err);
    actionError.value = errorMessage(err, label);
    toastError(actionError.value);
    return null;
  } finally {
    busy.value = false;
  }
}

const revalidate = () => run(t("ตรวจไฟล์ไม่สำเร็จ"), () => api.post(`/import-sessions/${id.value}/validate`));

/** ให้ระบบเลือกชื่อ หมวดของรุ่น สร้างสัญญาและปีงบที่เหลือให้ (#190) — ไม่บันทึก คนกดบันทึกเอง */
async function autoResolve() {
  const data = await run(t("ให้ระบบเลือกให้ไม่สำเร็จ"), () => api.post(`/import-sessions/${id.value}/auto`, { commit: false }), async () => {
    await refreshFiscalYears();
    await invalidateAfterWrites(queryClient, ["contracts", "fiscal-years"]);
  });
  if (data) toastSuccess(t("ระบบเลือกให้เท่าที่เลือกได้แล้ว"));
}

async function createContract(body) {
  contractErrors.value = {};
  const data = await run(t("สร้างสัญญาไม่สำเร็จ"), () => api.post(`/import-sessions/${id.value}/contracts`, body), () =>
    invalidateAfterWrites(queryClient, ["contracts"])
  );
  if (data) toastSuccess(t("สร้างสัญญา {0} แล้ว", [body.contract_no]));
  else contractErrors.value = lastFieldErrors;
}

async function createFiscalYears(years) {
  const data = await run(t("สร้างปีงบไม่สำเร็จ"), () => api.post(`/import-sessions/${id.value}/fiscal-years`, { years }), async () => {
    await refreshFiscalYears();
    await invalidateAfterWrites(queryClient, ["fiscal-years"]);
  });
  if (data) toastSuccess(t("สร้างปีงบ {0} แล้ว", [years.join(", ")]));
}

async function commit() {
  const s = registry.value?.summary ?? {};
  const r = validation.value?.readings?.counts ?? {};
  const ok = await askConfirm(
    t("จะสร้างเครื่องใหม่ {0} เติมข้อมูล {1} เครื่อง ยอดใหม่ {2} และเขียนทับ {3} รายการ — บันทึกทั้งหมดพร้อมกัน ถ้ามีข้อผิดพลาดจะไม่บันทึกเลยสักรายการ",
      [formatCount(s.create ?? 0), formatCount(s.fill ?? 0), formatCount(r.new ?? 0), formatCount(r.overwrite ?? 0)]),
    { title: t("บันทึกงานนำเข้านี้"), confirmText: t("บันทึก") }
  );
  if (!ok) return;
  const data = await run(t("บันทึกไม่สำเร็จ"), () => api.post(`/import-sessions/${id.value}/commit`), async (result) => {
    if (result.status !== "completed") return;
    await refreshFiscalYears();
    // การนำเข้าครั้งเดียวเขียนหลายชนิด — ล้างแต่ละแคชครั้งเดียว (#180)
    await invalidateAfterWrites(queryClient, ["device", "usage", "contracts", "fiscal-years", "buildings", "floors", "divisions", "departments", "brands"]);
  });
  if (data?.status === "completed") toastSuccess(t("บันทึกงานนำเข้าเรียบร้อย"));
}

async function abandon() {
  const ok = await askConfirm(t("ยกเลิกงานนำเข้านี้? ไฟล์และประวัติยังเก็บไว้ แต่จะบันทึกต่อไม่ได้"), {
    title: t("ยกเลิกงานนำเข้า"),
    confirmText: t("ยกเลิกงานนี้"),
    danger: true,
  });
  if (ok) await run(t("ยกเลิกไม่สำเร็จ"), () => api.post(`/import-sessions/${id.value}/abandon`, {}));
}

async function onChecklistAction(item) {
  const type = item.action?.type;
  if (type === "create_fiscal_years") return createFiscalYears(item.action.years);
  const target = { create_contract: "section-contracts", resolve_contract: "section-contracts", decide_names: "section-decisions", decide_models: "section-decisions" }[type];
  await nextTick();
  document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const fileUrl = computed(() => `${api.defaults.baseURL}/import-sessions/${id.value}/file`);
const notOwner = computed(() => session.value && authState.user && session.value.owner.id !== authState.user.id);
const dashboardFy = computed(() => fiscalYearForMonths(fiscalYearState.list, session.value?.result?.months ?? []));
const openDuplicates = computed(() => (session.value?.duplicates ?? []).filter((d) => d.status !== "completed"));
const completedDuplicates = computed(() => (session.value?.duplicates ?? []).filter((d) => d.status === "completed"));
</script>

<template>
  <div>
    <UiButton to="/admin/import" variant="ghost" size="sm" class="mb-3 -ml-2">
      <template #icon><ArrowLeft :size="15" /></template> {{ t("งานนำเข้าทั้งหมด") }}
    </UiButton>

    <div v-if="query.isPending.value" class="flex flex-col gap-3"><UiSkeleton v-for="n in 5" :key="n" height="3rem" /></div>

    <UiAlert v-else-if="query.isError.value" tone="danger">
      {{ errorMessage(query.error.value, t("โหลดงานนำเข้าไม่สำเร็จ")) }}
      <template #actions><UiButton size="sm" variant="secondary" @click="query.refetch()">{{ t("ลองใหม่") }}</UiButton></template>
    </UiAlert>

    <template v-else-if="session">
      <UiPageHeader :title="session.file.name" :description="t('งานนำเข้า #{0} · เจ้าของ {1} · สร้างเมื่อ {2}', [session.id, session.owner.username, formatDateTime(session.created_at)])">
        <template #badge>
          <UiBadge :tone="statusOf(session.status).tone" dot data-testid="import-status">{{ statusOf(session.status).label }}</UiBadge>
        </template>
        <template #actions>
          <UiButton variant="ghost" size="sm" :href="fileUrl" download>
            <template #icon><Download :size="14" /></template>{{ t("ไฟล์ต้นฉบับ") }}
          </UiButton>
          <UiButton v-if="editable" variant="secondary" size="sm" :disabled="busy" data-testid="revalidate" @click="revalidate">
            <template #icon><RefreshCw :size="14" /></template>{{ t("ตรวจอีกครั้ง") }}
          </UiButton>
          <UiButton v-if="editable" variant="ghost" size="sm" :disabled="busy" @click="abandon">
            <template #icon><XCircle :size="14" /></template>{{ t("ยกเลิกงานนี้") }}
          </UiButton>
        </template>
      </UiPageHeader>

      <p v-if="session.last_activity_by" class="text-xs text-ink-mute -mt-2 mb-3">
        {{ t("ทำล่าสุดโดย {0} เมื่อ {1}", [session.last_activity_by.username, formatDateTime(session.last_activity_at)]) }}
      </p>

      <div class="flex flex-col gap-3 mb-4">
        <UiAlert v-if="notOwner && editable" tone="info">
          {{ t("งานนี้เป็นของ {0} — คุณทำต่อได้ ทุกการกระทำบันทึกในประวัติด้วยชื่อของคุณ", [session.owner.username]) }}
        </UiAlert>
        <UiAlert v-if="validation?.notice && session.status !== 'completed'" tone="warn" data-testid="import-notice">{{ validation.notice.message }}</UiAlert>
        <UiAlert v-if="session.status === 'failed' && session.error" tone="danger" data-testid="import-error">
          <strong class="block">{{ session.error.message }}</strong>
          <span v-if="session.error.detail">{{ session.error.detail }}</span>
        </UiAlert>
        <UiAlert v-if="completedDuplicates.length && session.status !== 'completed'" tone="warn">
          {{ t("ไฟล์นี้เคยบันทึกแล้วในงาน #{0} เมื่อ {1}", [completedDuplicates[0].id, formatDateTime(completedDuplicates[0].completed_at)]) }}
          <template #actions><UiButton size="sm" variant="secondary" :to="`/admin/import/${completedDuplicates[0].id}`">{{ t("ดูงานนั้น") }}</UiButton></template>
        </UiAlert>
        <UiAlert v-if="openDuplicates.length && editable" tone="warn">
          {{ t("ไฟล์เดียวกันเปิดอยู่ในงาน #{0} ของ {1}", [openDuplicates[0].id, openDuplicates[0].owner]) }}
          <template #actions><UiButton size="sm" variant="secondary" :to="`/admin/import/${openDuplicates[0].id}`">{{ t("ไปที่งานนั้น") }}</UiButton></template>
        </UiAlert>
        <UiAlert v-if="actionError" tone="danger">{{ actionError }}</UiAlert>
      </div>

      <!-- ผลการบันทึก -->
      <UiCard v-if="session.status === 'completed' && session.result" class="mb-4" data-testid="import-result">
        <p class="inline-flex items-center gap-2 text-ink font-semibold"><CircleCheck :size="16" class="text-ok-ink" aria-hidden="true" />{{ t("บันทึกแล้วเมื่อ {0}", [formatDateTime(session.completed_at)]) }}</p>
        <p class="text-sm text-ink-soft mt-1">
          {{ t("เครื่องใหม่ {0} · เติมข้อมูล {1} · ยอดใหม่ {2} · เขียนทับ {3}", [formatCount(session.result.devices_created), formatCount(session.result.devices_filled), formatCount(session.result.readings_new), formatCount(session.result.readings_overwritten)]) }}
        </p>
        <ImportAutoSummary v-if="session.result.auto" :auto="session.result.auto" class="mt-3" />
        <div class="flex flex-wrap gap-2 mt-3">
          <UiButton v-if="dashboardFy" variant="primary" size="sm" :to="{ path: '/dashboard', query: { fy: dashboardFy.id } }" data-testid="open-dashboard">
            {{ t("ดูภาพรวมปีงบ {0}", [dashboardFy.year]) }}
          </UiButton>
          <UiButton v-if="dashboardFy" variant="secondary" size="sm" :to="{ path: '/expense', query: { fy: dashboardFy.id } }">{{ t("ค่าใช้จ่าย") }}</UiButton>
          <UiButton variant="secondary" size="sm" to="/assets">{{ t("ทะเบียนเครื่อง") }}</UiButton>
          <UiButton variant="ghost" size="sm" to="/admin/import">{{ t("นำเข้าไฟล์ถัดไป") }}</UiButton>
        </div>
      </UiCard>

      <template v-if="validation">
        <UiCard class="mb-4">
          <ImportAutoSummary v-if="validation.auto && editable" :auto="validation.auto" class="mb-3 pb-3 border-b border-line-soft" />
          <p class="text-sm font-semibold text-ink mb-2">{{ t("สิ่งที่ต้องทำก่อนบันทึก") }}</p>
          <ImportChecklist :items="validation.checklist" :busy="busy" :editable="editable" @action="onChecklistAction" />
          <div v-if="editable" class="flex flex-wrap justify-end gap-2 mt-4">
            <p v-if="busy" class="text-sm text-ink-mute mr-auto" role="status">{{ t("กำลังบันทึกการเลือกและตรวจใหม่…") }}</p>
            <UiButton v-if="!session.can_commit" variant="secondary" :disabled="busy" data-testid="import-auto-resolve" @click="autoResolve">
              <template #icon><Sparkles :size="15" /></template>{{ t("ให้ระบบเลือกส่วนที่เหลือ") }}
            </UiButton>
            <UiButton variant="primary" :disabled="!session.can_commit || busy" :loading="busy && session.status === 'processing'" data-testid="import-commit" @click="commit">
              <template #icon><Upload :size="15" /></template>{{ t("บันทึกทั้งหมด") }}
            </UiButton>
          </div>
        </UiCard>

        <section v-if="validation.contracts?.length" id="section-contracts" class="mb-4">
          <h2 class="text-base font-semibold text-ink mb-2">{{ t("สัญญา") }}</h2>
          <ImportContracts :contracts="validation.contracts" :acknowledged="acknowledged" :editable="editable" :busy="busy" :errors="contractErrors" @create="createContract" />
        </section>

        <section v-if="registry && (registry.unresolved?.brand?.length || registry.unresolved?.building?.length || registry.unresolved?.division?.length || registry.models?.length)" id="section-decisions" class="mb-4">
          <h2 class="text-base font-semibold text-ink mb-2">{{ t("ชื่อที่ไม่รู้จักและหมวดมิเตอร์") }}</h2>
          <ImportDecisions :registry="registry" :choices="choices" :editable="editable" />
        </section>

        <section v-if="registry" class="mb-4">
          <h2 class="text-base font-semibold text-ink mb-2">{{ t("เครื่อง") }}</h2>
          <!-- ก่อนมีสัญญา ทุกแถวถูกนับเป็น "ข้าม" ซึ่งอ่านแล้วเหมือนไฟล์ผิด — จริงๆ แค่รอสัญญา -->
          <p v-if="validation.contracts?.some((c) => c.state === 'missing')" class="text-sm text-ink-mute">
            {{ t("จำนวนเครื่องที่จะสร้างและเติมจะขึ้นหลังสร้างสัญญาด้านบน") }}
          </p>
          <ImportDevices v-else :registry="registry" />
        </section>

        <section v-if="validation.readings && validation.readings.status !== 'none'" class="mb-4">
          <h2 class="text-base font-semibold text-ink mb-2">{{ t("ยอดมิเตอร์") }}</h2>
          <ImportReadings :readings="validation.readings" :reconciliation="validation.reconciliation" />
        </section>
      </template>

      <UiCard>
        <p class="text-sm font-semibold text-ink mb-2">{{ t("ประวัติของงานนี้") }}</p>
        <ImportHistory :events="session.events ?? []" />
      </UiCard>
    </template>
  </div>
</template>
