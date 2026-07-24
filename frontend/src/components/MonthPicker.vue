<template>
  <div class="relative" ref="rootEl">
    <button
      type="button"
      @click="open = !open"
      class="border rounded px-3 py-2 w-full text-left flex items-center justify-between gap-2 bg-gray-50"
    >
      <span class="truncate">
        <template v-if="!modelValue.length">-- เลือกเดือน --</template>
        <template v-else>{{ summaryLabel }}</template>
      </span>
      <span class="text-gray-400 text-xs">{{ open ? "▲" : "▼" }}</span>
    </button>

    <!-- Dropdown รายชื่อเดือนไทย (ม.ค.–ธ.ค.) ของปีงบที่ active อยู่ตอนนี้ (เลือกปีจาก Navbar เท่านั้น ที่นี่เลือกได้แค่เดือน) -->
    <div
      v-if="open"
      class="absolute z-20 mt-1 w-64 bg-gray-50 border rounded-lg shadow-lg p-3"
    >
      <div class="flex items-center justify-between px-1 pb-2 mb-2 border-b">
        <span class="text-xs text-gray-400">
          ปีงบ {{ displayYearBE }}
          <template v-if="modelValue.length">
            • เลือกแล้ว {{ modelValue.length }} เดือน{{ max ? ` (สูงสุด ${max})` : "" }}
          </template>
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

      <div v-if="!year" class="text-xs text-gray-400 px-1 py-4 text-center">
        กรุณาเลือกปีงบก่อน (มุมขวาบน)
      </div>

      <div v-else-if="!options.length" class="text-xs text-gray-400 px-1 py-4 text-center">
        ไม่มีเดือนที่มีข้อมูลในปีงบนี้
      </div>

      <ul v-else class="divide-y max-h-72 overflow-y-auto">
        <li v-for="(label, idx) in monthsTH" :key="idx">
          <button
            type="button"
            :disabled="isDisabled(monthValue(idx))"
            @click="toggle(monthValue(idx))"
            class="w-full flex items-center justify-between text-sm py-2 px-2 rounded transition-colors"
            :class="cellClass(monthValue(idx))"
          >
            <span>{{ label }}</span>
            <span v-if="modelValue.includes(monthValue(idx))">✓</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { activeGregorianYear } from "../store/fiscalYear";

const props = defineProps({
  modelValue: { type: Array, default: () => [] }, // array ของ "YYYY-MM"
  options: { type: Array, default: () => [] },     // เดือนทั้งหมดที่เลือกได้ (มีข้อมูลจริง) — ต้องเป็น "YYYY-MM"
  max: { type: Number, default: 0 },                // 0 = ไม่จำกัด
});

const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const rootEl = ref(null);

const monthsTH = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// ปีอ้างอิงมาจากปีงบ (global, เลือกที่ Navbar) เสมอ — ตัวเลือกเดือนที่นี่จึงเหลือแค่ "เดือน" อย่างเดียว
const year = computed(() => activeGregorianYear.value);
const displayYearBE = computed(() => (year.value ? year.value + 543 : "-"));

function monthValue(idx) {
  if (!year.value) return "";
  return `${year.value}-${String(idx + 1).padStart(2, "0")}`;
}

function formatMonth(value) {
  if (!value) return "";
  const [y, m] = value.split("-");
  return `${monthsTH[Number(m) - 1]} ${Number(y) + 543}`;
}

const summaryLabel = computed(() => {
  if (props.modelValue.length <= 2) {
    return props.modelValue.map(formatMonth).join(", ");
  }
  return `${props.modelValue.length} เดือนที่เลือก`;
});

// เดือนที่เลือกได้ต้องอยู่ใน options เท่านั้น (เดือนที่ไม่มีข้อมูลจะถูก disable ไปโดยอัตโนมัติ)
function isSelectable(m) {
  return !!m && props.options.includes(m);
}

function isDisabled(m) {
  if (!isSelectable(m)) return true;
  return (
    props.max > 0 &&
    props.modelValue.length >= props.max &&
    !props.modelValue.includes(m)
  );
}

function cellClass(m) {
  if (!isSelectable(m)) {
    return "opacity-30 cursor-not-allowed text-gray-400";
  }
  if (props.modelValue.includes(m)) {
    return "bg-blue-600 text-white hover:bg-blue-700";
  }
  if (isDisabled(m)) {
    return "opacity-40 cursor-not-allowed text-gray-400";
  }
  return "hover:bg-blue-50";
}

function toggle(m) {
  if (!isSelectable(m)) return;

  const next = props.modelValue.includes(m)
    ? props.modelValue.filter((v) => v !== m)
    : [...props.modelValue, m];

  emit("update:modelValue", next.sort());
}

// ปีงบเปลี่ยน (จาก Navbar) → เดือนที่เคยเลือกไว้เป็นของปีงบเก่า ใช้ต่อไม่ได้แล้ว เคลียร์ทิ้งให้เริ่มเลือกใหม่
watch(year, () => {
  if (props.modelValue.length) emit("update:modelValue", []);
});

function onClickOutside(e) {
  if (rootEl.value && !rootEl.value.contains(e.target)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener("click", onClickOutside));
onBeforeUnmount(() => document.removeEventListener("click", onClickOutside));
</script>