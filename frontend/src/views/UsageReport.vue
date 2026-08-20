<script setup>
/**
 * UsageReport.vue — รวมหน้า "ค่าใช้จ่ายแยกตามสัญญา" (Expense.vue) กับ
 * "ยอดพิมพ์แยกตามฝ่าย/แผนก" (ByDepartment.vue) เข้าเป็นหน้าเดียว
 * เพราะทั้งสองหน้าแสดงข้อมูลชุดเดียวกัน (ยอดพิมพ์ + ค่าใช้จ่ายของแต่ละเครื่อง)
 * ต่างกันแค่มุมมอง — เดิมแยกเป็น 2 หน้า/2 route ตอนนี้รวมเป็นหน้าเดียว
 * แล้วมีแท็บให้กดสลับดูทีหลังแทน
 *
 * ตัวหน้าลูกทั้งสอง (Expense.vue / ByDepartment.vue) ไม่ได้แก้ logic ข้างในเลย
 * แค่ห่อด้วยแท็บตรงนี้ — ใช้ <keep-alive> กันไม่ให้ filter/scroll ของแต่ละแท็บ
 * รีเซ็ตทุกครั้งที่สลับไปมา
 *
 * แท็บที่เลือกอยู่ sync กับ query ?tab=expense|department เพื่อให้แชร์ลิงก์/รีเฟรช/
 * กดจากเมนูฝั่ง Sidebar (ที่ลิงก์ตรงไปแท็บใดแท็บหนึ่ง) แล้วเปิดแท็บถูกได้เลย
 */
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import Expense from "./Expense.vue";
import ByDepartment from "./ByDepartment.vue";

const route = useRoute();
const router = useRouter();

const tabs = [
  { key: "expense", label: "ค่าใช้จ่ายแยกตามสัญญา", component: Expense },
  { key: "department", label: "ค่าใช้จ่ายและยอดพิมพ์แยกตามฝ่าย/แผนก", component: ByDepartment },
];

const activeTab = computed(() => {
  const t = route.query.tab;
  return tabs.some((tab) => tab.key === t) ? t : "expense";
});

const activeComponent = computed(
  () => tabs.find((tab) => tab.key === activeTab.value)?.component
);

function selectTab(key) {
  if (key === activeTab.value) return;
  router.replace({ query: { ...route.query, tab: key } });
}
</script>

<template>
  <div>
    <div class="flex gap-1 mb-6 border-b border-gray-200">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        @click="selectTab(tab.key)"
        class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
        :class="
          activeTab === tab.key
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'
        "
      >
        {{ tab.label }}
      </button>
    </div>

    <keep-alive>
      <component :is="activeComponent" />
    </keep-alive>
  </div>
</template>