<script setup>
import { t } from "../lib/locale";

// รายการติดตามในลิ้นชักแจ้งเตือน พร้อมความสำคัญและลิงก์ไปจัดการแต่ละเรื่อง
import { locale } from "../lib/locale";
import { formatMonth } from "../lib/locale-format";
import { computed } from "vue";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-vue-next";
import { UiButton, UiSkeleton } from "../ui";

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
    label: t("ต้องแก้ทันที"),
    icon: CircleAlert,
    edge: "border-danger-ink",
    tint: "bg-danger-soft",
    ink: "text-danger-ink",
  },
  warning: {
    label: t("มีงานค้าง"),
    icon: TriangleAlert,
    edge: "border-warn-ink",
    tint: "bg-warn-soft",
    ink: "text-warn-ink",
  },
  info: {
    label: t("น่าตรวจสอบ"),
    icon: Info,
    edge: "border-line",
    tint: "bg-surface-2",
    ink: "text-ink-soft",
  },
};

const meta = (severity) => SEVERITY[severity] ?? SEVERITY.info;

const localizedItems = computed(() => props.items.map((item) => {
  if (locale.value !== "en") return item;
  const copy = {
    missing_readings: {
      title: t("ค้างกรอก {0} เดือน", [item.count]),
      detail: t("เดือนที่ค้างนานที่สุด: {0} ยังขาดอีก {1} เครื่อง", [formatMonth(item.params?.month ?? item.months?.[0]), item.params?.missing_devices ?? "—"]),
      action: t("บันทึกยอดพิมพ์"),
    },
    unbilled_devices: {
      title: t("มี {0} เครื่องที่มียอดพิมพ์แต่ไม่มีราคา", [item.count]),
      detail: t("ยังคิดค่าใช้จ่ายไม่ได้ {0} หน้า เพราะไม่มีข้อมูลราคา", [item.params?.pages ?? "—"]),
      action: t("ตรวจเครื่องที่ไม่มีสัญญา"),
    },
    idle_devices: {
      title: t("มี {0} เครื่องที่ไม่มียอดพิมพ์ในปีงบนี้", [item.count]),
      detail: t("ตรวจสอบว่ายังจำเป็นต้องใช้เครื่องเหล่านี้ก่อนต่อสัญญา"),
      action: t("ดูรายการเครื่อง"),
    },
  }[item.code];
  return copy ? { ...item, title: copy.title, detail: copy.detail, action: item.action ? { ...item.action, label: copy.action } : null } : item;
}));
const hasItems = computed(() => props.items.length > 0);
</script>

<template>
  <section aria-labelledby="attention-heading">
    <h2 id="attention-heading" class="eyebrow mb-2"> {{ t("สิ่งที่ต้องจัดการ") }} </h2>

    <div v-if="loading" class="grid gap-2">
      <UiSkeleton height="4.5rem" />
      <UiSkeleton height="4.5rem" />
    </div>

    <!--
      ไม่มีอะไรค้าง — ยืนยันให้เห็นชัดว่า "ตรวจแล้ว" ไม่ใช่ปล่อยว่าง
      ใช้ทรงเดียวกับรายการที่ค้างเพื่อไม่ให้ความสูงของหน้ากระโดดเวลาสถานะเปลี่ยน
    -->
    <p
      v-else-if="!hasItems"
      class="flex items-center gap-2.5 border-l-[3px] border-ok-ink bg-ok-soft rounded-r-lg py-2.5 pl-3 pr-4"
    >
      <CircleCheck class="size-4 shrink-0 text-ok-ink" aria-hidden="true" />
      <span class="text-base font-medium text-ink"> {{ t("ไม่มีงานค้าง") }} </span>
      <span class="text-sm text-ink-mute"> {{ t("กรอกยอดพิมพ์ครบทุกเดือนที่ถึงกำหนดแล้ว และไม่พบเครื่องที่คิดค่าใช้จ่ายไม่ได้") }} </span>
    </p>

    <!--
      แต่ละรายการเป็นแถบขีดข้างเดียว ไม่ใช่การ์ดที่มีกรอบรอบตัว

      รอบที่ 6 วัดหน้านี้เทียบกับ Plausible/Catalyst แล้วพบว่าของที่มีกรอบรอบตัว
      เหนือบรรทัดพับมีถึง 10 ชิ้น การ์ดสามชั้น (กรอบ + วงกลมไอคอน + พื้นสี) ทำให้
      แถบเตือนหนึ่งรายการสูง 106px ทั้งที่เนื้อความมีสองบรรทัด ขีดข้างเดียวบอก
      ระดับความสำคัญได้เท่ากันโดยใช้เส้นเส้นเดียว และเหลือพื้นที่ให้ตัวเลขจริง
    -->
    <ul v-else class="grid gap-2">
      <li
        v-for="item in localizedItems"
        :key="item.code"
        class="flex flex-col gap-2 border-l-[3px] rounded-r-lg py-2.5 pl-3 pr-3 sm:flex-row sm:items-center sm:gap-4"
        :class="[meta(item.severity).edge, meta(item.severity).tint]"
      >
        <div class="min-w-0 flex-1">
          <p class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <!--
              คำกำกับระดับความสำคัญเป็นข้อความจริง ไม่ใช่แค่สีของขีด — จำเป็นทั้ง
              กับคนที่แยกสีไม่ออกและกับโปรแกรมอ่านหน้าจอ
            -->
            <span class="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide" :class="meta(item.severity).ink">
              <component :is="meta(item.severity).icon" class="size-3.5" aria-hidden="true" />
              {{ meta(item.severity).label }}
            </span>
            <span class="text-base font-semibold text-ink">{{ item.title }}</span>
          </p>
          <p class="text-sm text-ink-soft">{{ item.detail }}</p>
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
      </li>
    </ul>
  </section>
</template>
