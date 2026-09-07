<script setup>
/**
 * App.vue — รากของแอป
 *
 * เลือก layout ตาม route.meta.layout (หน้า login ไม่มีเมนู) แล้ว mount กลไก
 * ที่ต้องมีตัวเดียวทั้งแอปไว้ที่นี่: กล่องแจ้งเตือนและหน้าต่างยืนยัน ทุกหน้า
 * จึงเรียก toastSuccess()/askConfirm() ได้โดยไม่ต้อง import component เอง
 */
import { computed, watchEffect } from "vue";
import { useRoute } from "vue-router";
import AuthLayout from "./layouts/AuthLayout.vue";
import { documentTitle } from "./app/brand";
import MainLayout from "./layouts/MainLayout.vue";
import { findActiveItem } from "./app/navigation";
import { UiConfirm, UiToaster } from "./ui";

const route = useRoute();

const layout = computed(() => (route.meta.layout === "auth" ? AuthLayout : MainLayout));

// ชื่อแท็บบอกว่ากำลังเปิดหน้าอะไร — คนที่เปิดหลายแท็บพร้อมกัน (เทียบข้อมูล
// สองปีงบ หรือดูรายงานคู่กับหน้าบันทึก) จะหาแท็บที่ต้องการเจอโดยไม่ต้องคลิกไล่
watchEffect(() => {
  const page = findActiveItem(route)?.label;
  document.title = documentTitle(page);
});
</script>

<template>
  <component :is="layout" />

  <UiToaster />
  <UiConfirm />
</template>
