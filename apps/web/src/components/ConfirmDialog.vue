<template>
  <div
    v-if="confirmState.visible"
    class="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4"
    @click.self="cancel"
  >
    <div class="bg-gray-50 rounded-lg shadow-xl w-full max-w-sm">
      <div class="p-5 border-b">
        <h2 class="text-lg font-bold text-gray-800">{{ confirmState.title }}</h2>
      </div>

      <div class="p-5 text-sm text-gray-600 whitespace-pre-line">
        {{ confirmState.message }}
      </div>

      <div class="p-5 border-t flex justify-end gap-2">
        <button
          type="button"
          @click="cancel"
          class="border px-4 py-2 rounded hover:bg-gray-100"
        >
          {{ confirmState.cancelText }}
        </button>
        <button
          ref="confirmBtn"
          type="button"
          @click="confirm"
          class="px-6 py-2 rounded text-white"
          :class="confirmState.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'"
        >
          {{ confirmState.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { confirmState, resolveConfirm } from "../store/confirmDialog";

const confirmBtn = ref(null);

function confirm() {
  resolveConfirm(true);
}

function cancel() {
  resolveConfirm(false);
}

// โฟกัสปุ่มยืนยันอัตโนมัติเมื่อเปิด dialog (คีย์บอร์ด/accessibility)
watch(
  () => confirmState.visible,
  (visible) => {
    if (visible) nextTick(() => confirmBtn.value?.focus());
  }
);

// กด Esc เพื่อยกเลิกได้จากทุกที่ ไม่ต้องคลิกโฟกัสใน dialog ก่อน
function onKeydown(e) {
  if (e.key === "Escape" && confirmState.visible) cancel();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>
