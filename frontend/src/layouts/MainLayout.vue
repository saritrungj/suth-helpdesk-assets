<script setup>
import Sidebar from "../components/Sidebar.vue";
import Navbar from "../components/Navbar.vue";
</script>


<template>

<div class="flex min-h-screen">

  <Sidebar />

  <div class="flex-1">

    <Navbar />

    <main class="p-6">

      <RouterView />

    </main>

  </div>

</div>

</template>