<script setup>
/**
 * UiTabs — แถบแท็บสลับแผงเนื้อหาในหน้าเดียว
 *
 * ใช้ Reka UI เพื่อให้ได้พฤติกรรมคีย์บอร์ดตามมาตรฐาน WAI-ARIA ฟรี: ลูกศรซ้าย/ขวา
 * เลื่อนแท็บ, Home/End ไปหัว-ท้าย, Tab กระโดดข้ามไปที่เนื้อหาเลยไม่ต้องไล่ทีละแท็บ
 *
 * แท็บในระบบนี้ผูกกับ query string (?tab=...) เพื่อให้บุ๊กมาร์กและปุ่มย้อนกลับ
 * ของเบราว์เซอร์ทำงานถูก — หน้าไหนใช้ ให้ v-model กับค่า route.query
 *
 * ตัวขีดใต้แท็บที่เลือกอยู่เลื่อนตามด้วย transition ไม่ใช่โผล่ทันที เพื่อให้สายตา
 * ตามได้ว่าย้ายจากไหนไปไหน (สำคัญเมื่อมีแท็บเยอะและต้องเลื่อนแนวนอน)
 */
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "reka-ui";

defineProps({
  modelValue: { type: String, required: true },
  /** [{ value, label, icon?, count? }] */
  tabs: { type: Array, required: true },
  label: { type: String, default: "แท็บเนื้อหา" },
});

defineEmits(["update:modelValue"]);
</script>

<template>
  <TabsRoot
    :model-value="modelValue"
    class="flex flex-col min-w-0"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <TabsList
      class="flex items-stretch gap-1 overflow-x-auto no-scrollbar border-b border-line-soft shrink-0"
      :aria-label="label"
    >
      <TabsTrigger
        v-for="tab in tabs"
        :key="tab.value"
        :value="tab.value"
        class="group relative inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap
               text-ink-mute hover:text-ink transition-colors
               data-[state=active]:text-brand-ink"
      >
        <component v-if="tab.icon" :is="tab.icon" :size="15" aria-hidden="true" />
        {{ tab.label }}

        <span
          v-if="tab.count !== undefined"
          class="numeral text-2xs px-1.5 py-0.5 rounded-xs bg-surface-3 text-ink-mute
                 group-data-[state=active]:bg-brand-soft group-data-[state=active]:text-brand-ink"
        >
          {{ tab.count }}
        </span>

        <span
          class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand scale-x-0 opacity-0
                 transition-[transform,opacity] duration-200 ease-out-quart
                 group-data-[state=active]:scale-x-100 group-data-[state=active]:opacity-100"
          aria-hidden="true"
        ></span>
      </TabsTrigger>
    </TabsList>

    <TabsContent
      v-for="tab in tabs"
      :key="tab.value"
      :value="tab.value"
      class="pt-4 min-w-0 focus-visible:outline-none"
    >
      <slot :name="tab.value" />
    </TabsContent>
  </TabsRoot>
</template>
