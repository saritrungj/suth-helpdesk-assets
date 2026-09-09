<script setup>
import { t } from "../lib/locale";

/**
 * UiFilterBar — แถบตัวกรองที่เปิดเผยข้อมูลทีละชั้น
 *
 * ## ปัญหาที่แก้
 *
 * หน้าที่มีตัวกรองเก้าช่องกางไว้ตลอดเวลา กินความสูงประมาณ 200px ก่อนถึงข้อมูล
 * จริง บนจอ 900px แปลว่า **งานที่คนเปิดหน้ามาทำถูกดันลงไปใต้เส้นพับ** ทั้งที่
 * ในการใช้งานจริงคนแตะตัวกรองพวกนั้นไม่ถึงหนึ่งครั้งในสิบครั้งที่เปิดหน้า
 *
 * ## โครง
 *
 *   [ ช่องค้นหา + ตัวกรองที่ใช้บ่อย ]  [ ปุ่มตัวกรอง (3) ]
 *   [ ป้ายตัวกรองที่เปิดอยู่ ×  ×  ×          ล้างทั้งหมด ]
 *   [ ตัวกรองที่เหลือ — ซ่อนอยู่จนกว่าจะกดเปิด              ]
 *
 * ## กฎที่บังคับไว้
 *
 * 1. **ตัวกรองที่เปิดอยู่ต้องมองเห็นเสมอ แม้แผงจะหุบ** ผ่านป้าย (chips) —
 *    ตัวกรองที่ถูกซ่อนแล้วยังทำงานอยู่คือสาเหตุอันดับหนึ่งของคำถาม
 *    "ทำไมข้อมูลหาย" ป้ายพวกนี้จึงไม่ใช่ของประดับ แต่เป็นกลไกความปลอดภัย
 *
 * 2. **แผงเปิดค้างไว้เองถ้ามีตัวกรองที่ยังทำงานอยู่ตอนเข้าหน้า** เช่นตอนถูกลิงก์
 *    มาจากแดชบอร์ดพร้อม ?status=repair — คนต้องเห็นว่าอะไรกำลังกรองอยู่
 *
 * 3. ปุ่มเปิด/ปิดมี `aria-expanded` และ `aria-controls` จริง ไม่ใช่ div ที่กดได้
 */
import { computed, ref, useId, watch } from "vue";
import { SlidersHorizontal, X } from "lucide-vue-next";
import UiButton from "./UiButton.vue";

const props = defineProps({
  /**
   * ป้ายของตัวกรองที่เปิดอยู่ — [{ key, label }]
   * `label` ต้องอ่านออกด้วยตัวเอง ("อาคาร: อาคารผู้ป่วยใน") ไม่ใช่แค่ค่า
   */
  chips: { type: Array, default: () => [] },
  /** ซ่อนปุ่มเปิด/ปิด เมื่อหน้านั้นไม่มีตัวกรองขั้นสูง */
  collapsible: { type: Boolean, default: true },
  toggleLabel: { type: String, default: t("ตัวกรอง") },
});

const emit = defineEmits(["remove", "clear"]);

const panelId = useId();
const open = ref(props.chips.length > 0);

/**
 * เปิดแผงให้เองเมื่อมีตัวกรองโผล่มาโดยที่ผู้ใช้ไม่ได้กดเอง (เช่นมาจาก URL)
 * แต่ **ไม่หุบเอง** เมื่อผู้ใช้ล้างตัวกรอง — การหุบแผงใต้มือคนที่กำลังจะกรอง
 * ต่อคือการแย่งการควบคุมไปจากเขา
 */
watch(
  () => props.chips.length,
  (count, previous) => {
    if (count > 0 && (previous ?? 0) === 0) open.value = true;
  }
);
</script>

<template>
  <section class="mb-4" data-print="hide">
    <div class="flex flex-wrap items-end gap-2">
      <!-- ตัวกรองที่ใช้บ่อย — อยู่ในสายตาเสมอ ไม่ต้องกดเปิด -->
      <div class="flex-1 min-w-0 flex flex-wrap items-end gap-2">
        <slot name="primary" />
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <slot name="actions" />

        <UiButton
          v-if="collapsible"
          variant="secondary"
          :aria-expanded="open"
          :aria-controls="panelId"
          @click="open = !open"
        >
          <template #icon><SlidersHorizontal :size="15" /></template>
          {{ toggleLabel }}
          <span v-if="chips.length" class="ml-1.5 numeral text-xs text-brand-ink">
            ({{ chips.length }})
          </span>
        </UiButton>
      </div>
    </div>

    <!-- ป้ายตัวกรองที่เปิดอยู่ — เห็นได้เสมอไม่ว่าแผงจะเปิดหรือหุบ -->
    <ul v-if="chips.length" class="flex flex-wrap items-center gap-1.5 mt-2.5 list-none">
      <li v-for="chip in chips" :key="chip.key">
        <button
          type="button"
          class="group inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full
                 border border-line bg-surface-2 text-xs text-ink-soft
                 hover:border-line-strong hover:text-ink transition-colors"
          @click="emit('remove', chip.key)"
        >
          {{ chip.label }}
          <X :size="13" class="text-ink-faint group-hover:text-ink" aria-hidden="true" />
          <span class="sr-only"> {{ t("เอาตัวกรองนี้ออก") }} </span>
        </button>
      </li>

      <li>
        <UiButton size="xs" variant="ghost" @click="emit('clear')"> {{ t("ล้างทั้งหมด") }} </UiButton>
      </li>
    </ul>

    <!-- ตัวกรองขั้นสูง
         ใช้ v-show ไม่ใช่ v-if เพื่อไม่ให้ค่าที่พิมพ์ไว้ในช่องหายตอนหุบ และ
         ไม่ต้องสร้าง combobox ทั้งชุดใหม่ทุกครั้งที่กดเปิด ซึ่งสะดุดตาเห็นได้ -->
    <div
      v-show="!collapsible || open"
      :id="panelId"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3
             mt-3 p-4 rounded-xl border border-line-soft bg-surface"
    >
      <slot />
    </div>
  </section>
</template>
