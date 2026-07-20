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
      <p class="text-sm text-blue-200 mt-4 mb-2">
        บันทึกข้อมูล
      </p>

      <RouterLink 
        to="/print-transactions" 
        class="block hover:bg-blue-600 p-2 rounded"
      >
        บันทึกยอดพิมพ์
      </RouterLink>


      <!-- รายงาน -->
      <p class="text-sm text-blue-200 mt-4 mb-2">
        รายงาน
      </p>

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


      <!-- ทรัพย์สิน — หน้าดูรายการ เปิดให้ผู้ใช้ทุกคนเหมือนหน้ารายงานอื่นๆ
           (การเพิ่ม/แก้ไข/ลบ ต้องเป็น admin เท่านั้น จึงย้ายไปอยู่ในหมวด Admin ด้านล่าง) -->
      <p class="text-sm text-blue-200 mt-4 mb-2">
        ทรัพย์สิน
      </p>

      <RouterLink 
        to="/assets" 
        class="block hover:bg-blue-600 p-2 rounded"
      >
        ทรัพย์สิน
      </RouterLink>



      <!-- Admin -->
      <div 
        v-if="authState.user?.role === 'admin'"
        class="pt-4 border-t border-blue-500"
      >

        <p class="text-sm text-blue-200 mb-2">
          Admin
        </p>


        <!-- อุปกรณ์ -->
        <p class="text-sm text-blue-200 mt-4 mb-2">
          อุปกรณ์
        </p>

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


        <!-- สถานที่ -->
        <p class="text-sm text-blue-200 mt-4 mb-2">
          สถานที่
        </p>

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


        <!-- องค์กร -->
        <p class="text-sm text-blue-200 mt-4 mb-2">
          องค์กร
        </p>

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


        <!-- สัญญา/งบประมาณ -->
        <p class="text-sm text-blue-200 mt-4 mb-2">
          สัญญา/งบประมาณ
        </p>

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


        <!-- Tools -->
        <p class="text-sm text-blue-200 mt-4 mb-2">
          Tools
        </p>

        <RouterLink
          to="/admin/import-devices"
          class="block hover:bg-blue-600 p-2 rounded"
        >
          Import CSV
        </RouterLink>


      </div>


    </nav>


  </aside>
</template>


<script setup>
import { authState } from "../store/auth";
</script>