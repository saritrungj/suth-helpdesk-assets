<script setup>
import { t } from "../lib/locale";

import { formatMonth, yearLabel } from "../lib/locale-format";

/**
 * DashboardHero — แผงสรุปบนสุดของแดชบอร์ด
 *
 * ตอบสี่คำถามที่คนถามใน 3 วินาทีแรกหลังเปิดหน้า และตอบ **ตามลำดับนี้**
 *
 *   1. นี่คือข้อมูลของช่วงไหน        -> ปีงบ + ช่วงเดือนจริง
 *   2. ข้อมูลครบพอจะเชื่อได้หรือยัง   -> แถบความครบถ้วน
 *   3. ถ้ายังไม่ครบ ต้องไปทำอะไรต่อ   -> แผง "สิ่งที่ต้องจัดการ" ที่อยู่ถัดลงไป
 *   4. ตอนนี้ใช้ไปเท่าไหร่แล้ว        -> อยู่ในการ์ดตัวเลขถัดลงไป ไม่ใช่ที่นี่
 *
 * ทำไมข้อ 2 มาก่อนข้อ 4: ตัวเลขค่าใช้จ่ายที่คำนวณจากข้อมูลที่กรอกไม่ครบ **คือ
 * ตัวเลขที่ผิด** ถ้าเอาแผงนี้ไปโชว์เงินก้อนใหญ่ก่อน คนจะจดตัวเลขไปใช้ต่อโดยไม่รู้
 * ว่ามันคิดจากข้อมูลแค่ 6 เดือนจาก 12 เดือน — ความครบถ้วนจึงต้องมาก่อนเสมอ
 *
 * เป็นหนึ่งในสองที่เดียวในระบบที่ใช้ artwork ได้ (อีกที่คือหน้าล็อกอิน) เพราะ
 * ไม่มีตัวเลขที่ต้องอ่านเทียบกันอยู่บนพื้นนี้ — ตัวหนังสือทุกตัวบนแผงนี้เป็น
 * หัวเรื่องหรือคำอธิบาย ไม่ใช่ข้อมูลที่ถูกเอาไปตรวจใบแจ้งหนี้
 */
import { computed } from "vue";
import { CalendarRange, CircleCheckBig } from "lucide-vue-next";

import AuroraCanvas from "./AuroraCanvas.vue";
import { UiSkeleton } from "../ui";

const props = defineProps({
  fiscalYear: { type: Object, default: null },
  /** ช่วงเดือนจริงของปีงบ { startMonth, endMonth } */
  range: { type: Object, default: null },
  /**
   * ความครบถ้วนจาก /dashboard/overview — { total_months, annual_complete_months }
   *
   * ⚠️ ต้องเป็นค่านี้เท่านั้น ห้ามเอา reporting_active_devices/active_devices
   * มาใส่แทน สองอย่างนั้นนับ "จำนวนเครื่องที่เคยมียอด" ไม่ใช่ "เดือนที่กรอกครบ"
   * และเคยทำให้แผงนี้ขึ้นว่า "18/18 กรอกครบแล้ว" พร้อมกับแผงข้างล่างที่บอกว่า
   * "ยังกรอกไม่ครบ 5 เดือน" อยู่บนจอเดียวกัน
   */
  coverage: { type: Object, default: null },
  loading: { type: Boolean, default: false },
});

const periodLabel = computed(() => {
  if (!props.range) return "";
  return `${formatMonth(props.range.startMonth)} – ${formatMonth(props.range.endMonth)}`;
});

const elapsed = computed(() => Number(props.coverage?.total_months || 0));
const complete = computed(() => Number(props.coverage?.annual_complete_months || 0));

/** สัดส่วนความครบถ้วน 0–100 — ปัดลงเสมอ ไม่ให้ 99.6% กลายเป็น "100%" ที่ยังไม่จริง */
const completeness = computed(() => {
  if (!elapsed.value) return 0;
  return Math.floor((complete.value / elapsed.value) * 100);
});

const isComplete = computed(() => elapsed.value > 0 && complete.value >= elapsed.value);

</script>

<template>
  <section
    class="relative isolate overflow-hidden rounded-2xl border border-line-soft bg-surface mb-5"
  >
    <AuroraCanvas variant="hero" />

    <div class="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-5 p-5 sm:p-6">
      <div class="min-w-0">
        <p v-if="fiscalYear" class="flex items-center gap-1.5 eyebrow mb-1.5">
          <CalendarRange :size="13" aria-hidden="true" /> {{ t("ปีงบประมาณ") }} {{ yearLabel(fiscalYear.year) }}
          <span v-if="periodLabel" class="text-ink-mute font-normal normal-case tracking-normal">
            · {{ periodLabel }}
          </span>
        </p>

        <h1 class="text-2xl sm:text-3xl font-semibold text-ink tracking-tight"> {{ t("ภาพรวมเครื่องพิมพ์และค่าใช้จ่าย") }} </h1>

        <p class="text-sm text-ink-mute mt-1.5 max-w-xl"> {{ t("ยอดพิมพ์ ค่าใช้จ่ายตามสัญญา และหน่วยงานที่ใช้งานมากที่สุดในช่วงที่เลือก") }} </p>
      </div>

      <!-- ความครบถ้วน + งานถัดไป — จัดชิดขวาให้เป็นก้อนเดียวที่สายตาไปหยุด -->
      <div class="min-w-0 w-full sm:w-auto sm:min-w-[17rem]">
        <UiSkeleton v-if="loading" class="h-[4.5rem] w-full rounded-xl" />

        <div v-else class="rounded-xl border border-line-soft bg-surface/80 p-3.5 backdrop-blur-[2px]">
          <div class="flex items-baseline justify-between gap-3 mb-2">
            <span class="text-xs font-medium text-ink-soft"> {{ t("กรอกยอดพิมพ์ครบทั้งปีงบ") }} </span>
            <span class="numeral text-sm font-semibold text-ink">
              {{ complete }}<span class="text-ink-mute">/{{ elapsed }}</span>
              <span class="text-2xs text-ink-mute font-normal ml-1"> {{ t("เดือน") }} </span>
            </span>
          </div>

          <!-- แถบเป็นภาพประกอบของตัวเลขที่เขียนไว้แล้วข้างบน จึง aria-hidden
               ไม่งั้นโปรแกรมอ่านหน้าจอจะอ่านค่าเดียวกันซ้ำสองรอบ -->
          <div class="h-1.5 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
            <div
              class="h-full rounded-full transition-[width] duration-300 ease-out-quart"
              :class="isComplete ? 'bg-ok' : completeness >= 80 ? 'bg-warn' : 'bg-brand'"
              :style="{ width: `${Math.max(completeness, 2)}%` }"
            />
          </div>

          <p
            v-if="isComplete"
            class="flex items-center gap-1.5 text-xs text-ok-ink mt-2.5"
          >
            <CircleCheckBig :size="14" aria-hidden="true" /> {{ t("กรอกครบทุกเดือนแล้ว") }} </p>

          <!-- ตั้งใจ "ไม่มี" ปุ่มตรงนี้
               แผง "สิ่งที่ต้องจัดการ" ที่อยู่ถัดลงไปไม่ถึงหนึ่งนิ้วมีปุ่มพาไป
               เดือนที่ค้างอยู่แล้ว พร้อมบริบทที่ดีกว่า ("เดือนที่ค้างนานที่สุด
               คือเมษายน 2569 ขาดอีก 18 เครื่อง") การมีปุ่มหน้าตาเหมือนกันสองปุ่ม
               ที่ไปที่เดียวกันในสายตาเดียว ทำให้ทั้งคู่ดูไม่สำคัญ ไม่ใช่สำคัญขึ้น

               หน้าที่ของบล็อกนี้คือบอกว่า "ตัวเลขทั้งหน้านี้เชื่อได้แค่ไหน"
               ส่วนหน้าที่สั่งงานเป็นของแผงข้างล่าง -->
          <p v-else-if="elapsed && coverage?.applicable" class="text-xs text-warn-ink mt-2.5"> {{ t("เดือนที่ค้าง: {0} · ยังไม่ถึงกำหนด: {1}", [coverage.incomplete_months, coverage.not_due_months]) }} </p>

          <p v-else class="text-xs text-ink-mute mt-2.5"> {{ t("ไม่มีเครื่องที่ใช้งานอยู่ในขอบเขตนี้ หรือยังไม่ได้เลือกปีงบ") }} </p>
        </div>
      </div>
    </div>
  </section>
</template>
