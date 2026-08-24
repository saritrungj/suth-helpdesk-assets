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

      <template v-else>
        <!-- เลือกด่วน: ไตรมาส / ครึ่งปี — เฉพาะตัวที่เลือกได้ไม่จำกัดจำนวนเดือน (max=0) เท่านั้น
             เพราะหน้าที่จำกัด max (เช่น max=1 ของ "เดือนที่เทียบแนวโน้ม") เลือกได้ทีละเดือนอยู่แล้ว -->
        <div v-if="!max" class="mb-2 pb-2 border-b">
          <div class="text-xs text-gray-400 px-1 pb-1">เลือกด่วน</div>
          <div class="grid grid-cols-2 gap-1 px-1">
            <button
              v-for="q in quarterOptions"
              :key="q.label"
              type="button"
              :disabled="!q.available"
              @click="selectQuick(q.months)"
              class="text-xs py-1.5 rounded border transition-colors"
              :class="quickButtonClass(q)"
            >
              {{ q.label }}
            </button>
          </div>
          <button
            type="button"
            :disabled="!firstHalfYearOption.available"
            @click="selectQuick(firstHalfYearOption.months)"
            class="mt-1 mx-1 w-[calc(100%-0.5rem)] text-xs py-1.5 rounded border transition-colors"
            :class="quickButtonClass(firstHalfYearOption)"
          >
            {{ firstHalfYearOption.label }}
          </button>
          <button
            type="button"
            :disabled="!secondHalfYearOption.available"
            @click="selectQuick(secondHalfYearOption.months)"
            class="mt-1 mx-1 w-[calc(100%-0.5rem)] text-xs py-1.5 rounded border transition-colors"
            :class="quickButtonClass(secondHalfYearOption)"
          >
            {{ secondHalfYearOption.label }}
          </button>
        </div>

        <ul class="divide-y max-h-72 overflow-y-auto">
          <li v-for="opt in fiscalMonthOptions" :key="opt.value">
            <button
              type="button"
              :disabled="isDisabled(opt.value)"
              @click="toggle(opt.value)"
              class="w-full flex items-center justify-between text-sm py-2 px-2 rounded transition-colors"
              :class="cellClass(opt.value)"
            >
              <span>{{ opt.label }}</span>
              <AppIcon v-if="modelValue.includes(opt.value)" name="check" class="w-3.5 h-3.5 shrink-0" />
            </button>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<script setup>
import ChevronIcon from "./ChevronIcon.vue";
import AppIcon from "./AppIcon.vue";
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

// เลือกด่วนเป็นไตรมาส/ครึ่งปี — อิงตามลำดับเดือนของปีงบ (fiscalMonthOptions ไล่จาก ต.ค. ปีก่อนหน้า
// ถึง ก.ย. ปีที่ตรงกับปีงบ) ไม่ใช่ ม.ค.-ธ.ค. ปีปฏิทิน: ไตรมาส 1 = ต.ค.-ธ.ค., ไตรมาส 2 = ม.ค.-มี.ค.,
// ไตรมาส 3 = เม.ย.-มิ.ย., ไตรมาส 4 = ก.ค.-ก.ย., ครึ่งปีแรก (6 เดือนแรก) = ต.ค.-มี.ค.,
// ครึ่งปีหลัง (6 เดือนหลัง) = เม.ย.-ก.ย.
function buildQuickOption(label, months) {
  return {
    label,
    months,
    // enable ก็ต่อเมื่อทุกเดือนในกลุ่มนั้นมีข้อมูลจริง (อยู่ใน options) ครบทุกเดือน
    available: months.length > 0 && months.every((m) => props.options.includes(m)),
  };
}

const quarterOptions = computed(() => {
  const all = fiscalMonthOptions.value.map((o) => o.value);
  return [
    buildQuickOption("ไตรมาส 1", all.slice(0, 3)),
    buildQuickOption("ไตรมาส 2", all.slice(3, 6)),
    buildQuickOption("ไตรมาส 3", all.slice(6, 9)),
    buildQuickOption("ไตรมาส 4", all.slice(9, 12)),
  ];
});

const firstHalfYearOption = computed(() => {
  const all = fiscalMonthOptions.value.map((o) => o.value);
  return buildQuickOption("ครึ่งปีแรก (6 เดือนแรก)", all.slice(0, 6));
});

const secondHalfYearOption = computed(() => {
  const all = fiscalMonthOptions.value.map((o) => o.value);
  return buildQuickOption("ครึ่งปีหลัง (6 เดือนหลัง)", all.slice(6, 12));
});

// ปุ่มเลือกด่วนถือว่า "active" เมื่อเดือนที่เลือกอยู่ตรงกับกลุ่มนั้นเป๊ะ (set เท่ากัน ไม่ใช่แค่ superset)
function isQuickActive(months) {
  if (!months.length || months.length !== props.modelValue.length) return false;
  const set = new Set(props.modelValue);
  return months.every((m) => set.has(m));
}

function quickButtonClass(q) {
  if (!q.available) {
    return "opacity-30 cursor-not-allowed text-gray-400 border-gray-200";
  }
  if (isQuickActive(q.months)) {
    return "bg-blue-600 text-white border-blue-600 hover:bg-blue-700";
  }
  return "border-gray-300 hover:bg-gray-200";
}

// เลือกด่วน = แทนที่ selection ทั้งหมดด้วยเดือนในกลุ่มนั้น (ไม่ merge กับที่เลือกไว้เดิม)
// ถ้าปุ่มที่กดกำลัง active อยู่แล้ว (เดือนที่เลือกตรงกับกลุ่มนี้เป๊ะ) ให้ถือว่าเป็นการ "กดซ้ำเพื่อเอาออก"
// เคลียร์ selection ทั้งหมดแทน ไม่ใช่เลือกกลุ่มเดิมซ้ำ
function selectQuick(months) {
  if (!months.every((m) => props.options.includes(m))) return;

  if (isQuickActive(months)) {
    emit("update:modelValue", []);
    return;
  }

  emit("update:modelValue", [...months].sort());
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