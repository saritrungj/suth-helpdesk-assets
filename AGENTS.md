# Repository Guidelines

ระบบ Hospital IT asset management — Express/MySQL API, Vue/Vite client, SQL scripts, เอกสารปฏิบัติการ เริ่มที่ `docs/README.md` (บอกว่าหาอะไรที่ไหน)

## อ่านก่อนแก้ (trigger → ไฟล์)

- เขียนโค้ดใน `apps/api` หรือ `apps/web` → [`docs/reference/coding-standards.md`](docs/reference/coding-standards.md) (รูปแบบ ชั้นพื้นฐาน API บทบาทโฟลเดอร์เว็บ ห้ามใช้สี Tailwind ดิบ ชื่อไฟล์)
- feature, domain rule, report, role → `docs/explanation/domain.md`
- โครงสร้างโค้ดหรือ API boundary → `docs/explanation/architecture.md`
- environment, schema, migration, seed, import → `docs/how-to/`
- หาชื่อคอลัมน์ endpoint ตัวแปร → `docs/reference/`
- **ตรรกะปีงบ เดือน หรือการคิดเงิน → `docs/decisions/` ก่อนเสมอ** — กฎเหล่านี้เคยพังมาแล้ว เหตุผลอยู่ใน ADR (ADR อยู่ที่ `docs/decisions/` ไม่ใช่ `docs/adr/`; คำศัพท์โดเมนอยู่ `CONTEXT.md`)
- ข้อตกลงทีม (branch, PR, อนุมัติ, worktree หลาย session) → `CONTRIBUTING.md`

README สรุปได้แต่ต้องลิงก์ไปบ้านหลัก — source of truth แห่งเดียว อ้างด้วยลิงก์ ไม่คัดลอกซ้ำ

## โครงสร้าง

npm workspace เดียว (`npm install` ที่รากครั้งเดียว): `apps/api/` (CommonJS Express), `apps/web/` (Vue 3 SPA), `packages/domain/`, `database/`, `docs/`

- `packages/domain/` คือกฎธุรกิจที่สองฝั่งใช้ร่วมกัน (ปีงบ เดือน การแสดงผลภาษาไทย) **ห้ามเขียนซ้ำที่อื่น**
- API: ความสามารถใหม่ = โฟลเดอร์ใหม่ใน `apps/api/src/` mount ที่ `index.js`; ทุกเส้นทางต้องใช้ชั้นใน `src/shared/` (`asyncHandler`, `ApiError`, `validate`, `db.withTransaction`, `cache`) — ดู coding-standards
- Web: views/components เรียกผ่าน `ui/`/`design/` เท่านั้น ([ADR-0008](docs/decisions/0008-design-system-tokens-and-ui-kit.md))

## Guardrails

- **ห้ามเปิดทางเข้าที่สองเข้าฐานข้อมูล** — อ่านเขียนต้องผ่าน HTTP API เดิม เพราะกฎสิทธิ์ ("viewer แก้ไม่ได้") อยู่ในชั้น API ต่อ MySQL ตรงแปลว่าเขียนกฎซ้ำแล้วรอวันไม่ตรง ([ADR-0012](docs/decisions/0012-remove-mcp-server.md) ถอด `apps/mcp/`) ข้อยกเว้นเดียว: harness ฐาน QA ตรวจตัวตน sentinel/หมุนรหัสตอน bootstrap ([ADR-0016](docs/decisions/0016-isolated-qa-database-and-bootstrap-harness.md)) และ `npm run db:bootstrap` ของฐาน Docker ตั้งรหัสบัญชีเท่านั้น ([ADR-0024](docs/decisions/0024-docker-development-database.md)) — ข้อมูลธุรกิจยังต้องผ่าน API
- **เครื่องมือที่ให้ AI เรียกได้ (MCP ฯลฯ) ต้องอ่านอย่างเดียว ห้ามมีเครื่องมือเขียนข้อมูล** — ข้อมูลขาเข้ามาจากโมเดลภาษา ไม่ใช่ผู้ใช้ที่กดยืนยัน ข้อความในไฟล์ที่โมเดลอ่านเจอจึงกลายเป็นคำสั่งแก้ข้อมูลได้ ([NSA/CISA — MCP Security Design](https://media.defense.gov/2026/Jun/02/2003943289/-1/-1/0/CSI_MCP_SECURITY.PDF)) ยอดพิมพ์คือฐานของทุกบาท การบันทึกต้องผ่านหน้าเว็บที่คนกดยืนยัน — จะผ่อนต้องแก้ ADR-0012 พร้อมเหตุผลก่อน
- เก็บ MySQL credentials และ `JWT_SECRET` ใน environment variables ตรวจ CSV/XLSX ก่อน import migration คือการเปลี่ยนแปลงแบบมีลำดับที่ต้อง review
- การตัดสินใจที่ย้อนกลับยากต้องเขียน ADR ใน `docs/decisions/` ตอนที่ตัดสิน

## Workflow

ลำดับเต็ม ชื่อ branch รูปแบบ commit และ PR อยู่ใน `CONTRIBUTING.md` — ที่ต้องยึดทุกครั้ง:

1. ตรวจ branch และ `git status` ก่อนแก้ — **ห้ามแก้บน `main`** สั่ง implementation + อยู่บน `main` + working tree สะอาด → สร้าง/ผูก Issue และ branch ได้ทันทีโดยไม่ถามซ้ำ; อยู่บน branch อื่นใช้ต่อเฉพาะเมื่อผูกกับงานนี้ชัดเจน; มีงานค้างหรือเป้าหมายไม่ชัด → หยุดเพื่อรักษางานเดิม
2. อ่าน source เสนอแผนก่อนแก้ ทำเฉพาะ Issue scope รักษาการเปลี่ยนแปลงเดิมของผู้ใช้
3. **มี session อื่นใน repo → สร้าง branch ใน git worktree ของตัวเองเสมอ** ห้าม `checkout`/`switch` ในโฟลเดอร์ที่อีก session ใช้ (จะสลับ branch ของเขากลางงาน) — [ขั้นตอนและพอร์ตที่ใช้ร่วม](CONTRIBUTING.md#ทำงานหลาย-session-พร้อมกัน)
4. **commit ที่ย้ายไฟล์ ห้ามเปลี่ยนพฤติกรรมไปด้วย** — แยกคนละ commit ไม่งั้น review/bisect ไม่ได้
5. commit, push, merge, ลบ branch ต้องมีคำสั่งชัดเจน ยกเว้นสั่ง **ปิดงาน / finish end-to-end** ([Authority สำหรับ Git lifecycle](CONTRIBUTING.md#authority-สำหรับ-git-lifecycle); ข้อจำกัดล่าสุดของผู้ใช้ชนะเสมอ) ใช้ [finish-issue](.agents/skills/finish-issue/SKILL.md) เดินงานต่อเนื่อง หยุดเฉพาะครบเกณฑ์หรือมี blocker
6. review request = review เท่านั้น แก้ไฟล์เมื่อสั่งตรงๆ

## การตรวจสอบ

เลือก checks ตาม `docs/how-to/verify-changes.md` ให้สัมพันธ์กับความเสี่ยงของ diff

- Backend → health check + authenticated API flow ที่ได้รับผลกระทบ
- Database → fresh schema + migration path ที่เกี่ยวข้อง โดยเฉพาะขอบเขตปีงบ ต.ค.–ก.ย.
- tests ใหม่อยู่ใกล้ module เป้าหมาย ชื่อ `*.test.js` / `*.spec.js`
- **รายงานสิ่งที่ไม่ได้ทดสอบทุกครั้ง**

## Agent docs

- Issue tracker: GitHub Issues (`saritrungj/suth-helpdesk-assets`) ผ่าน `gh` — `docs/agents/issue-tracker.md`; label: `docs/agents/triage-labels.md`; domain docs: `docs/agents/domain.md`
- แก้บั๊ก รีวิว diff หรือเตรียมส่งมอบ → [`docs/agents/review-workflow.md`](docs/agents/review-workflow.md) (reproduction แดงก่อน, ตรวจสามมิติ, ปิดทุก finding ด้วยหลักฐาน)
- subagent สำหรับรันชุดตรวจ/รีวิว security และกฎโดเมน (session หลักเป็นผู้เขียนโค้ดคนเดียว) → [`docs/agents/subagents.md`](docs/agents/subagents.md)
