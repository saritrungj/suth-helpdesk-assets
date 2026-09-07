# SUTH Helpdesk Assets

ระบบเว็บภายในสำหรับบริหารทรัพย์สิน IT ของโรงพยาบาล โดยเน้นทะเบียนเครื่องพิมพ์ สัญญา ยอดพิมพ์รายเดือน และค่าใช้จ่ายตามปีงบประมาณ

## ความสามารถหลัก

- จัดการทะเบียนอุปกรณ์ ตำแหน่ง หน่วยงาน สถานะ และประวัติการย้าย
- จัดการข้อมูลอ้างอิง สัญญา และปีงบประมาณ
- บันทึกหรือนำเข้ายอดพิมพ์รายเดือนจาก CSV/Excel
- แสดง Dashboard ค่าใช้จ่าย รายงานตามอาคาร/หน่วยงาน และการเปรียบเทียบรายเดือน
- ถามข้อมูลเป็นภาษาพูดผ่านผู้ช่วย AI ด้วยเซิร์ฟเวอร์ MCP แบบอ่านอย่างเดียว ([วิธีต่อ](docs/how-to/connect-mcp.md))
- ควบคุมการเข้าถึงด้วย JWT และบทบาท `admin`, `staff`, `viewer`

## เทคโนโลยี

- Backend: Node.js, CommonJS, Express และ MySQL
- Frontend: Vue 3, Vite, Tailwind CSS และ Chart.js
- Database: MySQL schema, ordered migrations และข้อมูลจำลอง
- ผู้ช่วย AI: เซิร์ฟเวอร์ MCP แบบ stdio อ่านอย่างเดียว (ดู [ADR-0011](docs/decisions/0011-read-only-mcp-server.md))

## เริ่มต้นใช้งานสำหรับการพัฒนา

ต้องมี Node.js, npm และ MySQL ก่อนเริ่มต้น เตรียม environment และฐานข้อมูลตาม [คู่มือตั้งระบบ](docs/how-to/set-up-development.md) ก่อนเปิดแอป

ติดตั้ง dependency ครั้งเดียวที่รากของ repository — เป็น npm workspace ตัวเดียวครอบทุก package:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
npm install
```

ตั้งค่าทุกตัวแปรตาม `apps/api/.env.example` ให้ครบก่อนเปิด API

เปิด API:

```powershell
npm run dev:api
```

เปิดเว็บในอีก terminal:

```powershell
npm run dev:web
```

API เปิดที่ `http://localhost:3000` เว็บเปิดที่ `http://localhost:5173` และเรียก API ที่ `http://localhost:3000/api`

## ตรวจสอบการเปลี่ยนแปลง

เลือก build, health check และ smoke test ตาม [คู่มือตรวจการเปลี่ยนแปลง](docs/how-to/verify-changes.md)

## เอกสาร

- [สารบัญเอกสารทั้งหมด](docs/README.md) — แบ่งตาม Diátaxis: เข้าใจ / ทำ / เปิดหา / การตัดสินใจ
- [กฎธุรกิจและโดเมน](docs/explanation/domain.md) — ปีงบประมาณ การคิดค่าใช้จ่าย ประวัติการย้ายเครื่อง
- [สถาปัตยกรรม](docs/explanation/architecture.md) — โครงสร้างระบบและโค้ด
- [บันทึกการตัดสินใจ (ADR)](docs/decisions/) — ทำไมถึงเลือกแบบนั้น
- [แนวทางสำหรับ AI agent](AGENTS.md) และ [ข้อตกลงการทำงานของทีม](CONTRIBUTING.md)

เอกสารชุดนี้มุ่งสำหรับนักพัฒนาและ AI agent ยังไม่ใช่คู่มือสำหรับผู้ใช้งานหน้าเว็บ

## ความปลอดภัย

ก่อนใช้ข้อมูลจริงหรือ deploy ให้อ่าน [checklist เตรียมขึ้น production](docs/how-to/prepare-for-production.md)
