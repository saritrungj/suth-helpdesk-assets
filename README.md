# SUTH Helpdesk Assets

ระบบเว็บภายในสำหรับบริหารทรัพย์สิน IT ของโรงพยาบาล โดยเน้นทะเบียนเครื่องพิมพ์ สัญญา ยอดพิมพ์รายเดือน และค่าใช้จ่ายตามปีงบประมาณ

## ความสามารถหลัก

- จัดการทะเบียนอุปกรณ์ ตำแหน่ง หน่วยงาน สถานะ และประวัติการย้าย
- จัดการข้อมูลอ้างอิง สัญญา และปีงบประมาณ
- บันทึกหรือนำเข้ายอดพิมพ์รายเดือนจาก CSV/Excel
- แสดง Dashboard ค่าใช้จ่าย รายงานตามอาคาร/หน่วยงาน และการเปรียบเทียบรายเดือน
- ควบคุมการเข้าถึงด้วย JWT และบทบาท `admin`, `staff`, `viewer`

## เทคโนโลยี

- Backend: Node.js, CommonJS, Express และ MySQL
- Frontend: Vue 3, Vite, Tailwind CSS และ Chart.js
- Database: MySQL schema, ordered migrations และข้อมูลจำลอง

## เริ่มต้นใช้งานสำหรับการพัฒนา

ต้องมี Node.js, npm และ MySQL ก่อนเริ่มต้น เตรียม environment และฐานข้อมูลตาม [คู่มือปฏิบัติการ](docs/OPERATIONS.md) ก่อนเปิดแอป

เตรียมและเปิด Backend:

```powershell
Copy-Item backend/.env.example backend/.env
cd backend
npm ci
npm run dev
```

ตั้งค่าทุกตัวแปรตาม `backend/.env.example` ก่อนใช้งาน Backend เปิดที่ `http://localhost:3000`

เปิด Frontend ในอีก terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Frontend เปิดที่ `http://localhost:5173` และเรียก API ที่ `http://localhost:3000/api`

## ตรวจสอบการเปลี่ยนแปลง

เลือก build, health check และ smoke test ตามส่วน [การตรวจระบบ](docs/OPERATIONS.md#การตรวจระบบ)

## เอกสาร

- [ภาพรวมระบบและกฎธุรกิจ](docs/PROJECT.md)
- [การติดตั้ง ฐานข้อมูล Migration Import และการตรวจระบบ](docs/OPERATIONS.md)
- [แนวทางการทำงานใน repository](AGENTS.md)

เอกสารชุดนี้มุ่งสำหรับนักพัฒนาและ AI agent ยังไม่ใช่คู่มือสำหรับผู้ใช้งานหน้าเว็บ

## ความปลอดภัย

ก่อนใช้ข้อมูลจริงหรือ deploy ให้อ่าน checklist ใน [คู่มือปฏิบัติการ](docs/OPERATIONS.md#ก่อนนำขึ้น-production)
