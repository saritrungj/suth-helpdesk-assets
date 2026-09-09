<script setup>
import { yearLabel } from "../lib/locale-format";
import { formatMonth } from "../lib/locale-format";

import { t } from "../lib/locale";

/**
 * AssetDetail — หน้ารายละเอียดของเครื่องหนึ่งเครื่อง
 *
 * ## ทำไมถึงต้องมีหน้านี้
 *
 * เดิมทะเบียนมีแต่ตารางรายการ ข้อมูลทั้งหมดของเครื่องหนึ่งเครื่องจึงกระจายอยู่
 * ในแถวเดียวที่กว้างเกินจอ กับใน dialog แก้ไขที่ต้องกดเข้าไปดู — ไม่มีที่ไหน
 * ที่ตอบได้ว่า "เครื่องนี้ทั้งชีวิตมันเป็นยังไง" ซึ่งเป็นคำถามที่เกิดขึ้นจริง
 * ทุกครั้งที่มีคนโทรมาถามว่าเครื่องที่ห้องนี้ค่าใช้จ่ายทำไมสูง
 *
 * ## การจัดกลุ่มข้อมูล
 *
 * แยกเป็นสองระดับตามความถี่ที่มันเปลี่ยน (แนวคิดเดียวกับหน้ารายละเอียดลูกค้า
 * ของ Stripe ดู docs/explanation/design-references.md)
 *
 *   ไม่เปลี่ยน / เปลี่ยนยาก   serial, ยี่ห้อ, รุ่น       -> หัวเรื่อง
 *   เปลี่ยนเป็นครั้งคราว       ที่ตั้ง, หน่วยงาน, สัญญา  -> การ์ดข้อมูลประจำ
 *   เปลี่ยนทุกเดือน            ยอดพิมพ์                  -> กราฟ/ตารางแยก
 *   ประวัติ                    การย้ายที่                -> ไทม์ไลน์
 *
 * ถ้าเอาทุกอย่างมาเรียงเป็นรายการเดียวกันหมด คนต้องอ่านทั้งหน้าเพื่อหาสิ่งเดียว
 * ที่ตัวเองมาหา ซึ่งเกือบทุกครั้งคือ "เดือนนี้พิมพ์ไปเท่าไหร่" หรือ "อยู่ตรงไหน"
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { ArrowLeft, MapPin, Move, Pencil } from "lucide-vue-next";

import { errorMessage } from "../lib/api-error";
import { useQueryClient } from "@tanstack/vue-query";
import { keys, useDevice, useDeviceHistory, useDeviceUsage } from "../api/queries";
import { authState } from "../store/auth";
import { activeFiscalYear } from "../store/fiscalYear";
import { formatBahtValue, formatCount } from "../lib/format";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiChart,
  UiEmpty,
  UiSkeleton,
} from "../ui";

const route = useRoute();

const deviceId = computed(() => Number(route.params.id));
const fiscalYearId = computed(() => activeFiscalYear.value?.id ?? null);
const isAdmin = computed(() => authState.user?.role === "admin");

/**
 * ทั้งสามชุดดึงผ่านชั้น queries.js ที่ผูกข้อมูลกับ key ไม่ใช่กับลำดับเวลา
 *
 * เดิมหน้านี้ยิง Promise.all เองใน watch แล้วเขียนผลลง ref ซึ่ง **พังจริงตอน
 * สลับปีงบ** — วัดแล้วจากเบราว์เซอร์: สลับ 2568 -> 2569 -> 2568 เร็วๆ ได้หน้าที่
 * เขียนว่า "ปีงบประมาณ 2568" คู่กับยอด 22,208 หน้า ซึ่งเป็นตัวเลขของปี 2569
 *
 * (ส่วนการสลับ "เครื่อง" ไม่พัง เพราะ MainLayout ใส่ :key="route.path" ไว้แล้ว
 * component จึงถูกสร้างใหม่ทั้งตัว — ตรวจยืนยันแล้ว ไม่ได้เดา)
 *
 * ตอนนี้คำตอบแต่ละอันเข้า cache ของ key ที่มันขอ ไม่ใช่ของสิ่งที่กำลังแสดงอยู่
 */
const deviceQuery = useDevice(deviceId);
const historyQuery = useDeviceHistory(deviceId);
const usageQuery = useDeviceUsage(deviceId, fiscalYearId);

const device = computed(() => deviceQuery.data.value ?? null);
const history = computed(() => historyQuery.data.value ?? []);
const usage = computed(() => usageQuery.data.value ?? []);

/** id จาก URL ใช้ได้จริงหรือไม่ — `/assets/abc` ไม่ควรยิง API เลย */
const hasValidId = computed(() => Number.isFinite(deviceId.value) && deviceId.value > 0);

const QUERIES = [deviceQuery, historyQuery, usageQuery];

/**
 * ยังโหลดอยู่ = **กำลังดึงข้อมูลอยู่จริง** ไม่ใช่แค่ "ยังไม่มีข้อมูล"
 *
 * ⚠️ ใช้ `isLoading` ไม่ใช่ `isPending` — สองอันนี้ต่างกันตรงจุดที่ทำให้หน้าค้าง
 *
 *   isPending  = ยังไม่มีข้อมูลใน cache (จริงทั้งตอนกำลังโหลด **และ** ตอนที่
 *                query ถูกปิดไว้ หรือถูกพักเพราะต่อเครือข่ายไม่ได้)
 *   isLoading  = isPending **และ** กำลังยิงคำขออยู่จริง
 *
 * วัดจากเบราว์เซอร์จริง: ตอนต่อ API ไม่ได้ (ERR_CONNECTION_REFUSED) query จะค้าง
 * ที่ pending โดยไม่ยิงต่อและไม่กลายเป็น error หน้าจึงโชว์โครงร่างหมุนค้างเกิน
 * 20 วินาทีโดยไม่มีข้อความอะไรเลย และไม่มีปุ่มให้กดลองใหม่
 */
const loading = computed(
  () => hasValidId.value && QUERIES.some((q) => q.isLoading.value)
);

/**
 * ค้างอยู่โดยไม่ได้กำลังโหลด — เกือบทั้งหมดคือ "ต่อเซิร์ฟเวอร์ไม่ได้"
 *
 * ไม่มีข้อมูล ไม่ได้ error และไม่ได้กำลังยิงคำขอ = มีบางอย่างผิดปกติที่ผู้ใช้
 * ต้องรู้ ไม่ใช่สถานะที่ควรปล่อยให้เงียบ
 */
const stalled = computed(
  () =>
    hasValidId.value &&
    !loading.value &&
    QUERIES.some((q) => q.isPending.value && !q.isFetching.value)
);

/**
 * ข้อผิดพลาด — เอาอันแรกที่เจอ
 *
 * ข้อมูลเครื่องสำคัญที่สุด ถ้าตัวนั้นล้ม หน้านี้ไม่มีอะไรจะแสดงเลย จึงขึ้นก่อน
 * ส่วนประวัติหรือยอดพิมพ์ล้มอย่างเดียว หน้ายังใช้ได้บางส่วน แต่ยังต้องบอกให้รู้
 * ไม่ใช่แสดงเป็น "ไม่มีข้อมูล" ซึ่งคนละความหมายกับ "โหลดไม่สำเร็จ"
 */
const loadError = computed(() => {
  if (stalled.value) {
    return t("ต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วกดลองใหม่");
  }
  if (deviceQuery.isError.value) {
    return errorMessage(deviceQuery.error.value, t("โหลดข้อมูลเครื่องไม่สำเร็จ"));
  }
  if (historyQuery.isError.value) {
    return errorMessage(historyQuery.error.value, t("โหลดประวัติการย้ายไม่สำเร็จ"));
  }
  if (usageQuery.isError.value) {
    return errorMessage(usageQuery.error.value, t("โหลดยอดพิมพ์ของเครื่องนี้ไม่สำเร็จ"));
  }
  return "";
});

const queryClient = useQueryClient();

/**
 * ลองโหลดใหม่หลังจากล้มเหลว
 *
 * ⚠️ ใช้ `resetQueries` ไม่ใช่ `refetch()` — วัดจากเบราว์เซอร์จริงแล้วพบว่า
 * query ที่ค้างอยู่ในสถานะพัก (ต่อเซิร์ฟเวอร์ไม่ได้) เรียก `refetch()` แล้ว
 * **ไม่เกิดอะไรขึ้นเลย** ปุ่ม "ลองใหม่" จึงกดเท่าไหร่ก็ไม่ฟื้น ทั้งที่เซิร์ฟเวอร์
 * กลับมาแล้ว — ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้นแย่กว่าไม่มีปุ่มเลย
 *
 * `resetQueries` ล้างสถานะของ key นั้นทิ้งแล้วเริ่มใหม่จากศูนย์ จึงหลุดจากสถานะ
 * พักได้เสมอ
 */
function reload() {
  for (const queryKey of [
    keys.device(deviceId.value),
    keys.deviceHistory(deviceId.value),
    keys.deviceUsage(deviceId.value, fiscalYearId.value),
  ]) {
    queryClient.resetQueries({ queryKey });
  }
}

/** ป้ายและโทนสีของสถานะ — ชุดเดียวกับที่ทะเบียนใช้ */
const STATUS_META = {
  active: { label: t("ใช้งานอยู่"), tone: "ok" },
  repair: { label: t("ซ่อมบำรุง"), tone: "warn" },
  retired: { label: t("ปลดระวาง"), tone: "neutral" },
};

const statusMeta = computed(
  () => STATUS_META[device.value?.status] ?? { label: device.value?.status ?? "—", tone: "neutral" }
);

/**
 * ราคาต่อแผ่นที่ใช้จริงกับเครื่องนี้
 *
 * ราคาเฉพาะเครื่อง (`price_override`) ชนะราคาของสัญญาเสมอ — ลำดับนี้เป็นกฎธุรกิจ
 * ที่ฝั่ง API ใช้ตอนคิดเงิน ที่นี่แค่บอกให้ผู้ใช้เห็นว่าตอนนี้ใช้ตัวไหนอยู่
 * และ **ต้องบอกว่ามาจากไหน** ไม่งั้นคนเห็นเลขไม่ตรงกับสัญญาแล้วคิดว่าระบบผิด
 */
const effectivePrice = computed(() => {
  if (!device.value) return null;
  if (device.value.price_override != null) {
    return { value: Number(device.value.price_override), source: t("ราคาเฉพาะเครื่อง") };
  }
  if (device.value.price_per_page != null) {
    return { value: Number(device.value.price_per_page), source: t("สัญญา {0}", [device.value.contract_no]) };
  }
  return null;
});

const totalPages = computed(() => usage.value.reduce((sum, row) => sum + Number(row.pages || 0), 0));

/** ค่าใช้จ่ายโดยประมาณของเครื่องนี้ — "โดยประมาณ" เพราะยังไม่ได้หักส่วนลดตามสัญญา */
const estimatedCost = computed(() => {
  const price = effectivePrice.value?.value;
  if (price == null) return null;
  return totalPages.value * price;
});

const usageLabels = computed(() => usage.value.map((row) => formatMonth(row.month)));

const usageSeries = computed(() => [
  {
    key: "pages",
    label: t("จำนวนหน้า"),
    data: usage.value.map((row) => Number(row.pages || 0)),
  },
]);
</script>

<template>
  <div>
    <UiButton to="/assets" variant="ghost" size="sm" class="mb-3 -ml-2">
      <template #icon><ArrowLeft :size="15" /></template> {{ t("กลับไปทะเบียน") }} </UiButton>

    <UiAlert v-if="loadError" tone="danger" class="mb-4">
      {{ loadError }}
      <template #actions>
        <UiButton size="sm" variant="secondary" @click="reload"> {{ t("ลองใหม่") }} </UiButton>
      </template>
    </UiAlert>

    <template v-if="loading">
      <UiSkeleton class="h-24 w-full rounded-xl mb-4" />
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <UiSkeleton class="h-64 w-full rounded-xl lg:col-span-2" />
        <UiSkeleton class="h-64 w-full rounded-xl" />
      </div>
    </template>

    <template v-else-if="device">
      <!-- หัวเรื่อง — serial เป็นตัวโมโนสเปซขนาดใหญ่ เพราะเป็นสิ่งที่คนเอาไป
           เทียบกับสติกเกอร์บนตัวเครื่องทีละตัวอักษร -->
      <header
        class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 mb-5 p-5
               rounded-xl border border-line-soft bg-surface"
      >
        <div class="min-w-0">
          <p class="eyebrow mb-1.5"> {{ t("ทะเบียนทรัพย์สิน") }} </p>

          <h1 class="font-mono text-2xl font-semibold text-ink tracking-tight break-all">
            {{ device.serial_number || "—" }}
          </h1>

          <p class="text-sm text-ink-mute mt-1.5">
            {{ device.brand_name || t("ไม่ระบุยี่ห้อ") }}
            <span v-if="device.model"> · {{ device.model }}</span>
          </p>

          <div class="flex flex-wrap items-center gap-2 mt-3">
            <UiBadge :tone="statusMeta.tone">{{ statusMeta.label }}</UiBadge>

            <UiBadge v-if="!device.contract_id" tone="warn"> {{ t("ยังไม่ผูกสัญญา") }} </UiBadge>
          </div>
        </div>

        <div v-if="isAdmin" class="flex flex-wrap items-center gap-2">
          <UiButton :to="`/assets?edit=${device.id}`" variant="secondary">
            <template #icon><Pencil :size="15" /></template> {{ t("แก้ไข") }} </UiButton>

          <UiButton :to="`/assets?move=${device.id}`" variant="secondary">
            <template #icon><Move :size="15" /></template> {{ t("ย้ายเครื่อง") }} </UiButton>
        </div>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- ยอดพิมพ์ — ใหญ่ที่สุดเพราะเป็นสิ่งที่คนเปิดหน้านี้มาดูบ่อยที่สุด -->
        <UiCard
          class="lg:col-span-2"
          :eyebrow="t(&quot;ยอดพิมพ์รายเดือน&quot;)"
          :title="
            activeFiscalYear
              ? t(&quot;ปีงบประมาณ {0}&quot;, [yearLabel(activeFiscalYear.year)])
              : t(&quot;ยอดพิมพ์ที่บันทึกไว้&quot;)
          "
        >
          <template #actions>
            <div class="text-right">
              <p class="numeral text-lg font-semibold text-ink">
                {{ formatCount(totalPages) }}
                <span class="text-xs text-ink-mute font-normal"> {{ t("หน้า") }} </span>
              </p>
              <p v-if="estimatedCost != null" class="text-2xs text-ink-mute">
                ≈ {{ formatBahtValue(estimatedCost) }} {{ t("บาท (ก่อนหักส่วนลด)") }} </p>
            </div>
          </template>

          <UiChart
            v-if="usage.length"
            kind="bar"
            :labels="usageLabels"
            :series="usageSeries"
            :unit="t(&quot;หน้า&quot;)"
            height="15rem"
            :category-label="t(&quot;เดือน&quot;)"
          />

          <UiEmpty
            v-else
            :title="t(&quot;ยังไม่มียอดพิมพ์ในปีงบนี้&quot;)"
            :description="t(&quot;ยอดพิมพ์บันทึกจากหน้า “บันทึกยอดพิมพ์” — เดือนที่ยังไม่กรอกจะไม่ถูกนับเป็นศูนย์&quot;)"
            compact
          >
            <template #actions>
              <UiButton to="/print-transactions" variant="secondary" size="sm"> {{ t("ไปกรอกยอดพิมพ์") }} </UiButton>
            </template>
          </UiEmpty>
        </UiCard>

        <!-- ข้อมูลประจำเครื่อง -->
        <UiCard :eyebrow="t(&quot;ข้อมูลประจำ&quot;)" :title="t(&quot;ที่ตั้งและสัญญา&quot;)">
          <dl class="grid gap-3.5 text-sm">
            <div>
              <dt class="text-xs text-ink-mute mb-0.5"> {{ t("ที่ตั้ง") }} </dt>
              <dd class="text-ink-soft">
                {{ device.building_name || "—" }}
                <span v-if="device.floor_name"> · {{ device.floor_name }}</span>
                <span v-if="device.location" class="block text-xs text-ink-mute mt-0.5">
                  {{ device.location }}
                </span>
              </dd>
            </div>

            <div>
              <dt class="text-xs text-ink-mute mb-0.5"> {{ t("หน่วยงาน") }} </dt>
              <dd class="text-ink-soft">
                {{ device.division_name || "—" }}
                <span v-if="device.department_name"> · {{ device.department_name }}</span>
              </dd>
            </div>

            <div class="pt-3 border-t border-line-soft">
              <dt class="text-xs text-ink-mute mb-0.5"> {{ t("สัญญา") }} </dt>
              <dd class="text-ink-soft">
                <template v-if="device.contract_no">
                  {{ device.contract_no }}
                  <span v-if="device.fiscal_year" class="text-xs text-ink-mute"> {{ t("· ปีงบ") }} {{ yearLabel(device.fiscal_year) }}
                  </span>
                </template>
                <span v-else class="text-warn-ink"> {{ t("ยังไม่ผูกสัญญา") }} </span>
              </dd>
            </div>

            <div>
              <dt class="text-xs text-ink-mute mb-0.5"> {{ t("ราคาต่อแผ่นที่ใช้จริง") }} </dt>
              <dd v-if="effectivePrice" class="text-ink-soft">
                <span class="numeral font-semibold text-ink">
                  {{ effectivePrice.value.toFixed(2) }}
                </span> {{ t("บาท") }} <!-- บอกที่มาเสมอ ไม่งั้นคนเห็นเลขไม่ตรงกับสัญญาแล้วคิดว่าระบบคิดผิด -->
                <span class="block text-xs text-ink-mute mt-0.5"> {{ t("จาก") }} {{ effectivePrice.source }}
                </span>
              </dd>
              <dd v-else class="text-danger-ink text-sm"> {{ t("ไม่มีราคา — ยอดพิมพ์ของเครื่องนี้คิดเป็นค่าใช้จ่ายไม่ได้") }} </dd>
            </div>
          </dl>
        </UiCard>
      </div>

      <!-- ประวัติการย้าย -->
      <UiCard class="mt-4" :eyebrow="t(&quot;ประวัติ&quot;)" :title="t(&quot;การย้ายที่ตั้ง&quot;)">
        <UiEmpty
          v-if="!history.length"
          :title="t(&quot;ยังไม่มีประวัติการย้าย&quot;)"
          :description="t(&quot;เครื่องนี้อยู่ที่เดิมตั้งแต่บันทึกเข้าระบบ&quot;)"
          compact
        />

        <!-- ไทม์ไลน์: เส้นตั้งเดียวพร้อมจุด — อ่านลำดับก่อนหลังได้โดยไม่ต้องอ่าน
             วันที่ทีละบรรทัด รายการบนสุดคือที่ตั้งปัจจุบัน (effective_to = null) -->
        <ol v-else class="relative list-none pl-6">
          <li
            v-for="(entry, index) in history"
            :key="entry.id"
            class="relative pb-5 last:pb-0"
          >
            <!-- เส้นเชื่อม — ไม่วาดใต้รายการสุดท้าย ไม่งั้นเส้นจะห้อยลอยอยู่ -->
            <span
              v-if="index < history.length - 1"
              class="absolute -left-[1.1rem] top-3 bottom-0 w-px bg-line"
              aria-hidden="true"
            />
            <span
              class="absolute -left-[1.35rem] top-1.5 size-2.5 rounded-full ring-2 ring-surface"
              :class="entry.effective_to ? 'bg-line-strong' : 'bg-brand'"
              aria-hidden="true"
            />

            <p class="text-sm text-ink">
              {{ entry.building_name || "—" }}
              <span v-if="entry.floor_name" class="text-ink-mute"> · {{ entry.floor_name }}</span>
            </p>

            <p class="text-xs text-ink-mute mt-0.5">
              {{ entry.division_name || "—" }}
              <span v-if="entry.department_name"> · {{ entry.department_name }}</span>
            </p>

            <p class="text-2xs text-ink-mute mt-1">
              <MapPin :size="11" class="inline align-[-1px]" aria-hidden="true" /> {{ t("ตั้งแต่") }} {{ entry.effective_from }}
              <template v-if="entry.effective_to"> {{ t("ถึง") }} {{ entry.effective_to }}</template>
              <span v-else class="text-brand-ink font-medium"> {{ t("· ที่ตั้งปัจจุบัน") }} </span>
            </p>
          </li>
        </ol>
      </UiCard>
    </template>

    <UiEmpty
      v-else-if="!loadError"
      :title="t(&quot;ไม่พบเครื่องนี้&quot;)"
      :description="t(&quot;อาจถูกลบออกจากทะเบียนไปแล้ว&quot;)"
    >
      <template #actions>
        <UiButton to="/assets" variant="secondary" size="sm"> {{ t("กลับไปทะเบียน") }} </UiButton>
      </template>
    </UiEmpty>
  </div>
</template>
