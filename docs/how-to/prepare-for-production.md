# เตรียมขึ้น production

checklist ก่อนให้ระบบรับข้อมูลจริงของโรงพยาบาล

## ความลับและบัญชี

- [ ] ตั้ง `JWT_SECRET` และ MySQL credentials ผ่าน environment ที่ปลอดภัย ไม่ใช่ค่าตัวอย่าง
- [ ] เปลี่ยนหรือลบบัญชี prototype ที่มากับ `schema.sql`
- [ ] ตรวจว่า `.env` ไม่ได้ถูก commit

## การตั้งค่า

- [ ] ทำให้ API base URL ฝั่งเว็บเป็น environment configuration ไม่ใช่ค่าคงที่ใน `apps/web/src/services/api.js`
- [ ] ทำให้ CORS origin ฝั่ง API เป็น environment configuration ไม่ใช่ `localhost` ที่ hardcode ไว้
- [ ] ถ้าเครื่อง production ออกอินเทอร์เน็ตไม่ได้ ต้องเตรียม tarball ของ SheetJS ไว้ในเครือข่ายก่อน ดู [ADR-0003](../decisions/0003-sheetjs-from-vendor-registry.md)

## ฐานข้อมูล

- [ ] สำรองข้อมูลก่อนรัน migration ทุกครั้ง
- [ ] ทดสอบ migration กับ **สำเนา** ของฐานข้อมูลจริงก่อน ไม่ใช่ทดสอบกับตัวจริง
- [ ] ตั้ง backup อัตโนมัติรายวัน
- [ ] **ซ้อมกู้คืนจริงอย่างน้อยหนึ่งครั้ง** — backup ที่ไม่เคยลอง restore ถือว่าไม่มี

## ข้อมูล

- [ ] ตรวจไฟล์นำเข้าและข้อมูลจริงก่อนโหลด ดู [นำเข้าไฟล์](import-files.md)
- [ ] ตรวจว่าเดือนในฐานข้อมูลเป็น ค.ศ. ทั้งหมด

## สุดท้าย

- [ ] รัน `npm test` และ `npm run build` ผ่าน
- [ ] smoke-test flow ที่ต้องล็อกอินครบทุก role
- [ ] มีคนรู้ว่าต้องโทรหาใครเมื่อระบบล่ม และเอกสารนั้นอยู่ที่ไหน
