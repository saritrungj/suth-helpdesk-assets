import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],

  server: {
    // ผูก IPv4 loopback ให้ชัดเจน (#124) ค่าเริ่มต้นของ Vite คือ "localhost" แล้วปล่อยให้
    // Node แปลงชื่อเอง ซึ่งบน Windows ได้ ::1 ก่อน Node จึงผูกเฉพาะ IPv6 แล้วเบราว์เซอร์ที่
    // แปลง localhost เป็น IPv4 ต่อไม่ติด ทั้งที่ curl (เลือก IPv6) ได้ 200 จนดูเหมือนปกติ
    // ยังเป็น loopback เหมือนเดิม ไม่เปิดสู่เครือข่าย — สั่ง --host ทับเมื่อต้องการเปิด
    host: '127.0.0.1',
    // Playwright writes downloads and traces here while Vite is running. On
    // Windows, watching a temporary .crdownload file can raise EBUSY and stop
    // the development server in the middle of the E2E suite.
    watch: {
      ignored: ['**/e2e/.artifacts/**'],
    },
  },

  // preview เสิร์ฟ bundle จริงให้ชุด E2E และ pre-push hook ซึ่งส่ง SUTH_WEB_URL เป็น
  // 127.0.0.1 ได้ ต้องผูกที่อยู่เดียวกับ dev ไม่งั้น Playwright รอ webServer จนหมดเวลา (#124)
  preview: {
    host: '127.0.0.1',
  },

  test: {
    // เทสของ store ไม่ต้องใช้ DOM — ใช้ environment node ให้รันเร็ว
    // ถ้าจะเทส component ค่อยตั้ง environment: "jsdom" เฉพาะไฟล์นั้นด้วย
    // // @vitest-environment jsdom ที่หัวไฟล์
    environment: 'node',
    include: ['src/**/*.test.js'],
  },

  optimizeDeps: {
    // @suth/domain เป็น CommonJS (ต้นฉบับต้อง require ได้จาก apps/api ที่เป็น CommonJS
    // ดู ADR-0004) ปกติ Vite จะข้าม dependency ที่เป็น workspace link ไม่ pre-bundle ให้
    // ตอน dev ผลคือ dev server เสิร์ฟไฟล์ .cjs เป็น ES module ตรงๆ แล้วพัง
    // "does not provide an export named 'default'" ทั้งที่ build ผ่าน (Rollup ทำ interop ให้เอง)
    // include ตรงนี้บังคับให้ esbuild แปลง CommonJS เป็น ESM ให้ตอน dev ด้วย
    include: ['@suth/domain'],
  },
})
