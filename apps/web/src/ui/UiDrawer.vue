<script setup>
import { watch } from "vue";
import {
  DialogRoot, DialogPortal, DialogOverlay, DialogContent,
  DialogTitle, DialogDescription,
} from "reka-ui";
import { X } from "lucide-vue-next";
import { t } from "../lib/locale";
import { usePortalTarget } from "./portal-target";
import UiButton from "./UiButton.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  size: { type: String, default: "md" },
  pending: { type: Boolean, default: false },
  returnFocus: { type: Object, default: null },
});
const emit = defineEmits(["update:open", "focus-fallback"]);
const portalTarget = usePortalTarget();
let returnFocus;
watch(() => props.open, (open) => {
  if (open) returnFocus = document.activeElement;
}, { flush: "sync", immediate: true });

// All dismissals are requests. The owner decides whether a draft may close.
function requestClose(event) {
  event?.preventDefault();
  emit("update:open", false);
}
function restoreFocus(event) {
  event.preventDefault();
  const target = props.returnFocus || returnFocus;
  if (target?.isConnected) target.focus({ preventScroll: true });
  else emit("focus-fallback");
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal :to="portalTarget">
      <DialogOverlay class="fixed inset-0 z-[100] bg-scrim data-[state=open]:animate-fade-in" />
      <DialogContent
        class="ui-drawer fixed inset-y-0 right-0 z-[101] flex flex-col max-w-full bg-surface border-l border-line-soft shadow-pop"
        :class="size === 'lg' ? 'w-[640px]' : 'w-[560px]'"
        :aria-busy="pending || undefined"
        @escape-key-down="requestClose"
        @pointer-down-outside="requestClose"
        @close-auto-focus="restoreFocus"
      >
        <header class="flex shrink-0 items-start justify-between gap-4 border-b border-line-soft p-6">
          <div class="min-w-0">
            <DialogTitle class="text-lg font-semibold text-ink">{{ title }}</DialogTitle>
            <DialogDescription :class="description ? 'mt-1 text-sm text-ink-mute' : 'sr-only'">{{ description || title }}</DialogDescription>
          </div>
          <UiButton variant="ghost" icon-only :label="t('ปิดหน้าต่าง')" :disabled="pending" @click="requestClose">
            <X :size="18" aria-hidden="true" />
          </UiButton>
        </header>
        <div class="grow min-h-0 overflow-y-auto p-6"><slot name="body"><slot /></slot></div>
        <footer v-if="$slots.footer" class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-surface-2 px-6 py-4">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
