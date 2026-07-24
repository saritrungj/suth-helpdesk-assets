<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-[#f8f6f2] px-4">
    <div class="bg-gray-50 p-8 rounded-2xl shadow-xl shadow-black/5 border border-gray-100 w-full max-w-sm">
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
        class="w-full border border-gray-200 rounded-lg p-2.5 mb-4 focus:border-blue-400 transition-colors"
        @keyup.enter="login"
      />

      <label class="block text-sm text-gray-500 mb-1">Password</label>
      <input
        v-model="password"
        type="password"
        placeholder="Password"
        class="w-full border border-gray-200 rounded-lg p-2.5 mb-5 focus:border-blue-400 transition-colors"
        @keyup.enter="login"
      />

      <button
        @click="login"
        class="w-full bg-blue-700 text-white p-2.5 rounded-lg font-medium hover:bg-blue-800 transition-colors"
      >
        Login
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
import { useRouter } from "vue-router";
import { setAuth } from "../store/auth";

const router = useRouter();

const username = ref("");
const password = ref("");
const error = ref("");

const login = async () => {
  try {
    const res = await api.post(
       "/auth/login",
      {
        username: username.value,
        password: password.value,
      }
    );

    setAuth(res.data.user, res.data.token);

    router.push("/");
  } catch (err) {
        console.log(err.response);
        console.log(err.response?.data);
        error.value = err.response?.data?.error || "Login failed";
}
};
</script>