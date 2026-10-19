# SUTH Helpdesk Assets

ระบบเว็บภายในสำหรับบริหารทรัพย์สิน IT ของโรงพยาบาล โดยเน้นทะเบียนเครื่องพิมพ์ สัญญา ยอดพิมพ์รายเดือน และค่าใช้จ่ายตามปีงบประมาณ

รันแอปเป็น Docker images ได้ตาม [คู่มือ Docker Compose](docs/how-to/deploy-docker-compose.md); การส่งขึ้นเครื่องจริงใช้ [คู่มือ deploy บน server](docs/how-to/deploy-server.md) และกระบวนการอนุมัติเดิม

## สถานะโปรเจกต์

อ่าน [สถานะการติดตั้งและความพร้อมล่าสุด](docs/reference/deployment.md) สำหรับรุ่นที่ deploy วันที่ตรวจ หลักฐานที่ผ่านแล้ว และข้อที่ยังไม่ยืนยัน เอกสารหน้านั้นเป็นแหล่งอ้างอิงหลักของสถานะการใช้งานจริง ส่วนลำดับงานและเกณฑ์ปิดติดตามใน [#304](https://github.com/saritrungj/suth-helpdesk-assets/issues/304)

สิ่งที่เปลี่ยนและผู้ใช้สังเกตเห็นได้อยู่ใน [CHANGELOG](CHANGELOG.md) หัวข้อ `Unreleased` ผลเทสอัตโนมัติและ health check ต้องพิจารณาร่วมกับการตรวจเส้นทางผู้ใช้หลัง deploy ตาม [คู่มือส่งรุ่นและกู้คืน](docs/how-to/release-and-recovery.md)

## ความสามารถหลัก

- จัดการทะเบียนอุปกรณ์ ตำแหน่ง หน่วยงาน สถานะ และประวัติการย้าย
- จัดการข้อมูลอ้างอิง สัญญา และปีงบประมาณ
- บันทึกหรือนำเข้ายอดพิมพ์รายเดือนจาก CSV/Excel
- หน้าภาพรวมการพิมพ์หน้าเดียวที่กรองตามปีงบ ช่วงเวลา ฝ่าย แผนก สัญญา อาคาร และเครื่อง แล้วเปรียบเทียบ เจาะรายละเอียด และส่งออกจากข้อมูลชุดเดียวกัน ดู [ADR-0020](docs/decisions/0020-single-scope-dashboard.md)
- ติดตามความครบถ้วนของยอดรายเดือนและงานค้าง พร้อมส่งออก Excel ที่มีแผ่นบริบท (เวลาออกรายงานและตัวกรองที่ใช้) ดู [วิธีตรวจยอดและติดตามงาน](docs/how-to/use-report-workflow.md)
- สลับภาษาไทย/อังกฤษจากเมนูบัญชี โดยชื่อข้อมูลและสกุลเงิน THB คงเดิม ดู [ADR-0013](docs/decisions/0013-localized-reporting.md)
- ควบคุมการเข้าถึงด้วย JWT ที่ส่งผ่าน cookie แบบ httpOnly (ดู [ADR-0006](docs/decisions/0006-session-cookie-instead-of-localstorage.md)) และบทบาท `admin`, `staff`, `viewer`

## เทคโนโลยี

- Backend: Node.js (CommonJS), Express และ MySQL — ข้อผิดพลาดตามมาตรฐาน Problem Details (RFC 9457) และตรวจข้อมูลขาเข้าด้วย zod ทุกเส้นทาง (ดู [ADR-0010](docs/decisions/0010-problem-details-and-api-conventions.md))
- Frontend: Vue 3, Vite, Tailwind CSS v4, TanStack Query และ Lightweight Charts (TradingView) — หน้าตาทั้งระบบผ่าน design system กลาง (token + Reka UI + lucide-vue-next) ดู [ADR-0008](docs/decisions/0008-design-system-tokens-and-ui-kit.md) และ [ADR-0009](docs/decisions/0009-tanstack-query-as-the-data-layer.md)
- Database: MySQL 8.4 บน Docker ([ฐานข้อมูลบน Docker](docs/how-to/run-docker-database.md)) — schema, ordered migrations ส่วนข้อมูลจำลองมีเฉพาะในชุดทดสอบที่สร้างฐานชั่วคราว

## โครงสร้าง repository

เป็น npm workspace ตัวเดียวครอบทุก package (ดู [ADR-0004](docs/decisions/0004-workspace-and-feature-folders.md))

| โฟลเดอร์ | คืออะไร |
|---|---|
| `apps/api` | REST API แบ่งโฟลเดอร์ตามความสามารถ (auth, devices, print-usage, expense, dashboard, import, …) |
| `apps/web` | เว็บ Vue 3 — `ui/` และ `design/` คือ design system, `views/` คือหน้าจริง |
| `packages/domain` | กฎธุรกิจที่ API และเว็บใช้ร่วมกัน — ปีงบ เดือน พ.ศ./ค.ศ. การคิดเงินเป็นสตางค์ และรูปแบบตามภาษา |
| `database` | schema, migration ตามลำดับ และข้อมูลตัวอย่าง |
| `docs` | เอกสารทั้งหมด แบ่งตาม Diátaxis |

## เริ่มต้นใช้งานสำหรับการพัฒนา

ต้องมี Node.js 20 ขึ้นไป, npm และ MySQL ก่อนเริ่มต้น เตรียม environment และฐานข้อมูลตาม [คู่มือตั้งระบบ](docs/how-to/set-up-development.md) ก่อนเปิดแอป

ติดตั้ง dependency ครั้งเดียวที่รากของ repository:

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

ตรวจว่า API พร้อมใช้งานจริง (ตรวจการเชื่อมต่อฐานข้อมูลด้วย):

```powershell
curl http://localhost:3000/api/health
```

ต่อฐานข้อมูลไม่ได้ API จะ **ไม่เปิดเลย** พร้อมบอกเหตุผลใน terminal — ตั้งใจให้ล้มแบบเห็นชัดตั้งแต่ตอนบูต ดีกว่าเปิดขึ้นมาแล้วทุกคำขอพังทีละอันโดยไม่มีใครสังเกต

## ตรวจสอบการเปลี่ยนแปลง

รันเทสของทุก workspace:

```powershell
npm test
```

ตรวจเอกสาร เทสทุก workspace, build, bundle budget และ E2E แบบ fixture ที่ไม่ใช้ฐานข้อมูล:

```powershell
npm run verify
```

ตรวจ flow ที่อ่านเขียนฐานข้อมูลด้วยฐาน QA แยก (ต้องมี Docker):

```powershell
npm run verify:db
```

เลือกชุดตรวจให้สัมพันธ์กับสิ่งที่แก้ และรายงานเคสที่ข้ามหรือไม่ได้ตรวจ ดู [คู่มือตรวจการเปลี่ยนแปลง](docs/how-to/verify-changes.md) การทดสอบที่เขียนข้อมูลให้ใช้ QA แยกตามคู่มือ

## เอกสาร

- [สารบัญเอกสารทั้งหมด](docs/README.md) — แบ่งตาม Diátaxis: เข้าใจ / ทำ / เปิดหา / การตัดสินใจ
- [กฎธุรกิจและโดเมน](docs/explanation/domain.md) — ปีงบประมาณ การคิดค่าใช้จ่าย ประวัติการย้ายเครื่อง
- [สถาปัตยกรรม](docs/explanation/architecture.md) — โครงสร้างระบบและโค้ด
- [สถานะการติดตั้ง](docs/reference/deployment.md) — รุ่นที่ใช้งาน หลักฐานตรวจ และงานความพร้อมที่ค้าง
- [บันทึกการตัดสินใจ (ADR)](docs/decisions/) — ทำไมถึงเลือกแบบนั้น
- [แนวทางสำหรับ AI agent](AGENTS.md) และ [ข้อตกลงการทำงานของทีม](CONTRIBUTING.md)

เอกสารส่วนใหญ่ในชุดนี้มุ่งสำหรับนักพัฒนาและ AI agent ผู้ใช้งานหน้าเว็บอ่าน [คู่มือผู้ใช้](docs/user-guide/README.md) ซึ่งครอบคลุมการบันทึกจำนวนพิมพ์รายเดือนและการนำเข้าไฟล์จากผู้ให้เช่า

## ความปลอดภัย

ก่อน deploy, migration หรือ operation ที่กระทบข้อมูลจริง ให้อ่าน [checklist เตรียมขึ้น production](docs/how-to/prepare-for-production.md), [คู่มือส่งรุ่นและกู้คืน](docs/how-to/release-and-recovery.md) และขอบเขตการอนุมัติใน [CONTRIBUTING](CONTRIBUTING.md) เก็บ secret ใน environment และอย่าเผยแพร่ข้อมูลผู้ใช้หรือรายละเอียดระบบภายในลง Issue/PR
