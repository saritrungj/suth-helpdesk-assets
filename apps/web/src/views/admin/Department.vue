<script setup>
import { t } from "../../lib/locale";

/**
 * Department — แผนก (หน่วยที่รับผิดชอบค่าใช้จ่ายจริง)
 *
 * เป็นหน่วยที่เล็กที่สุดที่รายงานค่าใช้จ่ายลงไปถึง ทุกเครื่องต้องสังกัดแผนก
 * ไม่งั้นยอดของเครื่องนั้นจะไปกองอยู่ใน "ไม่ระบุแผนก" ซึ่งไม่มีใครรับผิดชอบ
 */
import MasterDataPage from "../../components/MasterDataPage.vue";

const columns = [
  { key: "name", label: t("ชื่อแผนก") },
  { key: "division_id", label: t("ฝ่ายที่สังกัด"), optionKey: "division_id" },
  { key: "id", label: t("รหัส"), align: "right", width: "6rem" },
];

const fields = [
  {
    key: "division_id",
    label: t("ฝ่ายที่สังกัด"),
    type: "select",
    required: true,
    optionsFrom: "/divisions",
  },
  {
    key: "name",
    label: t("ชื่อแผนก"),
    type: "text",
    required: true,
    maxlength: 100,
    placeholder: t("เช่น งานผู้ป่วยนอก"),
  },
];
</script>

<template>
  <MasterDataPage
    :title="t(&quot;แผนก&quot;)"
    :eyebrow="t(&quot;ข้อมูลอ้างอิง · หน่วยงาน&quot;)"
    :description="t(&quot;แผนกที่เครื่องพิมพ์แต่ละเครื่องสังกัด และเป็นหน่วยที่รายงานค่าใช้จ่ายลงไปถึง&quot;)"
    endpoint="/departments"
    :item-noun="t(&quot;แผนก&quot;)"
    export-filename="departments"
    :empty-hint="t(&quot;เลือกฝ่ายแล้วเพิ่มแผนกที่อยู่ใต้ฝ่ายนั้น&quot;)"
    :columns="columns"
    :fields="fields"
  />
</template>
