<script setup>
/**
 * Department — แผนก (หน่วยที่รับผิดชอบค่าใช้จ่ายจริง)
 *
 * เป็นหน่วยที่เล็กที่สุดที่รายงานค่าใช้จ่ายลงไปถึง ทุกเครื่องต้องสังกัดแผนก
 * ไม่งั้นยอดของเครื่องนั้นจะไปกองอยู่ใน "ไม่ระบุแผนก" ซึ่งไม่มีใครรับผิดชอบ
 */
import MasterDataPage from "../../components/MasterDataPage.vue";

const columns = [
  { key: "name", label: "ชื่อแผนก" },
  { key: "division_id", label: "ฝ่ายที่สังกัด", optionKey: "division_id" },
  { key: "id", label: "รหัส", align: "right", width: "6rem" },
];

const fields = [
  {
    key: "division_id",
    label: "ฝ่ายที่สังกัด",
    type: "select",
    required: true,
    optionsFrom: "/divisions",
  },
  {
    key: "name",
    label: "ชื่อแผนก",
    type: "text",
    required: true,
    maxlength: 100,
    placeholder: "เช่น งานผู้ป่วยนอก",
  },
];
</script>

<template>
  <MasterDataPage
    title="แผนก"
    eyebrow="ข้อมูลอ้างอิง · หน่วยงาน"
    description="แผนกที่เครื่องพิมพ์แต่ละเครื่องสังกัด และเป็นหน่วยที่รายงานค่าใช้จ่ายลงไปถึง"
    endpoint="/departments"
    item-noun="แผนก"
    export-filename="departments"
    empty-hint="เลือกฝ่ายแล้วเพิ่มแผนกที่อยู่ใต้ฝ่ายนั้น"
    :columns="columns"
    :fields="fields"
  />
</template>
