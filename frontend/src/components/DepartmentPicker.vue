<template>
  <div class="relative" ref="rootEl">
    <button
      type="button"
      @click="open = !open"
      class="border rounded px-3 py-2 w-full text-left flex items-center justify-between gap-2 bg-white"
    >
      <span class="truncate">
        <template v-if="!modelValue.length">-- เลือกฝ่าย/แผนก --</template>
        <template v-else>{{ summaryLabel }}</template>
      </span>
      <span class="text-gray-400 text-xs">{{ open ? "▲" : "▼" }}</span>
    </button>

    <div
      v-if="open"
      class="absolute z-20 mt-1 w-72 max-h-80 overflow-y-auto bg-white border rounded-lg shadow-lg p-2"
    >
      <div class="flex items-center justify-between px-1 pb-2 mb-1 border-b">
        <span class="text-xs text-gray-400">เลือกแล้ว {{ modelValue.length }} รายการ</span>
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
        v-for="opt in options"
        :key="opt.id"
        class="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm"
      >
        <input
          type="checkbox"
          :checked="modelValue.includes(opt.id)"
          @change="toggle(opt.id)"
        />
        {{ opt.label }}
      </label>

      <div v-if="!options.length" class="text-xs text-gray-400 px-1 py-2">
        ไม่มีรายการให้เลือก
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({
  modelValue: { type: Array, default: () => [] }, // array ของ id
  options: { type: Array, default: () => [] },     // [{ id, label }]
});

const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const rootEl = ref(null);

const summaryLabel = computed(() => {
  const labels = props.options
    .filter((o) => props.modelValue.includes(o.id))
    .map((o) => o.label);

  if (labels.length <= 2) return labels.join(", ");
  return `${labels.length} รายการที่เลือก`;
});

function toggle(id) {
  const next = props.modelValue.includes(id)
    ? props.modelValue.filter((v) => v !== id)
    : [...props.modelValue, id];
  emit("update:modelValue", next);
}

function onClickOutside(e) {
  if (rootEl.value && !rootEl.value.contains(e.target)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener("click", onClickOutside));
onBeforeUnmount(() => document.removeEventListener("click", onClickOutside));
</script>