# ข้อเสนอแผน Merge — ใช้งานฝั่ง main (ของเพื่อน) เป็นหลัก

> วันที่ 16 ก.ค. 2026 — สถานการณ์: branch `oom-update-2026-07-16` กับ `main`
> ทำฟีเจอร์ชุดเดียวกันคนละเวอร์ชัน ชนกัน 20 ไฟล์
> ข้อสรุปจากการอ่านโค้ดทั้งสองฝั่ง: **ใช้ main เป็นหลัก แล้วเติมเฉพาะของที่ main ยังไม่มี** ง่ายและปลอดภัยที่สุด

## เหตุผล

1. **งานเด่นฝั่ง branch อยู่ในไฟล์ที่ main ไม่ได้แตะ** — merge เข้าได้เลยไม่ชนอะไร
   (Report.vue, importRoutes.js, auth.js, Login.vue, scripts/, docs/, expenses.js)
2. **ไฟล์ที่ชน 20 ไฟล์คือหน้าที่ main ทำใหญ่กว่า** (~7,500 บรรทัด) และ consistent ในตัว:
   Dashboard + DashboardFilter + ComparePeriods + CostChart, AssetForm/List,
   หน้า admin ครบชุด (มี Floor.vue / Department.vue แยก), PrintTransactions.vue (branch ไม่มี)
3. **main แก้บั๊กชุดเดียวกันไปแล้วบางส่วน** — ชื่อตาราง import (brand/building),
   JOIN floor, floor/department ผูก building_id/division_id — ตรรกะสองฝั่งตรงกัน

## สูตร merge (ทำใน branch `oom-update-2026-07-16` หรือ branch ใหม่)

```bash
git merge origin/main
# ไฟล์ที่ conflict ทั้ง 20 ไฟล์ → ยึดเวอร์ชัน main (theirs)
git checkout --theirs <ไฟล์ที่ชนทุกไฟล์>
# ยกเว้น: database/schema_normalized.sql — main ลบไฟล์นี้ (ย้ายไป test.sql + seed_dummy_data.sql)
# ให้ git rm ตาม main ไปเลย แล้วใช้ test.sql เป็น source of truth
```

ไฟล์ที่ไม่ชน (Report.vue, auth.js, Login.vue, importRoutes.js, scripts/, docs/, expenses.js)
จะติดมาจาก branch โดยอัตโนมัติ

## สิ่งที่ต้องแปะทับหลัง merge (4 จุด — main ยังไม่มี)

| # | ปัญหาใน main ปัจจุบัน | วิธีแก้ (ของพร้อมอยู่ใน branch แล้ว) |
|---|---|---|
| 1 | **Login พังกับ DB ใหม่** — seed ใน `seed_dummy_data.sql`/`test.sql` เป็น plaintext (`admin123`) แต่ auth ตรวจ bcrypt | แก้ seed เป็น bcrypt hash หรือรัน `node scripts/hash-passwords.js` หลังโหลด seed (สคริปต์มากับ branch) |
| 2 | **หน้า Login โดน Sidebar/Navbar ครอบ** — App.vue ยังเป็น `<MainLayout />` เสมอ, router แบน | ยกโครง nested routes จาก branch: `/login` อยู่นอก layout, หน้าอื่นเป็น children ของ MainLayout (แถมแก้เมนู admin ไม่ขึ้นจนกว่าจะ refresh ด้วย) |
| 3 | **fiscal-years ไม่มี PUT/DELETE** ใน master-data.js ของ main | คัดลอก 2 route จากเวอร์ชัน branch (~30 บรรทัด) |
| 4 | **ยังไม่ได้ทดสอบกับ DB จริง** — ฝั่ง branch ทดสอบ API ครบ 24 จุดแล้ว แต่โค้ดหน้า main ยังไม่ได้รัน test ชุดเดียวกัน | รัน smoke test เดิมซ้ำหลัง merge + ไล่คลิกทุกหน้า |

## ของแถมจาก branch ที่ main ได้ไปด้วยอัตโนมัติ

- หน้า **Report** เต็มรูปแบบ (filter 5 มิติ + การ์ดสรุป + Export CSV) — main ยังเป็นหน้าเปล่า
- **endpoint import ถูกล็อค** ต้อง login + admin (importRoutes.js) — main ยังเปิดโล่ง
- `auth.js` ไม่ log รหัสผ่าน/hash, ตอบ 401 แบบไม่เปิดเผยว่า username มีจริง
- `Login.vue` แสดง error จริง + กัน double-submit
- `GET /api/expenses/tree` — โครงสร้างค่าใช้จ่าย 4 ระดับ (ใช้หรือไม่ใช้ก็ได้ ไม่ชนกับ `/dashboard/expense` ของ main)
- `scripts/seed-demo-data.js` — ข้อมูลเดโม 20 เครื่อง 6 เดือน deterministic
- เอกสาร `docs/CHANGES_2026-07-16.md`

## ขั้นตอนหลังตกลงกัน

1. ทั้งคู่หยุด push เข้า `main` ชั่วคราว
2. ทำ merge ตามสูตรข้างบนใน branch นี้ + แปะ 4 จุด
3. รัน smoke test + ไล่คลิกทุกหน้ากับ MySQL จริง
4. เปิด PR ให้อีกฝ่าย review แล้วค่อย merge เข้า `main`
5. ทุกเครื่องหลัง pull: `cd backend && npm install` แล้วรัน `node scripts/hash-passwords.js` หนึ่งครั้ง
