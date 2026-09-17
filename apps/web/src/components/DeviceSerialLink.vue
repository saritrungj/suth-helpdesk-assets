<script setup>
/**
 * DeviceSerialLink — หมายเลข Serial ในตาราง ที่ลิงก์ไปหน้ารายละเอียดเครื่อง
 *
 * ทุกตารางที่มีคอลัมน์ Serial (ทะเบียน, บันทึกยอด, อันดับรายเครื่อง, ตรวจการติดตั้ง)
 * ใช้ตัวนี้ตัวเดียว เดิมแต่ละหน้าเขียน RouterLink พร้อมชุด class เดียวกันซ้ำสี่ที่
 * แก้ที่เดียวลืมอีกสามที่ได้ง่าย
 *
 * min-h-6 ไม่ใช่ของประดับ — ข้อ 2.5.8 บังคับพื้นที่กดอย่างน้อย 24x24 และลิงก์นี้
 * อยู่เดี่ยวๆ ในช่องตาราง จึงไม่เข้าข้อยกเว้น "อยู่ในประโยค"
 */
defineProps({
  deviceId: { type: [Number, String], required: true },
  serialNumber: { type: String, default: "" },
});
</script>

<template>
  <RouterLink
    :to="`/assets/${deviceId}`"
    class="inline-flex items-center min-h-6 font-mono text-sm text-ink hover:text-brand-ink hover:underline underline-offset-2 rounded-xs"
  >{{ serialNumber || "—" }}</RouterLink>
</template>
