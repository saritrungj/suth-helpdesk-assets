<script setup>
import { formatMonth } from "../../lib/locale-format";

import { t } from "../../lib/locale";

/**
 * FiscalYear — ปีงบประมาณ
 *
 * ปีงบเป็นตัวกรองที่อยู่เหนือทุกหน้าในระบบ (เลือกได้จากแถบบนสุด) การเพิ่มหรือ
 * แก้ไขที่นี่จึงต้องรีเฟรช state กลางทันที ไม่ใช่รอให้ผู้ใช้ refresh หน้าเว็บเอง
 * — ส่งผ่าน onChanged ให้ MasterDataPage เรียกหลังบันทึกสำเร็จ
 *
 * เก็บเป็น พ.ศ. (เช่น 2568) และฝั่ง API เป็นผู้คำนวณช่วงเดือน ต.ค.–ก.ย. ให้เอง
 * ตอนสร้าง ไม่ใช่ให้แต่ละหน้าเดา (ดู ADR-0001 และ ADR-0002)
 */
import { currentMonth } from "@suth/domain";
import MasterDataPage from "../../components/MasterDataPage.vue";
import { UiBadge } from "../../ui";
import { activeFiscalYear, refreshFiscalYears } from "../../store/fiscalYear";

/** ปีงบที่ครอบคลุมเดือนปัจจุบัน — เทียบเป็นข้อความ "YYYY-MM" ได้ตรงๆ เพราะเก็บเป็น ค.ศ. */
function isCurrent(row) {
  const now = currentMonth();
  return Boolean(row.start_month && row.end_month && row.start_month <= now && now <= row.end_month);
}

/**
 * ปีงบเป็นรหัสอ้างอิง ไม่ใช่ปริมาณที่เอามาเทียบกัน จึงชิดซ้ายเหมือนเลขที่สัญญา
 * (GOV.UK ให้ชิดขวาเฉพาะคอลัมน์ตัวเลขที่ต้องเทียบค่ากัน) และช่วงเดือนรวมเป็นคอลัมน์
 * เดียว เพราะ "เริ่ม" กับ "สิ้นสุด" ไม่เคยถูกอ่านแยกกัน
 */
/** ป้ายสถานะของปีงบหนึ่งแถว — เขียนครั้งเดียว ใช้ทั้งค่าที่ค้นหา/ส่งออกได้ และป้ายบนจอ */
function statusLabels(row) {
  return [
    isCurrent(row) ? t("ปีงบปัจจุบัน") : null,
    activeFiscalYear.value?.id === row.id ? t("กำลังดูอยู่") : null,
  ].filter(Boolean);
}

const columns = [
  { key: "year", label: t("ปีงบประมาณ"), width: "10rem" },
  {
    key: "start_month",
    label: t("ช่วงเดือน"),
    value: (row) => (row.start_month && row.end_month ? `${formatMonth(row.start_month)} – ${formatMonth(row.end_month)}` : "—"),
  },
  {
    key: "status",
    label: t("สถานะ"),
    sortable: false,
    value: (row) => statusLabels(row).join(" · "),
  },
  { key: "id", label: t("รหัส"), align: "right", width: "6rem", hidden: true },
];

const fields = [
  {
    key: "year",
    label: t("ปีงบประมาณ"),
    type: "text",
    required: true,
    unique: true,
    maxlength: 4,
    placeholder: t("เช่น 2568"),
    hint: t("กรอกเป็น พ.ศ. ระบบจะคำนวณช่วง ต.ค. ปีก่อนหน้า ถึง ก.ย. ของปีนั้นให้เอง"),
  },
];
</script>

<template>
  <MasterDataPage
    :title="t(&quot;ปีงบประมาณ&quot;)"
    :description="t(&quot;ปีงบที่เลือกได้จากแถบด้านบน และเป็นตัวกำหนดช่วงเดือนของทุกรายงาน&quot;)"
    endpoint="/fiscal-years"
    :item-noun="t(&quot;ปีงบประมาณ&quot;)"
    export-filename="fiscal-years"
    :empty-hint="t(&quot;ต้องมีปีงบอย่างน้อยหนึ่งปี ระบบถึงจะแสดงยอดและค่าใช้จ่ายได้&quot;)"
    :columns="columns"
    :fields="fields"
    :on-changed="refreshFiscalYears"
    :default-sort="{ key: 'year', dir: 'desc' }"
  >
    <template #cell-status="{ row }">
      <span class="inline-flex flex-wrap gap-1.5">
        <UiBadge v-for="label in statusLabels(row)" :key="label" :tone="label === t('ปีงบปัจจุบัน') ? 'ok' : 'brand'" :dot="label === t('ปีงบปัจจุบัน')">
          {{ label }}
        </UiBadge>
      </span>
    </template>
  </MasterDataPage>
</template>
