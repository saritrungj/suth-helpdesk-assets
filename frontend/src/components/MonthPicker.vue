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
      <ChevronIcon :open="open" class="text-gray-400" />
    </button>

    <!-- Dropdown รายชื่อเดือนไทย (ต.ค.–ก.ย. ตามปีงบราชการไทย) ของปีงบที่ active อยู่ตอนนี้ (เลือกปีจาก Navbar เท่านั้น ที่นี่เลือกได้แค่เดือน) -->
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

      <div v-if="!range" class="text-xs text-gray-400 px-1 py-4 text-center">
        กรุณาเลือกปีงบก่อน (มุมขวาบน)
      </div>

      <div v-else-if="!options.length" class="text-xs text-gray-400 px-1 py-4 text-center">
        ไม่มีเดือนที่มีข้อมูลในปีงบนี้
      </div>

      <ul v-else class="divide-y max-h-72 overflow-y-auto">
        <li v-for="opt in fiscalMonthOptions" :key="opt.value">
          <button
            type="button"
            :disabled="isDisabled(opt.value)"
            @click="toggle(opt.value)"
            class="w-full flex items-center justify-between text-sm py-2 px-2 rounded transition-colors"
            :class="cellClass(opt.value)"
          >
            <span>{{ opt.label }}</span>
            <span v-if="modelValue.includes(opt.value)">✓</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import ChevronIcon from "./ChevronIcon.vue";
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { activeFiscalYearRange, fiscalYearMonths } from "../store/fiscalYear";

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

// ช่วงเดือนอ้างอิงมาจากปีงบ (global, เลือกที่ Navbar) เสมอ — ตัวเลือกเดือนที่นี่จึงเหลือแค่ "เดือน" อย่างเดียว
// ปีงบราชการไทยคือ ต.ค.-ก.ย. (คร่อม 2 ปีปฏิทิน) จึงต้องไล่จาก fiscalYearMonths() แทนการวนลูป ม.ค.-ธ.ค. ปีเดียว
const range = computed(() => activeFiscalYearRange.value);
const displayYearBE = computed(() =>
  range.value ? Number(range.value.endMonth.split("-")[0]) + 543 : "-"
);

// ตัวเลือกเดือนที่แสดงจริง เรียงตามลำดับปีงบ (ต.ค. ปีก่อนหน้า ... ก.ย. ปีที่ตรงกับปีงบ)
const fiscalMonthOptions = computed(() =>
  fiscalYearMonths(range.value).map((value) => ({ value, label: formatMonth(value) }))
);

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

// หมายเหตุ: ไม่ disable เดือนอื่นตอนเลือกครบโควตาแล้ว — ให้กดเดือนใหม่ "แทนที่" ได้เลย
// (ดู toggle() ด้านล่าง) ผู้ใช้จะได้ไม่ต้องกดเอาเดือนเก่าออกก่อนถึงจะเปลี่ยนได้
function isDisabled(m) {
  return !isSelectable(m);
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
  return "hover:bg-gray-300";
}

function toggle(m) {
  if (!isSelectable(m)) return;

  // กดเดือนที่เลือกอยู่แล้ว -> เอาออก (พฤติกรรมเดิม)
  if (props.modelValue.includes(m)) {
    emit("update:modelValue", props.modelValue.filter((v) => v !== m).sort());
    return;
  }

  // กดเดือนใหม่ที่ยังไม่ได้เลือก -> เพิ่มเข้าไป ถ้าเกินโควตา (max) ให้ตัดเดือนที่เลือกไว้
  // นานที่สุดออกอัตโนมัติ (FIFO) เพื่อให้ "เปลี่ยนเดือนที่เทียบแนวโน้ม" ได้ในคลิกเดียว
  // โดยไม่ต้องกดเอาเดือนเก่าออกก่อน (สำคัญมากตอน max=1 อย่างหน้า "เดือนที่เทียบแนวโน้ม")
  let next = [...props.modelValue, m];
  if (props.max > 0 && next.length > props.max) {
    next = next.slice(next.length - props.max);
  }

  emit("update:modelValue", next.sort());
}

// ปีงบเปลี่ยน (จาก Navbar) → เดือนที่เคยเลือกไว้เป็นของปีงบเก่า ใช้ต่อไม่ได้แล้ว เคลียร์ทิ้งให้เริ่มเลือกใหม่
watch(range, () => {
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