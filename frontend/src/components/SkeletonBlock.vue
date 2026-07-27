<template>
  <!--
    SkeletonBlock — กล่องเทาเบลอกระพริบ (pulse) ใช้แทนเนื้อหาจริงตอนกำลังโหลด
    เพื่อไม่ให้ตัวเลข/ข้อความกระโดดจาก 0 -> ค่าจริงให้เห็นตอนโหลดเสร็จ
    ใช้แทนข้อความ "กำลังโหลด..." เดิม ซึ่งไม่บอกรูปร่างของเนื้อหาที่กำลังจะมา
  -->
  <div
    class="skeleton-block animate-pulse rounded-md"
    :style="{ width, height }"
    aria-hidden="true"
  ></div>
</template>

<script setup>
defineProps({
  width: { type: String, default: "100%" },
  height: { type: String, default: "1rem" },
});
</script>

<style scoped>
.skeleton-block {
  background-color: var(--neutral-200);
}
</style>
