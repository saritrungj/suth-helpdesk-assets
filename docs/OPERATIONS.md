# คู่มือปฏิบัติการ

เอกสารนี้เป็น source of truth สำหรับ environment, database, migration, seed, import และการตรวจระบบ กฎธุรกิจอยู่ใน [PROJECT.md](PROJECT.md)

## สิ่งที่ต้องมี

- Node.js และ npm
- MySQL
- ฐานข้อมูลสำหรับ development

## Environment

ใช้ `apps/api/.env.example` เป็น source of truth ของรายชื่อตัวแปร คัดลอกเป็น `apps/api/.env` แล้วกำหนดค่าทุกตัวก่อนเปิด Backend

ห้าม commit `apps/api/.env` และห้ามใช้ `JWT_SECRET` ตัวอย่างในระบบจริง

ติดตั้ง dependencies และเปิด Backend/Frontend ตาม [Quick Start](../README.md#เริ่มต้นใช้งานสำหรับการพัฒนา)

## ฐานข้อมูลใหม่

สร้างฐานข้อมูลเปล่า แล้วรัน schema จาก repository root:

```sh
mysql -u root -p your_database < database/schema.sql
```

`database/schema.sql` รวมโครงสร้างล่าสุดแล้ว ห้ามรัน migration เพิ่มบนฐานข้อมูลที่เพิ่งสร้างจาก schema นี้ เพราะอาจเกิด duplicate column, table, key หรือ constraint

Schema มีบัญชี prototype แบบ bcrypt hash แต่ไม่เก็บรหัสผ่านจริงใน repository ให้ผู้ดูแลสร้างหรือเปลี่ยนบัญชีสำหรับ environment นั้นก่อนใช้งาน และห้ามนำบัญชีตัวอย่างไปใช้ใน production

## ฐานข้อมูลเดิมและ Migration

สำรองข้อมูลและตรวจโครงสร้างปัจจุบันก่อนทุกครั้ง Migration เหล่านี้เป็น ordered, one-time changes และไม่ได้ออกแบบให้รันซ้ำโดยอัตโนมัติ

ลำดับตามการพัฒนา:

1. `database/migration_unique_print_transactions.sql`
2. `database/migration_add_fiscal_year_range.sql`
3. `database/migration_add_device_location.sql`
4. `database/migration_add_device_location_history.sql`
5. `database/migration_normalize_month_to_ce.sql`

ใช้เฉพาะ migration ที่ฐานข้อมูลเป้าหมายยังขาด และตรวจ dependency ของแต่ละไฟล์ก่อนรัน ตัวอย่าง:

```sh
mysql -u root -p your_database < database/migration_add_device_location.sql
```

การเปลี่ยน schema/migration และการรันกับ production ต้องได้รับอนุมัติก่อนเสมอ

## ข้อมูลจำลอง

ใช้กับฐานข้อมูล development เท่านั้น:

```sh
mysql -u root -p your_database < database/seed_dummy_data.sql
```

คำเตือน:

- Seed ลบข้อมูลเดิมในตารางธุรกิจหลายตารางก่อนสร้างข้อมูลใหม่
- เดือนยอดพิมพ์ตัวอย่าง `2025-01` ถึง `2025-03` ไม่อยู่ในปีงบ `2566` และ `2567` ที่ seed ไว้ รายงานที่กรองตามปีงบจึงอาจไม่พบยอดเหล่านี้
- ห้ามรัน seed กับ production หรือฐานข้อมูลที่ต้องรักษาข้อมูล

## การนำเข้าไฟล์

การ import ต้อง login ด้วย role `admin` รองรับ `.xlsx`, `.xls`, `.csv` และจำกัดขนาด 5 MB

- ทะเบียนอุปกรณ์: `POST /api/devices/import`
- ยอดพิมพ์: `POST /api/print-transactions/import`
- ชื่อ form field: `file`
- เทมเพลต CSV ทะเบียนอุปกรณ์: กดดาวน์โหลดในหน้านำเข้าข้อมูล ต้นฉบับอยู่ที่ `TEMPLATE_CSV` ใน `apps/web/src/views/ImportDevices.vue`
- คอลัมน์ทะเบียนอุปกรณ์: `serial_number`, `brand`, `model`, `building`, `floor`, `division`, `department`, `contract_no`, `price_override`

Importer จับคู่ข้อมูลอ้างอิงจากค่าที่อ่านได้ในไฟล์และรายงานแถวที่ผิดพลาด การนำเข้ายอดมิเตอร์หา column รูปแบบ `meter M/YY`, จับคู่เครื่องด้วย Serial Number และ normalize เดือนเป็น ค.ศ. ก่อนบันทึก

ตรวจ header, encoding, ข้อมูลส่วนบุคคล และความถูกต้องของค่าก่อน upload เสมอ การแก้ไฟล์นำเข้าหรือ mapping ต้อง smoke-test ทั้งแถวที่สำเร็จ แถวที่ถูกปฏิเสธ และการนำเข้าซ้ำ

## การตรวจระบบ

Backend health check:

```text
GET http://localhost:3000/
```

Frontend production build:

```powershell
npm run build
```

หลังเปลี่ยนส่วนที่เกี่ยวข้อง ให้ smoke-test อย่างน้อย:

- Login และ role ที่ได้รับผลกระทบ
- การอ่าน/เขียน API ที่แก้ไข
- ปีงบช่วงเดือนตุลาคมถึงกันยายน
- การบันทึกเดือนในรูปแบบ พ.ศ. และ ค.ศ. โดยตรวจว่า database เก็บเป็น ค.ศ.
- รายงานย้อนหลังของเครื่องที่ย้ายสถานที่หรือหน่วยงาน
- Fresh schema และ migration path ที่เปลี่ยน

Automated test:

```powershell
npm test
```

ตอนนี้ครอบคลุมเฉพาะ `packages/domain` (ปีงบ เดือน พ.ศ./ค.ศ. และการแสดงผล) ส่วน `apps/api` และ `apps/web` ยังไม่มี automated test ให้รายงานข้อจำกัดนี้ทุกครั้งที่ไม่ได้ทดสอบด้วยวิธีอื่น

## ก่อนนำขึ้น Production

- ตั้ง `JWT_SECRET` และ MySQL credentials ผ่าน environment ที่ปลอดภัย
- เปลี่ยนหรือลบบัญชี prototype
- ทำให้ API base URL และ CORS origin เป็น environment configuration
- สำรองและทดสอบ migration กับสำเนาฐานข้อมูล
- ตรวจไฟล์นำเข้าและข้อมูลจริงก่อนโหลด
- รัน Frontend build และ smoke-test authenticated flows
