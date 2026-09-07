<script setup>
/**
 * AppCommandPalette — ช่องค้นหาคำสั่ง เปิดด้วย Ctrl+K (หรือ ⌘K บน Mac)
 *
 * ทำไมต้องมีในระบบงานภายใน: คนที่ใช้ทุกวันจำชื่อหน้าได้แต่จำตำแหน่งในเมนูไม่ได้
 * โดยเฉพาะหน้าในกลุ่ม Admin ที่ซ้อนอยู่หลายกลุ่ม การพิมพ์สามตัวอักษรแล้ว Enter
 * เร็วกว่าการกวาดสายตาหาในเมนูสิบกว่ารายการมาก และไม่ต้องละมือจากคีย์บอร์ด
 * ระหว่างที่กำลังกรอกข้อมูลอยู่
 *
 * ค้นได้ทั้งชื่อหน้า ชื่อกลุ่ม และคำพ้องที่กำหนดไว้ใน navigation.js — พิมพ์
 * "printer" หรือ "มิเตอร์" ก็เจอหน้าบันทึกยอดพิมพ์เหมือนกัน
 *
 * รายการที่ผู้ใช้ไม่มีสิทธิ์เข้า (หน้า Admin สำหรับคนที่ไม่ใช่ admin) ถูกกรองออก
 * ตั้งแต่ต้น ไม่ใช่ให้กดแล้วค่อยเด้งกลับ ซึ่งทำให้คนเข้าใจว่าระบบพัง
 */
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { useRouter } from "vue-router";
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import { CornerDownLeft, Search } from "lucide-vue-next";
import { ALL_NAV_ITEMS } from "./navigation";
import { authState } from "../store/auth";
import { setCommandPalette, uiState } from "../store/ui";

const router = useRouter();

const query = ref("");
const cursor = ref(0);
const inputEl = useTemplateRef("inputEl");
const listEl = useTemplateRef("listEl");

const available = computed(() =>
  ALL_NAV_ITEMS.filter((item) => !item.admin || authState.user?.role === "admin")
);

const results = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return available.value;

  return available.value.filter((item) =>
    `${item.label} ${item.groupLabel} ${item.keywords ?? ""}`.toLowerCase().includes(keyword)
  );
});

watch(results, () => {
  cursor.value = 0;
});

watch(
  () => uiState.commandOpen,
  async (open) => {
    if (!open) return;
    query.value = "";
    cursor.value = 0;
    await nextTick();
    inputEl.value?.focus();
  }
);

function move(step) {
  if (!results.value.length) return;
  cursor.value = (cursor.value + step + results.value.length) % results.value.length;

  nextTick(() => {
    listEl.value?.children[cursor.value]?.scrollIntoView({ block: "nearest" });
  });
}

function go(item) {
  if (!item) return;
  setCommandPalette(false);
  router.push(item.to);
}

/**
 * คีย์ลัดระดับหน้าต่าง — จับที่ window เพื่อให้กดได้จากทุกที่ในแอป
 *
 * ข้ามการจับเมื่อโฟกัสอยู่ในช่องกรอกข้อความอยู่แล้ว ยกเว้น Ctrl/Cmd+K ซึ่งเป็น
 * คีย์ลัดที่คนคาดหวังว่าใช้ได้ทุกที่ (เบราว์เซอร์ไม่ได้จองไว้)
 */
function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    setCommandPalette(!uiState.commandOpen);
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <DialogRoot :open="uiState.commandOpen" @update:open="setCommandPalette">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-[150] bg-scrim backdrop-blur-[2px] data-[state=open]:animate-fade-in"
      />

      <DialogContent
        class="fixed z-[151] left-1/2 -translate-x-1/2 top-[12vh]
               w-[calc(100%-2rem)] max-w-xl overflow-hidden
               rounded-xl border border-line-soft bg-surface-float shadow-pop
               data-[state=open]:animate-pop-in"
        aria-label="ค้นหาหน้าในระบบ"
        aria-describedby="undefined"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="go(results[cursor])"
      >
        <DialogTitle class="sr-only">ค้นหาหน้าในระบบ</DialogTitle>

        <div class="flex items-center gap-2.5 px-4 h-12 border-b border-line-soft">
          <Search :size="17" class="text-ink-faint shrink-0" aria-hidden="true" />
          <input
            ref="inputEl"
            v-model="query"
            type="text"
            placeholder="พิมพ์ชื่อหน้าที่ต้องการไป…"
            class="flex-1 bg-transparent outline-none text-md text-ink placeholder:text-ink-faint"
            aria-controls="command-results"
            autocomplete="off"
            spellcheck="false"
          />
          <kbd class="font-mono text-2xs text-ink-mute px-1.5 py-0.5 rounded-xs border border-line-soft">
            Esc
          </kbd>
        </div>

        <ul
          v-if="results.length"
          id="command-results"
          ref="listEl"
          class="max-h-[min(24rem,55dvh)] overflow-y-auto overscroll-contain p-1.5 list-none"
          role="listbox"
        >
          <li
            v-for="(item, i) in results"
            :key="item.label"
            role="option"
            :aria-selected="i === cursor"
            class="flex items-center gap-3 px-3 h-11 rounded-lg cursor-pointer transition-colors duration-100"
            :class="i === cursor ? 'bg-brand-soft text-brand-ink' : 'text-ink-soft'"
            @click="go(item)"
            @mousemove="cursor = i"
          >
            <component :is="item.icon" :size="17" class="shrink-0" aria-hidden="true" />

            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium truncate">{{ item.label }}</span>
              <span class="block text-2xs text-ink-mute truncate">{{ item.groupLabel }}</span>
            </span>

            <CornerDownLeft
              v-if="i === cursor"
              :size="14"
              class="shrink-0 opacity-60"
              aria-hidden="true"
            />
          </li>
        </ul>

        <p v-else class="px-4 py-10 text-center text-sm text-ink-mute">
          ไม่พบหน้าที่ตรงกับ &ldquo;{{ query }}&rdquo;
        </p>

        <div
          class="flex items-center gap-4 px-4 py-2 border-t border-line-soft bg-surface-2 text-2xs text-ink-mute"
        >
          <span class="flex items-center gap-1.5">
            <kbd class="font-mono px-1 py-0.5 rounded-xs border border-line-soft">↑</kbd>
            <kbd class="font-mono px-1 py-0.5 rounded-xs border border-line-soft">↓</kbd>
            เลื่อน
          </span>
          <span class="flex items-center gap-1.5">
            <kbd class="font-mono px-1 py-0.5 rounded-xs border border-line-soft">Enter</kbd>
            เปิดหน้า
          </span>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
