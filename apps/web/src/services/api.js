import axios from "axios";
import router from "../router";
import { toastInfo } from "../store/toast";
import { clearAuth } from "../store/auth";

// ที่อยู่ของ API มาจาก environment ไม่ใช่ค่าคงที่ในโค้ด — เดิม hardcode เป็น localhost
// ทำให้ build ที่ได้ใช้ได้เฉพาะบนเครื่องพัฒนา deploy จริงไม่ได้จนกว่าจะแก้โค้ด
// ตั้งค่าที่ apps/web/.env (ดู .env.example) ค่าเริ่มต้นคือเครื่องพัฒนา
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },

  // ให้เบราว์เซอร์แนบ cookie ของ session ไปกับทุก request
  // เดิมเว็บอ่าน token จาก localStorage มาแนบเป็น header เอง ซึ่งแปลว่า JavaScript
  // ทุกตัวในหน้าอ่าน token ได้ ตอนนี้ token อยู่ใน cookie แบบ httpOnly ที่อ่านไม่ได้
  // และ CORS ฝั่ง API ตั้ง credentials: true ไว้แล้ว
  withCredentials: true,
});

// ถ้า Token หมดอายุหรือไม่ได้รับอนุญาต ให้ Logout
// กัน race condition กรณีมีหลาย request ยิง 401 พร้อมกัน จะได้ toast + redirect แค่ครั้งเดียว
let isHandlingSessionExpiry = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // บาง request ตั้งใจเรียกทั้งที่อาจยังไม่ได้ล็อกอิน (เช็ค session ตอนเปิดหน้า, logout)
    // 401 ของพวกนี้เป็นเรื่องปกติ ไม่ใช่ session หมดอายุ จึงไม่ต้องเด้งหรือขึ้น toast
    if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
      clearAuth();

      if (window.location.pathname !== "/login" && !isHandlingSessionExpiry) {
        isHandlingSessionExpiry = true;

        toastInfo("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");

        // ใช้ router แทน window.location.href เพื่อไม่ให้ reload ทั้งหน้า (คง SPA state)
        // หน่วงเล็กน้อยให้ผู้ใช้เห็น toast ก่อนเปลี่ยนหน้า
        setTimeout(() => {
          router.push({
            path: "/login",
            query: { redirect: window.location.pathname },
          });
          isHandlingSessionExpiry = false;
        }, 800);
      }
    }

    return Promise.reject(error);
  }
);

export default api;