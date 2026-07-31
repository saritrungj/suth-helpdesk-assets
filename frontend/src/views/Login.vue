<template>
  <div class="min-h-screen flex items-center justify-center px-4" style="background-color: var(--body-bg);">
    <div class="bg-gray-50 p-8 rounded-2xl shadow-xl shadow-black/5 border border-gray-200 w-full max-w-sm">
      <div class="flex flex-col items-center text-center mb-6">
        <span class="w-12 h-12 rounded-2xl bg-blue-700 text-white flex items-center justify-center font-bold mb-3">
          IT
        </span>
        <h2 class="text-lg font-semibold text-gray-800">ระบบจัดการทรัพย์สิน IT</h2>
        <p class="text-sm text-gray-400 mt-0.5">เข้าสู่ระบบเพื่อดำเนินการต่อ</p>
      </div>

      <label class="block text-sm text-gray-500 mb-1">Username</label>
      <input
        v-model="username"
        type="text"
        placeholder="Username"
        :disabled="loading"
        class="w-full border border-gray-200 rounded-lg p-2.5 mb-4 bg-gray-50 focus:border-blue-400 transition-colors disabled:opacity-60"
        @keyup.enter="login"
      />

      <label class="block text-sm text-gray-500 mb-1">Password</label>
      <input
        v-model="password"
        type="password"
        placeholder="Password"
        :disabled="loading"
        class="w-full border border-gray-200 rounded-lg p-2.5 mb-5 bg-gray-50 focus:border-blue-400 transition-colors disabled:opacity-60"
        @keyup.enter="login"
      />

      <button
        @click="login"
        :disabled="loading"
        class="w-full bg-blue-700 text-white p-2.5 rounded-lg font-medium hover:bg-blue-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <svg
          v-if="loading"
          class="animate-spin w-4 h-4"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        {{ loading ? "กำลังเข้าสู่ระบบ..." : "Login" }}
      </button>

      <p v-if="error" class="text-red-600 bg-red-50 border border-red-100 rounded-lg text-sm px-3 py-2 mt-4">
        {{ error }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import api from "../services/api";
import { useRouter, useRoute } from "vue-router";
import { setAuth } from "../store/auth";

const router = useRouter();
const route = useRoute();

const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

const login = async () => {
  if (loading.value) return; // กันกดซ้ำ/กด Enter รัวๆ ระหว่างรอ response

  error.value = "";
  loading.value = true;

  try {
    const res = await api.post(
      "/auth/login",
      {
        username: username.value,
        password: password.value,
      }
    );

    setAuth(res.data.user, res.data.token);

    // ถ้ามาจากหน้าที่ session หมดอายุ (มี redirect query จาก api.js) ให้กลับไปหน้าเดิม
    router.push(route.query.redirect || "/");
  } catch (err) {
    // backend บางเส้นตอบ key "error" บางเส้นตอบ "message" (เช่น /auth/login) — เช็คทั้งคู่กันข้อความหาย
    error.value =
      err.response?.data?.error ||
      err.response?.data?.message ||
      "Login failed";
  } finally {
    loading.value = false;
  }
};
</script>