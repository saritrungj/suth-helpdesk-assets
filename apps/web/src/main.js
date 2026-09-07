import { createApp } from "vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "./App.vue";
import "./style.css";

import router from "./router";
import { restoreSession } from "./store/session";
import { startFiscalYearRouterSync } from "./store/fiscalYear";

const app = createApp(App);

/**
 * ค่าตั้งต้นของชั้นดึงข้อมูล (ดูรายละเอียดต่อชุดที่ src/api/queries.js)
 *
 * retry: 1 — ลองซ้ำครั้งเดียวพอ เครือข่ายภายในโรงพยาบาลสะดุดเป็นช่วงสั้นๆ ได้
 * แต่การลองซ้ำหลายรอบทำให้ผู้ใช้รอนานโดยไม่มีอะไรบอกว่าเกิดอะไรขึ้น
 *
 * refetchOnWindowFocus: false — คนที่นี่สลับไปโปรแกรมอื่นแล้วกลับมาตลอดเวลา
 * การยิงใหม่ทุกครั้งที่กลับมาที่แท็บทำให้ตัวเลขขยับเองระหว่างที่กำลังอ่านอยู่
 * การรีเฟรชเมื่อข้อมูลเก่าเกิน staleTime ยังทำงานตามปกติ
 */
app.use(VueQueryPlugin, {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  },
});

// ลำดับตรงนี้สำคัญ ห้ามสลับ
//
// 1) ถามเซิร์ฟเวอร์ก่อนว่ายังล็อกอินอยู่ไหม — token อยู่ใน cookie แบบ httpOnly ที่เว็บอ่านเองไม่ได้
//    (ดู apps/api/src/auth/session-cookie.js) จึงต้องถาม GET /auth/me
// 2) ค่อย app.use(router) เพราะบรรทัดนี้เป็นตัวเริ่ม navigation ครั้งแรก ซึ่งเรียก router guard ทันที
//    ถ้าเรียกก่อนกู้ session เสร็จ guard จะเห็นว่ายังไม่ได้ล็อกอินแล้วเด้งไป /login ทุกครั้งที่รีเฟรช
//    ทั้งที่ cookie ยังใช้ได้อยู่ และจะไม่มี navigation รอบสองมาแก้ให้
// 3) ตั้ง watch ที่อ่าน router หลังจาก router พร้อมแล้วเท่านั้น (ดูเหตุผลใน store/fiscalYear.js)
restoreSession()
  .then(() => {
    app.use(router);
    return router.isReady();
  })
  .then(() => {
    startFiscalYearRouterSync();
    app.mount("#app");
  });
