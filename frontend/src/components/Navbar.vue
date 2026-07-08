<template>
  <header class="bg-white shadow px-6 py-4 flex justify-between items-center">
    <h2 class="text-xl font-semibold">
      ระบบจัดการทรัพย์สิน IT โรงพยาบาล
    </h2>

    <div class="flex items-center gap-4">
      <span class="text-gray-700">
        👤 <strong>{{ user?.username }}</strong>
        <span class="text-sm text-gray-500">
          ({{ user?.role }})
        </span>
      </span>

      <button
        @click="logout"
        class="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
      >
        Logout
      </button>
    </div>
  </header>
</template>

<script setup>
import { useRouter } from "vue-router";

const router = useRouter();

const user = JSON.parse(localStorage.getItem("user"));

const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  router.push("/login");
};
</script>