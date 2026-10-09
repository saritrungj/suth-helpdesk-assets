# SUTH brand assets

โฟลเดอร์นี้เป็นบ้านของภาพต้นฉบับที่ผู้ใช้ส่งให้โครงการ ส่วน asset ขนาดเว็บที่หน้าจอโหลดจริงอยู่ที่ `apps/web/public/brand/`

- `suth-horizontal-source.png` — ต้นฉบับ `SUTH-Horizontal.png` จาก `SUTH-Design System/SUTH-logo/` ที่ผู้ใช้จัดเตรียม เก็บไว้โดยไม่แก้ภาพ
- `apps/web/public/brand/suth-horizontal.webp` — ภาพเต็ม 1200×676 เก็บไว้สำหรับบริบทเดิม
- `apps/web/public/brand/suth-wordmark.png` — exact crop เฉพาะตัวอักษร SUTH สำหรับ sidebar
- `apps/web/public/favicon.png` และ `apple-touch-icon.png` — wordmark เดียวกันบนพื้นขาว ขนาด 64×64 และ 180×180

จุด crop อ้างจากภาพต้นฉบับ 1672×941: `crop=946:230:337:438` จากนั้น resize ด้วย Lanczos โดยไม่วาดหรือดัดแปลงเนื้อหาโลโก้ พื้นหลังขาวถูกรักษาไว้ทั้งธีมสว่างและมืดผ่าน `--brand-backdrop`

จุดอ้างในโค้ดอยู่รวมกันที่ `apps/web/src/app/brand.js` ห้ามพิมพ์ path ของ asset ซ้ำใน component ใหม่

## ภาพ Login กลางวันและกลางคืน (#298)

ต้นฉบับ `suth-login-day-source.png` และ `suth-login-night-source.png` ขนาด 1672×941 เป็นภาพพื้นโปร่งของเจ้าของระบบที่รับไว้ในต้นแบบ Login commit `14e2e6789dbb0d99bc7e55768560c3735de42bb3` (checkpoint ที่รับภาพ `e2e8704`) เก็บที่นี่ตาม [ADR-0015](../../decisions/0015-brand-assets-in-repository.md) โดยไม่แก้ภาพ

ไฟล์เว็บ `apps/web/public/brand/suth-login-{day,night}-{440,880,1344}.webp` นำมาจากต้นแบบเดียวกัน: แปลง RGBA แล้ว resize Lanczos เป็น 440×248, 880×495 และ 1344×756 บันทึก WebP lossless ด้วย Pillow (`method=6`, `exact=True`) ไม่วาดใหม่หรือเปลี่ยนสี Login เลือกไฟล์ตามธีมและพื้นที่/DPR ผ่าน `BRAND_ASSETS`/`srcset` ตาม [แบบ Login](../../explanation/design-system.md#หน้า-login-แบบที่เจ้าของงานรับ-2026-10-09) ไม่เปลี่ยน wordmark ของ sidebar

| ธีม | 440w (bytes) | 880w (bytes) | 1344w (bytes) |
|---|---:|---:|---:|
| day | 67816 | 203556 | 426662 |
| night | 65226 | 196034 | 407182 |

ขนาดไฟล์ไม่ใช่หลักฐานว่า LCP ผ่านเกณฑ์โดยยังไม่ได้วัด
