<script setup>
import { t } from "../lib/locale";
import { errorMessage } from "../lib/api-error";

/**
 * DeviceImportPanel — นำเข้าทะเบียนเครื่องจากไฟล์ CSV/Excel
 *
 * เป็นทางลัดที่สำคัญที่สุดของระบบตอนเริ่มใช้งาน: โรงพยาบาลมีทะเบียนเครื่องอยู่
 * ในไฟล์ Excel อยู่แล้ว การพิมพ์เข้าใหม่ทีละร้อยเครื่องคือเหตุผลอันดับหนึ่งที่
 * ระบบใหม่ไม่ถูกใช้จริง
 *
 * สิ่งที่ตั้งใจออกแบบไว้
 *   - ดาวน์โหลดไฟล์ตัวอย่างได้ก่อน พร้อมข้อมูลตัวอย่างที่กรอกครบ ไม่ใช่หัวตาราง
 *     เปล่าๆ — คนจะได้เห็นว่าค่าแต่ละช่องหน้าตาแบบไหนถึงจะผ่าน
 *   - ผลลัพธ์แยกให้ชัดว่า "เข้าไปกี่แถว" กับ "ข้ามไปกี่แถวเพราะอะไร" พร้อม
 *     ตารางเหตุผลรายแถว เพื่อให้แก้ไฟล์แล้วนำเข้าซ้ำได้เลย
 *   - เหตุผลที่ข้ามเขียนเป็นภาษาที่บอกทางแก้ ("ไม่พบยี่ห้อ X ในระบบ") มาจากฝั่ง
 *     API ซึ่งเป็นคนตัดสินจริงว่าแถวไหนผ่าน
 */
import { computed, ref } from "vue";
import { CircleCheck, Download, TriangleAlert, Upload } from "lucide-vue-next";
import api from "../services/api";
import { useQueryClient } from "@tanstack/vue-query";
import { invalidateAfterWrite } from "../api/invalidate";
import { formatCount } from "../lib/format";
import { UiAlert, UiButton, UiCard } from "../ui";
import FileDropzone from "./FileDropzone.vue";

const emit = defineEmits(["imported"]);

const queryClient = useQueryClient();

const file = ref(null);
const uploading = ref(false);
const result = ref(null);

const skipped = computed(() => result.value?.skipped ?? []);

/**
 * ไฟล์ตัวอย่าง — คอลัมน์ตรงกับช่องกรอกในฟอร์ม "เพิ่มทีละเครื่อง" ทุกช่อง
 * serial_number / brand / building บังคับ ที่เหลือเว้นว่างได้
 * ค่าที่กรอกในช่องอ้างอิง (ยี่ห้อ อาคาร ชั้น ฝ่าย แผนก สัญญา) ต้องตรงกับชื่อที่มี
 * อยู่จริงในระบบ ไม่งั้นแถวนั้นจะถูกข้ามพร้อมบอกเหตุผล
 */
const TEMPLATE_CSV = [
  "serial_number,brand,model,status,building,floor,location,division,department,contract_no,price_override",
  "SN-HP-001,HP,LaserJet M404dn,active,อาคารบริหาร,ชั้น 2,ห้อง 201,ฝ่ายบริหารทั่วไป,งานการเงินและบัญชี,สัญญาเช่า 001/2568,",
  "SN-CN-002,Canon,imageCLASS LBP6030,active,อาคารบริหาร,ชั้น 3,ห้อง 305,ฝ่ายบริหารทั่วไป,งานทรัพยากรบุคคล,สัญญาเช่า 001/2568,",
  "SN-EP-003,Epson,EcoTank L3250,repair,อาคารผู้ป่วยนอก,ชั้น 1,เคาน์เตอร์ OPD,ฝ่ายการพยาบาล,งานผู้ป่วยนอก,สัญญาเช่า 001/2568,1.50",
].join("\r\n");

function downloadTemplate() {
  // BOM นำหน้า เพื่อให้ Excel รู้ว่าเป็น UTF-8 ไม่งั้นภาษาไทยกลายเป็นตัวอ่านไม่ออก
  const blob = new Blob(["﻿" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "template-import-devices.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function upload() {
  if (!file.value) return;

  uploading.value = true;
  result.value = null;

  const body = new FormData();
  body.append("file", file.value);

  try {
    const res = await api.post("/devices/import", body, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    result.value = res.data;

    // นำเข้าทีเดียวหลายร้อยเครื่อง — ทุกหน้าที่นับเครื่องเปลี่ยนหมด
    await invalidateAfterWrite(queryClient, "device");

    emit("imported", res.data);
  } catch (err) {
    console.error("Import devices error:", err);
    result.value = { error: errorMessage(err, t("นำเข้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")) };
  } finally {
    uploading.value = false;
  }
}

// เลือกไฟล์ใหม่ = ล้างผลลัพธ์เก่า กันสับสนว่าผลที่เห็นเป็นของไฟล์ไหน
function onFileChange(next) {
  file.value = next;
  result.value = null;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UiAlert tone="info" :title="t(&quot;นำเข้าจากไฟล์ที่มีอยู่แล้วจะเร็วกว่ามาก&quot;)"> {{ t("กรอกข้อมูลลงไฟล์ตัวอย่าง แล้วอัปโหลดกลับมาได้ทั้งหมดในครั้งเดียว แถวที่ข้อมูลอ้างอิงไม่ตรงกับในระบบจะถูกข้ามพร้อมบอกเหตุผลรายแถว") }} <template #actions>
        <UiButton size="sm" variant="secondary" @click="downloadTemplate">
          <template #icon><Download :size="14" /></template> {{ t("ไฟล์ตัวอย่าง") }} </UiButton>
      </template>
    </UiAlert>

    <FileDropzone :model-value="file" :disabled="uploading" @update:model-value="onFileChange" />

    <div class="flex justify-end">
      <UiButton variant="primary" :disabled="!file" :loading="uploading" @click="upload">
        <template #icon><Upload :size="15" /></template>
        {{ uploading ? t("กำลังนำเข้า…") : t("นำเข้าข้อมูล") }}
      </UiButton>
    </div>

    <UiAlert v-if="result?.error" tone="danger">{{ result.error }}</UiAlert>

    <template v-else-if="result">
      <div class="grid grid-cols-3 gap-3">
        <div class="card px-4 py-3">
          <p class="eyebrow"> {{ t("แถวในไฟล์") }} </p>
          <p class="text-xl font-semibold text-ink numeral mt-0.5">
            {{ formatCount(result.total_rows) }}
          </p>
        </div>

        <div class="card px-4 py-3 border-ok-line bg-ok-soft/40">
          <p class="eyebrow flex items-center gap-1 text-ok-ink">
            <CircleCheck :size="12" aria-hidden="true" /> {{ t("บันทึกสำเร็จ") }} </p>
          <p class="text-xl font-semibold text-ok-ink numeral mt-0.5">
            {{ formatCount(result.inserted) }}
          </p>
        </div>

        <div
          class="card px-4 py-3"
          :class="skipped.length && 'border-warn-line bg-warn-soft/40'"
        >
          <p class="eyebrow flex items-center gap-1" :class="skipped.length && 'text-warn-ink'">
            <TriangleAlert v-if="skipped.length" :size="12" aria-hidden="true" /> {{ t("ข้ามไป") }} </p>
          <p
            class="text-xl font-semibold numeral mt-0.5"
            :class="skipped.length ? 'text-warn-ink' : 'text-ink'"
          >
            {{ formatCount(skipped.length) }}
          </p>
        </div>
      </div>

      <UiCard
        v-if="skipped.length"
        flush
        :title="t(&quot;แถวที่ยังไม่ได้บันทึก&quot;)"
        :description="t(&quot;แก้ค่าในไฟล์ให้ตรงกับชื่อที่มีอยู่จริงในระบบ แล้วนำเข้าไฟล์เดิมซ้ำได้เลย&quot;)"
      >
        <div class="overflow-x-auto max-h-72">
          <table class="w-full text-sm border-collapse">
            <thead class="sticky top-0 bg-surface-2">
              <tr>
                <th class="text-left font-semibold text-xs text-ink-mute px-4 py-2 border-b border-line-soft">
                  Serial
                </th>
                <th class="text-left font-semibold text-xs text-ink-mute px-4 py-2 border-b border-line-soft"> {{ t("ยี่ห้อ") }} </th>
                <th class="text-left font-semibold text-xs text-ink-mute px-4 py-2 border-b border-line-soft"> {{ t("อาคาร") }} </th>
                <th class="text-left font-semibold text-xs text-ink-mute px-4 py-2 border-b border-line-soft"> {{ t("เหตุผลที่ข้าม") }} </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in skipped" :key="index" class="border-b border-line-soft last:border-0">
                <td class="px-4 py-2 font-mono text-xs text-ink-soft">{{ row.serial_number }}</td>
                <td class="px-4 py-2 text-ink-soft">{{ row.brand || "—" }}</td>
                <td class="px-4 py-2 text-ink-soft">{{ row.building || "—" }}</td>
                <td class="px-4 py-2 text-warn-ink">{{ row.reason }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UiCard>
    </template>
  </div>
</template>
