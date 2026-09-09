<script setup>
import { t } from "../../lib/locale";

/**
 * Floor — ชั้นภายในอาคาร
 *
 * ชั้นต้องผูกกับอาคารเสมอ เพราะ "ชั้น 3" ของคนละอาคารคนละที่กัน
 */
import MasterDataPage from "../../components/MasterDataPage.vue";

const columns = [
  { key: "name", label: t("ชื่อชั้น") },
  { key: "building_id", label: t("อาคาร"), optionKey: "building_id" },
  { key: "id", label: t("รหัส"), align: "right", width: "6rem" },
];

const fields = [
  {
    key: "building_id",
    label: t("อาคาร"),
    type: "select",
    required: true,
    optionsFrom: "/buildings",
    hint: t("ยังไม่มีอาคารที่ต้องการ ให้ไปเพิ่มที่หน้าอาคารก่อน"),
  },
  {
    key: "name",
    label: t("ชื่อชั้น"),
    type: "text",
    required: true,
    maxlength: 100,
    placeholder: t("เช่น ชั้น 3"),
  },
];
</script>

<template>
  <MasterDataPage
    :title="t(&quot;ชั้นในอาคาร&quot;)"
    :eyebrow="t(&quot;ข้อมูลอ้างอิง · สถานที่&quot;)"
    :description="t(&quot;ชั้นที่ใช้ระบุตำแหน่งของเครื่องพิมพ์แต่ละเครื่อง&quot;)"
    endpoint="/floors"
    :item-noun="t(&quot;ชั้น&quot;)"
    export-filename="floors"
    :empty-hint="t(&quot;เลือกอาคารแล้วเพิ่มชั้นทีละชั้นตามที่มีเครื่องตั้งอยู่จริง&quot;)"
    :columns="columns"
    :fields="fields"
  />
</template>
