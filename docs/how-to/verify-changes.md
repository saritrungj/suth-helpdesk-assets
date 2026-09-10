# ตรวจการเปลี่ยนแปลงก่อนส่งมอบ

เลือก check ให้สัมพันธ์กับความเสี่ยงของสิ่งที่แก้ ไม่ต้องรันทุกข้อทุกครั้ง แต่ต้อง **รายงานสิ่งที่ไม่ได้ทดสอบ** เสมอ

## Automated test

```powershell
npm test
```

รันเทสของทุก workspace

| workspace | ครอบคลุม | ตัวรัน |
|---|---|---|
| `packages/domain` | ปีงบ เดือน พ.ศ./ค.ศ. การแสดงผลไทย และการคิดเงินเป็นสตางค์ | `node:test` |
| `apps/api` | requireAuth, ความปลอดภัยของ cookie, Problem Details, validate ที่ปากทาง และ shared helpers | `node:test` |
| `apps/web` | store ของ session, ชั้นดึงข้อมูล TanStack Query, navigation และ component เฉพาะจุดที่เสี่ยง เช่น race ของ `MonthEntryGrid` | `vitest` + Vue Test Utils |

ยังไม่มีเทสระดับ route ของ `apps/api` ที่ต่อฐานข้อมูลจริง ส่วนฝั่ง Vue มี component tests เฉพาะพฤติกรรมที่เสี่ยง ไม่ได้ครอบทุก component; พฤติกรรมข้าม component ตรวจด้วย E2E ผ่านเบราว์เซอร์จริงด้านล่าง

## Build ฝั่งเว็บ

```powershell
npm run build
```

## Health check ฝั่ง API

```text
GET http://localhost:3000/api/health
```

ต้องได้ `200` พร้อม JSON กลับมา — ถ้าต่อฐานข้อมูลไม่ได้จะตอบ `503` แทน (ดู [ADR-0010](../decisions/0010-problem-details-and-api-conventions.md))

## E2E ฝั่งเว็บ (Playwright)

```powershell
npm run test:e2e --workspace @suth/web
```

ตรวจเส้นทางการทำงานจริงบนเบราว์เซอร์ — กรอกข้อมูลแล้วบันทึก, คำเตือนออกจากหน้าทั้งที่ยังไม่บันทึก, การวางตัวเลขจากตารางคำนวณ, คีย์บอร์ดและ contrast ตามเกณฑ์ WCAG AA ทั้งสองธีม (`apps/web/e2e/wcag.spec.js`, `login-wcag.spec.js`)

ต้องมีทั้ง API (พอร์ต 3000) และเว็บ (5173) รันอยู่พร้อมฐานข้อมูลจริงก่อน — ถ้าต่อไม่ได้เทสจะ **ข้ามทั้งชุด** ไม่ใช่ล้มเหลว เทสกลุ่มที่เขียนข้อมูลลงฐาน (เช่น `month-entry.spec.js`) คืนค่าเดิมกลับเองทุกครั้งในขั้นตอนสุดท้าย (ดู `apps/web/e2e/fixtures.js`)

ถ้าแก้สี ธีม หรือ layout ของหน้าที่มีอยู่แล้ว ถ่ายภาพหน้าจอไว้เทียบก่อน/หลังด้วย `npm run test:e2e:shots --workspace @suth/web` (ภาพออกที่ `apps/web/e2e/screens/` — ไม่ commit เพราะสร้างใหม่ได้ทุกครั้ง ดู `.gitignore`)

## Smoke test ตามสิ่งที่แก้

| ถ้าแก้… | ต้องตรวจ |
|---|---|
| auth หรือสิทธิ์ | ล็อกอิน และทุก role ที่ได้รับผลกระทบ รวมถึงเรียก API โดยไม่มี token ต้องได้ 401 |
| API ใดๆ | เส้นที่แก้ ทั้งอ่านและเขียน และรูปแบบ error ต้องเป็น Problem Details |
| ตรรกะปีงบหรือเดือน | ขอบปีงบ ก.ย. → ต.ค. และบันทึกเดือนทั้งแบบ พ.ศ. และ ค.ศ. แล้วตรวจว่าฐานข้อมูลเก็บเป็น ค.ศ. |
| การคิดเงิน | ยอดสุทธิหลังหัก 20% และลำดับราคา `price_override` → `contracts` → `0` |
| รายงานย้อนหลัง | เครื่องที่เคยย้ายสถานที่หรือหน่วยงาน ยอดเดือนเก่าต้องอยู่กับหน่วยงานเดิม |
| schema หรือ migration | ติดตั้งใหม่จาก `schema.sql` และ migration path ที่เปลี่ยน |
| importer | แถวที่สำเร็จ แถวที่ถูกปฏิเสธ และการนำเข้าซ้ำ |
| หน้าเว็บที่ดึงข้อมูลอ้างอิงซ้ำ (อาคาร, แผนก, ฝ่าย, ยี่ห้อ, สัญญา) | เปิดหน้าที่เกี่ยวข้องสลับกันแล้วดูใน DevTools Network ว่าไม่ยิงซ้ำภายใน `staleTime` ของ [ADR-0009](../decisions/0009-tanstack-query-as-the-data-layer.md) |
| UI, สี, หรือ component ใน `apps/web/src/ui` | รัน E2E ด้านบน ทั้งสองธีม (สว่าง/มืด) และตรวจ contrast ผ่านเกณฑ์ AA |

## ด่านก่อน push บนเครื่อง

```powershell
git config core.hooksPath .githooks   # ครั้งเดียวต่อ clone
```

จากนั้นทุก `git push` จะรัน `npm run verify` (unit ทุก workspace → build → E2E สามไฟล์
ที่ไม่ต้องใช้ฐานข้อมูล) และตรวจช่องว่างท้ายบรรทัดให้ก่อน ใช้เวลาราวสองนาที
ข้ามได้ด้วย `git push --no-verify` หรือ `SKIP_VERIFY=1` เมื่อจำเป็นจริงเท่านั้น

hook นี้เป็นคำสั่งชุดเดียวกับที่ CI รัน จึงไม่มีทางเพี้ยนจากกัน และตั้งใจไม่รันชุดที่ต้องมี
API/ฐานข้อมูล เพราะ push ที่ล้มเพราะเครื่องไม่ได้เปิด MySQL ไม่ได้บอกอะไรเกี่ยวกับโค้ด

## CI ทำอะไรให้บ้าง

> **ตอนนี้ Actions ยังรันไม่ได้** บัญชี GitHub ถูกล็อกจากปัญหาบิล งานจึงถูกปฏิเสธตั้งแต่ยัง
> ไม่เริ่ม ด่านที่ทำงานจริงอยู่ตอนนี้คือ hook ด้านบน เมื่อบิลปลดแล้วส่วนนี้จะทำงานเองทันที
> โดยไม่ต้องแก้อะไร

ทุก PR และทุก push เข้า `main` GitHub Actions (`.github/workflows/ci.yml`) รัน `npm test`
ทุก workspace, `npm run build`, ตรวจช่องว่างท้ายบรรทัดของสิ่งที่เปลี่ยน และรัน E2E สามไฟล์
ที่ไม่ต้องใช้ API หรือฐานข้อมูล (`asset-drawer`, `asset-evidence`, `contrast-helper`)
เพราะ fixture ของมัน intercept `/api/*` ทั้งหมด — ชุดที่ต้องมีฐานจริงยังเป็นงานที่ต้องรันเอง

เว็บใน CI ถูกสตาร์ตจาก **build จริงแล้ว preview** ผ่าน `webServer` ใน `playwright.config.js`
ไม่ใช่ dev server เพราะสิ่งที่ต้องทดสอบคือ bundle ที่จะถูกส่งมอบ ตอนรันบนเครื่อง
`reuseExistingServer` ทำให้ Playwright ใช้ server ที่คุณเปิดค้างไว้เหมือนเดิม ไม่มีขั้นตอนใหม่

ผลที่ล้มดูได้จาก artifact `playwright-report` ของ run นั้น เก็บไว้ 14 วัน เปิดด้วย
`npx playwright show-report <โฟลเดอร์ที่แตกไฟล์>` — CI เขียวไม่ได้แปลว่าตรวจครบ
รายการที่ CI ยังไม่ครอบอยู่ในหัวข้อด้านบนทั้งหมด

## ก่อนเปิด PR

ตรวจ `git diff` ทั้งหมดด้วยตาอีกรอบ และแยกให้ชัดว่า commit ไหนย้ายไฟล์ commit ไหนเปลี่ยนพฤติกรรม — diff ที่ปนกันสองอย่าง review ไม่ได้จริง
