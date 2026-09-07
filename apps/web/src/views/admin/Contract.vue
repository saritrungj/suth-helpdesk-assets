<script setup>
/**
 * Contract — สัญญาเช่าเครื่องพิมพ์และราคาต่อแผ่น
 *
 * ราคาต่อแผ่นในสัญญาคือตัวคูณของค่าใช้จ่ายทั้งระบบ กรอกผิดหนึ่งหลักแล้วยอดทั้ง
 * ปีงบผิดตาม จึงกำหนด step ละเอียดถึงทศนิยมสี่ตำแหน่งและเขียนกำกับหน่วยไว้ชัด
 */
import MasterDataPage from "../../components/MasterDataPage.vue";
import { formatBahtValue } from "../../lib/format";

const columns = [
  { key: "contract_no", label: "เลขที่สัญญา" },
  { key: "fiscal_year_id", label: "ปีงบประมาณ", optionKey: "fiscal_year_id" },
  {
    key: "price_per_page",
    label: "ราคา/แผ่น (บาท)",
    align: "right",
    value: (row) => formatBahtValue(row.price_per_page),
    csv: (row) => Number(row.price_per_page ?? 0),
  },
  { key: "id", label: "รหัส", align: "right", width: "6rem" },
];

const fields = [
  {
    key: "contract_no",
    label: "เลขที่สัญญา",
    type: "text",
    required: true,
    unique: true,
    maxlength: 100,
    placeholder: "เช่น สัญญาเช่า 001/2568",
  },
  {
    key: "fiscal_year_id",
    label: "ปีงบประมาณ",
    type: "select",
    required: true,
    optionsFrom: "/fiscal-years",
    optionLabel: "year",
  },
  {
    key: "price_per_page",
    label: "ราคาต่อแผ่น",
    type: "number",
    required: true,
    step: "0.0001",
    min: "0",
    placeholder: "0.4200",
    hint: "หน่วยเป็นบาทต่อแผ่น ใส่ทศนิยมได้ถึงสี่ตำแหน่งตามที่ระบุในสัญญา",
  },
];
</script>

<template>
  <MasterDataPage
    title="สัญญาเช่า"
    eyebrow="ข้อมูลอ้างอิง · สัญญาและงบประมาณ"
    description="สัญญาและราคาต่อแผ่นที่ระบบใช้คำนวณค่าใช้จ่ายของทุกเครื่อง"
    endpoint="/contracts"
    item-noun="สัญญา"
    export-filename="contracts"
    empty-hint="ต้องมีสัญญาก่อน ระบบถึงจะคิดค่าใช้จ่ายจากยอดพิมพ์ได้"
    :columns="columns"
    :fields="fields"
  />
</template>
