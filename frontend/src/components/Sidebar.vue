<template>
  <aside class="w-64 bg-blue-700 text-white min-h-screen p-5">
    <h1 class="text-2xl font-bold mb-8">
      IT Asset
    </h1>

    <nav class="space-y-3">
      <RouterLink to="/" class="block hover:bg-blue-600 p-2 rounded">
        Dashboard
      </RouterLink>

      <RouterLink to="/assets" class="block hover:bg-blue-600 p-2 rounded">
        ทรัพย์สิน
      </RouterLink>

      <RouterLink to="/add-asset" class="block hover:bg-blue-600 p-2 rounded">
        เพิ่มทรัพย์สิน
      </RouterLink>

      <RouterLink to="/expense" class="block hover:bg-blue-600 p-2 rounded">
        ค่าใช้จ่าย
      </RouterLink>

      <RouterLink to="/report" class="block hover:bg-blue-600 p-2 rounded">
        รายงาน
      </RouterLink>
    </nav>
  </aside>
</template>