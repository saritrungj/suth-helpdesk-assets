<script setup>
import { t } from "../lib/locale";

/**
 * FileDropzone — ช่องรับไฟล์แบบลากมาวางหรือกดเลือก
 *
 * ใช้ทั้งการนำเข้าทะเบียนเครื่องและการนำเข้ายอดมิเตอร์ ทั้งสองที่เดิมเขียนช่อง
 * อัปโหลดของตัวเองแยกกัน หน้าตาและพฤติกรรมจึงไม่เหมือนกัน
 *
 * จุดที่ตั้งใจทำให้ถูกต้องตั้งแต่ต้น
 *   - เป็น <label> ครอบ <input type="file"> จริง ไม่ใช่ div ที่ดักคลิก จึงกดด้วย
 *     คีย์บอร์ดได้ตามปกติและโปรแกรมอ่านหน้าจอรู้ว่านี่คือช่องเลือกไฟล์
 *   - แสดงชื่อและขนาดไฟล์หลังเลือก พร้อมปุ่มเอาออก — คนที่เลือกไฟล์ผิดจะได้รู้
 *     ก่อนกดอัปโหลด ไม่ใช่รู้ตอนเห็นผลลัพธ์แปลกๆ
 *   - บอกนามสกุลที่รับได้เป็นข้อความ ไม่ใช่ปล่อยให้ลองแล้วโดนปฏิเสธ
 */
import { computed, ref } from "vue";
import { FileSpreadsheet, Upload, X } from "lucide-vue-next";

const props = defineProps({
  modelValue: { type: [Object, null], default: null },
  accept: { type: String, default: ".csv,.xlsx,.xls" },
  hint: { type: String, default: t("รองรับไฟล์ .csv, .xlsx และ .xls") },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);

const dragging = ref(false);

const sizeLabel = computed(() => {
  const bytes = props.modelValue?.size ?? 0;
  if (bytes < 1024) return t("{0} ไบต์", [bytes]);
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});

function pick(file) {
  if (!file || props.disabled) return;
  emit("update:modelValue", file);
}

function onDrop(event) {
  dragging.value = false;
  pick(event.dataTransfer?.files?.[0]);
}
</script>

<template>
  <div>
    <label
      class="flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-lg border-2 border-dashed
             text-center cursor-pointer transition-colors"
      :class="[
        dragging ? 'border-brand bg-brand-soft' : 'border-line hover:border-line-strong hover:bg-surface-2',
        disabled && 'opacity-50 pointer-events-none',
      ]"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <input
        type="file"
        class="sr-only"
        :accept="accept"
        :disabled="disabled"
        @change="pick($event.target.files[0])"
      />

      <span class="grid place-items-center w-11 h-11 rounded-xl bg-surface-3 text-ink-mute" aria-hidden="true">
        <Upload :size="20" />
      </span>

      <span class="text-sm text-ink-soft"> {{ t("ลากไฟล์มาวางที่นี่ หรือ") }} <span class="text-brand-ink font-medium underline"> {{ t("เลือกไฟล์จากเครื่อง") }} </span>
      </span>

      <span class="text-xs text-ink-mute">{{ hint }}</span>
    </label>

    <div
      v-if="modelValue"
      class="flex items-center gap-3 mt-3 px-3 py-2.5 rounded-lg border border-line-soft bg-surface-2"
    >
      <span class="grid place-items-center shrink-0 w-8 h-8 rounded-md bg-ok-soft text-ok-ink" aria-hidden="true">
        <FileSpreadsheet :size="16" />
      </span>

      <span class="min-w-0 flex-1">
        <span class="block text-sm text-ink truncate">{{ modelValue.name }}</span>
        <span class="block text-2xs text-ink-mute numeral">{{ sizeLabel }}</span>
      </span>

      <button
        type="button"
        class="shrink-0 grid place-items-center w-7 h-7 rounded-md text-ink-mute hover:text-ink hover:bg-surface-3 transition-colors"
        :aria-label="t(&quot;เอาไฟล์นี้ออก&quot;)"
        :disabled="disabled"
        @click="emit('update:modelValue', null)"
      >
        <X :size="15" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
