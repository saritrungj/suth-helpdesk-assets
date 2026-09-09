<script setup>
import { usePortalTarget } from "./portal-target";
const portalTarget = usePortalTarget();
import { t } from "../lib/locale";

/**
 * UiModal — หน้าต่างซ้อนที่ต้องจัดการก่อนถึงจะทำอย่างอื่นต่อได้
 *
 * สร้างบน Reka UI (DialogRoot) แทนการเขียน div ลอยเอง เพราะ dialog ที่ถูกต้อง
 * ต้องทำครบทุกข้อต่อไปนี้ ซึ่งเขียนเองแล้วมักตกหล่นอย่างน้อยหนึ่งข้อ
 *
 *   - ขังโฟกัสไว้ข้างใน (Tab วนอยู่ในหน้าต่าง ไม่หลุดไปโดนของข้างหลัง)
 *   - คืนโฟกัสกลับไปที่ปุ่มที่เปิดมันตอนปิด
 *   - ปิดด้วย Esc และคลิกพื้นหลัง
 *   - ซ่อนเนื้อหาข้างหลังจากโปรแกรมอ่านหน้าจอ (aria-hidden ทั้งหน้า)
 *   - ล็อกการเลื่อนหน้าเบื้องหลัง โดยชดเชยความกว้างสกอลบาร์ไม่ให้หน้ากระตุก
 *
 * บนจอมือถือหน้าต่างจะกลายเป็นแผ่นที่เลื่อนขึ้นจากขอบล่าง (bottom sheet) ซึ่ง
 * มือเอื้อมถึงปุ่มได้ง่ายกว่ากล่องกลางจอ
 */
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { X } from "lucide-vue-next";

defineProps({
  /** v-model:open */
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  size: { type: String, default: "md" },
  /** ห้ามปิดด้วย Esc/คลิกพื้นหลัง ใช้กับงานที่ปิดกลางคันแล้วข้อมูลเสียหาย */
  persistent: { type: Boolean, default: false },
});

defineEmits(["update:open"]);

const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
};
</script>

<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal :to="portalTarget">
      <DialogOverlay
        class="fixed inset-0 z-[100] bg-scrim backdrop-blur-[2px] data-[state=open]:animate-fade-in"
      />

      <DialogContent
        class="fixed z-[101] bg-surface-float shadow-pop border border-line-soft flex flex-col
               inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl
               sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
               sm:w-[calc(100%-2rem)] sm:rounded-xl sm:max-h-[85dvh]
               data-[state=open]:animate-slide-up sm:data-[state=open]:animate-pop-in"
        :class="SIZES[size] ?? SIZES.md"
        :aria-describedby="description ? undefined : 'undefined'"
        @escape-key-down="persistent && $event.preventDefault()"
        @pointer-down-outside="persistent && $event.preventDefault()"
      >
        <!-- ที่จับสำหรับลากบนมือถือ — เป็นสัญญาณสายตาว่าแผ่นนี้ปิดได้ -->
        <div class="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden="true">
          <span class="w-9 h-1 rounded-full bg-line"></span>
        </div>

        <header class="flex items-start justify-between gap-4 px-5 pt-4 pb-3 shrink-0">
          <div class="min-w-0">
            <DialogTitle class="text-lg font-semibold text-ink">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="text-xs text-ink-mute mt-1">
              {{ description }}
            </DialogDescription>
          </div>

          <DialogClose
            class="shrink-0 grid place-items-center w-8 h-8 -mr-1 rounded-md text-ink-mute hover:text-ink hover:bg-surface-3 transition-colors"
            :aria-label="t(&quot;ปิดหน้าต่าง&quot;)"
          >
            <X :size="17" aria-hidden="true" />
          </DialogClose>
        </header>

        <div class="px-5 pb-5 overflow-y-auto grow min-h-0 border-t border-line-soft pt-4">
          <slot />
        </div>

        <footer
          v-if="$slots.footer"
          class="flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 border-t border-line-soft bg-surface-2 shrink-0 rounded-b-xl pb-[max(0.875rem,env(safe-area-inset-bottom))]"
        >
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
