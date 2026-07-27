<template>
  <div class="relative" ref="rootEl">
    <button
      type="button"
      @click="toggleOpen"
      class="border rounded px-3 py-2 w-full text-left flex items-center justify-between gap-2 bg-gray-50"
    >
      <span class="truncate" :class="{ 'text-gray-400': !selectedLabel }">
        {{ selectedLabel || placeholder }}
      </span>
      <ChevronIcon :open="open" class="text-gray-400" />
    </button>

    <div
      v-if="open"
      class="absolute z-20 mt-1 w-64 max-h-80 overflow-y-auto bg-gray-50 border rounded-lg shadow-lg p-2"
    >
      <input
        ref="searchEl"
        v-model="search"
        type="text"
        :placeholder="searchPlaceholder"
        class="border rounded px-2 py-1 w-full text-sm mb-2"
        @click.stop
      />

      <button
        type="button"
        @click="select('')"
        class="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm"
        :class="!modelValue ? 'font-semibold text-blue-600' : ''"
      >
        {{ placeholder }}
      </button>

      <button
        v-for="opt in filteredOptions"
        :key="opt.value"
        type="button"
        @click="select(opt.value)"
        class="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center justify-between"
        :class="opt.value === modelValue ? 'font-semibold text-blue-600' : ''"
      >
        <span class="truncate">{{ opt.label }}</span>
        <span v-if="opt.value === modelValue">✓</span>
      </button>

      <div v-if="!options.length" class="text-xs text-gray-400 px-2 py-2">
        ไม่มีรายการให้เลือก
      </div>
      <div v-else-if="!filteredOptions.length" class="text-xs text-gray-400 px-2 py-2">
        ไม่พบรายการที่ตรงกับ "{{ search }}"
      </div>
    </div>
  </div>
</template>

<script setup>
import ChevronIcon from "./ChevronIcon.vue";
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";

const props = defineProps({
  modelValue: { type: [String, Number], default: "" }, // "" = ยังไม่เลือก (ทั้งหมด)
  options: { type: Array, default: () => [] },          // [{ value, label }]
  placeholder: { type: String, default: "ทั้งหมด" },     // ข้อความตอนยังไม่เลือก + ตัวเลือก "ล้าง"
  searchPlaceholder: { type: String, default: "พิมพ์เพื่อค้นหา..." },
});

const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const rootEl = ref(null);
const searchEl = ref(null);
const search = ref("");

const selectedLabel = computed(() => {
  const found = props.options.find((o) => o.value === props.modelValue);
  return found ? found.label : "";
});

const filteredOptions = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return props.options;
  return props.options.filter((o) => o.label.toLowerCase().includes(keyword));
});

function toggleOpen() {
  open.value = !open.value;
}

function select(value) {
  emit("update:modelValue", value);
  open.value = false;
}

// เปิด dropdown → เคลียร์คำค้นหาเก่า แล้วโฟกัสช่องพิมพ์ให้พิมพ์ได้ทันที
watch(open, async (isOpen) => {
  if (isOpen) {
    search.value = "";
    await nextTick();
    searchEl.value?.focus();
  }
});

function onClickOutside(e) {
  if (rootEl.value && !rootEl.value.contains(e.target)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener("click", onClickOutside));
onBeforeUnmount(() => document.removeEventListener("click", onClickOutside));
</script>