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
import MasterDataPage from "../../components/MasterDataPage.vue";
import { refreshFiscalYears } from "../../store/fiscalYear";


const columns = [
  { key: "year", label: t("ปีงบประมาณ (พ.ศ.)"), align: "right", width: "12rem" },
  {
    key: "start_month",
    label: t("เริ่ม"),
    value: (row) => (row.start_month ? formatMonth(row.start_month) : "—"),
  },
  {
    key: "end_month",
    label: t("สิ้นสุด"),
    value: (row) => (row.end_month ? formatMonth(row.end_month) : "—"),
  },
  { key: "id", label: t("รหัส"), align: "right", width: "6rem" },
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
    :eyebrow="t(&quot;ข้อมูลอ้างอิง · สัญญาและงบประมาณ&quot;)"
    :description="t(&quot;ปีงบที่เลือกได้จากแถบด้านบน และเป็นตัวกำหนดช่วงเดือนของทุกรายงาน&quot;)"
    endpoint="/fiscal-years"
    :item-noun="t(&quot;ปีงบประมาณ&quot;)"
    export-filename="fiscal-years"
    :empty-hint="t(&quot;ต้องมีปีงบอย่างน้อยหนึ่งปี ระบบถึงจะแสดงยอดและค่าใช้จ่ายได้&quot;)"
    :columns="columns"
    :fields="fields"
    :on-changed="refreshFiscalYears"
  />
</template>
