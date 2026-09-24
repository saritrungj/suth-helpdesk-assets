import { installLocale } from "./lib/locale";
import { createApp } from "vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { queryClient } from "./api/query-client";
import App from "./App.vue";
// ฟอนต์อยู่ในแอปเอง ไม่ดึงจาก Google Fonts (#213) — เครือข่ายภายในโรงพยาบาลที่ออกอินเทอร์เน็ตไม่ได้
// เคยได้ฟอนต์ระบบแทน Anuphan ทั้งหน้า และไม่ส่งที่อยู่ IP ของผู้ใช้ไปบริการภายนอก ไฟล์ .woff2 แยกตาม
// unicode-range เบราว์เซอร์โหลดเฉพาะชุดอักษรที่หน้าใช้จริง (ไทย + ละติน)
import "@fontsource-variable/anuphan";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./style.css";

import router from "./router";
import { restoreSession } from "./store/session";
import { startFiscalYearRouterSync } from "./store/fiscalYear";
import { startWebVitals } from "./lib/web-vitals";
import { API_BASE_URL } from "./services/api";

const app = createApp(App);
installLocale(app);

// ใช้ client ที่สร้างไว้ใน api/query-client.js ไม่ให้ plugin สร้างเอง เพราะ
// store/auth.js ต้องถือ reference ไว้ล้าง cache ตอนเปลี่ยนบัญชี ซึ่งอยู่นอก
// component tree จึงเรียก useQueryClient() ไม่ได้ (ค่าตั้งต้นย้ายไปอยู่ที่นั่นแล้ว)
app.use(VueQueryPlugin, { queryClient });

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
    // วัดความเร็วจากผู้ใช้จริง (#171) — เฉพาะ build ที่ใช้งานจริง ไม่รบกวน dev server
    if (import.meta.env.PROD) startWebVitals(router, API_BASE_URL);
  });
