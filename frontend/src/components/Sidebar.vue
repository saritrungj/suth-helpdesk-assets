<template>
  <aside class="w-64 bg-blue-700 text-white min-h-screen p-5">

    <h1 class="text-2xl font-bold mb-8">
      IT Asset
    </h1>


    <nav class="space-y-3">

      <RouterLink
        to="/"
        class="block hover:bg-blue-600 p-2 rounded"
      >
        Dashboard
      </RouterLink>


      <!-- บันทึกข้อมูล -->
      <SidebarGroup label="บันทึกข้อมูล" group-key="record">
        <RouterLink
          to="/print-transactions"
          class="block hover:bg-blue-600 p-2 rounded"
        >
          บันทึกยอดพิมพ์
        </RouterLink>
      </SidebarGroup>


      <!-- รายงาน -->
      <SidebarGroup label="รายงาน" group-key="reports">
        <RouterLink
          to="/expense"
          class="block hover:bg-blue-600 p-2 rounded"
        >
          ค่าใช้จ่าย
        </RouterLink>

        <RouterLink
          to="/compare"
          class="block hover:bg-blue-600 p-2 rounded"
        >
          เปรียบเทียบข้อมูลรายเดือน
        </RouterLink>

        <RouterLink
          to="/by-department"
          class="block hover:bg-blue-600 p-2 rounded"
        >
          ยอดพิมพ์แยกตามฝ่าย/แผนก
        </RouterLink>

        <RouterLink
          to="/report"
          class="block hover:bg-blue-600 p-2 rounded"
        >
          รายงาน
        </RouterLink>
      </SidebarGroup>


      <!-- ทรัพย์สิน — หน้าดูรายการ เปิดให้ผู้ใช้ทุกคนเหมือนหน้ารายงานอื่นๆ
           (การเพิ่ม/แก้ไข/ลบ ต้องเป็น admin เท่านั้น จึงย้ายไปอยู่ในหมวด Admin ด้านล่าง) -->
      <SidebarGroup label="ทรัพย์สิน" group-key="assets">
        <RouterLink
          to="/assets"
          class="block hover:bg-blue-600 p-2 rounded"
        >
          ทรัพย์สิน
        </RouterLink>
      </SidebarGroup>



      <!-- Admin -->
      <div
        v-if="authState.user?.role === 'admin'"
        class="pt-4 border-t border-blue-500"
      >

        <p class="text-sm text-blue-200 mb-2">
          Admin
        </p>


        <!-- อุปกรณ์ -->
        <SidebarGroup label="อุปกรณ์" group-key="admin-devices">
          <RouterLink
            to="/admin/add-asset"
            class="block hover:bg-blue-600 p-2 rounded"
          >
            เพิ่มทรัพย์สิน
          </RouterLink>

          <RouterLink
            to="/admin/brands"
            class="block hover:bg-blue-600 p-2 rounded"
          >
            จัดการยี่ห้อ
          </RouterLink>
        </SidebarGroup>


        <!-- สถานที่ -->
        <SidebarGroup label="สถานที่" group-key="admin-places">
          <RouterLink
            to="/admin/buildings"
            class="block hover:bg-blue-600 p-2 rounded"
          >
            จัดการอาคาร
          </RouterLink>

          <RouterLink
            to="/admin/floors"
            class="block hover:bg-blue-600 p-2 rounded"
          >
            จัดการชั้น
          </RouterLink>
        </SidebarGroup>


        <!-- องค์กร -->
        <SidebarGroup label="องค์กร" group-key="admin-org">
          <RouterLink
            to="/admin/divisions"
            class="block hover:bg-blue-600 p-2 rounded"
          >
            จัดการฝ่าย
          </RouterLink>

          <RouterLink
            to="/admin/departments"
            class="block hover:bg-blue-600 p-2 rounded"
          >
            จัดการแผนก
          </RouterLink>
        </SidebarGroup>


        <!-- สัญญา/งบประมาณ -->
        <SidebarGroup label="สัญญา/งบประมาณ" group-key="admin-contracts">
          <RouterLink
            to="/admin/fiscal-years"
            class="block hover:bg-blue-600 p-2 rounded"
          >
            ปีงบประมาณ
          </RouterLink>

          <RouterLink
            to="/admin/contracts"
            class="block hover:bg-blue-600 p-2 rounded"
          >
            จัดการสัญญา
          </RouterLink>
        </SidebarGroup>


        <!-- Tools -->
        <SidebarGroup label="Tools" group-key="admin-tools">
          <RouterLink
            to="/admin/import-devices"
            class="block hover:bg-blue-600 p-2 rounded"
          >
            Import CSV
          </RouterLink>
        </SidebarGroup>


      </div>


    </nav>


  </aside>
</template>


<script setup>
import { reactive, h } from "vue";
import { authState } from "../store/auth";

// เก็บสถานะเปิด/พับของแต่ละกลุ่มไว้ที่นี่ (key ตาม group-key ที่ส่งเข้าไป)
// ค่าเริ่มต้น true = กางออกไว้ก่อน
const openGroups = reactive({});

function isOpen(key) {
  if (!(key in openGroups)) openGroups[key] = false;
  return openGroups[key];
}

function toggleGroup(key) {
  openGroups[key] = !isOpen(key);
}

// คอมโพเนนต์ย่อยแบบ inline: หัวข้อกลุ่มที่กดพับ/กางได้ + เนื้อหาข้างใน (slot)
const SidebarGroup = (props, { slots }) => {
  const open = isOpen(props.groupKey);

  return h("div", { class: "mt-4" }, [
    h(
      "button",
      {
        type: "button",
        onClick: () => toggleGroup(props.groupKey),
        class:
          "w-full flex items-center justify-between text-sm text-blue-200 mb-2 hover:text-white",
      },
      [
        h("span", props.label),
        h(
          "svg",
          {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 20 20",
            fill: "currentColor",
            class: [
              "w-4 h-4 transition-transform",
              open ? "rotate-180" : "",
            ],
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
    open ? h("div", { class: "space-y-1" }, slots.default ? slots.default() : []) : null,
  ]);
};

SidebarGroup.props = ["label", "groupKey"];
</script>