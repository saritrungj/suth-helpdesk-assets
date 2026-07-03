<script setup>
import Sidebar from '../components/Sidebar.vue'
import Navbar from '../components/Navbar.vue'
</script>

<template>
  <div class="flex">
    <Sidebar />

    <div class="flex-1">
      <Navbar />

      <main class="p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>