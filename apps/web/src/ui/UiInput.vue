<script setup>
/**
 * UiInput — ช่องกรอกข้อความ/ตัวเลข/วันที่
 *
 * รองรับไอคอนนำหน้า (ช่องค้นหา) และปุ่มล้างค่า ซึ่งเป็นสองอย่างที่ระบบนี้ใช้บ่อย
 * ที่สุด — เดิมแต่ละหน้าวางไอคอนเองด้วย absolute ทำให้ระยะ padding ไม่เท่ากัน
 *
 * type="number" ถูกตั้ง inputmode ให้อัตโนมัติ เพื่อให้มือถือเด้งแป้นตัวเลขขึ้นมา
 * ซึ่งเร็วกว่ามากสำหรับคนที่เดินไปกรอกยอดมิเตอร์ที่หน้าเครื่องพิมพ์
 */
import { computed, ref, useAttrs } from "vue";
import { useField } from "./field-context";

/**
 * ปิดการส่ง attribute ลงราก เพราะรากเป็น <div> ที่ห่อไอคอนกับปุ่มล้างค่าไว้
 *
 * ถ้าปล่อยตามค่าเริ่มต้น attribute อย่าง `aria-label` `data-*` `@paste` ที่หน้าจอ
 * ใส่มาจะไปเกาะที่ <div> แทนที่จะเป็น <input> ผลคือโปรแกรมอ่านหน้าจอไม่ได้ยินชื่อ
 * ช่องกรอก และตัวเลือกที่เจาะจง input ในเทสหาไม่เจอ — เคยเป็นแบบนั้นมาแล้ว
 *
 * กติกาการแบ่ง: `class` กับ `style` อยู่ที่รากตามเดิม (หน้าจอใช้จัดระยะกล่องทั้งอัน)
 * ส่วน attribute อื่นทั้งหมดลงที่ <input>
 */
defineOptions({ inheritAttrs: false });

const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  type: { type: String, default: "text" },
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  /** แสดงปุ่มกากบาทเมื่อมีค่า กดแล้วล้างและโฟกัสกลับเข้าช่อง */
  clearable: { type: Boolean, default: false },
  /** ข้อความหน่วยท้ายช่อง เช่น "บาท" "แผ่น" */
  suffix: { type: String, default: "" },
  autocomplete: { type: String, default: undefined },
  min: { type: [String, Number], default: undefined },
  max: { type: [String, Number], default: undefined },
  step: { type: [String, Number], default: undefined },
  /** ใช้ฟอนต์ monospace สำหรับรหัส/serial ที่ต้องอ่านทีละตัว */
  mono: { type: Boolean, default: false },
  /**
   * class ที่จะไปเกาะที่ <input> โดยตรง ไม่ใช่ที่กล่องหุ้ม
   *
   * ต้องมีเพราะ `class` ธรรมดาถูกส่งไปที่รากซึ่งเป็น <div> (ดูหมายเหตุเรื่อง
   * การแบ่ง attribute ข้างบน) เวลาหน้าจอวางปุ่มของตัวเองทับมุมขวาของช่อง
   * แล้วเขียน `class="pr-12"` เพื่อเว้นที่ให้ปุ่ม สิ่งที่เกิดขึ้นจริงคือ
   * **กล่องหุ้มถูกบีบให้แคบลง** ช่องกรอกจึงสั้นลง 48px และปุ่มไปลอยอยู่
   * นอกช่องแทนที่จะอยู่ในนั้น — เป็นแบบนั้นอยู่บนหน้าล็อกอินจริงมาแล้ว
   */
  inputClass: { type: String, default: "" },
});

const emit = defineEmits(["update:modelValue", "enter"]);

const field = useField();
const el = ref(null);

const attrs = useAttrs();

/** attribute ทุกตัวยกเว้น class/style — ไปเกาะที่ <input> */
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});

/**
 * ช่องนี้บังคับกรอกหรือไม่ — มาได้สองทาง
 *
 *   1. `<UiField required>` ครอบอยู่ (ทางปกติ ได้เครื่องหมาย * ให้ด้วย)
 *   2. เขียน `required` บน `<UiInput>` ตรงๆ แบบ HTML ธรรมดา
 *
 * เดิมรองรับแค่ทางที่ 1 และบรรทัดนี้ยัง **ทับ** ทางที่ 2 ทิ้งด้วย เพราะมันถูก
 * เขียนไว้หลัง `v-bind="inputAttrs"` — คนที่ใส่ `required` เองจึงไม่ได้อะไรเลย
 * และไม่มีอะไรเตือน
 */
const isRequired = computed(() => field.required || attrs.required === "" || attrs.required === true);

const inputMode = computed(() => {
  if (props.type === "number") return "decimal";
  if (props.type === "tel") return "tel";
  return undefined;
});

function onInput(event) {
  emit("update:modelValue", event.target.value);
}

function clear() {
  emit("update:modelValue", "");
  el.value?.focus();
}

defineExpose({ focus: () => el.value?.focus() });
</script>

<template>
  <div class="relative flex items-center min-w-0" :class="attrs.class" :style="attrs.style">
    <span
      v-if="$slots.icon"
      class="absolute left-3 flex items-center text-ink-faint pointer-events-none"
      aria-hidden="true"
    >
      <slot name="icon" />
    </span>

    <input
      ref="el"
      v-bind="inputAttrs"
      :id="field.id"
      :value="modelValue"
      :type="type"
      :inputmode="inputMode"
      :placeholder="placeholder || undefined"
      :disabled="disabled"
      :readonly="readonly"
      :required="isRequired || undefined"
      :aria-invalid="field.invalid ? 'true' : undefined"
      :aria-describedby="field.describedBy"
      :autocomplete="autocomplete"
      :min="min"
      :max="max"
      :step="step"
      class="field"
      :class="[
        $slots.icon && 'pl-9',
        (clearable && String(modelValue).length) || suffix ? 'pr-9' : '',
        mono && 'font-mono text-sm tracking-tight',
        type === 'number' && 'numeral',
        inputClass,
      ]"
      @input="onInput"
      @keyup.enter="$emit('enter')"
    />

    <span
      v-if="suffix && !(clearable && String(modelValue).length)"
      class="absolute right-3 text-xs text-ink-mute pointer-events-none"
    >
      {{ suffix }}
    </span>

    <button
      v-if="clearable && String(modelValue).length && !disabled && !readonly"
      type="button"
      class="absolute right-2 grid place-items-center w-6 h-6 rounded-sm text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors"
      aria-label="ล้างค่าในช่องนี้"
      @click="clear"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
