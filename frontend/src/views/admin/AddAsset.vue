<script setup>
/**
 * AddAsset.vue — หน้า "เพิ่มทรัพย์สิน" ฝั่ง Admin (/admin/add-asset)
 * ใช้ AssetForm.vue (โหมด assetId = null คือเพิ่มใหม่) ตัวเดียวกับที่ AssetList.vue ใช้แก้ไข
 * เพียงแต่ที่นี่เปิด popup ค้างไว้ตลอดตั้งแต่เข้าหน้า แล้วพา user กลับไปหน้า "ทรัพย์สิน" (/assets)
 * เมื่อบันทึกสำเร็จ หรือกดยกเลิก/ปิด popup
 */
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import AssetForm from "../AssetForm.vue";

const router = useRouter();
const showFormModal = ref(true);

function onAssetSaved() {
  router.push("/assets");
}

// ปิด popup (กดยกเลิก / กดพื้นหลัง) → กลับไปหน้ารายการทรัพย์สิน
watch(showFormModal, (visible) => {
  if (!visible) router.push("/assets");
});
</script>

<template>
  <div>
    <h1 class="text-xl font-bold mb-4">เพิ่มทรัพย์สิน</h1>
    <p class="text-sm text-gray-500 mb-4">
      กรอกข้อมูลทรัพย์สินใหม่ในฟอร์มด้านล่าง บันทึกเสร็จแล้วจะพากลับไปหน้ารายการทรัพย์สิน
    </p>

    <AssetForm v-model="showFormModal" :asset-id="null" @saved="onAssetSaved" />
  </div>
</template>