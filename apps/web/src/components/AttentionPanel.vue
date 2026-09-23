<script setup>
import { t } from "../lib/locale";

// รายการติดตามในลิ้นชักแจ้งเตือน พร้อมความสำคัญและลิงก์ไปจัดการแต่ละเรื่อง
import { locale } from "../lib/locale";
import { formatMonth } from "../lib/locale-format";
import { computed } from "vue";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-vue-next";
import { UiActionRow, UiSkeleton } from "../ui";

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

/** เรียงจากด่วนที่สุดลงมา — ลำดับเดียวกับที่ API เรียงมาให้ (SEVERITY_ORDER) */
const SEVERITY_ORDER = ["critical", "warning", "info"];

const meta = (severity) => SEVERITY[severity] ?? SEVERITY.info;

const localizedItems = computed(() => props.items.map((item) => {
  if (locale.value !== "en") return item;
  const copy = {
    missing_readings: {
      title: t("ค้างกรอก {0} เดือน", [item.count]),
      detail: t("เดือนที่ค้างนานที่สุด: {0} ยังขาดอีก {1} เครื่อง", [formatMonth(item.params?.month ?? item.months?.[0]), item.params?.missing_devices ?? "—"]),
      action: t("บันทึกยอดพิมพ์"),
    },
    unpriced_outside_term: {
      title: t("มี {0} เครื่องที่มียอดพิมพ์นอกอายุสัญญา", [item.count]),
      detail: t("{0} รายการ รวม {1} หน้า ยังไม่ถูกนับในยอดเงิน", [item.params?.readings ?? "—", item.params?.pages ?? "—"]),
      action: t("ตรวจอายุสัญญา"),
    },
    unpriced_missing_price_line: {
      title: t("มี {0} เครื่องที่สัญญาไม่มีราคาของหมวดมิเตอร์", [item.count]),
      detail: t("{0} รายการ รวม {1} หน้า ยังไม่ถูกนับในยอดเงิน", [item.params?.readings ?? "—", item.params?.pages ?? "—"]),
      action: t("ตรวจรายการราคาของสัญญา"),
    },
    unassigned_unbilled_devices: {
      title: t("มี {0} เครื่องที่ยังไม่ได้ผูกสัญญา", [item.count]),
      detail: t("{0} รายการ รวม {1} หน้า ยังไม่ถูกนับในยอดเงิน", [item.params?.readings ?? "—", item.params?.pages ?? "—"]),
      action: t("ผูกสัญญาให้เครื่อง"),
    },
    unpriced_contract_history: {
      title: t("มี {0} เครื่องที่ประวัติสัญญาไม่ครอบคลุมยอดพิมพ์", [item.count]),
      detail: t("{0} รายการ รวม {1} หน้า ต้องตรวจวันที่เริ่มคิดเงินของเครื่อง", [item.params?.readings ?? "—", item.params?.pages ?? "—"]),
      action: t("ตรวจประวัติสัญญาของเครื่อง"),
    },
    unverified_installation: {
      title: t("มี {0} เครื่องที่ยังไม่ได้ตรวจยืนยันสถานะการติดตั้ง", [item.count]),
      detail: t("ยืนยันความครบถ้วนของยอดพิมพ์ไม่ได้จนกว่าจะตรวจครบ"),
      action: t("ตรวจยืนยันการติดตั้ง"),
    },
    idle_devices: {
      title: t("มี {0} เครื่องที่ไม่มียอดพิมพ์ในปีงบนี้", [item.count]),
      detail: t("ตรวจสอบว่ายังจำเป็นต้องใช้เครื่องเหล่านี้ก่อนต่อสัญญา"),
      action: t("ดูรายการเครื่อง"),
    },
  }[item.code];
  return copy ? { ...item, title: copy.title, detail: copy.detail, action: item.action ? { ...item.action, label: copy.action } : null } : item;
}));

/**
 * จัดเป็นกลุ่มตามความเร่งด่วน ไม่ใช่รายการเรียงยาวรายการเดียว
 *
 * Carbon (notification pattern) ระบุว่า notification panel จัดกลุ่มได้ตามแหล่งที่มา
 * หรือความเร่งด่วน และ Linear Inbox แยก "Priority" ออกจาก "Other" ด้วยเหตุผลเดียวกัน
 * คือคนเปิดกล่องนี้มาเพื่อถามว่า "มีอะไรที่ต้องทำเดี๋ยวนี้ไหม" ไม่ใช่มาอ่านทุกแถว
 * เรียงกันไปเรื่อยๆ แล้วตัดสินความด่วนเองทีละแถว
 *
 * ผลพลอยได้คือคำกำกับความสำคัญขึ้นครั้งเดียวที่หัวกลุ่ม แทนที่จะขึ้นซ้ำทุกแถว
 * แถวจึงเหลือแค่เรื่องกับปุ่มที่พาไปแก้
 */
const groups = computed(() => SEVERITY_ORDER
  .map((severity) => ({ severity, ...meta(severity), items: localizedItems.value.filter((item) => item.severity === severity) }))
  .filter((group) => group.items.length));

const hasItems = computed(() => props.items.length > 0);
</script>

<template>
  <div>
    <!--
      ไม่มีหัวข้อของตัวเอง — กล่องที่ครอบอยู่ (UiDrawer) ตั้งชื่อเรื่องนี้ไว้แล้วว่า
      "งานที่ต้องติดตาม" หัวข้อซ้อนอีกชั้นที่เขียนว่า "สิ่งที่ต้องจัดการ" คือการให้
      สองชื่อกับของสิ่งเดียวในกล่องเดียวกัน (#83)
    -->
    <div v-if="loading" class="grid gap-2" :aria-label="t('กำลังโหลดงานที่ต้องติดตาม')" role="status">
      <UiSkeleton height="4.5rem" />
      <UiSkeleton height="4.5rem" />
    </div>

    <!--
      ไม่มีอะไรค้าง — ยืนยันให้เห็นชัดว่า "ตรวจแล้ว" ไม่ใช่ปล่อยว่าง
      กล่องนี้เปิดจากกระดิ่งที่ไม่มีป้ายจำนวน คนกดเข้ามาจึงต้องได้คำตอบ ไม่ใช่หน้าว่าง
    -->
    <p
      v-else-if="!hasItems"
      class="flex flex-col gap-1 border-l-[3px] border-ok-ink bg-ok-soft rounded-r-lg py-3 pl-3 pr-4"
    >
      <span class="flex items-center gap-2 text-base font-medium text-ink">
        <CircleCheck class="size-4 shrink-0 text-ok-ink" aria-hidden="true" />
        {{ t("ไม่มีงานค้าง") }}
      </span>
      <span class="text-sm text-ink-soft"> {{ t("กรอกยอดพิมพ์ครบทุกเดือนที่ถึงกำหนดแล้ว และไม่พบเครื่องที่คิดค่าใช้จ่ายไม่ได้") }} </span>
    </p>

    <div v-else class="grid gap-5">
      <section v-for="group in groups" :key="group.severity" :aria-labelledby="`attention-${group.severity}`">
        <!--
          คำกำกับระดับความสำคัญเป็นข้อความจริง ไม่ใช่แค่สีของขีด — จำเป็นทั้งกับคนที่
          แยกสีไม่ออกและกับโปรแกรมอ่านหน้าจอ ตัวเลขท้ายหัวกลุ่มบอกว่ากลุ่มนี้มีกี่เรื่อง
          โดยไม่ต้องนับแถวเอง; เป็น h3 เพราะหัวลิ้นชัก (DialogTitle) เป็น h2 อยู่แล้ว
        -->
        <h3
          :id="`attention-${group.severity}`"
          class="flex items-center gap-1.5 mb-2 text-2xs font-semibold uppercase tracking-wide"
          :class="group.ink"
        >
          <component :is="group.icon" class="size-3.5" aria-hidden="true" />
          {{ group.label }}
          <span class="text-ink-mute font-normal normal-case tracking-normal">· {{ group.items.length }}</span>
        </h3>

        <!--
          แต่ละรายการเป็นแถบขีดข้างเดียว ไม่ใช่การ์ดที่มีกรอบรอบตัว

          รอบที่ 6 วัดหน้านี้เทียบกับ Plausible/Catalyst แล้วพบว่าการ์ดสามชั้น
          (กรอบ + วงกลมไอคอน + พื้นสี) ทำให้แถบเตือนหนึ่งรายการสูง 106px ทั้งที่
          เนื้อความมีสองบรรทัด ขีดข้างเดียวบอกระดับความสำคัญได้เท่ากันโดยใช้เส้นเดียว
        -->
        <ul class="grid gap-2">
          <li
            v-for="item in group.items"
            :key="item.code"
            class="border-l-[3px] rounded-r-lg"
            :class="[group.edge, group.tint]"
          >
            <!--
              ทั้งแถบเป็นลิงก์จริง ไม่ใช่แค่ปุ่มเล็กด้านล่าง เพราะผู้ใช้กดข้อความหรือ
              พื้นที่ของ notification ตามธรรมชาติ ต้องได้ผลเดียวกัน UiActionRow ใช้
              ลิงก์จริง จึงรองรับ Tab/Enter และเปิดแท็บใหม่โดยไม่เขียน handler ซ้ำที่นี่
            -->
            <UiActionRow :to="item.action ? { path: item.action.to, query: item.action.query } : null">
              <p class="text-base font-semibold text-ink">{{ item.title }}</p>
              <p class="mt-0.5 text-sm text-ink-soft">{{ item.detail }}</p>
              <template v-if="item.action" #action>{{ item.action.label }}</template>
            </UiActionRow>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
