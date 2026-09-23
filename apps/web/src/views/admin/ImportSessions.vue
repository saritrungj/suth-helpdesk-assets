<script setup>
/**
 * ImportSessions — หน้านำเข้าไฟล์จากผู้ให้เช่า (/admin/import) (#180)
 *
 * ทางเข้าเดียวของการนำเข้า: อัปโหลดไฟล์ หรือทำงานที่ค้างต่อ ไฟล์ของผู้ให้เช่าหนึ่งไฟล์ได้ทั้งเครื่องและยอด
 * (เดิมต้องอัปโหลดสองที่ — audit 2026-09-23 พบว่าผู้ใช้ลงทะเบียนเครื่อง 494 เครื่องแต่ยอดเป็นศูนย์)
 */
import { t } from "../../lib/locale";
import { UiCard, UiPageHeader } from "../../ui";
import ImportStart from "../../components/import/ImportStart.vue";
</script>

<template>
  <div>
    <UiPageHeader
      :title="t('นำเข้าไฟล์จากผู้ให้เช่า')"
      :description="t('รายงานมิเตอร์และรายงานสถานะเครื่องของผู้ให้เช่า — ระบบตรวจก่อน บอกสิ่งที่ต้องทำทีละข้อ แล้วค่อยบันทึกทั้งไฟล์พร้อมกัน')"
    />
    <UiCard><ImportStart /></UiCard>
  </div>
</template>
