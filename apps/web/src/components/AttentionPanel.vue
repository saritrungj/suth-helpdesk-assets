<script setup>
/**
 * AttentionPanel — "มีอะไรที่ต้องทำไหม"
 *
 * ## ทำไมสิ่งนี้อยู่บนสุดของหน้าแรก
 *
 * แดชบอร์ดเดิมตอบได้แค่ "ตัวเลขตอนนี้เป็นเท่าไหร่" ซึ่งเป็นคำถามที่คนถามเป็น
 * อันดับสอง คำถามแรกที่คนเปิดระบบมาถามจริงคือ "มีอะไรค้างที่ฉันต้องทำหรือเปล่า"
 * — ถ้าไม่มี เขาปิดหน้าไปทำอย่างอื่น ถ้ามี เขาต้องรู้ทันทีว่าคืออะไรและกดตรงไหน
 *
 * หลักการออกแบบแดชบอร์ดที่ใช้กันจริง (NN/g) บอกตรงกันว่าให้เอาสิ่งที่ต้องลงมือทำ
 * ขึ้นก่อนตัวเลขเฉยๆ และการเตือนต้องมี "บริบท" กับ "ก้าวถัดไป" ไม่ใช่แค่แจ้งว่า
 * มีปัญหา — คำเตือนที่ไม่บอกทางแก้จะถูกเพิกเฉยภายในสองสัปดาห์
 *
 * ## กฎที่บังคับไว้ในนี้
 *
 * 1. **ทุกรายการต้องมีปุ่มที่พาไปแก้ได้จริง** ไม่ใช่แค่บอกว่ามีปัญหา
 * 2. **ไม่เกิน 6 รายการ** (API ตัดมาให้แล้ว) — แดชบอร์ดที่เตือนยี่สิบเรื่องคือ
 *    แดชบอร์ดที่ไม่มีใครอ่านคำเตือนเลย
 * 3. **เมื่อไม่มีอะไรค้าง ต้องบอกว่าไม่มี** ไม่ใช่หายไปเฉยๆ — ช่องว่างตรงที่เคยมี
 *    คำเตือนทำให้คนสงสัยว่าระบบพังหรือเปล่า การยืนยันว่า "ตรวจแล้ว ไม่มีอะไรค้าง"
 *    คือข้อมูลที่มีค่าพอๆ กับตัวคำเตือนเอง
 * 4. **สีไม่ใช่ตัวบอกความหมายเพียงอย่างเดียว** ทุกระดับมีไอคอนและคำกำกับของตัวเอง
 */
import { computed } from "vue";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-vue-next";
import { UiButton, UiCard, UiSkeleton } from "../ui";

const props = defineProps({
  /** รายการจาก /api/dashboard/overview — ดู apps/api/src/dashboard/overview.js */
  items: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});

/**
 * หน้าตาของแต่ละระดับความสำคัญ
 *
 * `label` มีไว้เพราะสีกับไอคอนอย่างเดียวไม่พอ — คนที่แยกสีแดงกับสีส้มไม่ออก
 * ต้องอ่านคำได้ว่าอันไหนด่วนกว่ากัน
 */
const SEVERITY = {
  critical: {
    label: "ต้องแก้ทันที",
    icon: CircleAlert,
    ring: "ring-danger-line",
    tint: "bg-danger-soft",
    ink: "text-danger-ink",
  },
  warning: {
    label: "มีงานค้าง",
    icon: TriangleAlert,
    ring: "ring-warn-line",
    tint: "bg-warn-soft",
    ink: "text-warn-ink",
  },
  info: {
    label: "น่าตรวจสอบ",
    icon: Info,
    ring: "ring-line",
    tint: "bg-surface-2",
    ink: "text-ink-soft",
  },
};

const meta = (severity) => SEVERITY[severity] ?? SEVERITY.info;

const hasItems = computed(() => props.items.length > 0);
</script>

<template>
  <section aria-labelledby="attention-heading">
    <h2 id="attention-heading" class="eyebrow mb-2">สิ่งที่ต้องจัดการ</h2>

    <div v-if="loading" class="grid gap-2">
      <UiSkeleton height="4.5rem" />
      <UiSkeleton height="4.5rem" />
    </div>

    <!--
      ไม่มีอะไรค้าง — ยืนยันให้เห็นชัดว่า "ตรวจแล้ว" ไม่ใช่ปล่อยว่าง
      ใช้การ์ดโทนเดียวกับรายการอื่นเพื่อไม่ให้ความสูงของหน้ากระโดดเวลาสถานะเปลี่ยน
    -->
    <UiCard v-else-if="!hasItems" class="flex items-center gap-3 px-4 py-3.5">
      <span class="grid size-9 shrink-0 place-items-center rounded-full bg-ok-soft text-ok-ink">
        <CircleCheck class="size-5" aria-hidden="true" />
      </span>
      <div class="min-w-0">
        <p class="font-medium text-ink">ไม่มีงานค้าง</p>
        <p class="text-xs text-ink-mute">กรอกยอดพิมพ์ครบทุกเดือนที่ถึงกำหนดแล้ว และไม่พบเครื่องที่คิดค่าใช้จ่ายไม่ได้</p>
      </div>
    </UiCard>

    <ul v-else class="grid gap-2">
      <li v-for="item in items" :key="item.code">
        <UiCard
          class="flex flex-col gap-3 px-4 py-3.5 ring-1 sm:flex-row sm:items-center"
          :class="meta(item.severity).ring"
        >
          <span
            class="grid size-9 shrink-0 place-items-center rounded-full"
            :class="[meta(item.severity).tint, meta(item.severity).ink]"
          >
            <component :is="meta(item.severity).icon" class="size-5" aria-hidden="true" />
          </span>

          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <!--
                คำกำกับระดับความสำคัญเป็นข้อความจริง ไม่ใช่แค่สีของกรอบ — จำเป็นทั้ง
                กับคนที่แยกสีไม่ออกและกับโปรแกรมอ่านหน้าจอ
              -->
              <span class="text-2xs font-semibold uppercase tracking-wide" :class="meta(item.severity).ink">
                {{ meta(item.severity).label }}
              </span>
              <span class="font-medium text-ink">{{ item.title }}</span>
            </p>
            <p class="mt-0.5 text-xs text-ink-mute">{{ item.detail }}</p>
          </div>

          <!--
            ปุ่มพาไปยังหน้าที่แก้เรื่องนี้ได้จริง พร้อมพารามิเตอร์ที่เจาะจงถึงเดือน
            หรือตัวกรองที่เกี่ยวข้อง — ไม่ใช่พาไปหน้าเปล่าแล้วให้ผู้ใช้ไล่หาเอง
          -->
          <UiButton
            v-if="item.action"
            :to="{ path: item.action.to, query: item.action.query }"
            variant="secondary"
            size="sm"
            class="shrink-0 self-start sm:self-auto"
          >
            {{ item.action.label }}
          </UiButton>
        </UiCard>
      </li>
    </ul>
  </section>
</template>
