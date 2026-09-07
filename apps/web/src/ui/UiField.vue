<script setup>
/**
 * UiField — ป้ายกำกับ คำอธิบาย และข้อความแจ้งเตือนของช่องกรอกหนึ่งช่อง
 *
 * ทุกช่องกรอกในระบบต้องถูกห่อด้วย component นี้ ไม่ใช่เขียน <label> เอง เพราะ
 * ที่นี่จัดการสามเรื่องที่คนมักลืมให้ครบในที่เดียว
 *
 *   1. ผูก label เข้ากับ input ด้วย id ที่ไม่ซ้ำ (คลิกที่ป้ายแล้วโฟกัสเข้าช่อง)
 *   2. ผูกคำอธิบายและข้อความ error เข้ากับ input ด้วย aria-describedby
 *      โปรแกรมอ่านหน้าจอจะอ่าน "ชื่อช่อง + คำอธิบาย + error" ต่อกันให้อัตโนมัติ
 *   3. ตั้ง aria-invalid ให้ตอนมี error และแสดง error เป็น "ข้อความ" ไม่ใช่แค่
 *      ขอบแดง — คนตาบอดสีมองไม่เห็นขอบแดง
 *
 * error เขียนเป็นสิ่งที่ต้องทำ ไม่ใช่สิ่งที่ผิด: "กรอกชื่อยี่ห้อ" ดีกว่า "ข้อมูลไม่ถูกต้อง"
 */
import { computed, useId } from "vue";
import { provideField } from "./field-context";

const props = defineProps({
  /** ตั้ง id เองเมื่อจำเป็น — ใช้กับฟอร์มล็อกอินที่ต้องมี id คงที่ */
  fieldId: { type: String, default: "" },
  label: { type: String, default: "" },
  hint: { type: String, default: "" },
  error: { type: String, default: "" },
  required: { type: Boolean, default: false },
  /** วาง label ไว้ซ้ายของช่องกรอกแทนด้านบน สำหรับฟอร์มตัวกรองที่พื้นที่แนวตั้งจำกัด */
  inline: { type: Boolean, default: false },
});

const uid = useId();

/**
 * id ของช่องกรอก
 *
 * ปกติสร้างให้อัตโนมัติ (`f-v-0`, `f-v-1`, …) ซึ่งพอสำหรับการผูก label
 * แต่ **ไม่คงที่** เพราะเลขมาจากลำดับที่ component ถูกสร้างในหน้านั้น
 *
 * ฟอร์มล็อกอินต้องการ id ที่คงที่ข้ามการโหลดทุกครั้ง เพราะโปรแกรมจัดการรหัสผ่าน
 * (และตัวเติมอัตโนมัติของเบราว์เซอร์) ใช้ `id` กับ `name` เป็นตัวจำว่าช่องไหน
 * คือช่องไหน — id ที่เปลี่ยนไปมาทำให้มันเติมรหัสให้ไม่ได้บ้างได้บ้าง
 * (ดู web.dev — Sign-in form best practices)
 */
const id = computed(() => props.fieldId || `f-${uid}`);
const hintId = computed(() => `${id.value}-hint`);
const errorId = computed(() => `${id.value}-error`);

const describedBy = computed(
  () =>
    [props.hint ? hintId.value : null, props.error ? errorId.value : null]
      .filter(Boolean)
      .join(" ") || undefined
);

provideField({
  // ต้องเป็น getter ไม่ใช่ ref ตรงๆ — ตัวที่รับไปใช้เขียน `field.id` แล้วคาดว่า
  // จะได้สตริง ถ้าส่ง ref ไปจะได้วัตถุ แล้ว render ออกมาเป็น "[object Object]"
  get id() {
    return id.value;
  },
  get describedBy() {
    return describedBy.value;
  },
  get invalid() {
    return Boolean(props.error);
  },
  get required() {
    return props.required;
  },
});
</script>

<template>
  <div :class="inline ? 'flex items-center gap-3 min-w-0' : 'min-w-0'">
    <label
      v-if="label"
      :for="id"
      class="block text-xs font-medium text-ink-soft select-none"
      :class="inline ? 'shrink-0' : 'mb-1.5'"
    >
      {{ label }}
      <span v-if="required" class="text-danger-ink" aria-hidden="true">*</span>
      <span v-if="required" class="sr-only">จำเป็นต้องกรอก</span>
    </label>

    <div class="min-w-0" :class="inline && 'flex-1'">
      <slot />

      <p v-if="hint && !error" :id="hintId" class="text-xs text-ink-mute mt-1.5">
        {{ hint }}
      </p>

      <p
        v-if="error"
        :id="errorId"
        class="flex items-start gap-1.5 text-xs text-danger-ink mt-1.5"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" class="shrink-0 mt-px" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 7.5v5M12 16h.01" />
        </svg>
        {{ error }}
      </p>
    </div>
  </div>
</template>
