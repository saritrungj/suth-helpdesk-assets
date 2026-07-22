<template>
  <div class="relative" ref="rootEl">
    <button
      type="button"
      @click="open = !open"
      class="border rounded px-3 py-2 w-full text-left flex items-center justify-between gap-2 bg-white"
    >
      <span class="truncate">
        <template v-if="!modelValue.length">-- เลือกเดือน --</template>
        <template v-else>{{ summaryLabel }}</template>
      </span>
      <span class="text-gray-400 text-xs">{{ open ? "▲" : "▼" }}</span>
    </button>

    <div
      v-if="open"
      class="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto bg-white border rounded-lg shadow-lg p-2"
    >
      <div class="flex items-center justify-between px-1 pb-2 mb-1 border-b">
        <span class="text-xs text-gray-400">
          เลือกแล้ว {{ modelValue.length }} เดือน{{ max ? ` (สูงสุด ${max})` : "" }}
        </span>
        <button
          v-if="modelValue.length"
          type="button"
          @click="$emit('update:modelValue', [])"
          class="text-xs text-red-500 hover:underline"
        >
          ล้างทั้งหมด
        </button>
      </div>

      <label
        v-for="m in options"
        :key="m"
        class="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm"
        :class="isDisabled(m) ? 'opacity-40 cursor-not-allowed' : ''"
      >
        <input
          type="checkbox"
          :checked="modelValue.includes(m)"
          :disabled="isDisabled(m)"
          @change="toggle(m)"
        />
        {{ formatMonth(m) }}
      </label>

      <div v-if="!options.length" class="text-xs text-gray-400 px-1 py-2">
        ไม่มีเดือนที่มีข้อมูล
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({
  modelValue: { type: Array, default: () => [] }, // array ของ "YYYY-MM"
  options: { type: Array, default: () => [] },     // เดือนทั้งหมดที่เลือกได้ (มีข้อมูลจริง)
  min: { type: Number, default: 0 },
  max: { type: Number, default: 0 },                // 0 = ไม่จำกัด
});

const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const rootEl = ref(null);

function formatMonth(value) {
  if (!value) return "";
  const monthsTH = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.",
    "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.",
    "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  const [y, m] = value.split("-");
  return `${monthsTH[Number(m) - 1]} ${Number(y) + 543}`;
}

const summaryLabel = computed(() => {
  if (props.modelValue.length <= 2) {
    return props.modelValue.map(formatMonth).join(", ");
  }
  return `${props.modelValue.length} เดือนที่เลือก`;
});

function isDisabled(m) {
  return (
    props.max > 0 &&
    props.modelValue.length >= props.max &&
    !props.modelValue.includes(m)
  );
}

function toggle(m) {
  const next = props.modelValue.includes(m)
    ? props.modelValue.filter((v) => v !== m)
    : [...props.modelValue, m];

  emit("update:modelValue", next.sort());
}

function onClickOutside(e) {
  if (rootEl.value && !rootEl.value.contains(e.target)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener("click", onClickOutside));
onBeforeUnmount(() => document.removeEventListener("click", onClickOutside));
</script>