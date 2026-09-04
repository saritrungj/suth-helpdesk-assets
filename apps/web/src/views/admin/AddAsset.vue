<script setup>
/**
 * AddAsset.vue — หน้า "เพิ่มทรัพย์สิน" ฝั่ง Admin (/admin/add-asset)
 * เปิด popup AssetForm.vue ค้างไว้ตลอดตั้งแต่เข้าหน้า (โหมดเพิ่มใหม่ assetId = null)
 * ซึ่งใน popup มีแท็บ "เพิ่มทีละรายการ" / "นำเข้าไฟล์ (CSV/Excel)" ให้เลือกในตัวอยู่แล้ว
 * แล้วพา user กลับไปหน้า "ทรัพย์สิน" (/assets) เมื่อบันทึกสำเร็จ หรือกดยกเลิก/ปิด popup
 *
 * รองรับ query ?tab=import เพื่อเปิด popup มาที่แท็บนำเข้าไฟล์ตรงๆ
 * (ไว้ให้ลิงก์เก่า /admin/import-devices ที่ redirect มาที่นี่ ยังพาผู้ใช้ไปถูกแท็บ)
 */
import { ref, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import AssetForm from "../AssetForm.vue";

const router = useRouter();
const route = useRoute();

const showFormModal = ref(true);
const initialTab = route.query.tab === "import" ? "import" : "single";

function onAssetSaved() {
  router.push("/assets");
}

// ปิด popup (กดยกเลิก / กดพื้นหลัง / กดปิดหลังนำเข้าไฟล์) → กลับไปหน้ารายการทรัพย์สิน
watch(showFormModal, (visible) => {
  if (!visible) router.push("/assets");
});
</script>

<template>
  <div>
    <h1 class="text-xl font-bold mb-4">เพิ่มทรัพย์สิน</h1>
    <p class="text-sm text-gray-500 mb-4">
      เพิ่มทรัพย์สินทีละรายการผ่านฟอร์ม หรือนำเข้าหลายรายการพร้อมกันจากไฟล์ CSV/Excel
    </p>

    <AssetForm
      v-model="showFormModal"
      :asset-id="null"
      :initial-tab="initialTab"
      @saved="onAssetSaved"
    />
  </div>
</template>
