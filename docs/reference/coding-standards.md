# มาตรฐานการเขียนโค้ด

อ่านก่อนเขียนหรือรีวิวโค้ดใน `apps/api` หรือ `apps/web` — แต่ละหัวข้อมีกฎพร้อมเหตุผลอยู่ด้วยกัน

## รูปแบบทั่วไป

- indentation 2 spaces
- Backend: CommonJS + semicolon
- Frontend: ES modules, Vue `<script setup>`, Tailwind classes
- ตั้งชื่อ Vue component แบบ PascalCase และ JavaScript identifier แบบ camelCase โดยยึดรูปแบบไฟล์ข้างเคียง

## โครงสร้าง `apps/api/src/`

โฟลเดอร์ตั้งชื่อตามสิ่งที่ระบบทำ ไม่ใช่ตามชนิดของไฟล์ — โค้ดของหนึ่งความสามารถอยู่ด้วยกันหมด

- เพิ่มความสามารถใหม่ = เพิ่มโฟลเดอร์ใหม่ใน `src/` แล้ว mount ที่ `index.js` (`index.js` เป็น entry ที่ mount route เท่านั้น)
- **ห้ามเพิ่มโฟลเดอร์แบบ `routes/` หรือ `controllers/` กลับมาอีก**
- โค้ดที่ใช้แค่ feature เดียวอยู่ในโฟลเดอร์ของ feature นั้น `shared/` ไว้เฉพาะของที่ทุก feature ใช้จริง (ฐานข้อมูล ข้อผิดพลาด การตรวจข้อมูล ล็อก แคช)
- `auth/` ให้ middleware `require-auth` / `require-admin` / `require-staff` แก่ feature อื่น
- `health/` เป็นเส้นทางเดียวที่ไม่ต้องล็อกอิน
- `audit/` อ่านประวัติการแก้ไขอย่างเดียว การเขียนบันทึกทำผ่าน `shared/audit.js` จากทุกเส้นทางเขียน ([ADR-0035](../decisions/0035-audit-log.md))

## ชั้นพื้นฐานของทุกเส้นทาง API

กฎ ไม่ใช่คำแนะนำ ([ADR-0010](../decisions/0010-problem-details-and-api-conventions.md)) — ทุกเส้นทางใช้ `src/shared/`

| ต้องทำ | ห้ามทำ |
|---|---|
| ห่อ handler ที่เป็น async ด้วย `asyncHandler` | เขียน `try/catch` แล้ว `res.status(500).json({ error: err.message })` เอง |
| โยน `ApiError` (`notFound()`, `badRequest()`, …) | เรียก `res.status(4xx).json()` เองในเส้นทาง |
| ตรวจข้อมูลขาเข้าด้วย `validate({ body, query, params })` | เช็คด้วย `if (!x) return ...` ทีละบรรทัด |
| ใช้ `db.withTransaction()` | เขียน `getConnection` / `beginTransaction` / `rollback` / `release` เอง |
| ตั้ง `Cache-Control` ผ่าน `shared/cache.js` | ปล่อยว่างไว้ |

เหตุผล: ข้อความ error ของ MySQL เคยหลุดไปถึงเบราว์เซอร์ทั้งชื่อตารางและชื่อคอลัมน์ และรูปแบบคำตอบที่ต่างกันสามแบบทำให้ฝั่งเว็บต้องเดาว่าจะอ่านช่องไหน

## โครงสร้าง `apps/web/src/`

โฟลเดอร์ตั้งชื่อตามบทบาท ไม่ใช่ตามชนิดของไฟล์ ชั้นต่างๆ ตาม [ADR-0008](../decisions/0008-design-system-tokens-and-ui-kit.md)

| โฟลเดอร์ | บทบาท | กฎ |
|---|---|---|
| `design/` | token สี ตัวอักษร ระยะ เงา และจังหวะการเคลื่อนไหว — primitive → semantic → utility | CSS ล้วน ห้ามมี JavaScript |
| `ui/` | component พื้นฐานที่ไม่รู้จักเรื่องธุรกิจ (ปุ่ม, ตาราง, หน้าต่างซ้อน, ช่องเลือก) | ห้ามมีคำว่าเครื่องพิมพ์/ปีงบ/แผนก และห้ามเรียก API |
| `app/` | เปลือกของแอป — แถบเมนู แถบบน ช่องค้นหาคำสั่ง | รู้เรื่องเส้นทางและสิทธิ์ได้ |
| `api/` | ชั้นดึงข้อมูลกลางผ่าน TanStack Query (`queries.js`) | เฉพาะข้อมูลอ่านซ้ำข้ามหน้า การเขียนยังยิง axios ตรง ([ADR-0009](../decisions/0009-tanstack-query-as-the-data-layer.md)) |
| `lib/` | ฟังก์ชันช่วยทั่วไปที่ไม่ผูกกับ component ไหน (จัดรูปแบบตัวเลข, แปล error ของ API) | ห้ามเรียก API ตรง |
| `views/`, `components/` | หน้าจอและชิ้นส่วนเฉพาะธุรกิจ | เรียกใช้ `ui/`/`design/` เท่านั้น ไม่เขียนหน้าตาเอง |

**ห้ามเขียนคลาสสีของ Tailwind ตรงๆ ในหน้าจอ** (`bg-gray-50`, `text-blue-600`) — ใช้ชื่อเชิงหน้าที่ (`bg-surface`, `text-brand-ink`) ถ้าไม่มีชื่อที่ต้องการ ให้เพิ่ม semantic token ใหม่ใน `design/tokens.css` ไม่ใช่หยิบสีดิบมาใช้

- **ใช้ของกลางก่อนเขียนเอง** — ถ้า `ui/` มี component ที่ทำหน้าที่เดียวกันอยู่แล้ว (tooltip, ช่องเลือก, ตาราง) ให้ใช้ตัวนั้น การเขียนซ้ำใน `app/` หรือ `views/` ทำให้มีสองระบบที่พฤติกรรมไม่ตรงกัน เช่น Esc ปิด tooltip ไม่ได้
- **ไม่ลบหรือเปลี่ยนองค์ประกอบที่เกณฑ์ไม่ได้ขอ** — ถ้างานต้องเอาออก ให้ระบุเหตุผลใน PR
- โครงหน้าเดียวกันทุกหน้า (หัวหน้า → แถวเครื่องมือ → ตาราง → ท้ายตาราง) อยู่ที่ [design-system](../explanation/design-system.md) ไม่ต้องคัดลอกมาที่นี่
- เลย์เอาต์ภายใน workspace ใช้ container และคลาสกลางใน `design/layout.css` ตาม [ข้อกำหนด responsive](../explanation/design-system.md) เพื่อให้ตอบสนองต่อพื้นที่ที่เหลือเมื่อปรับ sidebar; viewport breakpoint ใช้กับการเปลี่ยน shell ระหว่าง desktop/mobile

## ชื่อไฟล์และโฟลเดอร์

- **ASCII เท่านั้น** ห้ามอักษรไทยหรืออักขระนอก ASCII ในชื่อไฟล์ — macOS เก็บชื่อแบบ NFD ส่วน Linux/Windows ใช้ NFC ทำให้ชื่อเดียวกันกลายเป็นคนละ byte sequence และบางเครื่องมือ escape เป็นข้อความอ่านไม่ออก (repo นี้เคยมีไฟล์ Excel ถูก track ซ้ำสองชื่อชี้ blob เดียวกัน)
- **kebab-case ตัวพิมพ์เล็ก** — `run-docker-database.md`, `print-usage/` ยกเว้น Vue component ใช้ PascalCase (`MonthPicker.vue`) และไฟล์รากตามธรรมเนียมสากลใช้ตัวพิมพ์ใหญ่ (`README.md`, `AGENTS.md`, `CHANGELOG.md`)
- **ห้ามช่องว่างในชื่อไฟล์** และห้ามตั้งชื่อที่ต่างกันแค่ตัวพิมพ์เล็กใหญ่ — Windows/macOS มองเป็นไฟล์เดียวกันแล้วทับกันเงียบๆ ตอน checkout
- ชื่อบอกบทบาท ไม่ใช่สถานะ — `import-format.md` ไม่ใช่ `final_v2.md`
- เปลี่ยนชื่อด้วย `git mv` เสมอ เพื่อให้ `git log --follow` ตามประวัติต่อได้
