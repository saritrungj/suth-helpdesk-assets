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
import { computed } from "vue";
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

const tab = computed({
  get: () => (route.query.tab === "department" ? "department" : "expense"),
  set: (value) => router.replace({ query: { ...route.query, tab: value } }),
});
</script>

<template>
  <div>
    <!--
      หัวเรื่องของหน้า — เดิมหน้านี้ **ไม่มี <h1> เลย** เพราะมันเริ่มด้วยแท็บทันที
      ผลคือคนที่ใช้โปรแกรมอ่านหน้าจอไม่มีทางรู้ว่ากำลังอยู่หน้าอะไร (โปรแกรมอ่าน
      หน้าจอใช้รายการหัวเรื่องเป็นสารบัญหลักในการนำทาง) และหน้านี้ก็เป็นหน้าเดียว
      ในระบบที่หน้าตาไม่เข้าชุดกับหน้าอื่นที่ใช้ UiPageHeader ทั้งหมด
    -->
    <UiPageHeader
      :eyebrow="activeFiscalYear?.year ? t(&quot;วิเคราะห์ · ปีงบประมาณ {0}&quot;, [yearLabel(activeFiscalYear.year)]) : t(&quot;วิเคราะห์&quot;)"
      :title="t(&quot;ค่าใช้จ่าย&quot;)"
      :description="t(&quot;ข้อมูลชุดเดียวกันสองมุมมอง — ตามสัญญาไว้ตรวจใบแจ้งหนี้ ตามหน่วยงานไว้ทำเรื่องเบิกภายใน&quot;)"
    />

    <UiTabs v-model="tab" :tabs="TABS" :label="t(&quot;มุมมองของรายงานค่าใช้จ่าย&quot;)">
      <template #expense>
        <KeepAlive>
          <Expense />
        </KeepAlive>
      </template>

      <template #department>
        <KeepAlive>
          <ByDepartment />
        </KeepAlive>
      </template>
    </UiTabs>
  </div>
</template>
