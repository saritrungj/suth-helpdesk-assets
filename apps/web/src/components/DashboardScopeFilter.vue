<script setup>
import { computed } from "vue";
import { t } from "../lib/locale";
import { UiCombobox, UiField, UiFilterBar } from "../ui";

const props = defineProps({
  modelValue: { type: Object, required: true },
  options: { type: Object, required: true },
});
const emit = defineEmits(["update:modelValue"]);

const DIMENSIONS = [
  ["departments", t("แผนก")],
  ["contracts", t("สัญญา")],
  ["divisions", t("ฝ่าย")],
  ["buildings", t("อาคาร")],
  ["devices", t("เครื่อง")],
];

function selection(key) {
  return computed({
    get: () => props.modelValue[key] ?? [],
    set: (value) => emit("update:modelValue", { ...props.modelValue, [key]: value ?? [] }),
  });
}

const departments = selection("departments");
const contracts = selection("contracts");
const divisions = selection("divisions");
const buildings = selection("buildings");
const devices = selection("devices");

const chips = computed(() => DIMENSIONS.flatMap(([key, label]) => {
  const values = props.modelValue[key] ?? [];
  if (!values.length) return [];
  const names = new Map((props.options[key] ?? []).map((option) => [String(option.value), option.label]));
  const detail = values.length <= 2
    ? values.map((value) => names.get(String(value)) ?? value).join(", ")
    : t("{0} รายการ", [values.length]);
  return [{ key, label: `${label}: ${detail}` }];
}));

function clear(key) {
  emit("update:modelValue", { ...props.modelValue, [key]: [] });
}

function clearAll() {
  emit("update:modelValue", Object.fromEntries(DIMENSIONS.map(([key]) => [key, []])));
}
</script>

<template>
  <UiFilterBar :chips="chips" :toggle-label="t('ขอบเขตข้อมูล')" @remove="clear" @clear="clearAll">
    <template #primary>
      <p class="w-full sm:w-auto min-w-0 pb-2 text-sm text-ink-soft break-words">{{ t("ทุกหน่วยงานในขอบเขตที่เลือก") }}</p>
    </template>

    <UiField :label="t('แผนก')">
      <UiCombobox v-model="departments" :options="options.departments" multiple :placeholder="t('ทุกแผนก')" />
    </UiField>
    <UiField :label="t('สัญญา')">
      <UiCombobox v-model="contracts" :options="options.contracts" multiple :placeholder="t('ทุกสัญญา')" />
    </UiField>
    <UiField :label="t('ฝ่าย')">
      <UiCombobox v-model="divisions" :options="options.divisions" multiple :placeholder="t('ทุกฝ่าย')" />
    </UiField>
    <UiField :label="t('อาคาร')">
      <UiCombobox v-model="buildings" :options="options.buildings" multiple :placeholder="t('ทุกอาคาร')" />
    </UiField>
    <UiField :label="t('เครื่อง')">
      <UiCombobox v-model="devices" :options="options.devices" multiple :placeholder="t('ทุกเครื่อง')" />
    </UiField>
  </UiFilterBar>
</template>
