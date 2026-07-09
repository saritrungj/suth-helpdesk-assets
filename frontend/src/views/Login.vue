<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <div class="bg-white p-8 rounded-lg shadow-md w-96">
      <h2 class="text-2xl font-bold text-center mb-6">Login</h2>

      <input
        v-model="username"
        type="text"
        placeholder="Username"
        class="w-full border rounded p-2 mb-4"
      />

      <input
        v-model="password"
        type="password"
        placeholder="Password"
        class="w-full border rounded p-2 mb-4"
      />

      <button
        @click="login"
        class="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
      >
        Login
      </button>

      <p class="text-red-500 mt-4">{{ error }}</p>
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

const login = async () => {
  try {
    const res = await api.post(
       "/auth/login",
      {
        username: username.value,
        password: password.value,
      }
    );

    localStorage.setItem("token", res.data.token);
    localStorage.setItem("user", JSON.stringify(res.data.user));

    router.push("/");
  } catch (err) {
        console.log(err.response);
        console.log(err.response?.data);
        error.value = err.response?.data?.error || "Login failed";
}
};
</script>