<script setup>
import { yearLabel } from "../lib/locale-format";
import { t } from "../lib/locale";

/**
 * UsageReport — หน้ารายงานค่าใช้จ่าย มีสองมุมมองในหน้าเดียว
 *
 *   ตามสัญญา       ใครเรียกเก็บเรา และเก็บเท่าไหร่ — ใช้ตอนตรวจใบแจ้งหนี้
 *   ตามหน่วยงาน    เราเอาไปลงที่แผนกไหนบ้าง — ใช้ตอนทำเรื่องเบิกภายใน
 *
 * ข้อมูลชุดเดียวกัน แต่คนละคำถาม จึงเป็นแท็บในหน้าเดียวไม่ใช่สองหน้าแยก
 *
 * แท็บผูกกับ ?tab= เพื่อให้บุ๊กมาร์กและลิงก์จากเมนูเปิดมาถูกมุมมอง และใช้
 * <KeepAlive> ไม่ให้ตัวกรองกับตำแหน่งที่เลื่อนค้างไว้หายทุกครั้งที่สลับแท็บ
 */
import { computed, nextTick, onActivated, onDeactivated, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Building2, ReceiptText } from "lucide-vue-next";
import ByDepartment from "./ByDepartment.vue";
import Expense from "./Expense.vue";
import { activeFiscalYear } from "../store/fiscalYear";
import { UiPageHeader, UiTabs } from "../ui";

const route = useRoute();
const router = useRouter();

const TABS = [
  { value: "expense", label: t("ตามสัญญา"), icon: ReceiptText },
  { value: "department", label: t("ตามฝ่าย / แผนก"), icon: Building2 },
];

const selectedTab = ref(route.query.tab === "department" ? "department" : "expense");
watch(() => [route.path, route.query.tab], ([path, value]) => {
  if (path === "/expense") selectedTab.value = value === "department" ? "department" : "expense";
});
const tab = computed({
  get: () => selectedTab.value,
  set: (value) => {
    scrollPositions[tab.value] = window.scrollY;
    router.replace({ query: { ...route.query, tab: value } });
  },
});
const visited = ref(new Set([tab.value]));
const scrollPositions = { expense: 0, department: 0 };
let activeTab = tab.value;
let restoringScroll = false;
const rememberScroll = () => {
  if (!restoringScroll) scrollPositions[activeTab] = window.scrollY;
};
async function restoreScroll(value) {
  restoringScroll = true;
  activeTab = value;
  await nextTick();
  window.scrollTo(0, scrollPositions[value]);
  requestAnimationFrame(() => { restoringScroll = false; });
}
watch(tab, value => {
  visited.value = new Set([...visited.value, value]);
  restoreScroll(value);
});
onActivated(async () => {
  await restoreScroll(tab.value);
  window.addEventListener("scroll", rememberScroll, { passive: true });
});
onDeactivated(() => window.removeEventListener("scroll", rememberScroll));
onUnmounted(() => window.removeEventListener("scroll", rememberScroll));
</script>

<template>
  <div>
    <!--
      หัวเรื่องของหน้า — เดิมหน้านี้ **ไม่มี <h1> เลย** เพราะมันเริ่มด้วยแท็บทันที
      ผลคือคนที่ใช้โปรแกรมอ่านหน้าจอไม่มีทางรู้ว่ากำลังอยู่หน้าอะไร (โปรแกรมอ่าน
      หน้าจอใช้รายการหัวเรื่องเป็นสารบัญหลักในการนำทาง) และหน้านี้ก็เป็นหน้าเดียว
      ในระบบที่หน้าตาไม่เข้าชุดกับหน้าอื่นที่ใช้ UiPageHeader ทั้งหมด
    -->
    <!-- หัวหน้าแถวเดียวแบบเดียวกับทะเบียนและบันทึกยอด (รอบที่ 3 ของ #51) -->
    <UiPageHeader :title="t(&quot;ค่าใช้จ่าย&quot;)">
      <!--
        ปีงบไม่ขึ้นซ้ำบนจอ เพราะแถบบนบอกอยู่แล้ว — แต่รายงานหน้านี้ถูกพิมพ์ออกกระดาษ
        ส่งผู้บริหารจริง และแถบบนกับแถบเลือกช่วงเวลาไม่ติดไปกับกระดาษ ถ้าไม่มีป้ายนี้
        กระดาษจะมีแต่ยอดรวมโดยไม่บอกว่าเป็นยอดของปีงบไหน (ข้อกำหนด #46: พิมพ์แล้ว
        ต้องคงชื่อและช่วงเวลาไว้) ตัวป้ายซ่อนอยู่จนถึงตอนพิมพ์ ดู base.css
      -->
      <template v-if="activeFiscalYear?.year" #meta>
        <p data-topbar-context class="mt-1 text-sm text-ink-mute numeral">
          {{ t("ปีงบ {0}", [yearLabel(activeFiscalYear.year)]) }}
        </p>
      </template>
    </UiPageHeader>

    <UiTabs v-model="tab" :tabs="TABS" keep-mounted :label="t(&quot;มุมมองของรายงานค่าใช้จ่าย&quot;)">
      <template #expense>
        <KeepAlive>
          <Expense v-if="visited.has('expense')" />
        </KeepAlive>
      </template>

      <template #department>
        <KeepAlive>
          <ByDepartment v-if="visited.has('department')" />
        </KeepAlive>
      </template>
    </UiTabs>
  </div>
</template>
