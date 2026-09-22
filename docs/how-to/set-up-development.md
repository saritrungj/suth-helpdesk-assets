# ตั้งระบบสำหรับพัฒนา

ทำตามลำดับนี้บนเครื่องเปล่า จบแล้วจะเปิดเว็บและ API ได้

## สิ่งที่ต้องมีก่อน

- Node.js 20 ขึ้นไป และ npm
- Docker Desktop แล้วใช้ [ฐานข้อมูลบน Docker](run-docker-database.md) (MySQL 8.4) แทนข้อ 3–4 ซึ่งสร้างฐาน บัญชี และ phpMyAdmin ให้ในคำสั่งเดียว — หรือ MySQL 8.4 ที่ติดตั้งเอง
- สิทธิ์สร้างฐานข้อมูลใหม่

## 1. ติดตั้ง dependency

repository นี้เป็น npm workspace เดียว ติดตั้งครั้งเดียวที่ราก ครอบคลุมทุก package

```powershell
npm install
```

> ต้องออกอินเทอร์เน็ตถึง `cdn.sheetjs.com` ได้ เพราะไลบรารีอ่านไฟล์ Excel ดึงจากที่นั่นไม่ใช่ npm — ดู [ADR-0003](../decisions/0003-sheetjs-from-vendor-registry.md)

## 2. ตั้งค่า environment

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

กำหนดค่าให้ครบทุกตัวก่อนเปิด API รายชื่อตัวแปรและความหมายอยู่ที่ [reference/environment.md](../reference/environment.md)

ห้าม commit `apps/api/.env` และห้ามใช้ `JWT_SECRET` ตัวอย่างในระบบจริง

## 3. สร้างฐานข้อมูล

สร้างฐานข้อมูลเปล่า แล้วรัน schema จากรากของ repository

```sh
mysql -u root -p your_database < database/schema.sql
```

`database/schema.sql` รวมโครงสร้างล่าสุดไว้แล้ว **ห้ามรัน migration เพิ่มบนฐานข้อมูลที่เพิ่งสร้างจาก schema นี้** เพราะจะเกิด duplicate column, table, key หรือ constraint ถ้าเป็นฐานข้อมูลเดิมที่มีข้อมูลอยู่แล้ว ให้ไปที่ [รัน migration](run-migrations.md) แทน

Schema สร้างบัญชี `admin` ที่ล็อกไว้ (ล็อกอินไม่ได้) และไม่มี hash ของรหัสใดอยู่ใน repository ฐานบน Docker ตั้งรหัสด้วย `npm run db:bootstrap` ส่วน MySQL ที่ติดตั้งเองให้สร้าง hash บนเครื่องของคุณแล้วใส่ลงฐาน:

```powershell
$env:NEW_ADMIN_PASSWORD = Read-Host "รหัส admin อย่างน้อย 12 ตัวอักษร" -MaskInput
node -e "console.log(require('bcrypt').hashSync(process.env.NEW_ADMIN_PASSWORD, 10))"
Remove-Item Env:NEW_ADMIN_PASSWORD
mysql -u root -p your_database -e "UPDATE users SET password = '<hash ที่ได้>' WHERE username = 'admin'"
```

## 4. ใส่ข้อมูลจำลอง (ไม่บังคับ)

ใช้กับฐานข้อมูล development เท่านั้น

```sh
mysql -u root -p your_database < database/seed_dummy_data.sql
```

ก่อนรันต้องรู้ว่า:

- seed **ลบข้อมูลเดิม** ในตารางธุรกิจหลายตารางก่อนสร้างข้อมูลใหม่
- เดือนยอดพิมพ์ตัวอย่าง `2025-01` ถึง `2025-03` ไม่อยู่ในปีงบ `2566` และ `2567` ที่ seed ไว้ รายงานที่กรองตามปีงบจึงอาจไม่พบยอดเหล่านี้
- ห้ามรันกับ production หรือฐานข้อมูลที่ต้องรักษาข้อมูล

## 5. เปิดระบบ

เปิด API:

```powershell
npm run dev:api
```

เปิดเว็บในอีก terminal:

```powershell
npm run dev:web
```

API อยู่ที่ `http://localhost:3000` เว็บอยู่ที่ `http://localhost:5173` และเรียก API ที่ `http://localhost:3000/api`

## ตรวจว่าใช้ได้จริง

```text
GET http://localhost:3000/
```

ควรได้ JSON ตอบกลับ และใน log ของ API ควรเห็นว่าต่อ MySQL สำเร็จ จากนั้นเปิดเว็บแล้วล็อกอิน — ถ้าถึงตรงนี้ได้ถือว่าตั้งระบบสำเร็จ

รายละเอียดการตรวจก่อนส่งงานอยู่ที่ [ตรวจการเปลี่ยนแปลง](verify-changes.md)
