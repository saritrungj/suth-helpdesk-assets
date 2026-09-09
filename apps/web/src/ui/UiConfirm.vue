<script setup>
import { usePortalTarget } from "./portal-target";
const portalTarget = usePortalTarget();
/**
 * UiConfirm — หน้าต่างยืนยันก่อนทำสิ่งที่ย้อนกลับไม่ได้
 *
 * mount ไว้ครั้งเดียวที่ App.vue แล้วทุกหน้าเรียกผ่าน askConfirm() จาก store
 * ได้เลยโดยไม่ต้อง import component
 *
 * ใช้ AlertDialog ของ Reka UI ไม่ใช่ Dialog ธรรมดา เพราะ role="alertdialog"
 * บอกโปรแกรมอ่านหน้าจอว่านี่คือการขัดจังหวะที่ต้องตอบก่อนไปต่อ และมันจะโฟกัส
 * ที่ปุ่ม "ยกเลิก" เป็นค่าเริ่มต้น — คนที่กด Enter รัวๆ จะได้ไม่เผลอลบข้อมูล
 *
 * ปุ่มยืนยันเขียนเป็นคำกริยาที่จะเกิดขึ้นจริง ("ลบเครื่องนี้") ไม่ใช่คำว่า "ตกลง"
 * เพราะคนอ่านแค่ปุ่มแล้วกด โดยไม่ได้อ่านคำถามด้านบน
 */
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from "reka-ui";
import { TriangleAlert } from "lucide-vue-next";
import { confirmState, resolveConfirm } from "../store/confirmDialog";
</script>

<template>
  <AlertDialogRoot
    :open="confirmState.visible"
    @update:open="(open) => !open && resolveConfirm(false)"
  >
    <AlertDialogPortal :to="portalTarget">
      <AlertDialogOverlay
        class="fixed inset-0 z-[140] bg-scrim backdrop-blur-[2px] data-[state=open]:animate-fade-in"
      />

      <AlertDialogContent
        class="fixed z-[141] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
               w-[calc(100%-2rem)] max-w-md rounded-xl border border-line-soft
               bg-surface-float shadow-pop data-[state=open]:animate-pop-in"
      >
        <div class="flex items-start gap-3.5 p-5">
          <span
            class="grid place-items-center shrink-0 w-10 h-10 rounded-full"
            :class="confirmState.danger ? 'bg-danger-soft text-danger-ink' : 'bg-brand-soft text-brand-ink'"
            aria-hidden="true"
          >
            <TriangleAlert :size="20" />
          </span>

          <div class="min-w-0">
            <AlertDialogTitle class="text-md font-semibold text-ink">
              {{ confirmState.title }}
            </AlertDialogTitle>
            <AlertDialogDescription class="text-sm text-ink-mute mt-1.5 whitespace-pre-line">
              {{ confirmState.message }}
            </AlertDialogDescription>
          </div>
        </div>

        <div
          class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-3.5
                 border-t border-line-soft bg-surface-2 rounded-b-xl"
        >
          <AlertDialogCancel
            class="inline-flex items-center justify-center h-[var(--field-h)] px-4 rounded-md border border-line
                   bg-surface text-ink-soft text-base font-medium
                   hover:bg-surface-3 transition-colors"
          >
            {{ confirmState.cancelText }}
          </AlertDialogCancel>

          <button
            type="button"
            class="inline-flex items-center justify-center h-[var(--field-h)] px-5 rounded-md border border-transparent
                   text-base font-medium shadow-e1 transition-colors"
            :class="
              confirmState.danger
                ? 'bg-danger text-danger-on hover:bg-danger-hover'
                : 'bg-brand text-brand-on hover:bg-brand-hover'
            "
            @click="resolveConfirm(true)"
          >
            {{ confirmState.confirmText }}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
