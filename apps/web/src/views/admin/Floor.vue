<script setup>
/**
 * Floor — ชั้นภายในอาคาร
 *
 * ชั้นต้องผูกกับอาคารเสมอ เพราะ "ชั้น 3" ของคนละอาคารคนละที่กัน
 */
import MasterDataPage from "../../components/MasterDataPage.vue";

const columns = [
  { key: "name", label: "ชื่อชั้น" },
  { key: "building_id", label: "อาคาร", optionKey: "building_id" },
  { key: "id", label: "รหัส", align: "right", width: "6rem" },
];

const fields = [
  {
    key: "building_id",
    label: "อาคาร",
    type: "select",
    required: true,
    optionsFrom: "/buildings",
    hint: "ยังไม่มีอาคารที่ต้องการ ให้ไปเพิ่มที่หน้าอาคารก่อน",
  },
  {
    key: "name",
    label: "ชื่อชั้น",
    type: "text",
    required: true,
    maxlength: 100,
    placeholder: "เช่น ชั้น 3",
  },
];
</script>

<template>
  <MasterDataPage
    title="ชั้นในอาคาร"
    eyebrow="ข้อมูลอ้างอิง · สถานที่"
    description="ชั้นที่ใช้ระบุตำแหน่งของเครื่องพิมพ์แต่ละเครื่อง"
    endpoint="/floors"
    item-noun="ชั้น"
    export-filename="floors"
    empty-hint="เลือกอาคารแล้วเพิ่มชั้นทีละชั้นตามที่มีเครื่องตั้งอยู่จริง"
    :columns="columns"
    :fields="fields"
  />
</template>
