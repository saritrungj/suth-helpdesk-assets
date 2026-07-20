<template>
  <header class="bg-white shadow px-6 py-4 flex justify-between items-center">
    <h2 class="text-xl font-semibold">
      ระบบจัดการทรัพย์สิน IT โรงพยาบาล
    </h2>

    <div class="flex items-center gap-4">
      <span class="text-gray-700">
        👤 <strong>{{ authState.user?.username }}</strong>
        <span class="text-sm text-gray-500">
          ({{ authState.user?.role }})
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
import { authState, clearAuth } from "../store/auth";

const router = useRouter();

const logout = () => {
  clearAuth();
  router.push("/login");
};
</script>