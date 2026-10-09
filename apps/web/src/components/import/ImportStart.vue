<script setup>
/**
 * ImportStart — จุดเริ่มงานนำเข้าไฟล์ (#180)
 *
 * อัปโหลดไฟล์แล้วไปหน้าตรวจของงานนั้นทันที และแสดงงานที่ยังไม่เสร็จของผู้ดูแลทุกคน (ADR-0029)
 * งานอยู่บนเซิร์ฟเวอร์ (ADR-0027) — ออกจากหน้าแล้วกลับมาทำต่อจากรายการนี้ได้ ไม่ต้องอัปโหลดใหม่
 * ใช้ทั้งหน้า "นำเข้าไฟล์จากผู้ให้เช่า" และแท็บนำเข้าของหน้าเพิ่มเครื่อง
 */
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { Download, FolderOpen } from "lucide-vue-next";
import api from "../../services/api";
import { keys, useImportSessions } from "../../api/queries";
import { errorMessage } from "../../lib/api-error";
import { formatCount } from "../../lib/format";
import { formatDateTime } from "../../lib/locale-format";
import { t } from "../../lib/locale";
import { UiAlert, UiBadge, UiButton, UiCheckbox, UiMenu, UiMenuItem, UiSkeleton } from "../../ui";
import FileDropzone from "../FileDropzone.vue";
import { statusOf } from "./import-session";
import { TEMPLATE_CSV, downloadCsv, readingsTemplateCsv } from "./templates";

const router = useRouter();
const queryClient = useQueryClient();

const showClosed = ref(false);
const sessions = useImportSessions(showClosed);
const rows = computed(() => sessions.data.value ?? []);

// ให้ระบบเตรียมให้ (#190, ADR-0030/0034) — เลือกชื่อ หมวดของรุ่น และเตรียมสัญญา/ปีงบจากหัวรายงาน แต่ **ไม่บันทึก**
// ผู้ดูแลเห็นสรุปสิ่งที่จะเกิดในหน้างานแล้วกดยืนยันเอง (#207) จำค่าไว้ในเบราว์เซอร์นี้
const AUTO_KEY = "suth.import.auto";
function readAuto() {
  try { return localStorage.getItem(AUTO_KEY) !== "off"; } catch { return true; }
}
const autoCommit = ref(readAuto());
watch(autoCommit, (value) => {
  try { localStorage.setItem(AUTO_KEY, value ? "on" : "off"); } catch { /* Storage may be disabled. */ }
});

const uploading = ref(false);
const uploadError = ref("");

async function upload(file) {
  if (!file || uploading.value) return;
  uploading.value = true;
  uploadError.value = "";
  try {
    const body = new FormData();
    body.append("file", file);
    if (autoCommit.value) body.append("auto", "resolve");
    const { data } = await api.post("/import-sessions", body, { headers: { "Content-Type": "multipart/form-data" } });
    queryClient.setQueryData(keys.importSession(data.id), data);
    queryClient.invalidateQueries({ queryKey: ["import-sessions"] });
    await router.push(`/admin/import/${data.id}`);
  } catch (err) {
    uploadError.value = errorMessage(err, t("อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
  } finally {
    uploading.value = false;
  }
}

function headline(row) {
  const h = row.headline ?? {};
  if (row.status === "completed") {
    return t("เครื่องใหม่ {0} · ตัวเลขใหม่ {1} · แทนที่ {2}", [formatCount(h.devices_created ?? 0), formatCount(h.readings_new ?? 0), formatCount(h.readings_overwritten ?? 0)]);
  }
  if (row.blocking) return t("ยังต้องทำอีก {0} ข้อ", [formatCount(row.blocking)]);
  return t("สร้าง {0} · เติม {1} · ใหม่ {2}", [formatCount(h.devices_create ?? 0), formatCount(h.devices_fill ?? 0), formatCount(h.readings_new ?? 0)]);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UiAlert tone="info" :title="t('อัปโหลดไฟล์จากผู้ให้เช่าได้ตรงๆ')">
      {{ t("รายงานมิเตอร์ได้ทั้งเครื่องและจำนวนพิมพ์ในครั้งเดียว ระบบตรวจให้แล้วบอกทีละข้อว่าต้องทำอะไร ออกจากหน้าแล้วกลับมาทำต่อได้") }}
      <template #actions>
        <UiMenu :label="t('ไฟล์ตัวอย่าง')">
          <template #trigger>
            <UiButton size="sm" variant="secondary">
              <template #icon><Download :size="14" /></template>{{ t("ไฟล์ตัวอย่าง") }}
            </UiButton>
          </template>
          <UiMenuItem @select="downloadCsv(TEMPLATE_CSV, 'template-import-devices.csv')">{{ t("ทะเบียนเครื่อง") }}</UiMenuItem>
          <UiMenuItem @select="downloadCsv(readingsTemplateCsv(), 'template-import-print-usage.csv')">{{ t("จำนวนพิมพ์รายเดือน") }}</UiMenuItem>
        </UiMenu>
      </template>
    </UiAlert>

    <FileDropzone :model-value="null" :disabled="uploading" @update:model-value="upload" />
    <div>
      <UiCheckbox v-model="autoCommit" :disabled="uploading" :label="t('ให้ระบบเตรียมข้อมูลที่ขาดให้ แล้วแสดงก่อนบันทึก')" data-testid="import-auto-toggle" />
      <p class="text-xs text-ink-mute mt-1 pl-6">
        {{ t("ระบบเตรียมสัญญาจากหัวรายงาน ปีงบ ยี่ห้อ อาคาร ฝ่าย และเลือกหมวดของรุ่นที่รู้จักให้ แล้วแสดงสรุปว่าจะบันทึกอะไร — ยังไม่มีอะไรเข้าระบบจนกว่าคุณจะกดยืนยัน") }}
      </p>
    </div>
    <p v-if="uploading" class="text-sm text-ink-soft" role="status">{{ autoCommit ? t("กำลังอัปโหลด ตรวจ และเตรียมข้อมูล… ไฟล์ใหญ่อาจใช้เวลาครึ่งนาที") : t("กำลังอัปโหลดและตรวจไฟล์…") }}</p>
    <UiAlert v-if="uploadError" tone="danger">{{ uploadError }}</UiAlert>

    <section class="min-w-0 rounded-lg border border-line-soft p-3" data-testid="import-sessions">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <p class="text-sm font-semibold text-ink mr-auto">
          {{ showClosed ? t("งานนำเข้าทั้งหมด") : t("งานนำเข้าที่ยังไม่เสร็จ") }}
        </p>
        <UiCheckbox v-model="showClosed" :label="t('แสดงงานที่ปิดแล้ว')" />
      </div>
      <div v-if="sessions.isPending.value" class="flex flex-col gap-2"><UiSkeleton v-for="n in 3" :key="n" height="2rem" /></div>
      <UiAlert v-else-if="sessions.isError.value" tone="danger">
        {{ t("โหลดรายการงานนำเข้าไม่สำเร็จ") }}
        <template #actions><UiButton size="sm" variant="secondary" @click="sessions.refetch()">{{ t("ลองใหม่") }}</UiButton></template>
      </UiAlert>
      <p v-else-if="!rows.length" class="text-sm text-ink-mute">{{ t("ไม่มีงานที่ค้างอยู่") }}</p>
      <!-- จอแคบกว่า sm แสดงเป็นการ์ดแบบเดียวกับ UiDataTable — เจ็ดคอลัมน์ล้นจอ 320px (#318) -->
      <div v-else class="hidden sm:block overflow-x-auto">
        <table class="w-full text-sm [&_th]:pr-4 [&_td]:pr-4">
          <thead>
            <tr class="border-b border-line-soft text-left text-ink-mute">
              <th class="py-2">{{ t("ไฟล์") }}</th><th>{{ t("สถานะ") }}</th><th>{{ t("เจ้าของ") }}</th><th>{{ t("สร้างเมื่อ") }}</th><th>{{ t("ใช้ล่าสุด") }}</th><th>{{ t("สรุป") }}</th><th><span class="sr-only">{{ t("การกระทำ") }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-b border-line-soft align-top" data-testid="import-session-row">
              <td class="py-2 font-medium text-ink break-all">{{ row.file_name }}</td>
              <td><UiBadge :tone="statusOf(row.status).tone" dot>{{ statusOf(row.status).label }}</UiBadge></td>
              <td>{{ row.owner.username }}</td>
              <td class="numeral whitespace-nowrap">{{ formatDateTime(row.created_at) }}</td>
              <td class="numeral whitespace-nowrap">
                {{ formatDateTime(row.last_activity_at) }}
                <span v-if="row.last_activity_by" class="block text-xs text-ink-mute">{{ row.last_activity_by.username }}</span>
              </td>
              <td class="text-ink-soft">{{ headline(row) }}</td>
              <td class="text-right">
                <UiButton size="sm" variant="secondary" :to="`/admin/import/${row.id}`">
                  <template #icon><FolderOpen :size="14" /></template>
                  {{ ["draft", "ready", "failed"].includes(row.status) ? t("ทำต่อ") : t("ดู") }}
                </UiButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul v-if="!sessions.isPending.value && !sessions.isError.value && rows.length" class="sm:hidden flex flex-col gap-2 list-none">
        <li v-for="row in rows" :key="row.id" class="card p-3" data-testid="import-session-card">
          <p class="text-sm font-medium text-ink break-all">{{ row.file_name }}</p>
          <dl class="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 mt-2">
            <dt class="text-xs text-ink-mute">{{ t("สถานะ") }}</dt>
            <dd class="text-sm text-right min-w-0"><UiBadge :tone="statusOf(row.status).tone" dot>{{ statusOf(row.status).label }}</UiBadge></dd>
            <dt class="text-xs text-ink-mute">{{ t("เจ้าของ") }}</dt>
            <dd class="text-sm text-ink-soft text-right min-w-0 break-words">{{ row.owner.username }}</dd>
            <dt class="text-xs text-ink-mute">{{ t("สร้างเมื่อ") }}</dt>
            <dd class="numeral text-sm text-ink-soft text-right min-w-0">{{ formatDateTime(row.created_at) }}</dd>
            <dt class="text-xs text-ink-mute">{{ t("ใช้ล่าสุด") }}</dt>
            <dd class="numeral text-sm text-ink-soft text-right min-w-0">
              {{ formatDateTime(row.last_activity_at) }}
              <span v-if="row.last_activity_by" class="block text-xs text-ink-mute">{{ row.last_activity_by.username }}</span>
            </dd>
            <dt class="text-xs text-ink-mute">{{ t("สรุป") }}</dt>
            <dd class="text-sm text-ink-soft text-right min-w-0 break-words">{{ headline(row) }}</dd>
          </dl>
          <div class="flex justify-end mt-3 pt-3 border-t border-line-soft">
            <UiButton size="sm" variant="secondary" :to="`/admin/import/${row.id}`">
              <template #icon><FolderOpen :size="14" /></template>
              {{ ["draft", "ready", "failed"].includes(row.status) ? t("ทำต่อ") : t("ดู") }}
            </UiButton>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
