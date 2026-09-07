<script setup>
/**
 * PeriodPicker — เลือกช่วงเดือนภายในปีงบประมาณ
 *
 * แทน MonthPicker เดิมที่ผู้ใช้บอกว่า "งง ใช้ยาก" ปัญหาของอันเดิมมีสามข้อ
 *
 *   1. เป็นการ "ติ๊กเลือกทีละเดือน" ซึ่งเป็นวิธีคิดของฐานข้อมูล ไม่ใช่ของคน
 *      คนคิดเป็น "ไตรมาส 3" หรือ "ครึ่งปีหลัง" ไม่ได้คิดเป็นเซตของเดือน
 *   2. ปุ่มที่หน้าจอบอกแค่ "เลือกไว้ 5 เดือน" ซึ่งไม่บอกว่าเดือนไหนบ้าง
 *      ต้องเปิดเข้าไปดูทุกครั้งถึงจะรู้ว่ากำลังดูข้อมูลช่วงไหนอยู่
 *   3. ตัวเลือกด่วนถูกซ่อนไว้ข้างในและกดได้เฉพาะตอนที่ทุกเดือนในกลุ่มมีข้อมูลครบ
 *      ซึ่งเป็นเงื่อนไขที่ผู้ใช้มองไม่เห็นและเดาไม่ถูกว่าทำไมปุ่มถึงกดไม่ได้
 *
 * อันใหม่กลับด้านความสำคัญ: **ตัวเลือกสำเร็จรูปมาก่อน เป็นรายการแนวตั้ง** แล้ว
 * ค่อยมี "เลือกช่วงเอง" ซ่อนอยู่ใต้เส้นคั่น ตามแนวทางของ dashboard ที่ใช้กันจริง —
 * ไม่มีใครอยากสู้กับตารางปฏิทินเพื่อเลือกคำว่า "ไตรมาสที่แล้ว"
 *
 * และปุ่มที่หน้าจอเขียนช่วงจริงออกมาเป็นภาษาคนเสมอ ("ต.ค. 2567 – ก.ย. 2568")
 * จึงรู้ได้ทันทีว่าตัวเลขที่เห็นอยู่มาจากช่วงไหน โดยไม่ต้องกดเปิด
 *
 * สองโหมด
 *   range (ค่าเริ่มต้น) — เลือกเป็นช่วงต่อเนื่อง คลิกเดือนเริ่ม แล้วคลิกเดือนสุดท้าย
 *                        ใช้กับตัวกรองของหน้ารายงานทั้งหมด
 *   multi              — เลือกเดือนแบบไม่ต่อเนื่องได้ ใช้เฉพาะหน้าเปรียบเทียบ
 *                        ซึ่งการหยิบ มิ.ย. มาเทียบกับ ก.ย. คือจุดประสงค์ของหน้า
 *
 * ค่าที่ส่งออกยังเป็นอาเรย์ของ "YYYY-MM" เหมือนเดิม ทุกหน้าที่ใช้อยู่จึงไม่ต้องแก้
 */
import { computed, ref, watch } from "vue";
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui";
import { CalendarRange, Check, ChevronDown, X } from "lucide-vue-next";
import { fiscalYearLabel, formatMonthTH, MONTHS_TH } from "@suth/domain";
import { activeFiscalYearRange, fiscalYearMonths } from "../store/fiscalYear";

const props = defineProps({
  /** อาเรย์ของ "YYYY-MM" — ว่าง = ทั้งปีงบ */
  modelValue: { type: Array, default: () => [] },
  /** เดือนที่มีข้อมูลจริง เดือนนอกรายการนี้จะเลือกไม่ได้ */
  options: { type: Array, default: () => [] },
  mode: { type: String, default: "range" },
  /** ข้อความบนปุ่มเมื่อยังไม่ได้เจาะจงช่วง */
  allLabel: { type: String, default: "ทั้งปีงบ" },
  /**
   * เลือก "ทั้งปีงบ" แล้วส่งอาเรย์ว่างกลับไปหรือไม่
   *
   * true (ค่าเริ่มต้น) — หน้าที่ใช้ตีความค่าว่างเป็น "ไม่กรองเดือน" อยู่แล้ว
   * false             — หน้าที่ค่าว่างแปลว่า "ยังไม่ได้เลือกอะไรเลย" เช่นหน้า
   *                     เปรียบเทียบ ซึ่งต้องมีเดือนอย่างน้อยหนึ่งเดือนถึงจะมีอะไรให้ดู
   */
  allEmitsEmpty: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
/** เดือนแรกที่คลิกไว้ระหว่างกำลังลากช่วง (โหมด range) */
const pendingStart = ref(null);
const hoverMonth = ref(null);

const range = computed(() => activeFiscalYearRange.value);
const yearLabel = computed(() => fiscalYearLabel(range.value));

/** 12 เดือนของปีงบ เรียงตามลำดับปีงบจริง (ต.ค. -> ก.ย.) ไม่ใช่ ม.ค. -> ธ.ค. */
const cells = computed(() =>
  fiscalYearMonths(range.value).map((value, index) => ({
    value,
    index,
    short: MONTHS_TH[Number(value.slice(5, 7)) - 1],
    full: formatMonthTH(value),
    hasData: props.options.includes(value),
  }))
);

const selected = computed(() => new Set(props.modelValue));

/* --------------------------------------------------------------------------
   ข้อความบนปุ่ม — เขียนช่วงจริงออกมาเสมอ ไม่ใช่ "เลือกไว้ n เดือน"
   -------------------------------------------------------------------------- */
const summary = computed(() => {
  const months = [...props.modelValue].sort();
  if (!months.length) return { text: props.allLabel, detail: fullRangeText.value, isAll: true };

  if (months.length === cells.value.length) {
    return { text: props.allLabel, detail: fullRangeText.value, isAll: true };
  }

  if (months.length === 1) {
    return { text: formatMonthTH(months[0]), detail: "1 เดือน", isAll: false };
  }

  const contiguous = isContiguous(months);
  if (contiguous) {
    return {
      text: `${formatMonthTH(months[0])} – ${formatMonthTH(months[months.length - 1])}`,
      detail: `${months.length} เดือน`,
      isAll: false,
    };
  }

  return {
    text: months.map((m) => formatMonthTH(m, { shortYear: true })).join(", "),
    detail: `${months.length} เดือน`,
    isAll: false,
  };
});

const fullRangeText = computed(() => {
  const list = cells.value;
  if (!list.length) return "";
  return `${list[0].full} – ${list[list.length - 1].full}`;
});

function isContiguous(months) {
  const order = cells.value.map((c) => c.value);
  const positions = months.map((m) => order.indexOf(m)).sort((a, b) => a - b);
  return positions.every((p, i) => i === 0 || p === positions[i - 1] + 1);
}

/* --------------------------------------------------------------------------
   ตัวเลือกสำเร็จรูป — เรียงจาก "ใช้บ่อยที่สุด" ลงมา

   ต่างจากของเดิมตรงที่ **ไม่ปิดปุ่มเมื่อบางเดือนไม่มีข้อมูล** แต่เลือกเฉพาะเดือน
   ที่มีข้อมูลในช่วงนั้นให้ แล้วเขียนกำกับว่าได้กี่เดือนจากกี่เดือน — ผู้ใช้จึงเห็น
   ว่าช่วงไม่เต็มแทนที่จะเจอปุ่มที่กดไม่ได้โดยไม่มีคำอธิบาย
   -------------------------------------------------------------------------- */
const presets = computed(() => {
  const all = cells.value;
  const withData = all.filter((c) => c.hasData);
  const slice = (from, to) => all.slice(from, to).map((c) => c.value);
  const lastN = (n) => withData.slice(-n).map((c) => c.value);

  const list = [
    { key: "all", label: props.allLabel, months: all.map((c) => c.value) },
    { key: "last1", label: "เดือนล่าสุดที่มีข้อมูล", months: lastN(1) },
    { key: "last3", label: "3 เดือนล่าสุด", months: lastN(3) },
    { key: "last6", label: "6 เดือนล่าสุด", months: lastN(6) },
    { key: "h1", label: "ครึ่งปีแรก", months: slice(0, 6) },
    { key: "h2", label: "ครึ่งปีหลัง", months: slice(6, 12) },
    { key: "q1", label: "ไตรมาส 1", months: slice(0, 3) },
    { key: "q2", label: "ไตรมาส 2", months: slice(3, 6) },
    { key: "q3", label: "ไตรมาส 3", months: slice(6, 9) },
    { key: "q4", label: "ไตรมาส 4", months: slice(9, 12) },
  ];

  return list
    .map((preset) => {
      const usable = preset.months.filter((m) => props.options.includes(m));
      return {
        ...preset,
        usable,
        // ข้อความขวามือ: ช่วงจริงที่จะได้ ไม่ใช่ชื่อกลุ่มซ้ำอีกรอบ
        hint: rangeHint(preset.months, usable),
        empty: usable.length === 0,
      };
    })
    .filter((preset) => preset.months.length > 0);
});

function rangeHint(months, usable) {
  if (!months.length) return "";
  if (!usable.length) return "ยังไม่มีข้อมูล";

  const first = formatMonthTH(usable[0], { shortYear: true });
  const last = formatMonthTH(usable[usable.length - 1], { shortYear: true });
  const span = usable.length === 1 ? first : `${first} – ${last}`;

  // บอกตรงๆ เมื่อช่วงที่เลือกได้ไม่เต็มกลุ่ม เพื่อไม่ให้เข้าใจว่ายอดที่เห็นคือทั้งไตรมาส
  return usable.length < months.length ? `${span} (${usable.length}/${months.length} เดือน)` : span;
}

function isPresetActive(preset) {
  if (preset.usable.length !== props.modelValue.length) {
    // "ทั้งปีงบ" ถือว่า active เมื่อไม่ได้เจาะจงอะไรเลยด้วย
    return preset.key === "all" && props.modelValue.length === 0;
  }
  return preset.usable.every((m) => selected.value.has(m));
}

function applyPreset(preset) {
  if (preset.empty) return;
  const isAll = preset.key === "all";
  emit(
    "update:modelValue",
    isAll && props.allEmitsEmpty ? [] : [...preset.usable].sort()
  );
  pendingStart.value = null;
  open.value = false;
}

/* --------------------------------------------------------------------------
   เลือกช่วงเอง
   -------------------------------------------------------------------------- */
function monthsBetween(a, b) {
  const order = cells.value;
  const i = order.findIndex((c) => c.value === a);
  const j = order.findIndex((c) => c.value === b);
  const [from, to] = i <= j ? [i, j] : [j, i];
  return order
    .slice(from, to + 1)
    .filter((c) => c.hasData)
    .map((c) => c.value);
}

function onCellClick(cell) {
  if (!cell.hasData) return;

  if (props.mode === "multi") {
    const next = selected.value.has(cell.value)
      ? props.modelValue.filter((m) => m !== cell.value)
      : [...props.modelValue, cell.value];
    emit("update:modelValue", [...next].sort());
    return;
  }

  // โหมดช่วง: คลิกแรกตั้งจุดเริ่ม คลิกที่สองปิดช่วง
  if (!pendingStart.value) {
    pendingStart.value = cell.value;
    return;
  }

  emit("update:modelValue", monthsBetween(pendingStart.value, cell.value));
  pendingStart.value = null;
  open.value = false;
}

/** ช่วงที่กำลังจะได้ถ้าปล่อยเมาส์ตรงนี้ — ให้เห็นก่อนคลิกจริง */
const previewSet = computed(() => {
  if (props.mode !== "range" || !pendingStart.value || !hoverMonth.value) return null;
  return new Set(monthsBetween(pendingStart.value, hoverMonth.value));
});

function cellState(cell) {
  if (previewSet.value?.has(cell.value)) return "preview";
  if (pendingStart.value === cell.value) return "start";
  if (selected.value.has(cell.value)) return "selected";
  return "idle";
}

function clearAll() {
  emit("update:modelValue", []);
  pendingStart.value = null;
}

// เปลี่ยนปีงบแล้วเดือนที่เลือกไว้เป็นของปีเก่า ใช้ต่อไม่ได้ ล้างทิ้ง
watch(range, () => {
  if (props.modelValue.length) emit("update:modelValue", []);
  pendingStart.value = null;
});

watch(open, (isOpen) => {
  if (!isOpen) {
    pendingStart.value = null;
    hoverMonth.value = null;
  }
});
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger
      :disabled="disabled"
      class="field flex items-center gap-2.5 text-left disabled:cursor-not-allowed"
    >
      <CalendarRange :size="16" class="shrink-0 text-ink-mute" aria-hidden="true" />

      <span class="min-w-0 flex-1">
        <span class="block truncate leading-tight" :class="summary.isAll ? 'text-ink-soft' : 'text-ink font-medium'">
          {{ summary.text }}
        </span>
        <span class="block text-2xs text-ink-mute leading-tight truncate">{{ summary.detail }}</span>
      </span>

      <ChevronDown :size="15" class="shrink-0 text-ink-faint" aria-hidden="true" />
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="6"
        class="z-[110] w-[21rem] rounded-lg bg-surface-float border border-line-soft shadow-pop overflow-hidden
               data-[state=open]:animate-pop-in"
      >
        <header class="flex items-baseline justify-between gap-2 px-4 py-3 border-b border-line-soft">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-ink">ปีงบประมาณ {{ yearLabel }}</p>
            <p class="text-2xs text-ink-mute truncate">{{ fullRangeText }}</p>
          </div>

          <button
            v-if="modelValue.length"
            type="button"
            class="shrink-0 inline-flex items-center gap-1 text-xs text-ink-mute hover:text-ink"
            @click="clearAll"
          >
            <X :size="12" aria-hidden="true" />
            ล้าง
          </button>
        </header>

        <p v-if="!range" class="px-4 py-10 text-center text-sm text-ink-mute">
          เลือกปีงบประมาณจากแถบด้านบนก่อน
        </p>

        <template v-else>
          <!-- ตัวเลือกสำเร็จรูปเป็นรายการแนวตั้ง — สิ่งที่คนกดจริงเกือบทุกครั้ง -->
          <ul class="max-h-[17rem] overflow-y-auto p-1.5 list-none" role="listbox" aria-label="ช่วงเวลาสำเร็จรูป">
            <li v-for="preset in presets" :key="preset.key">
              <button
                type="button"
                role="option"
                :aria-selected="isPresetActive(preset)"
                :disabled="preset.empty"
                class="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-md text-sm text-left transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed
                       hover:bg-surface-3 disabled:hover:bg-transparent"
                :class="isPresetActive(preset) && 'bg-brand-soft'"
                @click="applyPreset(preset)"
              >
                <Check
                  :size="16"
                  :stroke-width="3"
                  class="shrink-0 text-brand-ink"
                  :class="!isPresetActive(preset) && 'opacity-0'"
                  aria-hidden="true"
                />
                <span class="flex-1 truncate" :class="isPresetActive(preset) ? 'font-semibold text-brand-ink' : 'text-ink-soft'">
                  {{ preset.label }}
                </span>
                <span class="shrink-0 text-2xs text-ink-mute">{{ preset.hint }}</span>
              </button>
            </li>
          </ul>

          <!-- เลือกช่วงเอง — ซ่อนอยู่ใต้เส้นคั่นตามลำดับความถี่ในการใช้จริง -->
          <div class="border-t border-line-soft px-4 py-3">
            <p class="flex items-center justify-between gap-2 mb-2">
              <span class="eyebrow">เลือกช่วงเอง</span>
              <span class="text-2xs text-ink-mute">
                <template v-if="mode === 'multi'">กดเลือกทีละเดือน</template>
                <template v-else-if="pendingStart">เลือกเดือนสุดท้าย</template>
                <template v-else>กดเดือนเริ่ม แล้วกดเดือนสุดท้าย</template>
              </span>
            </p>

            <div class="grid grid-cols-6 gap-1" @mouseleave="hoverMonth = null">
              <button
                v-for="cell in cells"
                :key="cell.value"
                type="button"
                :disabled="!cell.hasData"
                :title="cell.hasData ? cell.full : `${cell.full} — ยังไม่มีข้อมูล`"
                :aria-pressed="selected.has(cell.value)"
                class="h-8 rounded-md text-xs font-medium transition-colors
                       disabled:opacity-25 disabled:cursor-not-allowed"
                :class="{
                  'bg-brand text-brand-on': cellState(cell) === 'selected' || cellState(cell) === 'start',
                  'bg-brand-soft text-brand-ink': cellState(cell) === 'preview',
                  'text-ink-soft hover:bg-surface-3': cellState(cell) === 'idle',
                }"
                @click="onCellClick(cell)"
                @mouseenter="hoverMonth = cell.value"
              >
                {{ cell.short }}
              </button>
            </div>
          </div>
        </template>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
