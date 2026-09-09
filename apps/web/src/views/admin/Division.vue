<script setup>
import { t } from "../../lib/locale";

/**
 * Division — ฝ่าย (ระดับบนของแผนก)
 *
 * รายงานค่าใช้จ่ายสรุปเป็นรายฝ่ายก่อนแล้วค่อยกางเป็นรายแผนก ชื่อฝ่ายจึงต้อง
 * ตรงกับโครงสร้างองค์กรจริง ไม่ใช่ชื่อที่ใช้เรียกกันเองในทีม
 */
import MasterDataPage from "../../components/MasterDataPage.vue";

const columns = [
  { key: "name", label: t("ชื่อฝ่าย") },
  { key: "id", label: t("รหัส"), align: "right", width: "6rem" },
];

const fields = [
  {
    key: "name",
    label: t("ชื่อฝ่าย"),
    type: "text",
    required: true,
    unique: true,
    maxlength: 100,
    placeholder: t("เช่น ฝ่ายการพยาบาล"),
  },
];
</script>

<template>
  <MasterDataPage
    :title="t(&quot;ฝ่าย&quot;)"
    :eyebrow="t(&quot;ข้อมูลอ้างอิง · หน่วยงาน&quot;)"
    :description="t(&quot;ระดับบนสุดของหน่วยงาน ใช้จัดกลุ่มแผนกในรายงานค่าใช้จ่าย&quot;)"
    endpoint="/divisions"
    :item-noun="t(&quot;ฝ่าย&quot;)"
    export-filename="divisions"
    :empty-hint="t(&quot;เพิ่มฝ่ายก่อน แล้วจึงเพิ่มแผนกที่อยู่ใต้ฝ่ายนั้น&quot;)"
    :columns="columns"
    :fields="fields"
  />
</template>
