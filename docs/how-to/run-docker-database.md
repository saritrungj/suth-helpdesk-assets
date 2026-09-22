# เปิดฐานข้อมูลบน Docker และดูข้อมูลด้วย phpMyAdmin

ฐาน MySQL 8.4 LTS กับ phpMyAdmin ในคำสั่งเดียว ตั้งใหม่ได้ทุกเมื่อ ฐานนี้คือ**ข้อมูลจริง**ฐานเดียวของระบบ — ห้ามใส่ข้อมูลจำลองหรือรันชุดทดสอบที่เขียนข้อมูลกับฐานนี้ (ใช้ `npm run verify:db` ซึ่งสร้างฐานชั่วคราวเอง) เหตุผลและขอบเขตอยู่ใน [ADR-0024](../decisions/0024-docker-development-database.md)

ต้องมี Docker Desktop เปิดอยู่ และติดตั้ง dependency แล้ว (`npm install`)

## 1. ตั้งรหัสผ่านของเครื่องนี้

```powershell
Copy-Item database/docker/compose.env.example database/docker/compose.env
```

เปิด `database/docker/compose.env` แล้วตั้งทุกช่องที่ลงท้าย `_PASSWORD` ห้ามมี `'` `"` `\` หรือ `$` ไฟล์นี้อยู่ใน `.gitignore` ห้าม commit

`SUTH_DB_IMAGE` เป็น `mysql:8.4` ตาม ADR-0024 — เปลี่ยนเมื่อตัดสินเปลี่ยนรุ่นแล้วเท่านั้น

## 2. เปิดฐาน

```powershell
npm run db:up
```

ครั้งแรกจะสร้างฐาน `hospital_it_asset` จาก `database/schema.sql` และสร้างบัญชี `suth_app` (ให้ API) กับ `suth_readonly` (ให้เครื่องมือดูข้อมูล) คำสั่งจบเมื่อฐานพร้อมรับงาน

ตั้งรหัสบัญชี `admin` ของแอป (ใช้ `SUTH_ADMIN_PASSWORD` ใน compose.env):

```powershell
npm run db:bootstrap
```

สคริปต์ตรวจว่าชี้ฐานบน Docker จริง และทำเฉพาะฐานที่เพิ่งสร้าง รันซ้ำจะถูกปฏิเสธ

## 3. ให้ API ต่อฐานนี้

ตั้งใน `apps/api/.env`:

```text
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=hospital_it_asset
DB_USER=suth_app
DB_PASSWORD=<ค่า SUTH_APP_PASSWORD ใน compose.env>
```

แล้วเปิด `npm run dev:api` ตามปกติ ล็อกอินด้วย `admin` และรหัสจากข้อ 2

## 4. ลงข้อมูลหลักและยอดจริง

ข้อมูลทุกชิ้นลงผ่าน API เหมือนที่หน้าเว็บทำ

ไฟล์จริงทั้งหมด (Excel ต้นฉบับ plan ไฟล์สำรอง) เก็บนอก repo เพราะ repo เป็น public — ตัวอย่างข้างล่างใช้ `D:\suth-data\`

ข้อมูลหลักและชื่อเรียกอื่น ([ADR-0025](../decisions/0025-master-data-aliases.md)) — เขียน plan ตาม [`scripts/master-data/plan.example.json`](../../scripts/master-data/plan.example.json) แล้วตรวจว่าครอบทุกชื่อในไฟล์ดิบ:

```powershell
node scripts/master-data/list-names.cjs D:/suth-data/master-data/plan.json "D:/suth-data/raw/ไฟล์ทะเบียน.xlsx" "D:/suth-data/raw/รายงานมิเตอร์.xlsx"
```

ชื่อที่ขึ้นว่า "ยังไม่มีใน plan" ต้องตัดสินว่าเป็นรายการใหม่หรือชื่อเรียกอื่นของรายการเดิม แล้วลง:

```powershell
$env:SUTH_ADMIN_USER = "admin"; $env:SUTH_ADMIN_PASSWORD = "<รหัส admin>"
node scripts/master-data/load-master-data.cjs D:/suth-data/master-data/plan.json            # ดูก่อน
node scripts/master-data/load-master-data.cjs D:/suth-data/master-data/plan.json --confirm  # ลงจริง
```

เครื่องและยอดมิเตอร์จากรายงานของผู้ให้เช่า ใช้ `scripts/load-vendor-workbooks.cjs` (วิธีตั้ง config อยู่หัวไฟล์) — ต้องลงข้อมูลหลักก่อน ชื่อที่จับคู่ไม่ได้ทำให้สคริปต์หยุด

## 5. ดูว่าข้อมูลเข้าหรือยัง

เปิด phpMyAdmin ที่ <http://localhost:8080> แล้วเข้าด้วย `suth_readonly` — ดูได้ทุกตาราง แต่แก้ไม่ได้ การแก้ข้อมูลต้องทำผ่านแอป เพราะกฎสิทธิ์และประวัติการย้ายอยู่ในชั้น API

ใช้ DBeaver หรือ HeidiSQL แทนได้: host `127.0.0.1` port `3307` ฐาน `hospital_it_asset` บัญชี `suth_readonly`

คำสั่งตรวจยอดรวมเทียบใบแจ้งหนี้:

```sql
SELECT c.contract_no, i.month, i.print_cost, i.rental, i.vat, i.invoice_total
FROM v_contract_invoice i JOIN contracts c ON c.id = i.contract_id
ORDER BY c.contract_no, i.month;
```

## สำรอง กู้คืน และย้ายไปเครื่องอื่น

```powershell
npm run db:dump                                              # → output/db-backup/hospital_it_asset-<เวลา>.sql
npm run db:restore -- output/db-backup/<ไฟล์>.sql --confirm  # แทนข้อมูลทั้งฐาน
```

`db:restore` สำรองของเดิมให้ก่อนเสมอ (`before-restore-<เวลา>.sql`) และแสดงจำนวนเครื่อง/ยอดก่อนและหลัง

ย้ายไปเครื่องอื่น:

1. เครื่องต้นทาง `npm run db:dump`
2. ส่งไฟล์ `.sql` ผ่านช่องทางที่หน่วยงานอนุญาต — เป็นข้อมูลของหน่วยงาน ห้ามใส่ใน Git หรือส่งผ่านช่องทางสาธารณะ
3. เครื่องปลายทาง: ติดตั้ง Docker Desktop และ Node.js 20+, clone repo, `npm install` แล้วทำข้อ 1–3 ของหน้านี้ด้วยรหัสของเครื่องนั้นเอง
4. `npm run db:restore -- <ไฟล์>.sql --confirm`

สิ่งที่ต้องรู้:

- ไฟล์สำรองมีตาราง `users` — หลังกู้คืน รหัส `admin` ของแอปเป็นของเครื่องต้นทาง ไม่ใช่ `SUTH_ADMIN_PASSWORD` ของเครื่องปลายทาง
- บัญชีฐานข้อมูล (`suth_app`, `suth_readonly`) ไม่ติดไป เครื่องปลายทางใช้ของตัวเองตาม compose.env
- API และเว็บยังไม่อยู่ใน Docker เครื่องปลายทางต้องรัน `npm run dev:api` / `dev:web` เอง
- ไฟล์สำรองจาก MariaDB รุ่นใหม่ (`mariadb-dump`) บรรทัดแรกเป็นคำสั่งที่ client ของ MySQL ไม่รู้จัก — ย้ายข้อมูลจาก MariaDB ให้ลงใหม่จากไฟล์ต้นฉบับตามข้อ 4 แทน

## ปิด และตั้งใหม่

```powershell
npm run db:down    # ปิด ข้อมูลยังอยู่
npm run db:reset -- --confirm   # สำรองก่อน แล้วลบข้อมูลทั้งหมด — ครั้งหน้า db:up สร้างฐานใหม่จาก schema.sql
npm run db:logs    # ดู log ของฐาน
```

⚠️ ฐานนี้คือข้อมูลจริง `db:reset` ไม่ทำอะไรถ้าไม่ใส่ `--confirm` และสำรองเป็น `output/db-backup/before-reset-<เวลา>.sql` ก่อนลบเสมอ

เปลี่ยนรหัสใน compose.env ภายหลังไม่มีผลกับฐานที่สร้างไปแล้ว ต้อง `db:reset` ก่อน

## ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `db:up` ขึ้นว่า `ตั้ง SUTH_..._PASSWORD` | ยังไม่ได้ตั้งรหัสใน compose.env |
| พอร์ต 3307 หรือ 8080 ถูกใช้อยู่ | เปลี่ยน `SUTH_DB_PORT` / `SUTH_PMA_PORT` ใน compose.env แล้ว `db:up` ใหม่ |
| API ไม่เปิด บอกว่าไม่มีสิทธิ์ `SHOW VIEW` | ฐานสร้างด้วยสคริปต์รุ่นก่อน — `db:reset` แล้วสร้างใหม่ |
| `db:bootstrap` บอกว่าบัญชีแอปต่อไม่ได้ | สคริปต์สร้างบัญชีล้มตอนสร้างฐาน ดู `db:logs` แก้ compose.env แล้ว `db:reset` |
| ข้อความ error เรื่องค่ายาวเกินคอลัมน์ หรือวันที่ผิด | ฐานบน Docker เป็น strict mode ต่างจาก XAMPP — แก้ข้อมูลหรือโค้ดที่ต้นเหตุ |
| ชื่อไทยใน phpMyAdmin เป็น `à¸...` | ไฟล์ SQL ถูกโหลดโดยไม่มี `SET NAMES utf8mb4;` — ไฟล์ของ repo มีบรรทัดนี้แล้ว ไฟล์จากที่อื่นให้โหลดด้วย `--default-character-set=utf8mb4` |
