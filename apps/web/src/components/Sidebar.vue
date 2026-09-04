<template>

  <!-- Backdrop — เฉพาะจอมือถือ/แท็บเล็ต (< md) ตอน sidebar เปิดอยู่ คลิกเพื่อปิด -->
  <Transition name="fade">
    <div
      v-if="uiState.mobileSidebarOpen"
      class="fixed inset-0 z-30 bg-black/40 md:hidden"
      @click="closeMobileSidebar"
    ></div>
  </Transition>

  <aside
    class="w-64 shrink-0 h-screen flex flex-col bg-gray-50 border-r border-gray-200 fixed md:sticky top-0 z-40 transition-transform duration-200 ease-out md:translate-x-0"
    :class="uiState.mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'"
  >

    <!-- โลโก้ / ชื่อระบบ — โลโก้เป็นภาพพื้นขาว จึงวางบนแผ่น bg-white เสมอ
         (bg-white ไม่ถูกพลิกสีตามโหมด เหมือน bg-gray-*) เพื่อให้ขอบภาพกลืนกับแผ่นรองทั้งสองโหมด -->
    <div class="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-gray-200">
      <div class="leading-tight min-w-0 flex-1">
        <img
          src="/logo-suth.png"
          width="480"
          height="198"
          alt="โรงพยาบาลมหาวิทยาลัยเทคโนโลยีสุรนารี"
          class="w-full max-w-[168px] h-auto rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5"
        />
        <p class="text-sm text-gray-400 truncate mt-2">ระบบทรัพย์สินโรงพยาบาล</p>
      </div>

      <!-- ปุ่มปิด — เฉพาะจอมือถือ/แท็บเล็ต -->
      <button
        type="button"
        class="md:hidden shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        @click="closeMobileSidebar"
        aria-label="ปิดเมนู"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>

    <!-- เมนู (เลื่อนแยกจากส่วนหัว/ท้าย) -->
    <nav class="sidebar-nav flex-1 overflow-y-auto px-3.5 py-4 space-y-1 text-base">

      <RouterLink
        to="/"
        class="flex items-center gap-2.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 px-2.5 py-2 rounded-lg transition-colors font-medium"
      >
        <IconSvg :d="ICONS.home" class="w-[18px] h-[18px] shrink-0" />
        <span class="truncate">Dashboard</span>
      </RouterLink>

      <div class="pt-2 space-y-0.5">
        <SidebarGroup
          v-for="g in groups"
          :key="g.key"
          :label="g.label"
          :icon="g.icon"
          :group-key="g.key"
          :active="isGroupActive(g)"
        >
          <SidebarLink
            v-for="item in g.items"
            :key="item.label"
            :to="item.to"
            :label="item.label"
            :icon="item.icon"
          />
        </SidebarGroup>
      </div>

      <!-- Admin -->
      <div v-if="authState.user?.role === 'admin'" class="pt-4 mt-4 border-t border-gray-200">
        <p class="flex items-center gap-1.5 text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1.5">
          <IconSvg :d="ICONS.shield" class="w-3.5 h-3.5" />
          Admin
        </p>

        <div class="space-y-0.5">
          <SidebarGroup
            v-for="g in adminGroups"
            :key="g.key"
            :label="g.label"
            :icon="g.icon"
            :group-key="g.key"
            :active="isGroupActive(g)"
          >
            <SidebarLink
              v-for="item in g.items"
              :key="item.label"
              :to="item.to"
              :label="item.label"
              :icon="item.icon"
            />
          </SidebarGroup>
        </div>
      </div>

    </nav>

    <!-- ท้าย sidebar -->
    <div class="px-5 py-3.5 border-t border-gray-200">
      <div class="flex items-center gap-2 text-sm text-gray-400">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
        <span class="truncate">เชื่อมต่อระบบแล้ว</span>
      </div>
    </div>

  </aside>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>


<script setup>
import { reactive, watch, h } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { authState } from "../store/auth";
import { uiState, closeMobileSidebar } from "../store/ui";

// ปิด sidebar มือถืออัตโนมัติทุกครั้งที่เปลี่ยนหน้า (กด link แล้วเมนูควรหุบเอง)
const routeForClose = useRoute();
watch(
  () => routeForClose.fullPath,
  () => closeMobileSidebar()
);

/* -----------------------------------------------------------
   ไอคอน — เก็บเป็น path data (Heroicons outline, 24x24) แล้วสร้าง
   <svg> ผ่าน render function เดียว (IconSvg) เพื่อไม่ต้องเพิ่ม
   dependency ไอคอนภายนอก และคุมสไตล์ (สี/ขนาด) ให้เหมือนกันทุกจุด
----------------------------------------------------------- */
const ICONS = {
  home: "m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  pencil: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10",
  printer: "M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.32 0h1.125c.618 0 1.12-.502 1.12-1.12v-2.223a3.375 3.375 0 0 0-.988-2.39l-1.318-1.318a4.875 4.875 0 0 0-3.448-1.429H9.129c-1.294 0-2.531.514-3.447 1.429l-1.318 1.318A3.375 3.375 0 0 0 3.375 14.65v2.223c0 .618.503 1.12 1.12 1.12H5.62M6.75 8.25V4.875c0-.621.504-1.125 1.125-1.125h8.25c.621 0 1.125.504 1.125 1.125V8.25",
  chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
  currency: "M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  swap: "M7.5 21 3 16.5m0 0L7.5 12M3 16.5h18M16.5 3 21 7.5m0 0L16.5 12M21 7.5H3",
  folder: "M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-19.5 0v6a2.25 2.25 0 0 0 2.25 2.25h15a2.25 2.25 0 0 0 2.25-2.25v-6m-19.5 0h19.5M4.5 9.75V6a2.25 2.25 0 0 1 2.25-2.25h6a2.25 2.25 0 0 1 1.591.659l1.409 1.409A2.25 2.25 0 0 0 17.25 6.75h1.5A2.25 2.25 0 0 1 21 9v.75",
  document: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  cube: "m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
  shield: "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
  chip: "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z",
  plus: "M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  tag: ["M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.169.659 1.591l9.581 9.581c.699.699 1.83.699 2.528 0l7.302-7.302a1.79 1.79 0 0 0 0-2.528L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z", "M6 6h.008v.008H6V6Z"],
  building: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  layers: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  users: "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
  briefcase: "M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
  wrench: "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437 5.877 5.877",
  upload: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3",
  userCog: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
};

const IconSvg = (props) =>
  h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.5,
      class: props.class || "w-4 h-4",
    },
    (Array.isArray(props.d) ? props.d : [props.d]).map((d) =>
      h("path", { d, "stroke-linecap": "round", "stroke-linejoin": "round" })
    )
  );
IconSvg.props = ["d", "class"];

/* -----------------------------------------------------------
   โครงสร้างเมนู — แยกเป็น config ให้สร้าง SidebarGroup/SidebarLink
   ซ้ำๆ ด้วย v-for แทนการเขียน RouterLink ทีละบรรทัดเหมือนเดิม
   ทำให้เพิ่ม/แก้เมนูในอนาคตทำได้ที่จุดเดียว
----------------------------------------------------------- */
const groups = [
  {
    key: "record",
    label: "บันทึกข้อมูล",
    icon: ICONS.pencil,
    // แยกกลับมาเป็น route เดี่ยวของตัวเอง (ไม่ได้รวมกับหน้า "ค่าใช้จ่าย" แล้ว)
    items: [{ to: "/print-transactions", label: "บันทึกยอดพิมพ์", icon: ICONS.printer }],
  },
  {
    key: "reports",
    label: "รายงาน",
    icon: ICONS.chart,
    items: [
      // "ค่าใช้จ่าย" กับ "ยอดพิมพ์แยกตามฝ่าย/แผนก" รวมเป็นหน้าเดียวกันแล้ว (ดู views/UsageReport.vue)
      // เหลือลิงก์เดียวในเมนู พอเข้าไปแล้วมีแท็บให้เลือกดูอีกทีในหน้า
      { to: "/expense", label: "ค่าใช้จ่าย", icon: ICONS.currency },
      { to: "/compare", label: "เปรียบเทียบข้อมูลรายเดือน", icon: ICONS.swap },
      { to: "/report", label: "รายงาน", icon: ICONS.document },
    ],
  },
  {
    key: "assets",
    label: "ทรัพย์สิน",
    icon: ICONS.cube,
    // หน้าดูรายการ เปิดให้ผู้ใช้ทุกคนเหมือนหน้ารายงานอื่นๆ
    // (การเพิ่ม/แก้ไข/ลบ ต้องเป็น admin เท่านั้น จึงอยู่ในหมวด Admin ด้านล่าง)
    items: [{ to: "/assets", label: "ทรัพย์สิน", icon: ICONS.cube }],
  },
];

const adminGroups = [
  {
    key: "admin-devices",
    label: "อุปกรณ์",
    icon: ICONS.chip,
    items: [
      { to: "/admin/add-asset", label: "เพิ่มทรัพย์สิน", icon: ICONS.plus },
      { to: "/admin/brands", label: "จัดการยี่ห้อ", icon: ICONS.tag },
    ],
  },
  {
    key: "admin-places",
    label: "สถานที่",
    icon: ICONS.building,
    items: [
      { to: "/admin/buildings", label: "จัดการอาคาร", icon: ICONS.building },
      { to: "/admin/floors", label: "จัดการชั้น", icon: ICONS.layers },
    ],
  },
  {
    key: "admin-org",
    label: "องค์กร",
    icon: ICONS.users,
    items: [
      { to: "/admin/divisions", label: "จัดการฝ่าย", icon: ICONS.users },
      { to: "/admin/departments", label: "จัดการแผนก", icon: ICONS.folder },
    ],
  },
  {
    key: "admin-contracts",
    label: "สัญญา/งบประมาณ",
    icon: ICONS.briefcase,
    items: [
      { to: "/admin/fiscal-years", label: "ปีงบประมาณ", icon: ICONS.calendar },
      { to: "/admin/contracts", label: "จัดการสัญญา", icon: ICONS.briefcase },
    ],
  },
  // "Import CSV" ย้ายไปรวมเป็นแท็บในหน้า "เพิ่มทรัพย์สิน" แล้ว (ดู admin-devices ด้านบน)
  // จึงตัดกลุ่ม admin-tools ที่มีแค่รายการเดียวนี้ทิ้ง ไม่ต้องมีเมนูซ้ำซ้อน
  {
    key: "admin-users",
    label: "ผู้ใช้งานระบบ",
    icon: ICONS.userCog,
    items: [
      { to: "/admin/users", label: "จัดการผู้ใช้งาน", icon: ICONS.userCog },
    ],
  },
];

/* -----------------------------------------------------------
   สถานะเปิด/พับของแต่ละกลุ่ม — จำไว้ที่ openGroups (key ตาม group-key)
   และเปิดกลุ่มที่มีหน้าปัจจุบันอยู่ให้อัตโนมัติ เพื่อไม่ให้ผู้ใช้หลงทาง
   ตอนกดเข้าเมนูย่อยแล้วกลุ่มยังพับอยู่
----------------------------------------------------------- */
const route = useRoute();
const openGroups = reactive({});

// item.to อาจเป็น string ("/expense") หรือ object ({ path, query }) แบบที่ใช้กับลิงก์ที่ต้องระบุ query ด้วย
// เทียบ path เสมอ + เทียบ query เฉพาะ key ที่ item ระบุไว้ (ไม่สนใจ query อื่นที่ route มีเพิ่ม)
function itemMatchesRoute(item, currentRoute) {
  const path = typeof item.to === "string" ? item.to : item.to.path;
  const query = typeof item.to === "string" ? {} : item.to.query || {};

  if (path !== currentRoute.path) return false;
  return Object.entries(query).every(([key, value]) => currentRoute.query[key] === value);
}

function isGroupActive(group) {
  return group.items.some((item) => itemMatchesRoute(item, route));
}

watch(
  () => [route.path, route.query.tab],
  () => {
    for (const g of [...groups, ...adminGroups]) {
      if (g.items.some((item) => itemMatchesRoute(item, route))) openGroups[g.key] = true;
    }
  },
  { immediate: true }
);

function isOpen(key) {
  if (!(key in openGroups)) openGroups[key] = false;
  return openGroups[key];
}

function toggleGroup(key) {
  openGroups[key] = !isOpen(key);
}

// ลิงก์เมนูย่อย — ไอคอน + ข้อความ, ใช้ซ้ำทั้งในเมนูปกติและเมนู Admin
const SidebarLink = (props) =>
  h(
    RouterLink,
    {
      to: props.to,
      class:
        "flex items-center gap-2.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 px-2.5 py-1.5 rounded-lg transition-colors",
    },
    () => [
      h(IconSvg, { d: props.icon, class: "w-4 h-4 shrink-0 text-gray-400" }),
      h("span", { class: "truncate" }, props.label),
    ]
  );
SidebarLink.props = ["to", "label", "icon"];

// หัวข้อกลุ่มที่กดพับ/กางได้ (ไอคอน + ชื่อกลุ่ม + ลูกศร) พร้อมเน้นสีเมื่อมี
// เมนูย่อยข้างในกำลัง active อยู่ แม้ตัวกลุ่มจะถูกพับเก็บไว้ก็ตาม
const SidebarGroup = (props, { slots }) => {
  const open = isOpen(props.groupKey);
  const headerColor = props.active ? "text-[var(--brand-text)]" : "text-gray-500";

  return h("div", {}, [
    h(
      "button",
      {
        type: "button",
        onClick: () => toggleGroup(props.groupKey),
        class: [
          "w-full flex items-center gap-2.5 text-sm font-semibold uppercase tracking-wide px-2.5 py-2 rounded-lg hover:bg-gray-100 transition-colors",
          headerColor,
        ],
      },
      [
        h(IconSvg, { d: props.icon, class: "w-4 h-4 shrink-0" }),
        h("span", { class: "flex-1 text-left truncate" }, props.label),
        h(
          "svg",
          {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 20 20",
            fill: "currentColor",
            class: ["w-3.5 h-3.5 shrink-0 transition-transform", open ? "rotate-180" : ""],
          },
          [
            h("path", {
              "fill-rule": "evenodd",
              d: "M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z",
              "clip-rule": "evenodd",
            }),
          ]
        ),
      ]
    ),
    open
      ? h(
          "div",
          { class: "ml-[19px] pl-3 border-l border-gray-200 space-y-0.5 mt-0.5 mb-1.5" },
          slots.default ? slots.default() : []
        )
      : null,
  ]);
};
SidebarGroup.props = ["label", "groupKey", "icon", "active"];
</script>