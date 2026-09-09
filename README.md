# SUTH Helpdesk Assets

ระบบเว็บภายในสำหรับบริหารทรัพย์สิน IT ของโรงพยาบาล โดยเน้นทะเบียนเครื่องพิมพ์ สัญญา ยอดพิมพ์รายเดือน และค่าใช้จ่ายตามปีงบประมาณ

## สถานะโปรเจกต์

อยู่ระหว่างพัฒนา ยังไม่ออกเวอร์ชันอย่างเป็นทางการ (`version` ยังเป็น `0.0.0`) และยังไม่ได้ deploy ขึ้นใช้งานจริงกับข้อมูลผู้ป่วย/ข้อมูลจริงของหน่วยงาน

- ความสามารถหลักทำงานครบตั้งแต่ทะเบียนเครื่อง การนำเข้ายอดพิมพ์ จนถึง Dashboard และรายงาน
- หน้าตาทั้งระบบผ่าน design system กลางแล้ว รองรับโหมดสว่าง/มืด และสลับภาษาไทย/อังกฤษได้
- มีชุดเทสอัตโนมัติของ `packages/domain`, `apps/api`, `apps/web` และเทส E2E ผ่านเบราว์เซอร์จริง แต่ยังไม่มีเทสระดับ route ที่ต่อฐานข้อมูลจริง
- สิ่งที่เปลี่ยนล่าสุดและผู้ใช้สังเกตเห็นได้ อยู่ใน [CHANGELOG](CHANGELOG.md) หัวข้อ `Unreleased`
- ก่อนใช้ข้อมูลจริง ต้องผ่าน [checklist เตรียมขึ้น production](docs/how-to/prepare-for-production.md) ก่อน

## ความสามารถหลัก

- จัดการทะเบียนอุปกรณ์ ตำแหน่ง หน่วยงาน สถานะ และประวัติการย้าย
- จัดการข้อมูลอ้างอิง สัญญา และปีงบประมาณ
- บันทึกหรือนำเข้ายอดพิมพ์รายเดือนจาก CSV/Excel
- แสดง Dashboard ค่าใช้จ่าย รายงานตามอาคาร/ฝ่าย/แผนก และการเปรียบเทียบรายเดือน
- ติดตามความครบถ้วนของยอดรายเดือนและงานค้าง พร้อมส่งออก Excel ที่มีแผ่นบริบท (เวลาออกรายงานและตัวกรองที่ใช้) ดู [วิธีตรวจยอดและติดตามงาน](docs/how-to/use-report-workflow.md)
- สลับภาษาไทย/อังกฤษจากเมนูบัญชี โดยชื่อข้อมูลและสกุลเงิน THB คงเดิม ดู [ADR-0013](docs/decisions/0013-localized-reporting.md)
- ควบคุมการเข้าถึงด้วย JWT ที่ส่งผ่าน cookie แบบ httpOnly (ดู [ADR-0006](docs/decisions/0006-session-cookie-instead-of-localstorage.md)) และบทบาท `admin`, `staff`, `viewer`

## เทคโนโลยี

- Backend: Node.js (CommonJS), Express และ MySQL — ข้อผิดพลาดตามมาตรฐาน Problem Details (RFC 9457) และตรวจข้อมูลขาเข้าด้วย zod ทุกเส้นทาง (ดู [ADR-0010](docs/decisions/0010-problem-details-and-api-conventions.md))
- Frontend: Vue 3, Vite, Tailwind CSS v4, TanStack Query และ Chart.js — หน้าตาทั้งระบบผ่าน design system กลาง (token + Reka UI + lucide-vue-next) ดู [ADR-0008](docs/decisions/0008-design-system-tokens-and-ui-kit.md) และ [ADR-0009](docs/decisions/0009-tanstack-query-as-the-data-layer.md)
- Database: MySQL schema, ordered migrations และข้อมูลจำลอง

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

เทส E2E ผ่านเบราว์เซอร์จริง (ต้องมี API, เว็บ และฐานข้อมูลรันอยู่ก่อน):

```powershell
npm run test:e2e --workspace @suth/web
```

เลือก build, health check และ smoke test ตามสิ่งที่แก้ ดู [คู่มือตรวจการเปลี่ยนแปลง](docs/how-to/verify-changes.md)

## เอกสาร

- [สารบัญเอกสารทั้งหมด](docs/README.md) — แบ่งตาม Diátaxis: เข้าใจ / ทำ / เปิดหา / การตัดสินใจ
- [กฎธุรกิจและโดเมน](docs/explanation/domain.md) — ปีงบประมาณ การคิดค่าใช้จ่าย ประวัติการย้ายเครื่อง
- [สถาปัตยกรรม](docs/explanation/architecture.md) — โครงสร้างระบบและโค้ด
- [บันทึกการตัดสินใจ (ADR)](docs/decisions/) — ทำไมถึงเลือกแบบนั้น
- [แนวทางสำหรับ AI agent](AGENTS.md) และ [ข้อตกลงการทำงานของทีม](CONTRIBUTING.md)

เอกสารชุดนี้มุ่งสำหรับนักพัฒนาและ AI agent ยังไม่ใช่คู่มือสำหรับผู้ใช้งานหน้าเว็บ

## ความปลอดภัย

ก่อนใช้ข้อมูลจริงหรือ deploy ให้อ่าน [checklist เตรียมขึ้น production](docs/how-to/prepare-for-production.md)
