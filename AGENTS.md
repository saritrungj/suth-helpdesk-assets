# Repository Guidelines

ระบบ Hospital IT asset management ประกอบด้วย Express/MySQL API, Vue/Vite client, SQL scripts และเอกสารปฏิบัติการ

## เอกสารอ้างอิง

- เมื่อแก้ feature, domain rule, report calculation, role หรือ API boundary ให้อ่าน `docs/PROJECT.md`
- เมื่อแก้ environment, schema, migration, seed, import หรือ deployment ให้อ่าน `docs/OPERATIONS.md`
- ใช้ `README.md` เป็น landing page: ภาพรวมสั้น Quick Start และดัชนีไปยังเอกสารหลัก

รายละเอียดเชิงลึกหรือข้อมูลที่เปลี่ยนบ่อยต้องมี source of truth แห่งเดียว README สรุปได้แต่ต้องลิงก์ไปยังบ้านหลัก อ้างด้วยลิงก์แทนการคัดลอกซ้ำ และเก็บรายละเอียดที่อ่านตรงจาก code/config ได้ง่ายไว้ใน code/config

## โครงสร้างโปรเจกต์

- `backend/` — CommonJS Express API; routes, controllers, middleware และ shared utilities
- `frontend/` — Vue 3 SPA; views, components, stores, router และ API client
- `database/` — schema สำหรับฐานข้อมูลใหม่, ordered migrations สำหรับฐานข้อมูลเดิม และ seed
- `docs/` — ภาพรวมระบบและคู่มือปฏิบัติการ

ใช้ indentation 2 spaces Backend ใช้ CommonJS และ semicolon ส่วน Frontend ใช้ ES modules, Vue `<script setup>` และ Tailwind classes ตั้งชื่อ Vue component แบบ PascalCase และ JavaScript identifier แบบ camelCase โดยยึดรูปแบบไฟล์ข้างเคียง

## Workflow

1. เริ่ม development task จาก GitHub Issue และ dedicated branch ที่เชื่อมกับ Issue เสมอ
2. ตรวจ branch และ `git status` ก่อนแก้ไฟล์ ถ้าอยู่บน `main` ให้หยุดและแจ้งผู้ใช้
3. อ่าน source ที่เกี่ยวข้อง วิเคราะห์ และเสนอแผนก่อนแก้
4. ทำเฉพาะ Issue scope และรักษาการเปลี่ยนแปลงเดิมของผู้ใช้
5. ตรวจ `git diff` และรัน checks ที่สัมพันธ์กับความเสี่ยงก่อนส่งมอบ
6. สรุปไฟล์ที่เปลี่ยน ผลตรวจ และความเสี่ยงที่เหลือ

ต้องได้รับคำสั่งชัดเจนก่อน commit, push, merge, delete branch, deploy หรือเปลี่ยน production และต้องขออนุมัติก่อนเปลี่ยน schema/migration, auth/security, secrets หรือทำ destructive operation

เมื่อผู้ใช้อนุญาตให้ commit ให้ใช้ imperative Conventional Commit subject เช่น `docs: simplify project documentation` ส่วน PR ต้องระบุ Issue ต้นทาง การเปลี่ยนแปลง checks ที่รัน ลำดับ migration เมื่อเกี่ยวข้อง และ screenshot สำหรับงาน UI

สำหรับ review request ให้ review เท่านั้น แก้ไฟล์เมื่อผู้ใช้ร้องขอโดยตรง

## การตรวจสอบ

- เลือก checks ตาม `docs/OPERATIONS.md` ให้สัมพันธ์กับความเสี่ยงของ diff
- Backend change ต้องตรวจ health check และ authenticated API flow ที่ได้รับผลกระทบ
- Database change ต้องทดสอบ fresh schema และ migration path ที่เกี่ยวข้อง โดยเฉพาะขอบเขตปีงบ ต.ค.–ก.ย.
- Automated tests ใหม่ให้อยู่ใกล้ module เป้าหมายและใช้ชื่อ `*.test.js` หรือ `*.spec.js`

รายงานสิ่งที่ไม่ได้ทดสอบทุกครั้ง

## ความปลอดภัย

เก็บ MySQL credentials และ `JWT_SECRET` ใน environment variables ใช้ secret ที่แข็งแรง ตรวจ CSV/XLSX ก่อน import และถือว่า migration เป็นการเปลี่ยนแปลงแบบมีลำดับที่ต้อง review
