<template>
  <header class="bg-white shadow px-6 py-4 flex justify-between items-center">
    <h2 class="text-xl font-semibold">
      ระบบจัดการทรัพย์สิน IT โรงพยาบาล
    </h2>

    <div class="flex items-center gap-4">

      <!-- ปีงบ (Global) — ทุกหน้า subscribe ค่านี้ร่วมกัน -->
      <div class="flex items-center gap-2">
        <label class="text-sm text-gray-500">ปีงบ</label>
        <select
          :value="fiscalYearState.activeId ?? ''"
          @change="setActiveFiscalYear(Number($event.target.value))"
          class="border rounded px-2 py-1 text-sm"
        >
          <option
            v-for="fy in fiscalYearState.list"
            :key="fy.id"
            :value="fy.id"
          >
            {{ Number(fy.year) + 543 }}
          </option>
        </select>
      </div>

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
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { authState, clearAuth } from "../store/auth";
import { fiscalYearState, loadFiscalYears, setActiveFiscalYear } from "../store/fiscalYear";

const router = useRouter();

const logout = () => {
  clearAuth();
  router.push("/login");
};

onMounted(loadFiscalYears);
</script>