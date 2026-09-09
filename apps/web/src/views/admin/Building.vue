<script setup>
import { t } from "../../lib/locale";

/**
 * Building — อาคารในโรงพยาบาล
 *
 * อาคารเป็นระดับบนสุดของที่ตั้ง (อาคาร -> ชั้น -> แผนก) และเป็นตัวกรองหลัก
 * ของทุกหน้ารายงาน จึงห้ามมีชื่อซ้ำเด็ดขาด ไม่งั้นยอดจะถูกแยกเป็นสองก้อน
 */
import MasterDataPage from "../../components/MasterDataPage.vue";

const columns = [
  { key: "name", label: t("ชื่ออาคาร") },
  { key: "id", label: t("รหัส"), align: "right", width: "6rem" },
];

const fields = [
  {
    key: "name",
    label: t("ชื่ออาคาร"),
    type: "text",
    required: true,
    unique: true,
    maxlength: 100,
    placeholder: t("เช่น อาคารรัตนเวชพัฒน์"),
  },
];
</script>

<template>
  <MasterDataPage
    :title="t(&quot;อาคาร&quot;)"
    :eyebrow="t(&quot;ข้อมูลอ้างอิง · สถานที่&quot;)"
    :description="t(&quot;อาคารที่ใช้จัดกลุ่มเครื่องพิมพ์และแยกยอดในรายงาน&quot;)"
    endpoint="/buildings"
    :item-noun="t(&quot;อาคาร&quot;)"
    export-filename="buildings"
    :empty-hint="t(&quot;เพิ่มอาคารก่อน แล้วจึงเพิ่มชั้นในอาคารนั้น&quot;)"
    :columns="columns"
    :fields="fields"
  />
</template>
