/**
 * app-router.js — ที่เก็บ router ตัวที่แอปใช้อยู่ สำหรับโค้ดที่อยู่นอก component
 *
 * ## ปัญหาที่ไฟล์นี้แก้
 *
 * โมดูลนอก component (`services/api.js`, `store/fiscalYear.js`) ต้องสั่งนำทางได้ แต่การ
 * `import router from "../router"` ตรงๆ สร้างวง import ขึ้นมา
 *
 *     router/index.js → (หน้าที่โหลดแบบ lazy) → store/fiscalYear.js → router/index.js
 *
 * ตอนเปิดเว็บครั้งแรกวงนี้ไม่พัง เพราะหน้าถูกโหลดทีหลัง `const router` จึงประกาศเสร็จ
 * ไปก่อนแล้ว แต่ **ตอน hot reload มันพัง** — Vite รันโมดูลในวงใหม่ตามลำดับที่ต่างออกไป
 * ถ้า `store/fiscalYear.js` ถูกรันก่อนที่ `router/index.js` จะประกาศ `const router` เสร็จ
 * จะได้ `ReferenceError: Cannot access 'router' before initialization` แล้วแอปไม่ mount
 * ทั้งหน้า = **จอขาว** ทุกครั้งที่มีใครแก้ไฟล์ของหน้าแรกขณะเปิด `npm run dev` ค้างไว้
 *
 * เดิมแก้ด้วยการเลื่อนจังหวะ (โหลดหน้าแบบ lazy, เลื่อน watch ไปเรียกจาก `main.js`) ซึ่ง
 * ทำให้ "ตอนเปิดครั้งแรก" ไม่พัง แต่ **วงยังอยู่** อาการจึงกลับมาทุกครั้งที่ hot reload
 *
 * ## วิธีแก้
 *
 * ไฟล์นี้ไม่ import อะไรเลย จึงเป็นใบไม้ของกราฟ ไม่มีทางอยู่ในวงกับใครได้
 * `router/index.js` เป็นผู้ฝาก instance ไว้ที่นี่ ส่วนโมดูลอื่นมาหยิบไปใช้
 *
 *     router/index.js ──▶ app-router.js ◀── store/fiscalYear.js, services/api.js
 *
 * **ห้าม import `../router` จากที่อื่นนอกจาก `main.js`** — มีเทสใน `app-router.test.js`
 * บังคับกฎนี้ไว้ เพราะกฎที่เขียนไว้เฉยๆ เคยถูกลืมมาแล้ว
 *
 * ## ในหน้าเว็บให้ใช้ useRouter()
 *
 * component ใช้ `useRouter()` ของ vue-router เหมือนเดิม ไฟล์นี้มีไว้สำหรับโค้ดที่ไม่มี
 * component instance ให้เกาะเท่านั้น (interceptor ของ axios, store, และเทส)
 */

let instance = null;

/** เรียกจาก `router/index.js` ทันทีที่สร้าง router เสร็จ */
export function setAppRouter(router) {
  instance = router;
}

/**
 * router ที่แอปใช้อยู่
 *
 * คืน `null` เมื่อยังไม่มีใครฝากไว้ — เกิดได้ในเทสที่ import store มาใช้เดี่ยวๆ ผู้เรียก
 * ต้องเช็คเสมอ แทนที่จะคาดว่ามีเสมอแล้วพังที่อื่นในแบบที่ไล่ต้นตอยาก
 */
export function appRouter() {
  return instance;
}
