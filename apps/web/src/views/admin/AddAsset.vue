<script setup>
import { t } from "../../lib/locale";

/**
 * AddAsset — หน้าเพิ่มเครื่องเข้าทะเบียน (/admin/add-asset)
 *
 * เดิมหน้านี้ทำได้อย่างเดียวคือเปิดหน้าต่างซ้อนค้างไว้ตั้งแต่เข้าหน้า ซึ่งมีปัญหา
 * สองข้อ: ปุ่มย้อนกลับของเบราว์เซอร์ไม่ทำงานตามที่คาด (ปิดหน้าต่างแล้วเด้งไป
 * หน้าอื่น) และฟอร์มยาวๆ ถูกบีบอยู่ในกล่องที่ต้องเลื่อนในตัวเอง
 *
 * ตอนนี้เป็นหน้าจริงที่มีสองแท็บ ผูกกับ query string เพื่อให้บุ๊กมาร์กและลิงก์เก่า
 * /admin/import-devices ที่ redirect มาพร้อม ?tab=import เปิดมาถูกที่
 *
 *   เพิ่มทีละเครื่อง  — สำหรับเครื่องที่เพิ่งซื้อเข้ามาใหม่ทีละตัว
 *   นำเข้าจากไฟล์    — สำหรับตอนตั้งต้นระบบ หรือรับมอบเครื่องล็อตใหญ่
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, FileSpreadsheet, Plus } from "lucide-vue-next";
import DeviceFormFields from "../../components/DeviceFormFields.vue";
import DeviceImportPanel from "../../components/DeviceImportPanel.vue";
import { UiButton, UiCard, UiPageHeader, UiTabs } from "../../ui";

const router = useRouter();
const route = useRoute();

const TABS = [
  { value: "single", label: t("เพิ่มทีละเครื่อง"), icon: Plus },
  { value: "import", label: t("นำเข้าจากไฟล์"), icon: FileSpreadsheet },
];

const tab = computed({
  get: () => (route.query.tab === "import" ? "import" : "single"),
  // replace ไม่ push เพื่อไม่ให้การสลับแท็บไปกองอยู่ในประวัติของเบราว์เซอร์
  // จนกดย้อนกลับหลายครั้งกว่าจะออกจากหน้านี้ได้
  set: (value) => router.replace({ query: { ...route.query, tab: value } }),
});

const fields = useTemplateRef("fields");
const saving = ref(false);
const dirty = ref(false);

/*
 * งานที่กรอกค้างไม่หายเมื่อออกจากหน้า (#177)
 *
 * ค่าในฟอร์มถูกเก็บเป็นร่างใน sessionStorage ทุกครั้งที่เปลี่ยน (draft-key ด้านล่าง) กดเมนู ย้อนกลับ
 * หรือรีเฟรช แล้วกลับมาจึงได้ค่าเดิมพร้อมแถบบอกว่ากู้คืนมา — ไม่ต้องถามก่อนออกทุกครั้ง แท็บทั้งสอง
 * mount ค้างไว้ (keep-mounted) สลับไปหน้านำเข้าแล้วกลับมาก็ไม่เริ่มใหม่ การปิดแท็บทิ้งร่างไปด้วย
 * (sessionStorage) จึงยังเตือนก่อนปิดเหมือนแผงแก้ไขเครื่อง
 */
function beforeUnload(event) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));

async function save(goBack) {
  saving.value = true;
  const ok = await fields.value?.submit();
  saving.value = false;

  if (!ok) return;

  if (goBack) router.push("/assets");
  else fields.value?.reset(); // บันทึกแล้วอยู่ต่อ — ล้างฟอร์มให้กรอกเครื่องถัดไปได้เลย
}
</script>

<template>
  <div>
    <!-- ลิงก์กลับแบบเดียวกับหน้ารายละเอียดเครื่อง — หน้าลูกของทะเบียนทุกหน้าหน้าตาเดียวกัน -->
    <UiButton to="/assets" variant="ghost" size="sm" class="mb-3 -ml-2">
      <template #icon><ArrowLeft :size="15" /></template> {{ t("กลับไปทะเบียน") }} </UiButton>

    <UiPageHeader
      :title="t(&quot;เพิ่มเครื่องเข้าทะเบียน&quot;)"
      :description="t(&quot;กรอกทีละเครื่องสำหรับของที่เพิ่งรับเข้ามา หรือนำเข้าทั้งล็อตจากไฟล์ที่มีอยู่แล้ว&quot;)"
    />

    <UiTabs v-model="tab" :tabs="TABS" :label="t(&quot;วิธีเพิ่มเครื่อง&quot;)" keep-mounted>
      <template #single>
        <UiCard>
          <DeviceFormFields ref="fields" :asset-id="null" draft-key="add-asset" @dirty="dirty = $event" />

          <template #footer>
            <div class="flex flex-wrap justify-end gap-2">
              <!-- "บันทึกแล้วเพิ่มต่อ" มีไว้สำหรับตอนรับเครื่องเข้ามาหลายตัวพร้อมกัน
                   ไม่ต้องกลับไปกดปุ่มเพิ่มใหม่ทุกครั้ง -->
              <UiButton variant="secondary" :loading="saving" @click="save(false)"> {{ t("บันทึกแล้วเพิ่มเครื่องถัดไป") }} </UiButton>
              <UiButton variant="primary" :loading="saving" @click="save(true)"> {{ t("บันทึกและกลับไปหน้าทะเบียน") }} </UiButton>
            </div>
          </template>
        </UiCard>
      </template>

      <template #import>
        <UiCard>
          <DeviceImportPanel />
        </UiCard>
      </template>
    </UiTabs>
  </div>
</template>
