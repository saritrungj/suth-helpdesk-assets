<script setup>
import { computed } from "vue";
import { t } from "../lib/locale";
import { formatMonth } from "../lib/locale-format";
import { UiCombobox, UiField, UiFilterBar } from "../ui";
import PeriodPicker from "./PeriodPicker.vue";

/**
 * DashboardFilters — ตัวกรองชุดเดียวของหน้าภาพรวมการพิมพ์
 *
 * ทุกอย่างที่ตอบคำถาม "ดูข้อมูลชุดไหน" อยู่ในแถบนี้แถบเดียว: ปีงบ ช่วงเวลา ฝ่าย แผนก
 * สัญญา อาคาร และเครื่อง เลือกหลายค่าได้ทุกช่อง และเลือกแผนกข้ามฝ่ายได้โดยไม่ต้อง
 * เลือกฝ่ายก่อน เพราะตัวกรองแต่ละตัวไม่ผูกกัน
 *
 * เดิมตัวกรองของหน้านี้กระจายอยู่สองที่ — แถบช่วงเวลาบนสุดชุดหนึ่ง กับการ์ด "ขอบเขต
 * ข้อมูล" อีกชุดหนึ่ง แล้วพื้นที่เปรียบเทียบยังมีช่อง "รายการที่เลือก" ที่ชื่อซ้ำกับตัวกรอง
 * อีกชั้น ผู้ใช้จึงเดาไม่ออกว่าตัวไหนคุมตัวเลขบนการ์ด
 *
 * ปีงบกับช่วงเวลาอยู่ในสายตาเสมอเพราะแตะเกือบทุกครั้ง ส่วนอีกห้าช่องอยู่ในแผงที่กางได้
 * โดยมีป้ายบอกเสมอว่าอะไรกำลังกรองอยู่ — ตัวกรองที่ถูกซ่อนแล้วยังทำงานคือที่มาของ
 * คำถาม "ทำไมข้อมูลหาย"
 */
const props = defineProps({
  /** สถานะของหน้าทั้งก้อน (ดู dashboard-view.js) */
  modelValue: { type: Object, required: true },
  /** ตัวเลือกของแต่ละมิติ — { divisions, departments, contracts, buildings, devices } */
  options: { type: Object, required: true },
  /** ปีงบที่เลือกได้ทั้งหมด [{ value, label }] */
  yearOptions: { type: Array, default: () => [] },
  /** ปีงบที่เลือกอยู่จริง (รวมปีงบหลักที่ยังไม่ได้เขียนลง URL) */
  selectedYears: { type: Array, default: () => [] },
  /** เดือนของปีงบหลักที่มีข้อมูลจริง — เดือนนอกรายการนี้เลือกไม่ได้ */
  monthOptions: { type: Array, default: () => [] },
});
const emit = defineEmits(["update:modelValue", "update:years"]);

const DIMENSIONS = [
  ["divisions", t("ฝ่าย"), t("ทุกฝ่าย")],
  ["departments", t("แผนก"), t("ทุกแผนก")],
  ["contracts", t("สัญญา"), t("ทุกสัญญา")],
  ["buildings", t("อาคาร"), t("ทุกอาคาร")],
  ["devices", t("เครื่อง"), t("ทุกเครื่อง")],
];

const patch = (change) => emit("update:modelValue", { ...props.modelValue, ...change });

/*
 * ปีงบไม่ได้เก็บใน modelValue ตรงๆ เพราะปีที่ใหม่ที่สุดที่เลือกคือปีงบของทั้งแอป
 * (แถบบนสุด) หน้าจึงเป็นผู้ตัดสินใจว่าจะสลับปีงบหลักหรือเก็บเป็นปีที่เอามาเทียบ
 */
const years = computed({
  get: () => props.selectedYears,
  set: (value) => emit("update:years", value ?? []),
});

const months = computed({
  get: () => props.modelValue.months ?? [],
  set: (value) => patch({ months: value ?? [] }),
});

/*
 * ป้ายมีเฉพาะตัวกรองที่อยู่ในแผงที่พับได้
 *
 * ปีงบกับช่วงเวลาอยู่ในสายตาเสมอพร้อมค่าที่เลือกอยู่บนตัวมันเอง การทำป้ายซ้ำให้อีก
 * นอกจากไม่ช่วยอะไรแล้วยังทำให้ตัวเลขข้างปุ่ม "ตัวกรองเพิ่มเติม" นับของที่ไม่ได้อยู่
 * ในแผงนั้น แล้วแผงก็กางเองทั้งที่ยังไม่มีใครเลือกอะไรข้างใน
 */
const chips = computed(() => DIMENSIONS.flatMap(([key, label]) => {
  const values = props.modelValue[key] ?? [];
  if (!values.length) return [];
  const names = new Map((props.options[key] ?? []).map((option) => [String(option.value), option.label]));
  const detail = values.length <= 2
    ? values.map((value) => names.get(String(value)) ?? value).join(", ")
    : t("{0} รายการ", [values.length]);
  return [{ key, label: `${label}: ${detail}` }];
}));

const remove = (key) => patch({ [key]: [] });
const clearAll = () => patch(Object.fromEntries(DIMENSIONS.map(([key]) => [key, []])));

const latestMonth = computed(() => (props.monthOptions.length ? formatMonth(props.monthOptions.at(-1)) : ""));
</script>

<template>
  <UiFilterBar role="region" :aria-label="t('ตัวกรองข้อมูล')" :chips="chips" :toggle-label="t('ตัวกรองเพิ่มเติม')" @remove="remove" @clear="clearAll">
    <template #primary>
      <!-- บนจอแคบให้สองช่องนี้ยืดเต็มบรรทัดแทนการหดจนอ่านค่าที่เลือกอยู่ไม่ออก -->
      <UiField :label="t('ปีงบประมาณ')" class="flex-1 min-w-[11rem] sm:flex-none sm:w-56">
        <UiCombobox v-model="years" :options="yearOptions" multiple :placeholder="t('เลือกปีงบ')" :search-placeholder="t('พิมพ์เพื่อค้นหา…')" />
      </UiField>
      <UiField :label="t('ช่วงเวลา')" class="flex-1 min-w-[13rem] sm:flex-none sm:w-72">
        <PeriodPicker v-model="months" :options="monthOptions" mode="multi" :all-label="t('ทั้งปีงบ')" />
      </UiField>
      <p v-if="latestMonth" class="pb-2 text-xs text-ink-mute">{{ t("ข้อมูลล่าสุด {0}", [latestMonth]) }}</p>
    </template>

    <template #actions><slot name="actions" /></template>

    <UiField v-for="[key, label, placeholder] in DIMENSIONS" :key="key" :label="label">
      <UiCombobox
        :model-value="modelValue[key] ?? []"
        :options="options[key] ?? []"
        multiple
        :placeholder="placeholder"
        :search-placeholder="t('พิมพ์เพื่อค้นหา…')"
        @update:model-value="(value) => patch({ [key]: value ?? [] })"
      />
    </UiField>
  </UiFilterBar>
</template>
