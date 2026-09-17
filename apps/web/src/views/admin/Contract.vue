<script setup>
import { t } from "../../lib/locale";

/**
 * Contract — สัญญาเช่าเครื่องพิมพ์และราคาต่อหน้า
 *
 * ราคาต่อหน้าในสัญญาคือตัวคูณของค่าใช้จ่ายทั้งระบบ กรอกผิดหนึ่งหลักแล้วยอดทั้ง
 * ปีงบผิดตาม จึงกำหนด step ละเอียดถึงทศนิยมสี่ตำแหน่งและเขียนกำกับหน่วยไว้ชัด
 */
import MasterDataPage from "../../components/MasterDataPage.vue";
import { formatUnitPrice } from "../../lib/format";

const columns = [
  { key: "contract_no", label: t("เลขที่สัญญา") },
  { key: "fiscal_year_id", label: t("ปีงบประมาณ"), optionKey: "fiscal_year_id" },
  {
    key: "price_per_page",
    label: t("ราคา/หน้า (บาท)"),
    align: "right",
    value: (row) => formatUnitPrice(row.price_per_page),
    csv: (row) => Number(row.price_per_page ?? 0),
  },
  { key: "id", label: t("รหัส"), align: "right", width: "6rem", hidden: true },
];

const fields = [
  {
    key: "contract_no",
    label: t("เลขที่สัญญา"),
    type: "text",
    required: true,
    unique: true,
    maxlength: 100,
    placeholder: t("เช่น สัญญาเช่า 001/2568"),
  },
  {
    key: "fiscal_year_id",
    label: t("ปีงบประมาณ"),
    type: "select",
    required: true,
    optionsFrom: "/fiscal-years",
    optionLabel: "year",
  },
  {
    key: "price_per_page",
    label: t("ราคาต่อหน้า"),
    type: "number",
    required: true,
    step: "0.0001",
    min: "0",
    placeholder: "0.4200",
    hint: t("หน่วยเป็นบาทต่อหน้า ใส่ทศนิยมได้ถึงสี่ตำแหน่งตามที่ระบุในสัญญา"),
  },
];
</script>

<template>
  <MasterDataPage
    :title="t(&quot;สัญญาเช่า&quot;)"
    :description="t(&quot;สัญญาและราคาต่อหน้าที่ระบบใช้คำนวณค่าใช้จ่ายของทุกเครื่อง&quot;)"
    endpoint="/contracts"
    :item-noun="t(&quot;สัญญา&quot;)"
    export-filename="contracts"
    :empty-hint="t(&quot;ต้องมีสัญญาก่อน ระบบถึงจะคิดค่าใช้จ่ายจากยอดพิมพ์ได้&quot;)"
    :columns="columns"
    :fields="fields"
  />
</template>
