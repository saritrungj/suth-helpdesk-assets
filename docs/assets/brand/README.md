# SUTH brand assets

โฟลเดอร์นี้เป็นบ้านของภาพต้นฉบับที่ผู้ใช้ส่งให้โครงการ ส่วน asset ขนาดเว็บที่หน้าจอโหลดจริงอยู่ที่ `apps/web/public/brand/`

- `suth-horizontal-source.png` — ต้นฉบับ `SUTH-Horizontal.png` จาก `SUTH-Design System/SUTH-logo/` ที่ผู้ใช้จัดเตรียม เก็บไว้โดยไม่แก้ภาพ
- `apps/web/public/brand/suth-horizontal.webp` — ภาพเต็ม 1200×676 สำหรับ Login
- `apps/web/public/brand/suth-wordmark.png` — exact crop เฉพาะตัวอักษร SUTH สำหรับ sidebar
- `apps/web/public/favicon.png` และ `apple-touch-icon.png` — wordmark เดียวกันบนพื้นขาว ขนาด 64×64 และ 180×180

จุด crop อ้างจากภาพต้นฉบับ 1672×941: `crop=946:230:337:438` จากนั้น resize ด้วย Lanczos โดยไม่วาดหรือดัดแปลงเนื้อหาโลโก้ พื้นหลังขาวถูกรักษาไว้ทั้งธีมสว่างและมืดผ่าน `--brand-backdrop`

จุดอ้างในโค้ดอยู่รวมกันที่ `apps/web/src/app/brand.js` ห้ามพิมพ์ path ของ asset ซ้ำใน component ใหม่
