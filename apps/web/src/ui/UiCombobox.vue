<script setup>
import { usePortalTarget } from "./portal-target";
const portalTarget = usePortalTarget();
import { t } from "../lib/locale";

/**
 * UiCombobox — ช่องเลือกที่พิมพ์ค้นหาได้ รองรับทั้งเลือกเดี่ยวและเลือกหลายรายการ
 *
 * ใช้แทน <select> เมื่อรายการยาวเกินกว่าจะกวาดตาหา — ระบบนี้มีแผนกเป็นร้อย
 * และเครื่องพิมพ์เป็นพัน การเลื่อนหาใน dropdown ยาวๆ ช้ากว่าพิมพ์สามตัวอักษรมาก
 *
 * แทนที่ SearchableSelect.vue และ DepartmentPicker.vue เดิม ซึ่งเขียน dropdown
 * เองด้วย click-outside listener จึงไม่มีสิ่งเหล่านี้: เลื่อนเลือกด้วยลูกศร,
 * Enter เพื่อยืนยัน, Esc เพื่อปิด, ประกาศจำนวนผลลัพธ์ให้โปรแกรมอ่านหน้าจอ,
 * และเลื่อนรายการที่ถูกไฮไลต์ให้อยู่ในสายตาอัตโนมัติ — Reka UI ทำให้ครบทั้งหมด
 *
 * การค้นหาตัดช่องว่างและไม่สนตัวพิมพ์ใหญ่เล็ก และค้นจากทั้ง label และ keywords
 * (ถ้าใส่มา) เพื่อให้พิมพ์ "printer" แล้วเจอรายการที่เขียนว่า "เครื่องพิมพ์" ได้
 */
import { computed, ref, watch } from "vue";
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from "reka-ui";
import { Check, ChevronsUpDown, Search, X } from "lucide-vue-next";
import { useField } from "./field-context";

const props = defineProps({
  /** string|number สำหรับเลือกเดี่ยว, array สำหรับ multiple */
  modelValue: { type: [String, Number, Array, null], default: "" },
  /** [{ value, label, keywords?, hint? }] */
  options: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: false },
  placeholder: { type: String, default: t("เลือกรายการ") },
  searchPlaceholder: { type: String, default: t("พิมพ์เพื่อค้นหา...") },
  /** ข้อความของตัวเลือก "ไม่เจาะจง" ในโหมดเลือกเดี่ยว ไม่ใส่ = ไม่มีตัวเลือกนี้ */
  anyLabel: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  emptyText: { type: String, default: t("ไม่มีรายการให้เลือก") },
});

const emit = defineEmits(["update:modelValue"]);

const field = useField();
const search = ref("");
const open = ref(false);

// ค่าที่ส่งให้ Reka: โหมดหลายรายการต้องเป็น array เสมอ ส่วนโหมดเดี่ยวใช้ null
// แทนค่าว่าง (Reka ถือว่า "" เป็นค่าที่เลือกไว้จริง ทำให้ติ๊กถูกค้างที่ช่องว่าง)
const innerValue = computed(() => {
  if (props.multiple) return Array.isArray(props.modelValue) ? props.modelValue : [];
  return props.modelValue === "" || props.modelValue === undefined ? null : props.modelValue;
});

const normalized = computed(() =>
  props.options.map((option) => ({
    value: option.value,
    label: String(option.label ?? ""),
    hint: option.hint ?? "",
    haystack: `${option.label ?? ""} ${option.keywords ?? ""}`.toLowerCase(),
  }))
);

const filtered = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return normalized.value;
  return normalized.value.filter((option) => option.haystack.includes(keyword));
});

const selectedLabels = computed(() => {
  if (props.multiple) {
    const picked = normalized.value.filter((o) => innerValue.value.includes(o.value));
    if (!picked.length) return "";
    if (picked.length <= 2) return picked.map((o) => o.label).join(", ");
    return t("เลือกไว้ {0} รายการ", [picked.length]);
  }
  return normalized.value.find((o) => o.value === innerValue.value)?.label ?? "";
});

const count = computed(() => (props.multiple ? innerValue.value.length : 0));

function onUpdate(value) {
  emit("update:modelValue", props.multiple ? value ?? [] : value ?? "");
}

function clearAll() {
  emit("update:modelValue", props.multiple ? [] : "");
}

// เคลียร์คำค้นหาทุกครั้งที่ปิด เพื่อให้เปิดครั้งหน้าเห็นรายการครบตั้งแต่แรก
watch(open, (isOpen) => {
  if (!isOpen) search.value = "";
});
</script>

<template>
  <ComboboxRoot
    :model-value="innerValue"
    v-model:open="open"
    :multiple="multiple"
    :disabled="disabled"
    ignore-filter
    class="relative min-w-0"
    @update:model-value="onUpdate"
  >
    <ComboboxAnchor as-child>
      <ComboboxTrigger
        :id="field.id"
        class="field flex items-center gap-2 text-left cursor-pointer"
        :aria-invalid="field.invalid ? 'true' : undefined"
        :aria-describedby="field.describedBy"
      >
        <span class="flex-1 truncate" :class="!selectedLabels && 'text-ink-mute'">
          {{ selectedLabels || placeholder }}
        </span>

        <span
          v-if="count > 2"
          class="shrink-0 numeral text-2xs px-1.5 py-0.5 rounded-xs bg-brand-soft text-brand-ink"
        >
          {{ count }}
        </span>

        <ChevronsUpDown :size="15" class="shrink-0 text-ink-faint" aria-hidden="true" />
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxPortal :to="portalTarget">
      <ComboboxContent
        position="popper"
        :side-offset="6"
        class="z-[110] w-[var(--reka-combobox-trigger-width)] min-w-[15rem] max-h-[min(22rem,60dvh)]
               flex flex-col rounded-lg bg-surface-float border border-line-soft shadow-pop overflow-hidden
               data-[state=open]:animate-pop-in"
      >
        <div class="relative shrink-0 border-b border-line-soft">
          <Search
            :size="15"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
            aria-hidden="true"
          />
          <ComboboxInput
            v-model="search"
            :placeholder="searchPlaceholder"
            class="w-full bg-transparent pl-9 pr-3 py-2.5 text-sm outline-none placeholder:text-ink-faint"
          />
        </div>

        <div
          v-if="multiple && count"
          class="flex items-center justify-between gap-2 px-3 py-1.5 shrink-0 border-b border-line-soft bg-surface-2"
        >
          <span class="text-xs text-ink-mute"> {{ t("เลือกไว้") }} {{ count }} {{ t("รายการ") }} </span>
          <button
            type="button"
            class="inline-flex items-center gap-1 text-xs text-danger-ink hover:underline"
            @click="clearAll"
          >
            <X :size="12" aria-hidden="true" /> {{ t("ล้างทั้งหมด") }} </button>
        </div>

        <ComboboxViewport class="p-1 overflow-y-auto overscroll-contain">
          <ComboboxItem
            v-if="anyLabel && !multiple"
            :value="null"
            class="flex items-center gap-2 px-2.5 py-2 rounded-md text-sm cursor-pointer outline-none
                   text-ink-mute italic
                   data-[highlighted]:bg-surface-3 data-[highlighted]:text-ink"
          >
            <span class="w-4 shrink-0"></span>
            {{ anyLabel }}
          </ComboboxItem>

          <ComboboxItem
            v-for="option in filtered"
            :key="String(option.value)"
            :value="option.value"
            class="group flex items-start gap-2 px-2.5 py-2 rounded-md text-sm cursor-pointer outline-none
                   text-ink-soft
                   data-[highlighted]:bg-surface-3 data-[highlighted]:text-ink
                   data-[state=checked]:text-brand-ink data-[state=checked]:font-medium"
          >
            <Check
              :size="15"
              class="shrink-0 mt-0.5 opacity-0 group-data-[state=checked]:opacity-100"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ option.label }}</span>
              <span v-if="option.hint" class="block text-2xs text-ink-mute truncate">
                {{ option.hint }}
              </span>
            </span>
          </ComboboxItem>

          <!-- กรองเองด้วย ignore-filter จึงเช็คผลลัพธ์ว่างเองด้วย ไม่ใช้ ComboboxEmpty
               ซึ่งนับจากตัวกรองภายในของ Reka ที่ถูกปิดไปแล้ว -->
          <p v-if="!filtered.length" class="px-3 py-6 text-center text-xs text-ink-mute">
            <template v-if="!options.length">{{ emptyText }}</template>
            <template v-else> {{ t("ไม่พบรายการที่ตรงกับ “") }} {{ search }}&rdquo;</template>
          </p>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
