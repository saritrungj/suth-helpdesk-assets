/**
 * web-vitals.js — วัด Core Web Vitals จากผู้ใช้จริงแล้วส่งเข้า log ของ API (#171)
 *
 * ใช้ไลบรารี web-vitals ของ Google (ตัวเดียวกับที่ Chrome และ PageSpeed Insights ใช้) แบบ attribution
 * เพื่อรู้ว่า element ไหนเป็นต้นเหตุ — เช่นปุ่มที่กดแล้วหน้าเอ๋อ (INP) หรือกล่องที่ทำให้หน้ากระตุก (CLS)
 * API เขียนลง log บรรทัดละค่า แล้ว scripts/web-vitals-report.cjs สรุป p75 รายหน้า
 *
 * ข้อตกลง
 *   - ส่งแค่รูปแบบ route ของหน้า (เช่น /assets/:id) ไม่ส่ง URL จริง query string หรือตัวตนผู้ใช้
 *   - รวมเป็นชุดแล้วส่งครั้งเดียวตอนหน้าถูกซ่อนหรือปิด ด้วย navigator.sendBeacon ซึ่งส่งถึงแม้หน้ากำลังปิด
 *     body เป็น text/plain เพื่อไม่ต้อง preflight ข้ามโดเมน (beacon ทำ preflight ไม่ได้)
 *   - ไม่ส่งจากเบราว์เซอร์อัตโนมัติ (navigator.webdriver) — เทส E2E และ bot ต้องไม่ปนกับค่าของคนจริง
 *   - โหลดไลบรารีหลังแอปขึ้นแล้ว จึงไม่เพิ่มขนาด JS ที่ทุกหน้าต้องโหลด (งบของ #169)
 */

const MAX_TEXT = 200;
const MAX_BATCH = 20;

/** ตัดอักขระควบคุมและความยาว — API ปฏิเสธทั้งชุดถ้ามี */
function clean(text, max = MAX_TEXT) {
  if (typeof text !== "string" || !text) return undefined;
  return text.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, max);
}

/** ms ที่ปัดแล้ว — undefined ถ้าไม่ใช่ตัวเลข */
function ms(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 10) / 10 : undefined;
}

/** รูปแบบ route ของหน้าปัจจุบัน เช่น /assets/:id — ไม่มี query เสมอ */
export function routePattern(route) {
  const path = route?.matched?.at(-1)?.path || route?.path || "/";
  return clean(path.split(/[?#]/)[0], 120) || "/";
}

/** แปลงค่าจาก web-vitals เป็นรูปแบบที่ API รับ (apps/api/src/metrics/routes.js) */
export function toReport(metric, page) {
  const a = metric.attribution || {};
  const report = {
    name: metric.name,
    value: metric.name === "CLS" ? Math.round(metric.value * 10000) / 10000 : Math.round(metric.value * 10) / 10,
    rating: metric.rating,
    id: clean(metric.id, 80),
    navigationType: clean(metric.navigationType, 40),
    page,
  };
  if (metric.name === "LCP") report.target = clean(a.target);
  if (metric.name === "CLS") report.target = clean(a.largestShiftTarget);
  if (metric.name === "INP") {
    report.target = clean(a.interactionTarget);
    report.interactionType = a.interactionType === "keyboard" ? "keyboard" : a.interactionType === "pointer" ? "pointer" : undefined;
    report.inputDelay = ms(a.inputDelay);
    report.processingDuration = ms(a.processingDuration);
    report.presentationDelay = ms(a.presentationDelay);
  }
  return Object.fromEntries(Object.entries(report).filter(([, v]) => v !== undefined));
}

/**
 * คิวของค่าที่รอส่ง — ค่าเดิม (id เดียวกัน) ที่รายงานซ้ำเก็บแค่ตัวล่าสุด
 * @param {(batch: object[]) => void} send
 */
export function createReporter(send) {
  const pending = new Map();
  return {
    add(report) {
      pending.set(report.id, report);
    },
    flush() {
      if (!pending.size) return;
      const reports = [...pending.values()];
      pending.clear();
      for (let i = 0; i < reports.length; i += MAX_BATCH) send(reports.slice(i, i + MAX_BATCH));
    },
    get size() {
      return pending.size;
    },
  };
}

/**
 * เริ่มวัด — เรียกครั้งเดียวหลัง router พร้อม
 * @param {import("vue-router").Router} router
 * @param {string} apiBase เช่น http://127.0.0.1:3100/api
 */
export function startWebVitals(router, apiBase) {
  if (typeof navigator === "undefined" || navigator.webdriver || typeof navigator.sendBeacon !== "function") return;

  const endpoint = `${apiBase.replace(/\/$/, "")}/metrics/web-vitals`;
  const reporter = createReporter((batch) => {
    try {
      navigator.sendBeacon(endpoint, new Blob([JSON.stringify(batch)], { type: "text/plain;charset=UTF-8" }));
    } catch {
      // การวัดต้องไม่ทำให้แอปพัง
    }
  });

  // LCP/FCP/TTFB เป็นของหน้าที่เปิดเข้ามาครั้งแรก ส่วน INP/CLS เป็นของหน้าที่อยู่ตอนเกิดเหตุ
  const landing = routePattern(router.currentRoute.value);
  const current = () => routePattern(router.currentRoute.value);

  const onHidden = () => {
    if (document.visibilityState === "hidden") reporter.flush();
  };
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", () => reporter.flush());

  import("web-vitals/attribution")
    .then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
      const onLanding = (metric) => reporter.add(toReport(metric, landing));
      onLCP(onLanding);
      onFCP(onLanding);
      onTTFB(onLanding);
      // reportAllChanges: INP ที่แย่ที่สุดเปลี่ยนเมื่อไร ได้หน้าที่กำลังอยู่ตอนนั้นทันที ไม่ใช่หน้าตอนปิดแท็บ
      onINP((metric) => reporter.add(toReport(metric, current())), { reportAllChanges: true });
      onCLS((metric) => reporter.add(toReport(metric, current())));
    })
    .catch(() => {
      // โหลดไลบรารีไม่ได้ (เช่นออฟไลน์) — ข้ามการวัดรอบนี้
    });
}
