# ตัวแปร environment

source of truth คือ `apps/api/.env.example` และ `apps/web/.env.example` ตารางนี้อธิบายความหมาย ถ้าสองที่ไม่ตรงกันให้เชื่อไฟล์

ไฟล์จริงอยู่ที่ `apps/api/.env` และ `apps/web/.env` ทั้งคู่อยู่ใน `.gitignore` แล้ว **ห้าม commit**

## ฝั่ง API (`apps/api/.env`)

| ตัวแปร | จำเป็น | ความหมาย |
|---|---|---|
| `DB_HOST` | ใช่ | โฮสต์ของ MySQL/MariaDB ปกติ `localhost` |
| `DB_USER` | ใช่ | ผู้ใช้ฐานข้อมูล |
| `DB_PASSWORD` | ใช่ | รหัสผ่านฐานข้อมูล ว่างได้เฉพาะบนเครื่องพัฒนา |
| `DB_NAME` | ใช่ | ชื่อฐานข้อมูล |
| `JWT_SECRET` | ใช่ | กุญแจเซ็น JWT — ต้องเป็นค่าสุ่มที่ยาวและไม่ซ้ำใคร |
| `PORT` | ไม่ | พอร์ตของ API ค่าเริ่มต้น `3000` |
| `CORS_ORIGIN` | ไม่ | origin ของเว็บที่อนุญาตให้เรียก API คั่นหลายค่าด้วย comma ค่าเริ่มต้น `http://localhost:5173` |
| `COOKIE_SAMESITE` | ไม่ | `lax` (ค่าเริ่มต้น) เมื่อเว็บกับ API อยู่โดเมนเดียวกัน · `none` เมื่ออยู่คนละโดเมน ซึ่งบังคับให้ cookie ต้อง secure |
| `NODE_ENV` | ไม่ | ตั้งเป็น `production` บนเครื่องจริง เพื่อบังคับให้ cookie session เป็น `secure` |

## ฝั่งเว็บ (`apps/web/.env`)

| ตัวแปร | จำเป็น | ความหมาย |
|---|---|---|
| `VITE_API_BASE_URL` | ไม่ | ที่อยู่ API ที่เว็บเรียก ต้องลงท้ายด้วย `/api` ค่าเริ่มต้น `http://localhost:3000/api` |

## ข้อควรระวัง

- `JWT_SECRET` ที่อ่อนหรือใช้ค่าตัวอย่าง = ใครก็ปลอม token เข้าระบบได้ ต้องเปลี่ยนก่อนขึ้น production เสมอ
- token มีอายุ 8 ชั่วโมงและ **revoke ทีละใบไม่ได้** การเปลี่ยน `JWT_SECRET` จะทำให้ทุก session ที่ออกไปแล้วใช้ไม่ได้ทันที ซึ่งเป็นวิธีเดียวที่มีตอนนี้ในการบังคับให้ทุกคนล็อกอินใหม่
- token อยู่ใน cookie แบบ httpOnly ไม่ได้อยู่ใน localStorage แล้ว ดู [ADR-0006](../decisions/0006-session-cookie-instead-of-localstorage.md)
- `CORS_ORIGIN` ต้องระบุ origin ที่แน่นอน ใช้ `*` ไม่ได้ เพราะ cookie ต้องมากับ `credentials: true`
- `VITE_API_BASE_URL` ถูก **ฝังตอน build** ไม่ใช่อ่านตอนรัน เปลี่ยนค่าแล้วต้อง `npm run build` ใหม่เสมอ
- `CORS_ORIGIN` ต้องตรงกับที่อยู่จริงของเว็บ ไม่งั้นเบราว์เซอร์จะบล็อกทุก request โดยที่ API เองไม่เห็น error
