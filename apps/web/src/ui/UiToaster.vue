<script setup>
import { usePortalTarget } from "./portal-target";
const portalTarget = usePortalTarget();
import { t } from "../lib/locale";

/**
 * UiToaster — กล่องแจ้งผลลัพธ์ที่ลอยขึ้นแล้วหายเอง
 *
 * ใช้กับ "ผลของสิ่งที่ผู้ใช้เพิ่งกด" เท่านั้น (บันทึกสำเร็จ, ลบไม่สำเร็จ) ไม่ใช้กับ
 * สถานะถาวรของหน้า — อย่างหลังต้องใช้ UiAlert ที่อยู่กับที่ เพราะ toast หายไป
 * ภายในไม่กี่วินาที คนที่หันไปมองอย่างอื่นพอดีจะไม่มีทางรู้เลยว่าเกิดอะไรขึ้น
 *
 * ตำแหน่ง: มุมขวาบนบนจอใหญ่ แต่ขอบล่างบนมือถือ เพราะนิ้วโป้งบังมุมขวาบนไม่ได้
 * แต่บังขอบล่างได้ จึงต้องวางเหนือ safe area และไม่ทับปุ่มหลักของหน้า
 *
 * role: ข้อความ error ใช้ role="alert" ให้ประกาศทันที ส่วนที่เหลือ role="status"
 * ซึ่งรอจังหวะที่ไม่ขัดจังหวะสิ่งที่กำลังอ่านอยู่
 */
import { CircleAlert, CircleCheck, Info, X } from "lucide-vue-next";
import { dismissToast, toastState } from "../store/toast";

const ICONS = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
};

const TONES = {
  success: "text-ok-ink",
  error: "text-danger-ink",
  info: "text-info-ink",
};

const RAILS = {
  success: "bg-ok",
  error: "bg-danger",
  info: "bg-info",
};
</script>

<template>
  <Teleport :to="portalTarget">
    <div
      class="fixed z-[130] flex flex-col gap-2 pointer-events-none
             inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]
             sm:inset-x-auto sm:bottom-auto sm:top-4 sm:right-4 sm:w-full sm:max-w-sm"
      data-print="hide"
    >
      <TransitionGroup name="toast">
        <div
          v-for="item in toastState.items"
          :key="item.id"
          class="pointer-events-auto relative flex items-start gap-2.5 overflow-hidden
                 rounded-xl border border-line-soft bg-surface-float shadow-pop px-4 py-3 pl-5 text-sm"
          :role="item.type === 'error' ? 'alert' : 'status'"
        >
          <!-- แถบสีด้านซ้ายบอกชนิด — เห็นได้จากหางตาโดยไม่ต้องอ่านไอคอน -->
          <span
            class="absolute inset-y-0 left-0 w-1"
            :class="RAILS[item.type] ?? RAILS.info"
            aria-hidden="true"
          ></span>

          <component
            :is="ICONS[item.type] ?? ICONS.info"
            :size="18"
            class="shrink-0 mt-0.5"
            :class="TONES[item.type] ?? TONES.info"
            aria-hidden="true"
          />

          <p class="flex-1 leading-snug text-ink-soft whitespace-pre-line min-w-0">
            {{ item.message }}
          </p>

          <button
            type="button"
            class="shrink-0 -mr-1 -mt-0.5 grid place-items-center w-6 h-6 rounded-sm text-ink-faint hover:text-ink hover:bg-surface-3 transition-colors"
            :aria-label="t(&quot;ปิดการแจ้งเตือน&quot;)"
            @click="dismissToast(item.id)"
          >
            <X :size="14" aria-hidden="true" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.22s var(--ease-out-quart), transform 0.22s var(--ease-out-quart);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(0.75rem) scale(0.97);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(1.5rem) scale(0.97);
}
/* ตัวที่เหลืออยู่ต้องเลื่อนขึ้นมาแทนที่อย่างนุ่มนวลเมื่อมีตัวหนึ่งหายไป */
.toast-move {
  transition: transform 0.22s var(--ease-out-quart);
}

@media (min-width: 640px) {
  .toast-enter-from {
    transform: translateY(-0.5rem) scale(0.97);
  }
}
</style>
