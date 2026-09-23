<script setup>
/**
 * DeviceImportPanel — นำเข้าทะเบียนเครื่องจากไฟล์ (#132)
 *
 * รับทั้งเทมเพลตของระบบ รายงานสถานะเครื่องของผู้ให้เช่า และรายงานมิเตอร์ ตรวจก่อนแล้วค่อยบันทึก
 * เหมือนหน้านำเข้ายอดมิเตอร์ ระหว่างตรวจผู้ดูแลตัดสินสิ่งที่ระบบไม่เดาให้:
 *
 *   - ชื่อยี่ห้อ อาคาร ฝ่าย ที่ยังไม่รู้จัก → สร้างใหม่ หรือเป็นชื่อเรียกอื่นของรายการเดิม (ADR-0025)
 *   - หมวดมิเตอร์ของแต่ละรุ่น → ครั้งเดียวต่อรุ่น ไฟล์ถัดไปของรุ่นเดิมไม่ต้องเลือกซ้ำ
 *
 * ทุกครั้งที่เลือก หน้านี้ตรวจไฟล์ใหม่กับ API ตัวเลขที่เห็นจึงเป็นของสิ่งที่เลือกล่าสุดเสมอ
 * และปุ่มบันทึกเปิดเมื่อ API บอกว่าครบแล้วเท่านั้น
 */
import { computed, reactive, ref, watch } from "vue";
import { CircleCheck, Download, RefreshCw, TriangleAlert, Upload } from "lucide-vue-next";
import { useQueryClient } from "@tanstack/vue-query";
import api from "../services/api";
import { invalidateAfterWrite } from "../api/invalidate";
import { errorMessage } from "../lib/api-error";
import { formatCount } from "../lib/format";
import { t } from "../lib/locale";
import { UiAlert, UiButton, UiCheckbox, UiInput, UiSelect } from "../ui";
import FileDropzone from "./FileDropzone.vue";
import {
  KIND_LABEL,
  NAME_KINDS,
  actionLabel,
  blockingMessages,
  buildDecisions,
  initialChoices,
  nameOptions,
} from "./device-import";

const emit = defineEmits(["imported"]);
const queryClient = useQueryClient();

const file = ref(null);
const busy = ref(false);
const preview = ref(null);
const result = ref(null);
const error = ref("");
const choices = reactive({ names: {}, models: {}, renames: {} });
const showAllRows = ref(false);

/**
 * ไฟล์ตัวอย่าง — คอลัมน์ตรงกับช่องกรอกในฟอร์ม "เพิ่มทีละเครื่อง" ไฟล์ของผู้ให้เช่าอัปโหลดได้ตรงๆ
 * ไม่ต้องแปลงเป็นเทมเพลตนี้
 */
const TEMPLATE_CSV = [
  "serial_number,brand,model,status,building,floor,location,division,department,contract_no,price_override,meter_category",
  "SN-HP-001,HP,LaserJet M404dn,active,อาคารบริหาร,ชั้น 2,ห้อง 201,ฝ่ายบริหารทั่วไป,งานการเงินและบัญชี,สัญญาเช่า 001/2568,,a4-laser-bw",
  "SN-CN-002,Canon,imageCLASS LBP6030,active,อาคารบริหาร,ชั้น 3,ห้อง 305,ฝ่ายบริหารทั่วไป,งานทรัพยากรบุคคล,สัญญาเช่า 001/2568,,a4-laser-bw",
].join("\r\n");

function downloadTemplate() {
  // BOM นำหน้า เพื่อให้ Excel รู้ว่าเป็น UTF-8 ไม่งั้นภาษาไทยกลายเป็นตัวอ่านไม่ออก
  const url = URL.createObjectURL(new Blob(["﻿" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "template-import-devices.csv";
  link.click();
  URL.revokeObjectURL(url);
}

const blocking = computed(() => blockingMessages(preview.value?.blocking));
const unresolvedKinds = computed(() => NAME_KINDS.filter((kind) => preview.value?.unresolved?.[kind]?.length));
const models = computed(() => preview.value?.models ?? []);
const rows = computed(() => preview.value?.rows ?? []);
const attentionRows = computed(() => rows.value.filter((row) => row.action === "skip" || row.notes?.length));
const visibleRows = computed(() => (showAllRows.value ? rows.value : attentionRows.value));
const summary = computed(() => preview.value?.summary ?? {});
const canCommit = computed(() => Boolean(preview.value?.valid) && !busy.value);

async function send(mode) {
  const body = new FormData();
  body.append("file", file.value);
  body.append("mode", mode);
  body.append("decisions", JSON.stringify(buildDecisions(choices.names, choices.models, choices.renames)));
  const res = await api.post("/devices/import", body, { headers: { "Content-Type": "multipart/form-data" } });
  return res.data;
}

function applyPreview(data) {
  const next = initialChoices(data, { names: choices.names, models: choices.models, renames: choices.renames });
  choices.names = next.names;
  choices.models = next.models;
  choices.renames = next.renames;
  preview.value = data;
}

// เลขลำดับของคำขอล่าสุด — คำตอบของคำขอเก่าที่มาถึงทีหลังต้องไม่ทับผลของสิ่งที่เลือกล่าสุด
let latestRequest = 0;

async function inspect() {
  if (!file.value) return;
  clearTimeout(timer);
  const request = ++latestRequest;
  busy.value = true;
  error.value = "";
  result.value = null;
  try {
    const data = await send("preview");
    if (request === latestRequest) applyPreview(data);
  } catch (err) {
    if (request === latestRequest) error.value = errorMessage(err, t("ตรวจไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
  } finally {
    if (request === latestRequest) busy.value = false;
  }
}

// เลือกแล้วตรวจใหม่อัตโนมัติ — รวมการเลือกหลายช่องติดกันเป็นคำขอเดียว
let timer = null;
watch(
  () => JSON.stringify(buildDecisions(choices.names, choices.models, choices.renames)),
  (next, previous) => {
    if (!preview.value || next === previous) return;
    clearTimeout(timer);
    // พิมพ์ชื่อทางการทีละตัวอักษร — รอให้หยุดพิมพ์ก่อนค่อยตรวจใหม่
    timer = setTimeout(inspect, 700);
  }
);

function createAllUnchosen(kind) {
  for (const name of Object.keys(choices.names[kind] ?? {})) {
    if (!choices.names[kind][name]) choices.names[kind][name] = "create";
  }
}

async function commit() {
  if (!canCommit.value) return;
  clearTimeout(timer);
  latestRequest += 1; // ผลตรวจที่ยังค้างอยู่ห้ามกลับมาทับหน้าผลการบันทึก
  busy.value = true;
  error.value = "";
  try {
    const data = await send("commit");
    result.value = data;
    preview.value = null;
    // การนำเข้าครั้งเดียวสร้างทั้งเครื่อง อาคาร ชั้น ฝ่าย แผนก และยี่ห้อ
    for (const change of ["device", "buildings", "floors", "divisions", "departments", "brands"]) {
      await invalidateAfterWrite(queryClient, change);
    }
    emit("imported", data);
  } catch (err) {
    error.value = errorMessage(err, t("นำเข้าไม่สำเร็จ กรุณาตรวจไฟล์อีกครั้ง"));
  } finally {
    busy.value = false;
  }
}

function selectFile(next) {
  clearTimeout(timer);
  latestRequest += 1;
  file.value = next;
  preview.value = null;
  result.value = null;
  error.value = "";
  choices.names = {};
  choices.models = {};
  choices.renames = {};
  showAllRows.value = false;
}

const kindLabel = (kind) => t(KIND_LABEL[kind]);
const sheetKind = (kind) => (kind === "meter_report" ? t("รายงานมิเตอร์") : t("ทะเบียนเครื่อง"));
</script>

<template>
  <div class="flex flex-col gap-4">
    <UiAlert tone="info" :title="t('อัปโหลดไฟล์ทะเบียนจากผู้ให้เช่าได้ตรงๆ')">
      {{ t("รับรายงานสถานะเครื่องหลายแผ่น รายงานมิเตอร์ หรือไฟล์ตัวอย่างของระบบ ระบบตรวจให้ก่อน แล้วถามเฉพาะสิ่งที่เดาแทนไม่ได้") }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="downloadTemplate">
          <template #icon><Download :size="14" /></template>{{ t("ไฟล์ตัวอย่าง") }}
        </UiButton>
      </template>
    </UiAlert>

    <FileDropzone :model-value="file" :disabled="busy" @update:model-value="selectFile" />

    <div v-if="!preview" class="flex justify-end">
      <UiButton variant="primary" :disabled="!file" :loading="busy" @click="inspect">
        {{ busy ? t("กำลังตรวจไฟล์…") : t("ตรวจไฟล์") }}
      </UiButton>
    </div>

    <UiAlert v-if="error" tone="danger">{{ error }}</UiAlert>

    <UiAlert v-if="result" tone="ok" data-testid="registry-import-result">
      <span class="inline-flex items-center gap-1"><CircleCheck :size="14" aria-hidden="true" />
        {{ t("บันทึกแล้ว: เครื่องใหม่ {0} เครื่อง เติมข้อมูล {1} เครื่อง", [formatCount(result.created), formatCount(result.filled)]) }}</span>
    </UiAlert>

    <template v-if="preview">
      <!-- แผ่นงานที่อ่านได้ -->
      <div class="overflow-x-auto">
        <p class="mb-2 text-sm font-semibold text-ink">{{ t("แผ่นงานที่พบ") }}</p>
        <table class="w-full text-sm [&_th]:pr-4 [&_td]:pr-4">
          <thead>
            <tr class="border-b border-line-soft text-left text-ink-mute">
              <th class="py-2">{{ t("แผ่นงาน") }}</th><th>{{ t("ชนิด") }}</th><th>{{ t("เลขที่สัญญา") }}</th><th class="text-right">{{ t("เครื่อง") }}</th><th>{{ t("หมายเหตุ") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sheet in preview.sheets" :key="sheet.sheet" data-testid="registry-sheet" class="border-b border-line-soft align-top">
              <td class="py-2 font-medium text-ink">{{ sheet.sheet }}</td>
              <td>{{ sheetKind(sheet.kind) }}</td>
              <td>{{ sheet.contract_no || "—" }}</td>
              <td class="text-right numeral">{{ formatCount(sheet.rows) }}</td>
              <td class="text-ink-soft">{{ sheet.notes.join(" · ") || "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- สรุป -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3" role="status">
        <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("สร้างใหม่") }}</span><strong class="numeral text-lg text-ink" data-testid="summary-create">{{ formatCount(summary.create) }}</strong></div>
        <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("เติมช่องที่ว่าง") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(summary.fill) }}</strong></div>
        <div class="rounded-lg bg-surface-2 p-3"><span class="block text-xs text-ink-mute">{{ t("ไม่เปลี่ยน") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(summary.unchanged) }}</strong></div>
        <div class="rounded-lg p-3" :class="summary.skip ? 'bg-warn-soft' : 'bg-surface-2'"><span class="block text-xs" :class="summary.skip ? 'text-warn-ink' : 'text-ink-mute'">{{ t("ข้าม") }}</span><strong class="numeral text-lg text-ink">{{ formatCount(summary.skip) }}</strong></div>
      </div>
      <p v-if="summary.create" class="text-sm text-ink-soft">
        {{ t("เครื่องใหม่: ติดตั้งแล้ว {0} · ยังไม่ติดตั้ง {1} · รอตรวจยืนยันการติดตั้ง {2}", [formatCount(summary.installed), formatCount(summary.not_installed), formatCount(summary.unverified)]) }}
        <template v-if="preview.new_floors.length || preview.new_departments.length">
          · {{ t("จะสร้างชั้นใหม่ {0} และแผนกใหม่ {1}", [formatCount(preview.new_floors.length), formatCount(preview.new_departments.length)]) }}
        </template>
      </p>

      <!-- สิ่งที่ยังกันการบันทึก -->
      <UiAlert v-if="blocking.length" tone="warn" data-testid="registry-blocking">
        <strong class="block">{{ t("ยังบันทึกไม่ได้ — เลือกให้ครบก่อน") }}</strong>
        <ul class="mt-2 list-disc pl-5 text-sm"><li v-for="message in blocking" :key="message">{{ message }}</li></ul>
      </UiAlert>

      <!-- ชื่อที่ยังไม่รู้จัก -->
      <section v-for="kind in unresolvedKinds" :key="kind" class="rounded-lg border border-line-soft p-3" :data-testid="`unresolved-${kind}`">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <p class="text-sm font-semibold text-ink mr-auto">{{ t("{0}ที่ยังไม่มีในระบบ", [kindLabel(kind)]) }}</p>
          <UiButton size="sm" variant="ghost" :disabled="busy" @click="createAllUnchosen(kind)">{{ t("สร้างใหม่ทุกชื่อที่ยังไม่เลือก") }}</UiButton>
        </div>
        <p class="mb-2 text-xs text-ink-mute">{{ t("ชื่อที่เขียนต่างกันแต่เป็นที่เดียวกัน ให้เลือก “ชื่อเรียกอื่นของ…” ระบบจะจำไว้ ไฟล์ครั้งหน้าไม่ต้องเลือกซ้ำ") }}</p>
        <p class="mb-2 text-xs text-ink-mute">{{ t("เลือก “สร้างใหม่” แล้วแก้ชื่อในช่องด้านล่างเป็นชื่อทางการได้ ชื่อในไฟล์จะถูกจำเป็นชื่อเรียกอื่นให้เอง") }}</p>
        <div class="grid gap-2">
          <div v-for="entry in preview.unresolved[kind]" :key="entry.name" class="grid gap-2 sm:grid-cols-[1fr_auto_18rem] sm:items-center">
            <span class="text-sm text-ink break-words">{{ entry.name }}</span>
            <span class="text-xs text-ink-mute numeral">{{ t("{0} แถว", [formatCount(entry.rows)]) }}</span>
            <UiSelect
              v-model="choices.names[kind][entry.name]"
              :options="nameOptions(kind, entry.name, preview.choices[kind], choices.names)"
              value-key="value"
              label-key="label"
              :placeholder="t('— เลือก —')"
              :aria-label="t('ตัดสินชื่อ {0}', [entry.name])"
              :disabled="busy"
            />
            <UiInput
              v-if="choices.names[kind][entry.name] === 'create'"
              v-model="choices.renames[kind][entry.name]"
              class="sm:col-start-3"
              :placeholder="entry.name"
              :aria-label="t('ชื่อที่จะใช้ในระบบสำหรับ {0}', [entry.name])"
              :disabled="busy"
            />
          </div>
        </div>
      </section>

      <!-- หมวดมิเตอร์ของแต่ละรุ่น -->
      <section v-if="models.length" class="rounded-lg border border-line-soft p-3" data-testid="registry-models">
        <p class="text-sm font-semibold text-ink mb-1">{{ t("หมวดมิเตอร์ของแต่ละรุ่น") }}</p>
        <p class="mb-2 text-xs text-ink-mute">{{ t("ใช้คิดเงินตามรายการราคาของสัญญา รุ่นที่เคยลงแล้วระบบเลือกให้ตามเครื่องเดิม") }}</p>
        <div class="grid gap-2">
          <div v-for="model in models" :key="model.key" class="grid gap-2 sm:grid-cols-[1fr_auto_14rem_auto] sm:items-center">
            <span class="text-sm text-ink">{{ model.brand }} {{ model.model }}</span>
            <span class="text-xs text-ink-mute numeral">{{ t("{0} เครื่อง", [formatCount(model.rows)]) }}</span>
            <UiSelect
              v-model="choices.models[model.key].category"
              :options="preview.choices.meter_categories"
              value-key="id"
              label-key="name"
              :placeholder="model.required ? t('— เลือกหมวด —') : t('หมวดทั่วไป (ขาวดำ)')"
              :aria-label="t('หมวดมิเตอร์ของรุ่น {0}', [model.model])"
              :disabled="busy"
            />
            <UiCheckbox v-model="choices.models[model.key].color" :label="t('มีมิเตอร์สี')" :disabled="busy" />
          </div>
        </div>
      </section>

      <!-- คำเตือน -->
      <UiAlert v-if="preview.warnings.length" tone="warn" data-testid="registry-warnings">
        <strong class="block">{{ t("พบคำเตือน {0} รายการ — บันทึกได้ แต่ควรตรวจ", [formatCount(preview.warnings.length)]) }}</strong>
        <ul class="mt-2 list-disc pl-5 text-sm">
          <li v-for="(warning, index) in preview.warnings.slice(0, 20)" :key="index">{{ warning.sheet }} · {{ t("แถว {0}", [warning.row]) }} · {{ warning.serial_number }} — {{ warning.reason }}</li>
        </ul>
        <span v-if="preview.warnings.length > 20" class="block mt-2 text-sm">{{ t("และอีก {0} รายการ", [formatCount(preview.warnings.length - 20)]) }}</span>
      </UiAlert>

      <!-- รายแถว -->
      <div v-if="rows.length">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <p class="text-sm font-semibold text-ink mr-auto">
            {{ showAllRows ? t("ทุกแถว {0} แถว", [formatCount(rows.length)]) : t("แถวที่ต้องดู {0} แถว", [formatCount(attentionRows.length)]) }}
          </p>
          <UiButton size="sm" variant="ghost" :aria-expanded="showAllRows" @click="showAllRows = !showAllRows">
            {{ showAllRows ? t("แสดงเฉพาะแถวที่ต้องดู") : t("แสดงทุกแถว") }}
          </UiButton>
        </div>
        <div v-if="visibleRows.length" class="overflow-x-auto max-h-80 overflow-y-auto" tabindex="0" role="region" :aria-label="t('รายการแถวในไฟล์')">
          <table class="w-full text-sm [&_th]:pr-4 [&_td]:pr-4">
            <thead class="sticky top-0 bg-surface">
              <tr class="border-b border-line-soft text-left text-ink-mute">
                <th class="py-2">{{ t("แผ่นงาน") }}</th><th>{{ t("แถว") }}</th><th>Serial</th><th>{{ t("อาคาร") }}</th><th>{{ t("ฝ่าย") }}</th><th>{{ t("ผล") }}</th><th>{{ t("เหตุผล") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="`${row.sheet}-${row.row}`" data-testid="registry-row" class="border-b border-line-soft align-top">
                <td class="py-2">{{ row.sheet }}</td>
                <td class="numeral">{{ row.row }}</td>
                <td class="font-mono text-xs">{{ row.serial_number }}</td>
                <td>{{ row.building || "—" }}</td>
                <td>{{ row.division || "—" }}</td>
                <td :class="row.action === 'skip' ? 'text-warn-ink font-medium' : 'text-ink'">
                  <TriangleAlert v-if="row.action === 'skip'" :size="12" class="inline" aria-hidden="true" /> {{ actionLabel(row.action) }}
                </td>
                <td class="text-ink-soft">{{ [...row.reasons, ...row.notes].join(" · ") || "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-sm text-ink-mute">{{ t("ไม่มีแถวที่ต้องดู") }}</p>
      </div>

      <div class="flex flex-wrap justify-end gap-2">
        <UiButton variant="secondary" :disabled="busy" @click="inspect">
          <template #icon><RefreshCw :size="14" /></template>{{ t("ตรวจอีกครั้ง") }}
        </UiButton>
        <UiButton variant="primary" :disabled="!canCommit" :loading="busy" data-testid="registry-commit" @click="commit">
          <template #icon><Upload :size="15" /></template>
          {{ busy ? t("กำลังบันทึก…") : t("บันทึก {0} เครื่อง", [formatCount((summary.create ?? 0) + (summary.fill ?? 0))]) }}
        </UiButton>
      </div>
    </template>
  </div>
</template>
