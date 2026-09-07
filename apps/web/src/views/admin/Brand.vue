<script setup>
/**
 * Brand — ยี่ห้อของอุปกรณ์
 *
 * เป็นข้อมูลอ้างอิงล้วนๆ ทั้งหน้าจึงเป็นแค่การประกาศว่า "ชุดนี้มีช่องอะไรบ้าง"
 * แล้วให้ MasterDataPage จัดการพฤติกรรมทั้งหมด (ดูเหตุผลในไฟล์นั้น)
 */
import MasterDataPage from "../../components/MasterDataPage.vue";

const columns = [
  { key: "name", label: "ชื่อยี่ห้อ" },
  { key: "id", label: "รหัส", align: "right", width: "6rem" },
];

const fields = [
  {
    key: "name",
    label: "ชื่อยี่ห้อ",
    type: "text",
    required: true,
    unique: true,
    maxlength: 100,
    placeholder: "เช่น Canon, HP, Ricoh",
    hint: "ใช้ชื่อตามที่พิมพ์อยู่บนตัวเครื่อง เพื่อให้ค้นหาแล้วตรงกับของจริง",
  },
];
</script>

<template>
  <MasterDataPage
    title="ยี่ห้ออุปกรณ์"
    eyebrow="ข้อมูลอ้างอิง · อุปกรณ์"
    description="ยี่ห้อที่เลือกได้ตอนเพิ่มเครื่องเข้าทะเบียน"
    endpoint="/brands"
    item-noun="ยี่ห้อ"
    export-filename="brands"
    empty-hint="เพิ่มยี่ห้อก่อน แล้วจะเลือกได้ตอนบันทึกเครื่องใหม่"
    :columns="columns"
    :fields="fields"
  />
</template>
