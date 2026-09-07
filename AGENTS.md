# Repository Guidelines

ระบบ Hospital IT asset management ประกอบด้วย Express/MySQL API, Vue/Vite client, SQL scripts และเอกสารปฏิบัติการ

## เอกสารอ้างอิง

- เอกสารแบ่งตาม Diátaxis เริ่มที่ `docs/README.md` ซึ่งบอกว่าจะหาอะไรที่ไหน
- เมื่อแก้ feature, domain rule, report calculation หรือ role ให้อ่าน `docs/explanation/domain.md`
- เมื่อแก้โครงสร้างโค้ดหรือ API boundary ให้อ่าน `docs/explanation/architecture.md`
- เมื่อแก้ environment, schema, migration, seed หรือ import ให้อ่าน `docs/how-to/`
- เมื่อต้องหาชื่อคอลัมน์ endpoint หรือตัวแปร ให้อ่าน `docs/reference/`
- **ก่อนแก้ตรรกะปีงบ เดือน หรือการคิดเงิน ให้อ่าน `docs/decisions/` ก่อนเสมอ** — กฎเหล่านั้นเคยพังมาแล้วและเหตุผลอยู่ใน ADR
- ใช้ `README.md` เป็น landing page: ภาพรวมสั้น Quick Start และดัชนีไปยังเอกสารหลัก
- ข้อตกลงการทำงานของทีม (branch, PR, การขออนุมัติ) อยู่ใน `CONTRIBUTING.md`

รายละเอียดเชิงลึกหรือข้อมูลที่เปลี่ยนบ่อยต้องมี source of truth แห่งเดียว README สรุปได้แต่ต้องลิงก์ไปยังบ้านหลัก อ้างด้วยลิงก์แทนการคัดลอกซ้ำ และเก็บรายละเอียดที่อ่านตรงจาก code/config ได้ง่ายไว้ใน code/config

## โครงสร้างโปรเจกต์

npm workspace เดียว ติดตั้งด้วย `npm install` ที่รากครั้งเดียว

- `apps/api/` — CommonJS Express API; `index.js` เป็น entry ที่ mount route เท่านั้น โค้ดจริงอยู่ใน `src/` แบ่งตามความสามารถ
- `apps/web/` — Vue 3 SPA แบ่งเป็นชั้นตาม [ADR-0008](docs/decisions/0008-design-system-tokens-and-ui-kit.md) — views/components เฉพาะธุรกิจเรียกผ่าน `ui/`/`design/` เท่านั้น ไม่เขียนหน้าตาเอง
- `apps/mcp/` — เซิร์ฟเวอร์ MCP แบบ **อ่านอย่างเดียว** เรียกผ่าน HTTP API เดิม ไม่ต่อฐานข้อมูลตรง (ดู [ADR-0011](docs/decisions/0011-read-only-mcp-server.md))
- `packages/domain/` — กฎธุรกิจที่ทั้งสองฝั่งใช้ร่วมกัน (ปีงบ เดือน การแสดงผลภาษาไทย) **ห้ามเขียนซ้ำที่อื่น**
- `database/` — schema สำหรับฐานข้อมูลใหม่, ordered migrations สำหรับฐานข้อมูลเดิม และ seed
- `docs/` — ภาพรวมระบบ คู่มือปฏิบัติการ และ ADR

โฟลเดอร์ใน `apps/api/src/` ตั้งชื่อตามสิ่งที่ระบบทำ ไม่ใช่ตามชนิดของไฟล์ — โค้ดของหนึ่งความสามารถอยู่ด้วยกันหมด

| โฟลเดอร์ | รับผิดชอบ |
|---|---|
| `auth/` | ล็อกอิน และ middleware `require-auth` / `require-admin` / `require-staff` ที่ feature อื่นเรียกใช้ |
| `devices/` | ทะเบียนเครื่องและประวัติการย้าย |
| `print-usage/` | ยอดพิมพ์รายเดือน |
| `expense/` | ค่าใช้จ่ายตามสัญญา |
| `dashboard/` | รายงานรวมและ KPI |
| `contracts/` | สัญญาและราคาต่อหน้า |
| `master-data/` | ข้อมูลอ้างอิง (ยี่ห้อ อาคาร ชั้น ฝ่าย แผนก ปีงบ) |
| `users/` | จัดการผู้ใช้ |
| `import/` | นำเข้าไฟล์ Excel/CSV ทั้งทะเบียนเครื่องและยอดมิเตอร์ |
| `health/` | ตรวจว่าระบบพร้อมรับงาน — เส้นทางเดียวที่ไม่ต้องล็อกอิน |
| `shared/` | เฉพาะของที่ทุก feature ใช้จริง — การเชื่อมฐานข้อมูล ข้อผิดพลาด การตรวจข้อมูล ล็อก และแคช |

เพิ่มความสามารถใหม่ = เพิ่มโฟลเดอร์ใหม่ใน `src/` แล้ว mount ที่ `index.js` ห้ามเพิ่มโฟลเดอร์แบบ `routes/` หรือ `controllers/` กลับมาอีก ถ้าโค้ดถูกใช้แค่ feature เดียว ให้อยู่ในโฟลเดอร์ของ feature นั้น อย่ายัดเข้า `shared/`

**ทุกเส้นทางของ API ต้องใช้ชั้นพื้นฐานใน `src/shared/`** (ดู [ADR-0010](docs/decisions/0010-problem-details-and-api-conventions.md))

| ต้องทำ | ห้ามทำ |
|---|---|
| ห่อ handler ที่เป็น async ด้วย `asyncHandler` | เขียน `try/catch` แล้ว `res.status(500).json({ error: err.message })` เอง |
| โยน `ApiError` (`notFound()`, `badRequest()`, …) | เรียก `res.status(4xx).json()` เองในเส้นทาง |
| ตรวจข้อมูลขาเข้าด้วย `validate({ body, query, params })` | เช็คด้วย `if (!x) return ...` ทีละบรรทัด |
| ใช้ `db.withTransaction()` | เขียน `getConnection` / `beginTransaction` / `rollback` / `release` เอง |
| ตั้ง `Cache-Control` ผ่าน `shared/cache.js` | ปล่อยว่างไว้ |

เหตุผลที่เป็นกฎ ไม่ใช่คำแนะนำ: ข้อความ error ของ MySQL เคยหลุดออกไปถึงเบราว์เซอร์ทั้งชื่อตารางและชื่อคอลัมน์ และรูปแบบคำตอบที่ต่างกันสามแบบทำให้ฝั่งเว็บต้องเดาว่าจะอ่านช่องไหน

**ข้อจำกัดของ `apps/mcp/` ห้ามผ่อน** — ห้ามเพิ่มเครื่องมือที่เขียนข้อมูลเด็ดขาด ข้อมูลขาเข้าของเครื่องมือ MCP มาจากโมเดลภาษา ไม่ใช่จากผู้ใช้โดยตรง ถ้าจำเป็นต้องเปลี่ยนจริงๆ ต้องแก้ [ADR-0011](docs/decisions/0011-read-only-mcp-server.md) พร้อมเหตุผลก่อน — มีเทสบังคับข้อนี้ไว้แล้วใน `apps/mcp/test/tools.test.js`

โฟลเดอร์ใน `apps/web/src/` ก็ตั้งชื่อตามบทบาท ไม่ใช่ตามชนิดของไฟล์ เช่นเดียวกับฝั่ง API

| โฟลเดอร์ | บทบาท | กฎ |
|---|---|---|
| `design/` | token สี ตัวอักษร ระยะ เงา และจังหวะการเคลื่อนไหว — สามระดับ primitive → semantic → utility | CSS ล้วน ห้ามมี JavaScript |
| `ui/` | component พื้นฐานที่ไม่รู้จักเรื่องธุรกิจ (ปุ่ม, ตาราง, หน้าต่างซ้อน, ช่องเลือก) | ห้ามมีคำว่าเครื่องพิมพ์/ปีงบ/แผนก และห้ามเรียก API |
| `app/` | เปลือกของแอป — แถบเมนู แถบบน ช่องค้นหาคำสั่ง | รู้เรื่องเส้นทางและสิทธิ์ได้ |
| `api/` | ชั้นดึงข้อมูลกลางผ่าน TanStack Query (`queries.js`) | ดู [ADR-0009](docs/decisions/0009-tanstack-query-as-the-data-layer.md) — เฉพาะข้อมูลอ่านซ้ำข้ามหน้า การเขียนยังยิง axios ตรง |
| `lib/` | ฟังก์ชันช่วยทั่วไปที่ไม่ผูกกับ component ไหน (จัดรูปแบบตัวเลข, แปล error ของ API) | ห้ามเรียก API ตรง |
| `views/`, `components/` | หน้าจอและชิ้นส่วนเฉพาะธุรกิจ | เรียกใช้ `ui/`/`design/` เท่านั้น |

**ห้ามเขียนคลาสสีของ Tailwind ตรงๆ ในหน้าจอ** (`bg-gray-50`, `text-blue-600`) — ใช้ชื่อเชิงหน้าที่แทนเสมอ (`bg-surface`, `text-brand-ink`) ถ้าไม่มีชื่อที่ต้องการแปลว่าต้องเพิ่ม semantic token ใหม่ใน `design/tokens.css` ไม่ใช่หยิบสีดิบมาใช้ (ดู [ADR-0008](docs/decisions/0008-design-system-tokens-and-ui-kit.md))

ใช้ indentation 2 spaces Backend ใช้ CommonJS และ semicolon ส่วน Frontend ใช้ ES modules, Vue `<script setup>` และ Tailwind classes ตั้งชื่อ Vue component แบบ PascalCase และ JavaScript identifier แบบ camelCase โดยยึดรูปแบบไฟล์ข้างเคียง

## การตั้งชื่อไฟล์และโฟลเดอร์

- **ASCII เท่านั้น** ห้ามใช้อักษรไทยหรืออักขระนอก ASCII ในชื่อไฟล์ — macOS เก็บชื่อแบบ NFD ส่วน Linux/Windows ใช้ NFC ทำให้ชื่อเดียวกันกลายเป็นคนละ byte sequence และบางเครื่องมือจะ escape เป็นข้อความอ่านไม่ออก (repo นี้เคยมีไฟล์ Excel ถูก track ซ้ำสองชื่อชี้ blob เดียวกันมาแล้ว)
- **kebab-case ตัวพิมพ์เล็ก** สำหรับไฟล์และโฟลเดอร์ทั่วไป — `meter-import-source.xlsx`, `print-usage/`
- ยกเว้น Vue component ใช้ PascalCase (`MonthPicker.vue`) และไฟล์รากที่มีธรรมเนียมสากล ใช้ตัวพิมพ์ใหญ่ (`README.md`, `AGENTS.md`, `CHANGELOG.md`)
- **ห้ามใช้ช่องว่างในชื่อไฟล์** และห้ามตั้งชื่อที่ต่างกันแค่ตัวพิมพ์เล็กใหญ่ เพราะ Windows/macOS จะมองเป็นไฟล์เดียวกันแล้วทับกันเงียบๆ ตอน checkout
- ชื่อต้องบอกบทบาท ไม่ใช่สถานะ — `meter-import-source.xlsx` ไม่ใช่ `final_v2.xlsx`
- เปลี่ยนชื่อด้วย `git mv` เสมอ เพื่อให้ git บันทึกเป็น rename และ `git log --follow` ตามประวัติต่อได้

## Workflow

ลำดับการทำงานเต็ม ชื่อ branch รูปแบบ commit และข้อกำหนดของ PR อยู่ใน `CONTRIBUTING.md` — ส่วนที่ต้องยึดทุกครั้ง:

1. ตรวจ branch และ `git status` ก่อนแก้ไฟล์ ถ้าอยู่บน `main` ให้หยุดและแจ้งผู้ใช้
2. อ่าน source ที่เกี่ยวข้อง วิเคราะห์ และเสนอแผนก่อนแก้
3. ทำเฉพาะ Issue scope และรักษาการเปลี่ยนแปลงเดิมของผู้ใช้
4. ตรวจ `git diff` และรัน checks ที่สัมพันธ์กับความเสี่ยงก่อนส่งมอบ
5. สรุปไฟล์ที่เปลี่ยน ผลตรวจ และความเสี่ยงที่เหลือ

**commit ที่ย้ายไฟล์ ห้ามเปลี่ยนพฤติกรรมไปด้วย** แยกเป็นคนละ commit เสมอ ไม่งั้น review และ bisect ไม่ได้จริง

ต้องได้รับคำสั่งชัดเจนก่อน commit, push, merge, delete branch, deploy หรือเปลี่ยน production และต้องขออนุมัติก่อนเปลี่ยน schema/migration, auth/security, secrets หรือทำ destructive operation

การตัดสินใจที่ย้อนกลับยากต้องเขียน ADR ไว้ใน `docs/decisions/` ตอนที่ตัดสิน ไม่ใช่ตอนสรุปทีหลัง

สำหรับ review request ให้ review เท่านั้น แก้ไฟล์เมื่อผู้ใช้ร้องขอโดยตรง

## การตรวจสอบ

- เลือก checks ตาม `docs/how-to/verify-changes.md` ให้สัมพันธ์กับความเสี่ยงของ diff
- Backend change ต้องตรวจ health check และ authenticated API flow ที่ได้รับผลกระทบ
- Database change ต้องทดสอบ fresh schema และ migration path ที่เกี่ยวข้อง โดยเฉพาะขอบเขตปีงบ ต.ค.–ก.ย.
- Automated tests ใหม่ให้อยู่ใกล้ module เป้าหมายและใช้ชื่อ `*.test.js` หรือ `*.spec.js`

รายงานสิ่งที่ไม่ได้ทดสอบทุกครั้ง

## ความปลอดภัย

เก็บ MySQL credentials และ `JWT_SECRET` ใน environment variables ใช้ secret ที่แข็งแรง ตรวจ CSV/XLSX ก่อน import และถือว่า migration เป็นการเปลี่ยนแปลงแบบมีลำดับที่ต้อง review

## Agent skills

### Issue tracker

Issue ของ repo นี้อยู่ใน GitHub Issues (`saritrungj/suth-helpdesk-assets`) ใช้ `gh` CLI ดู `docs/agents/issue-tracker.md`

### Triage labels

ใช้ชุดคำมาตรฐาน 5 บทบาท (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) ตรงตัวกับชื่อ label จริงบน GitHub ดู `docs/agents/triage-labels.md`

### Domain docs

Single-context — ADR อยู่ที่ `docs/decisions/` (ไม่ใช่ `docs/adr/`) ยังไม่มี `CONTEXT.md` ดู `docs/agents/domain.md`
