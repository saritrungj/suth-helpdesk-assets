import axios from "axios";
import router from "../router";
import { toastInfo } from "../store/toast";
import { clearAuth } from "../store/auth";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// แนบ Token อัตโนมัติทุก Request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ถ้า Token หมดอายุหรือไม่ได้รับอนุญาต ให้ Logout
// กัน race condition กรณีมีหลาย request ยิง 401 พร้อมกัน จะได้ toast + redirect แค่ครั้งเดียว
let isHandlingSessionExpiry = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
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