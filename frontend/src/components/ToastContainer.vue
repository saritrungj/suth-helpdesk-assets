<template>
  <teleport to="body">
    <div class="fixed top-4 right-4 z-[100] w-full max-w-sm flex flex-col gap-2 pointer-events-none">
      <transition-group name="toast-anim" tag="div" class="flex flex-col gap-2">
        <div
          v-for="t in toastState.items"
          :key="t.id"
          class="pointer-events-auto flex items-start gap-2.5 rounded-xl border shadow-lg px-4 py-3 text-sm bg-gray-50"
          :class="borderClass(t.type)"
          role="status"
        >
          <span class="mt-0.5 shrink-0" :class="iconClass(t.type)">
            <svg v-if="t.type === 'success'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <svg v-else-if="t.type === 'error'" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </span>

          <p class="flex-1 leading-snug text-gray-700 whitespace-pre-line">{{ t.message }}</p>

          <button
            type="button"
            @click="dismissToast(t.id)"
            class="shrink-0 text-gray-400 hover:text-gray-700 leading-none text-lg"
            aria-label="ปิดการแจ้งเตือน"
          >
            &times;
          </button>
        </div>
      </transition-group>
    </div>
  </teleport>
</template>

<script setup>
import { toastState, dismissToast } from "../store/toast";

function borderClass(type) {
  if (type === "success") return "border-green-200";
  if (type === "error") return "border-[var(--danger-200)]";
  return "border-gray-200";
}

function iconClass(type) {
  if (type === "success") return "text-green-600";
  if (type === "error") return "text-[var(--danger-700)]";
  return "text-[var(--brand-text)]";
}
</script>

<style scoped>
.toast-anim-enter-active,
.toast-anim-leave-active {
  transition: all 0.2s ease;
}
.toast-anim-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-anim-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
</style>
