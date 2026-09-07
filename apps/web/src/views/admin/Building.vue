<script setup>
/**
 * Building — อาคารในโรงพยาบาล
 *
 * อาคารเป็นระดับบนสุดของที่ตั้ง (อาคาร -> ชั้น -> แผนก) และเป็นตัวกรองหลัก
 * ของทุกหน้ารายงาน จึงห้ามมีชื่อซ้ำเด็ดขาด ไม่งั้นยอดจะถูกแยกเป็นสองก้อน
 */
import MasterDataPage from "../../components/MasterDataPage.vue";

const columns = [
  { key: "name", label: "ชื่ออาคาร" },
  { key: "id", label: "รหัส", align: "right", width: "6rem" },
];

const fields = [
  {
    key: "name",
    label: "ชื่ออาคาร",
    type: "text",
    required: true,
    unique: true,
    maxlength: 100,
    placeholder: "เช่น อาคารรัตนเวชพัฒน์",
  },
];
</script>

<template>
  <MasterDataPage
    title="อาคาร"
    eyebrow="ข้อมูลอ้างอิง · สถานที่"
    description="อาคารที่ใช้จัดกลุ่มเครื่องพิมพ์และแยกยอดในรายงาน"
    endpoint="/buildings"
    item-noun="อาคาร"
    export-filename="buildings"
    empty-hint="เพิ่มอาคารก่อน แล้วจึงเพิ่มชั้นในอาคารนั้น"
    :columns="columns"
    :fields="fields"
  />
</template>
