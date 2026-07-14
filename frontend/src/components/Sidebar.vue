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


      <RouterLink 
        to="/assets" 
        class="block hover:bg-blue-600 p-2 rounded"
      >
        ทรัพย์สิน
      </RouterLink>


      <RouterLink 
        to="/add-asset" 
        class="block hover:bg-blue-600 p-2 rounded"
      >
        เพิ่มทรัพย์สิน
      </RouterLink>


      <RouterLink 
        to="/expense" 
        class="block hover:bg-blue-600 p-2 rounded"
      >
        ค่าใช้จ่าย
      </RouterLink>


      <RouterLink 
        to="/report" 
        class="block hover:bg-blue-600 p-2 rounded"
      >
        รายงาน
      </RouterLink>



      <!-- Admin -->
      <div 
        v-if="user?.role === 'admin'" 
        class="pt-4 border-t border-blue-500"
      >

        <p class="text-sm text-blue-200 mb-2">
          Admin
        </p>


        <RouterLink
          to="/admin/devices"
          class="block hover:bg-blue-600 p-2 rounded"
        >
          จัดการอุปกรณ์
        </RouterLink>


        <RouterLink
          to="/admin/brands"
          class="block hover:bg-blue-600 p-2 rounded"
        >
          จัดการยี่ห้อ
        </RouterLink>


        <!-- Master Data -->

        <p class="text-sm text-blue-200 mt-4 mb-2">
          Master Data
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



        <p class="text-sm text-blue-200 mt-4 mb-2">
          Tools
        </p>


        <RouterLink
          to="/import-devices"
          class="block hover:bg-blue-600 p-2 rounded"
        >
          Import CSV
        </RouterLink>


      </div>


    </nav>


  </aside>
</template>


<script setup>
const user = JSON.parse(
  localStorage.getItem("user") || "null"
)
</script>