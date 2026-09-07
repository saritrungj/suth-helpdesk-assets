<script setup>
/**
 * MonthEntryGrid — กรอกยอดพิมพ์ของ "หนึ่งเดือน หลายเครื่อง"
 *
 * ## ทำไมต้องมีโหมดนี้
 *
 * งานจริงของเจ้าหน้าที่คือ **เดินอ่านมิเตอร์ทีละเครื่องในเดือนหนึ่ง** แล้วเอามา
 * กรอกรวดเดียว ไม่ใช่เปิดทีละเครื่องแล้วกรอกย้อนหลังทั้งปี หน้าเดิมมีแต่แบบหลัง
 * (หน้าต่างรายเครื่อง 12 ช่อง) ซึ่งแปลว่าการกรอกหนึ่งเดือนของ 18 เครื่อง ต้อง
 * เปิด-ปิดหน้าต่าง 18 ครั้ง
 *
 * ## กติกาที่บังคับไว้ในนี้
 *
 * 1. **`0` กับ "ว่าง" ไม่ใช่สิ่งเดียวกัน** — `0` คือ "อ่านแล้ว เดือนนี้ไม่ได้พิมพ์"
 *    ส่วนว่างคือ "ยังไม่ได้อ่าน" ค่าที่ส่งไป API จึงเป็น `null` ไม่ใช่ `0`
 *    (ดู docs/reference/api.md — API แยกสองอย่างนี้เป็น saved กับ cleared)
 *
 * 2. **ส่งเฉพาะรายการที่เปลี่ยนจริง** เก็บ draft เป็น Map ตาม device id จึงข้าม
 *    การแบ่งหน้าได้ — แก้หน้า 1 แล้วไปหน้า 2 กลับมา ค่ายังอยู่
 *
 * 3. **ก่อนล้างค่าที่เคยมี ต้องถามก่อน** การลบยอดที่บันทึกไว้แล้วเป็นการทำลาย
 *    ข้อมูล ไม่ใช่การแก้ไข
 *
 * 4. **มีของแก้ค้างแล้วออกจากหน้า ต้องเตือน** ทั้งการเปลี่ยนหน้าในแอปและการปิดแท็บ
 */
import { computed, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { Save, Undo2, TriangleAlert } from "lucide-vue-next";
import { formatMonthTH, MAX_PAGES_PER_MONTH } from "@suth/domain";
import api from "../services/api";
import { useQueryClient } from "@tanstack/vue-query";
import { invalidateAfterWrite } from "../api/invalidate";
import { errorMessage } from "../lib/api-error";
import { askConfirm } from "../store/confirmDialog";
import { toastError, toastSuccess } from "../store/toast";
import { formatCount } from "../lib/format";
import { describePaste, parseNumbers } from "../lib/paste-numbers";
import { UiAlert, UiButton, UiInput } from "../ui";

const props = defineProps({
  /** เครื่องทั้งหมดที่ผ่านตัวกรองแล้ว เรียงตามที่แสดงบนตาราง */
  devices: { type: Array, default: () => [] },
  /** เดือนที่กำลังกรอก "YYYY-MM" */
  month: { type: String, required: true },
  /** ยอดที่บันทึกไว้แล้วของเดือนนี้ — { [deviceId]: number } */
  saved: { type: Object, default: () => ({}) },
  canEdit: { type: Boolean, default: false },
  /**
   * ยอดของเดือนนี้โหลดสำเร็จแล้วหรือยัง
   *
   * ถ้ายัง **ห้ามให้กรอก** — เพราะ `saved` ที่ยังว่างอยู่หน้าตาเหมือน "เดือนนี้
   * ยังไม่มีใครกรอก" ทั้งที่จริงคือ "ยังไม่รู้" ผู้ใช้ที่กรอกตอนนั้นจะทับของเดิม
   * โดยไม่รู้ตัว และตัวนับ "แก้ไว้ N รายการ" ก็จะนับผิดด้วย
   */
  ready: { type: Boolean, default: true },
});

const emit = defineEmits(["saved", "update:month", "update:dirty"]);

const queryClient = useQueryClient();

/**
 * ค่าที่ผู้ใช้แก้ค้างไว้ — เก็บเฉพาะที่ "ต่างจากของเดิม" เท่านั้น
 * key = device id, value = number | null (null = ตั้งใจล้างให้ว่าง)
 */
const draft = ref(new Map());
const saving = ref(false);

/**
 * ค่าที่ "ส่งไปแล้วแต่ยังไม่รู้ผล" — key = device id, value = ค่าที่ส่ง
 *
 * ## ทำไมต้องมี
 *
 * ช่องกรอกยังพิมพ์ได้ระหว่างที่คำขอบันทึกเดินทางอยู่ ถ้าเทียบสิ่งที่พิมพ์กับ
 * `props.saved` เพียงอย่างเดียว จะเทียบกับค่าที่ล้าสมัยไปแล้ว ลำดับที่พังคือ
 *
 *   บันทึกไว้ 100 → พิมพ์ 200 แล้วกดบันทึก → ระหว่างรอพิมพ์กลับเป็น 100
 *   → เทียบกับ props.saved (ยังเป็น 100) แล้วถอด draft ทิ้ง
 *   → API บันทึก 200 สำเร็จ → รีเฟรชเห็น 200 โดยไม่เหลือร่องรอยว่าผู้ใช้
 *     เปลี่ยนใจกลับไป 100
 *
 * ความตั้งใจล่าสุดหายเงียบ ไม่มีแถบบันทึกค้างให้เห็นด้วยซ้ำ (issue #26)
 */
const inFlight = ref(new Map());
const saveError = ref("");
const saveBar = ref(null);

// Native focus scrolling does not account for a sticky sibling covering the
// focused row. Only reposition when it actually overlaps the save bar.
function keepFocusVisible(event) {
  const target = event.target;
  const bar = saveBar.value;
  if (!bar || bar.contains(target)) return;
  const field = target.getBoundingClientRect();
  const overlay = bar.getBoundingClientRect();
  if (field.bottom > overlay.top && field.top < overlay.bottom &&
      field.right > overlay.left && field.left < overlay.right) {
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  }
}

/** ค่าที่บันทึกไว้แล้วของเครื่องนี้ — undefined = ยังไม่เคยกรอก */
function savedValue(deviceId) {
  const value = props.saved[deviceId];
  return value === undefined || value === null ? null : Number(value);
}

/**
 * ค่าที่ใช้เป็น "ของเดิม" ในการตัดสินว่าสิ่งที่พิมพ์นับเป็นการแก้ไหม
 *
 * ถ้ามีคำขอค้างอยู่ ของเดิมคือ **ค่าที่กำลังจะถูกบันทึก** ไม่ใช่ค่าที่บันทึกไว้
 * ก่อนหน้า เพราะอีกไม่กี่วินาทีค่านั้นจะกลายเป็นของจริง
 */
function baselineValue(deviceId) {
  if (inFlight.value.has(deviceId)) return inFlight.value.get(deviceId);
  return savedValue(deviceId);
}

/** ค่าที่ควรแสดงในช่องกรอก — ของที่แก้ค้างไว้ชนะของที่บันทึกไว้ */
function displayValue(deviceId) {
  if (draft.value.has(deviceId)) {
    const value = draft.value.get(deviceId);
    return value === null ? "" : String(value);
  }
  const value = savedValue(deviceId);
  return value === null ? "" : String(value);
}

/**
 * ผู้ใช้พิมพ์ในช่องของเครื่องหนึ่ง
 *
 * ถ้าพิมพ์กลับไปเท่าค่าเดิมเป๊ะ ให้ถอดออกจาก draft — ไม่งั้นแถบบันทึกจะบอกว่ามี
 * รายการเปลี่ยนแปลงทั้งที่ไม่มีอะไรเปลี่ยน แล้วผู้ใช้จะเลิกเชื่อตัวเลขนั้น
 */
function onInput(deviceId, raw) {
  const text = String(raw ?? "").trim();

  if (text === "") {
    if (baselineValue(deviceId) === null) draft.value.delete(deviceId);
    else draft.value.set(deviceId, null);
    draft.value = new Map(draft.value);
    return;
  }

  const value = Number(text.replace(/[,\s ]/g, ""));
  if (!Number.isFinite(value) || value < 0) return;

  const rounded = Math.round(value);
  if (rounded === baselineValue(deviceId)) draft.value.delete(deviceId);
  else draft.value.set(deviceId, rounded);

  draft.value = new Map(draft.value);
}

const dirtyCount = computed(() => draft.value.size);
const isDirty = computed(() => dirtyCount.value > 0);

// บอกหน้าแม่ว่ามีของค้างกี่รายการ เพราะหน้าแม่เป็นคนคุมการสลับโหมด ซึ่งทำให้
// component นี้ถูกถอดออกจากหน้าจอทั้งตัว — ถ้ามันไม่รู้ ก็ถามผู้ใช้ก่อนไม่ได้
watch(dirtyCount, (count) => emit("update:dirty", count), { immediate: true });

/** จำนวนรายการที่จะ "ถูกลบ" ถ้ากดบันทึกตอนนี้ — ค่าเดิมมีอยู่ แต่ draft เป็น null */
const clearingCount = computed(() => {
  let count = 0;
  for (const [deviceId, value] of draft.value) {
    if (value === null && savedValue(deviceId) !== null) count += 1;
  }
  return count;
});

/** ค่าที่เกินเพดานที่ระบบรับได้ — กันไว้ก่อนส่ง ไม่ให้ API ปฏิเสธทั้งชุด */
const invalidCount = computed(() => {
  let count = 0;
  for (const value of draft.value.values()) {
    if (value !== null && value > MAX_PAGES_PER_MONTH) count += 1;
  }
  return count;
});

function discard() {
  draft.value = new Map();
  saveError.value = "";
}

/**
 * เปลี่ยนเดือนแล้วของที่แก้ค้างไว้ใช้กับเดือนใหม่ไม่ได้ จึงต้องล้าง
 *
 * ⚠️ แต่ห้ามล้าง **เงียบๆ** — เดิมบรรทัดนี้เป็น `watch(() => props.month, discard)`
 * เฉยๆ พร้อมคอมเมนต์ว่า "ตัวเรียกใช้เป็นคนถามผู้ใช้ก่อนเปลี่ยน" ซึ่ง **ไม่มีตัว
 * เรียกใช้ตัวไหนถามจริง** ผลคือผู้ใช้ที่กรอกไป 20 ช่องแล้วเผลอเปลี่ยนเดือน
 * เสียงานทั้งหมดโดยไม่มีอะไรเตือนเลย
 *
 * ตอนนี้ตัวการ์ดเป็นคนถามเอง ไม่ฝากความหวังไว้กับตัวเรียกใช้ ถ้าผู้ใช้ตอบว่า
 * ไม่ออก จะย้อนเดือนกลับไปเป็นค่าเดิมผ่าน `update:month`
 */
watch(
  () => props.month,
  async (next, previous) => {
    if (!previous || !isDirty.value || next === previous) {
      discard();
      return;
    }

    const ok = await askConfirm(
      `มียอดพิมพ์ของเดือน${formatMonthTH(previous, { long: true })} ที่แก้ไว้ ${dirtyCount.value} รายการแต่ยังไม่ได้บันทึก ` +
        `ถ้าเปลี่ยนไปเดือนอื่นตอนนี้ ค่าที่กรอกไว้จะหายทั้งหมด`,
      { title: "ยังมีข้อมูลที่ยังไม่ได้บันทึก", confirmText: "เปลี่ยนเดือนโดยไม่บันทึก", danger: true }
    );

    if (ok) {
      discard();
      return;
    }

    // ผู้ใช้เลือกอยู่ต่อ — พาเดือนกลับไปที่เดิมพร้อมค่าที่กรอกค้างไว้
    emit("update:month", previous);
  }
);

async function save() {
  if (!isDirty.value || saving.value) return;

  if (invalidCount.value > 0) {
    saveError.value = `มี ${invalidCount.value} รายการที่เกิน ${formatCount(MAX_PAGES_PER_MONTH)} หน้า กรุณาตรวจก่อนบันทึก`;
    return;
  }

  // ถามก่อนลบเสมอ และบอกจำนวนที่จะหายไปให้ชัด
  if (clearingCount.value > 0) {
    const ok = await askConfirm(
      `จะลบยอดพิมพ์ที่เคยบันทึกไว้ของ ${clearingCount.value} เครื่องในเดือน` +
        `${formatMonthTH(props.month, { long: true })} ข้อมูลเดิมจะหายไปและรายงานจะเปลี่ยนตาม`,
      { title: "ยืนยันการลบยอดที่บันทึกไว้", confirmText: "ลบและบันทึก", danger: true }
    );
    if (!ok) return;
  }

  saving.value = true;
  saveError.value = "";

  // ถ่ายภาพสิ่งที่กำลังจะส่ง ณ วินาทีนี้ไว้ก่อน — ผู้ใช้ยังพิมพ์ต่อได้ระหว่างรอ
  const sending = new Map(draft.value);

  // ตั้งเป็น baseline ทันที เพื่อให้สิ่งที่ผู้ใช้พิมพ์ระหว่างรอถูกเทียบกับค่าที่
  // กำลังจะถูกบันทึก ไม่ใช่ค่าเก่าที่อีกเดี๋ยวก็ไม่จริงแล้ว
  inFlight.value = new Map(sending);

  try {
    const items = [...sending].map(([device_id, pages]) => ({ device_id, pages }));
    const res = await api.post("/print-transactions/bulk", { month: props.month, items });

    toastSuccess(res.data.message || "บันทึกยอดพิมพ์เรียบร้อย");

    // ยอดพิมพ์เป็นฐานของทุกบาทในรายงาน — แดชบอร์ดต้องไม่ค้างตัวเลขเก่า
    await invalidateAfterWrite(queryClient, "usage");

    /**
     * ⚠️ ล้างเฉพาะรายการที่ "ส่งไปแล้ว **และ** ยังไม่ถูกแก้เพิ่มระหว่างรอ"
     *
     * เดิมเขียน `draft.value = new Map()` ซึ่งล้างทั้งก้อน ผลคือถ้าผู้ใช้แก้ค่า
     * เพิ่มระหว่างที่คำขอยังไม่กลับมา (เช่นส่ง 200 ไปแล้วแก้เป็น 300)
     * ค่าที่แก้ใหม่จะถูกลบทิ้งไปด้วย ทั้งที่ยังไม่เคยถูกส่งไปไหนเลย —
     * ผู้ใช้เห็นข้อความ "บันทึกสำเร็จ" แล้วค่าที่เพิ่งพิมพ์หายไปเฉยๆ
     *
     * การเทียบค่าทำให้รายการที่ถูกแก้เพิ่มยังค้างอยู่ใน draft ต่อไป แถบบันทึก
     * จึงยังโชว์อยู่และผู้ใช้กดบันทึกซ้ำได้ ซึ่งถูกต้อง
     */
    const next = new Map(draft.value);
    for (const [deviceId, sentValue] of sending) {
      if (next.get(deviceId) === sentValue) next.delete(deviceId);
    }
    draft.value = next;

    emit("saved");
  } catch (err) {
    // ⚠️ ห้ามล้าง draft เมื่อบันทึกไม่สำเร็จ — ผู้ใช้เพิ่งพิมพ์ตัวเลขไปหลายสิบช่อง
    // การล้างทิ้งเพราะเน็ตสะดุดคือการทำให้เขาต้องทำงานใหม่ทั้งหมด
    saveError.value = errorMessage(err, "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    toastError(saveError.value);

    // บันทึกไม่สำเร็จ ค่าที่ส่งไปจึงไม่เคยกลายเป็นของจริง — คืนกลับเป็นของค้าง
    // ถ้าผู้ใช้ยังไม่ได้พิมพ์ทับไปแล้ว
    const restored = new Map(draft.value);
    for (const [deviceId, sentValue] of sending) {
      if (!restored.has(deviceId)) restored.set(deviceId, sentValue);
    }
    draft.value = restored;
  } finally {
    saving.value = false;
    inFlight.value = new Map();
  }
}

/* --------------------------------------------------------------------------
   วางตัวเลขจากตารางคำนวณ
   -------------------------------------------------------------------------- */
const pastePreview = ref(null);

/**
 * วางคอลัมน์ตัวเลขลงในตาราง เริ่มจากแถวที่กำลังโฟกัสอยู่
 *
 * **แสดงตัวอย่างก่อนเสมอ ไม่ลงค่าให้ทันที** — การวางผิดแถวเดียวทำให้ยอดของทุก
 * เครื่องที่เหลือเลื่อนตามกันหมด และผู้ใช้จะไม่รู้ตัวจนกว่าจะไปเห็นในรายงาน
 * การให้ดูก่อนว่า "เครื่องไหนจะได้เลขอะไร" ใช้เวลาสองวินาที แต่กันความผิดพลาด
 * ที่ต้องไล่แก้ทีละเครื่องได้
 */
function onPaste(event, startIndex, orderedRows) {
  if (!props.canEdit) return;

  const text = event.clipboardData?.getData("text") ?? "";
  if (!text.includes("\n") && !text.includes("\t")) return; // ค่าเดียว ปล่อยให้วางปกติ

  event.preventDefault();

  // ⚠️ ต้องใช้ "ลำดับแถวที่ผู้ใช้เห็นบนตาราง" ที่ตารางส่งมาให้ ไม่ใช่ props.devices
  // ตารางเรียงลำดับใหม่ได้และแบ่งหน้าได้ ถ้าวางตามลำดับของ props.devices ค่าจะไป
  // ลงผิดเครื่องทันทีที่ผู้ใช้กดเรียงคอลัมน์ใดคอลัมน์หนึ่ง โดยไม่มีอะไรฟ้อง
  const source = Array.isArray(orderedRows) && orderedRows.length ? orderedRows : props.devices;

  const parsed = parseNumbers(text);
  const rows = source.slice(startIndex, startIndex + parsed.length);

  const entries = rows.map((device, index) => ({
    device,
    value: parsed[index],
    previous: draft.value.has(device.id) ? draft.value.get(device.id) : savedValue(device.id),
  }));

  pastePreview.value = {
    startIndex,
    entries,
    filled: entries.filter((e) => typeof e.value === "number").length,
    skipped: parsed.filter((v) => v === undefined).length,
    overflow: Math.max(0, parsed.length - rows.length),
  };
}

function applyPastePreview() {
  const preview = pastePreview.value;
  if (!preview) return;

  for (const entry of preview.entries) {
    // undefined = อ่านไม่ออก (เช่นหัวตารางที่ติดมาด้วย) ให้ข้ามโดยไม่เลื่อนแถว
    if (entry.value === undefined) continue;
    onInput(entry.device.id, entry.value === null ? "" : String(entry.value));
  }

  toastSuccess(describePaste(preview));
  pastePreview.value = null;
}

/* --------------------------------------------------------------------------
   กันงานที่แก้ค้างไว้หาย
   -------------------------------------------------------------------------- */
onBeforeRouteLeave(async () => {
  if (!isDirty.value) return true;

  return askConfirm(
    `มียอดพิมพ์ที่แก้ไว้ ${dirtyCount.value} รายการแต่ยังไม่ได้บันทึก ถ้าออกจากหน้านี้ตอนนี้ค่าที่กรอกไว้จะหายทั้งหมด`,
    { title: "ยังมีข้อมูลที่ยังไม่ได้บันทึก", confirmText: "ออกโดยไม่บันทึก", danger: true }
  );
});

/**
 * ปิดแท็บ/รีเฟรช — เบราว์เซอร์บังคับให้ใช้ข้อความมาตรฐานของตัวเอง เราตั้งข้อความ
 * เองไม่ได้ แต่ยังทำให้มันถามก่อนได้ ซึ่งเป็นสิ่งเดียวที่สำคัญ
 */
watch(isDirty, (dirty) => {
  const handler = (event) => {
    event.preventDefault();
    event.returnValue = "";
  };
  if (dirty) window.addEventListener("beforeunload", handler);
  else window.removeEventListener("beforeunload", handler);

  // เก็บตัวถอดไว้กับ window เพื่อให้ถอดตัวเดิมได้จริง
  window.__suthUnloadGuard?.();
  window.__suthUnloadGuard = dirty ? () => window.removeEventListener("beforeunload", handler) : null;
});

defineExpose({ isDirty, dirtyCount, discard });
</script>

<template>
  <div @focusin="keepFocusVisible">
    <UiAlert v-if="saveError" tone="danger" class="mb-3">
      {{ saveError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" :loading="saving" @click="save">ลองบันทึกใหม่</UiButton>
      </template>
    </UiAlert>

    <!-- ตัวอย่างก่อนวาง -->
    <div
      v-if="pastePreview"
      class="mb-3 rounded-xl border border-brand-line bg-brand-soft/40 p-4"
      role="dialog"
      aria-label="ตัวอย่างก่อนวางตัวเลข"
    >
      <p class="text-sm font-medium text-ink mb-1">
        จะวาง {{ pastePreview.filled }} ค่า เริ่มจากแถวที่ {{ pastePreview.startIndex + 1 }}
      </p>
      <p class="text-xs text-ink-mute mb-3">
        <span v-if="pastePreview.skipped">ข้าม {{ pastePreview.skipped }} ค่าที่ไม่ใช่ตัวเลข · </span>
        <span v-if="pastePreview.overflow">เกินจำนวนแถว {{ pastePreview.overflow }} ค่า จะไม่ถูกใช้ · </span>
        ตรวจว่าตรงเครื่องก่อนกดยืนยัน
      </p>

      <div class="max-h-56 overflow-auto rounded-lg border border-line-soft bg-surface">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-surface-2 text-xs text-ink-mute">
            <tr>
              <th class="text-left font-medium px-3 py-1.5">Serial</th>
              <th class="text-right font-medium px-3 py-1.5">เดิม</th>
              <th class="text-right font-medium px-3 py-1.5">จะกลายเป็น</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in pastePreview.entries"
              :key="entry.device.id"
              class="border-t border-line-soft"
              :class="entry.value === undefined ? 'opacity-45' : ''"
            >
              <td class="px-3 py-1.5 font-mono text-xs">{{ entry.device.serial_number }}</td>
              <td class="px-3 py-1.5 text-right numeral text-ink-mute">
                {{ entry.previous === null ? "—" : formatCount(entry.previous) }}
              </td>
              <td class="px-3 py-1.5 text-right numeral font-medium">
                <span v-if="entry.value === undefined" class="text-ink-mute text-xs">ข้าม</span>
                <span v-else-if="entry.value === null" class="text-ink-mute">—</span>
                <span v-else class="text-brand-ink">{{ formatCount(entry.value) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center gap-2 mt-3">
        <UiButton size="sm" variant="primary" @click="applyPastePreview">ยืนยันการวาง</UiButton>
        <UiButton size="sm" variant="ghost" @click="pastePreview = null">ยกเลิก</UiButton>
      </div>
    </div>

    <slot :display-value="displayValue" :on-input="onInput" :on-paste="onPaste" :draft="draft" />

    <!--
      แถบบันทึกที่ปักอยู่ก้นจอ — โผล่เมื่อมีของแก้ค้างเท่านั้น
      ปักไว้เพราะตารางยาวกว่าหน้าจอเสมอ ถ้าปุ่มบันทึกอยู่ท้ายตาราง คนที่แก้แถวที่ 3
      ต้องเลื่อนลงไปสุดเพื่อกดบันทึก แล้วเลื่อนกลับขึ้นมาทำงานต่อ
    -->
    <Transition name="savebar">
      <div
        v-if="isDirty && canEdit"
        ref="saveBar"
        class="sticky bottom-0 z-20 -mx-3 sm:-mx-6 mt-3 px-3 sm:px-6 py-3
               border-t border-line bg-surface-float/95 backdrop-blur
               flex flex-wrap items-center gap-3 shadow-e3"
        data-print="hide"
      >
        <p class="text-sm text-ink flex-1 min-w-0">
          แก้ไว้ <span class="numeral font-semibold">{{ dirtyCount }}</span> รายการ
          <span class="text-ink-mute">· เดือน{{ formatMonthTH(month, { long: true }) }}</span>
          <span v-if="clearingCount" class="block text-xs text-danger-ink mt-0.5">
            <TriangleAlert :size="12" class="inline align-[-1px]" aria-hidden="true" />
            ในนั้นมี {{ clearingCount }} รายการที่จะถูกลบยอดเดิมทิ้ง
          </span>
        </p>

        <UiButton variant="ghost" :disabled="saving" @click="discard">
          <template #icon><Undo2 :size="15" /></template>
          ทิ้งที่แก้ไว้
        </UiButton>

        <UiButton variant="primary" :loading="saving" @click="save">
          <template #icon><Save :size="15" /></template>
          บันทึก {{ dirtyCount }} รายการ
        </UiButton>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.savebar-enter-active,
.savebar-leave-active {
  transition: transform var(--dur-panel) var(--ease-out-quart), opacity var(--dur-panel) var(--ease-out-quart);
}
.savebar-enter-from,
.savebar-leave-to {
  opacity: 0;
  transform: translateY(0.75rem);
}
</style>
