<script setup>
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
import { formatMonthTH } from "@suth/domain";

const columns = [
  { key: "year", label: "ปีงบประมาณ (พ.ศ.)", align: "right", width: "12rem" },
  {
    key: "start_month",
    label: "เริ่ม",
    value: (row) => (row.start_month ? formatMonthTH(row.start_month) : "—"),
  },
  {
    key: "end_month",
    label: "สิ้นสุด",
    value: (row) => (row.end_month ? formatMonthTH(row.end_month) : "—"),
  },
  { key: "id", label: "รหัส", align: "right", width: "6rem" },
];

const fields = [
  {
    key: "year",
    label: "ปีงบประมาณ",
    type: "text",
    required: true,
    unique: true,
    maxlength: 4,
    placeholder: "เช่น 2568",
    hint: "กรอกเป็น พ.ศ. ระบบจะคำนวณช่วง ต.ค. ปีก่อนหน้า ถึง ก.ย. ของปีนั้นให้เอง",
  },
];
</script>

<template>
  <MasterDataPage
    title="ปีงบประมาณ"
    eyebrow="ข้อมูลอ้างอิง · สัญญาและงบประมาณ"
    description="ปีงบที่เลือกได้จากแถบด้านบน และเป็นตัวกำหนดช่วงเดือนของทุกรายงาน"
    endpoint="/fiscal-years"
    item-noun="ปีงบประมาณ"
    export-filename="fiscal-years"
    empty-hint="ต้องมีปีงบอย่างน้อยหนึ่งปี ระบบถึงจะแสดงยอดและค่าใช้จ่ายได้"
    :columns="columns"
    :fields="fields"
    :on-changed="refreshFiscalYears"
  />
</template>
