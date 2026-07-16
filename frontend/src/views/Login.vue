<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <div class="bg-white p-8 rounded-lg shadow-md w-96">
      <h2 class="text-2xl font-bold text-center mb-2">
        ระบบจัดการทรัพย์สิน IT โรงพยาบาล
      </h2>
      <p class="text-center text-gray-500 mb-6">เข้าสู่ระบบ</p>

      <input
        v-model="username"
        type="text"
        placeholder="Username"
        class="w-full border rounded p-2 mb-4"
        @keyup.enter="login"
      />

      <input
        v-model="password"
        type="password"
        placeholder="Password"
        class="w-full border rounded p-2 mb-4"
        @keyup.enter="login"
      />

      <button
        @click="login"
        :disabled="loading"
        class="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {{ loading ? "กำลังเข้าสู่ระบบ..." : "Login" }}
      </button>

      <p v-if="error" class="text-red-500 mt-4 text-center">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import api from "../services/api";
import { useRouter } from "vue-router";

const router = useRouter();

const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

const login = async () => {
  if (loading.value) return;

  error.value = "";
  loading.value = true;

  try {
    const res = await api.post("/auth/login", {
      username: username.value,
      password: password.value,
    });

    localStorage.setItem("token", res.data.token);
    localStorage.setItem("user", JSON.stringify(res.data.user));

    router.push("/");
  } catch (err) {
    // backend ส่ง error มาใน field "message"
    error.value =
      err.response?.data?.message ||
      err.response?.data?.error ||
      "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่";
  } finally {
    loading.value = false;
  }
};
</script>
