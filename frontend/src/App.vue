<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import MainLayout from "./layouts/MainLayout.vue";
import AuthLayout from "./layouts/AuthLayout.vue";

const route = useRoute();

// เลือก layout ตาม route.meta.layout — หน้า login ไม่มี sidebar/navbar ของระบบหลัก
const layout = computed(() =>
  route.meta.layout === "auth" ? AuthLayout : MainLayout
);
</script>

<template>
  <component :is="layout" />
</template>