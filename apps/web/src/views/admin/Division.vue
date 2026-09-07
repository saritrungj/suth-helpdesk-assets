<script setup>
/**
 * Division — ฝ่าย (ระดับบนของแผนก)
 *
 * รายงานค่าใช้จ่ายสรุปเป็นรายฝ่ายก่อนแล้วค่อยกางเป็นรายแผนก ชื่อฝ่ายจึงต้อง
 * ตรงกับโครงสร้างองค์กรจริง ไม่ใช่ชื่อที่ใช้เรียกกันเองในทีม
 */
import MasterDataPage from "../../components/MasterDataPage.vue";

const columns = [
  { key: "name", label: "ชื่อฝ่าย" },
  { key: "id", label: "รหัส", align: "right", width: "6rem" },
];

const fields = [
  {
    key: "name",
    label: "ชื่อฝ่าย",
    type: "text",
    required: true,
    unique: true,
    maxlength: 100,
    placeholder: "เช่น ฝ่ายการพยาบาล",
  },
];
</script>

<template>
  <MasterDataPage
    title="ฝ่าย"
    eyebrow="ข้อมูลอ้างอิง · หน่วยงาน"
    description="ระดับบนสุดของหน่วยงาน ใช้จัดกลุ่มแผนกในรายงานค่าใช้จ่าย"
    endpoint="/divisions"
    item-noun="ฝ่าย"
    export-filename="divisions"
    empty-hint="เพิ่มฝ่ายก่อน แล้วจึงเพิ่มแผนกที่อยู่ใต้ฝ่ายนั้น"
    :columns="columns"
    :fields="fields"
  />
</template>
