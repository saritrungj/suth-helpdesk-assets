<script setup>
import Sidebar from "../components/Sidebar.vue";
import Navbar from "../components/Navbar.vue";
</script>


<template>

<div class="flex min-h-screen">

  <Sidebar />

  <div class="flex-1 min-w-0">

    <Navbar />

    <main class="p-6 max-w-[1600px] mx-auto">

      <RouterView />

    </main>

  </div>

</div>

</template>