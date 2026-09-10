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

ต้องมีทั้ง API (พอร์ต 3000) และเว็บ (5173) รันอยู่พร้อมฐานข้อมูลจริงก่อน — ถ้าต่อไม่ได้เทสจะ **ข้ามทั้งชุด** ไม่ใช่ล้มเหลว เทสกลุ่มที่เขียนข้อมูลลงฐาน (เช่น `month-entry.spec.js`) ต้องเปิดเองด้วย `SUTH_E2E_ALLOW_WRITES=1` และคืนค่าเดิมกลับเองทุกครั้งในขั้นตอนสุดท้าย (ดู `apps/web/e2e/fixtures.js`)

อยากจำลองงาน `db` ของ CI บนเครื่องตัวเองก่อน push (เช่นตอน GitHub Actions ยังรันไม่ได้)
ไม่ต้องแตะฐานพัฒนาเลย — สร้างฐานชั่วคราวด้วย Docker แล้วชี้ API ไปที่ฐานนั้นแทน:

```powershell
docker run -d --name suth-ci-mysql -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_DATABASE=suth_ci -p 3307:3306 mysql:8.4
Get-Content database/schema.sql, database/seed_ci.sql | docker exec -i suth-ci-mysql mysql --default-character-set=utf8mb4 -uroot suth_ci

$env:DB_HOST="127.0.0.1"; $env:DB_PORT="3307"; $env:DB_NAME="suth_ci"
$env:SUTH_E2E_START_API="1"; $env:SUTH_E2E_REQUIRE_SERVICES="1"; $env:SUTH_E2E_ALLOW_WRITES="1"
npm run test:e2e:db --workspace @suth/web

docker rm -f suth-ci-mysql
```

`--default-character-set=utf8mb4` ตอนโหลด seed จำเป็น ไม่ใช่ตัวเลือก — ไม่ใส่แล้ว client
ต่อด้วย latin1 นับความยาวชื่อภาษาไทยเป็นไบต์แทนตัวอักษร ทำให้ INSERT ที่ตัวอักษรไม่เกิน
255 จริงล้มด้วย "Data too long"

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

hook ติดตั้งเองตอน `npm install` หรือ `npm ci` ผ่านสคริปต์ `prepare` ไม่มีขั้นตอนให้จำ
จากนั้นทุก `git push` จะผ่านสองด่าน

1. **ห้าม push ตรงเข้า `main`** — ต้องเปิด branch แล้วส่งผ่าน PR การ merge บนเว็บไม่ผ่าน
   hook นี้ เส้นทาง PR จึงใช้ได้ตามปกติ ด่านนี้ทำหน้าที่แทน ruleset ฝั่ง GitHub ที่ยังตั้ง
   ไม่ได้ระหว่างบัญชีถูกล็อก
2. **`npm run verify`** — unit ทุก workspace → build → E2E สามไฟล์ที่ไม่ต้องใช้ฐานข้อมูล
   และตรวจช่องว่างท้ายบรรทัด ใช้เวลาราวสองนาที

ข้ามได้ด้วย `git push --no-verify` เมื่อจำเป็นจริงเท่านั้น หรือข้ามเฉพาะด่านที่ 2 ด้วย
`SKIP_VERIFY=1` — ทั้งหมดนี้อยู่บนเครื่อง ใครตั้งใจข้ามก็ข้ามได้ มันกันความพลั้งเผลอ ไม่ได้
กันคนที่ตั้งใจ ซึ่งเป็นเหตุผลที่ยังต้องมี CI ฝั่ง GitHub เมื่อบัญชีใช้ได้

hook นี้เป็นคำสั่งชุดเดียวกับที่ CI รัน จึงไม่มีทางเพี้ยนจากกัน และตั้งใจไม่รันชุดที่ต้องมี
API/ฐานข้อมูล เพราะ push ที่ล้มเพราะเครื่องไม่ได้เปิด MySQL ไม่ได้บอกอะไรเกี่ยวกับโค้ด

## CI ทำอะไรให้บ้าง

> **ตอนนี้ Actions ยังรันไม่ได้** บัญชี GitHub ถูกล็อกจากปัญหาบิล งานจึงถูกปฏิเสธตั้งแต่ยัง
> ไม่เริ่ม ด่านที่ทำงานจริงอยู่ตอนนี้คือ hook ด้านบน เมื่อบิลปลดแล้วส่วนนี้จะทำงานเองทันที
> โดยไม่ต้องแก้อะไร

ทุก PR และทุก push เข้า `main` GitHub Actions (`.github/workflows/ci.yml`) รันสองงานคู่กัน

| งาน | รันอะไร | ต้องมีฐานข้อมูล |
|---|---|---|
| `verify` | `npm test` ทุก workspace, `npm run build`, ตรวจช่องว่างท้ายบรรทัด, E2E ที่ fixture intercept `/api/*` ทั้งหมด (`asset-drawer`, `asset-evidence`, `contrast-helper`) | ไม่ต้อง |
| `db` | E2E ที่เหลือทั้งหมด ยกเว้น `screenshots.spec.js` (ภาพเทียบข้ามรอบ ไม่เหมาะกับ CI) และ `asset-qa48.spec.js` (ใช้ฐาน QA แยกบนเครื่อง ดู [ADR-0016](../decisions/0016-isolated-qa-database-and-bootstrap-harness.md)) | ต้องมี — MySQL service container สร้างใหม่ทุก run จาก `database/schema.sql` + `database/seed_ci.sql` |

งาน `db` สตาร์ต API เองด้วย `SUTH_E2E_START_API=1` ต่อฐานที่สร้างใหม่นั้นโดยตรง (ไม่ใช่ฐาน
พัฒนา) ด้วย `JWT_SECRET` ที่สุ่มใหม่ทุก run ผ่าน `openssl rand` ไม่เก็บเป็น GitHub Secret
เพราะฐานทิ้งทุกครั้งจบ job ไม่มีอะไรต้องคงอยู่ข้ามรอบ และตั้ง `SUTH_E2E_REQUIRE_SERVICES=1`
ให้ `reasonToSkip()` โยน error แทนการข้าม — ถ้า service container ต่อไม่ติดเพราะ config ผิด
งานนี้ต้องแดง ไม่ใช่เขียวแบบ skip ทั้งที่ไม่ได้ตรวจอะไรเลย

`database/seed_ci.sql` ใส่เคสร้ายจงใจ (ชื่อแผนกยาว 102 ตัวอักษร, เครื่องที่มีประวัติย้าย,
สัญญา 0.45 บาท/แผ่น) เพราะรอบ #48 เจอบั๊ก a11y สองตัวได้ก็เพราะฐาน QA บังเอิญมีข้อมูล
แบบนี้ — ถ้า seed มีแต่ข้อมูลสวย CI จะตรวจไม่เจอสิ่งเหล่านี้อีกเลย ปีงบและเดือนคำนวณจาก
วันที่รันจริงด้วย `CURDATE()` ไม่ตรึงวันที่ตายตัว seed จึงไม่มีวัน "หมดอายุ"

เว็บใน CI ถูกสตาร์ตจาก **build จริงแล้ว preview** ผ่าน `webServer` ใน `playwright.config.js`
ไม่ใช่ dev server เพราะสิ่งที่ต้องทดสอบคือ bundle ที่จะถูกส่งมอบ ตอนรันบนเครื่อง
`reuseExistingServer` ทำให้ Playwright ใช้ server ที่คุณเปิดค้างไว้เหมือนเดิม ไม่มีขั้นตอนใหม่

ผลที่ล้มดูได้จาก artifact `playwright-report` (งาน `verify`) หรือ `playwright-report-db`
(งาน `db`) ของ run นั้น เก็บไว้ 14 วัน เปิดด้วย `npx playwright show-report <โฟลเดอร์ที่แตกไฟล์>`
— CI เขียวไม่ได้แปลว่าตรวจครบ รายการที่ CI ยังไม่ครอบอยู่ในหัวข้อด้านบนทั้งหมด

### รายงานผลขึ้น PR (#65)

ไม่ต้องเปิด artifact ทุกครั้งเพื่อรู้ว่าล้มตรงไหน — `verify` และ `db` แต่ละงานส่งผล
E2E (junit ที่ `playwright.config.js` สร้างเฉพาะตอน `CI=1`) ให้ [`dorny/test-reporter`](https://github.com/dorny/test-reporter)
ขึ้น Checks ของ run นั้น พร้อม annotation ชี้บรรทัดที่ล้มตรงในไฟล์เทส แล้วงาน `report`
(รันหลังสองงานนั้นเสร็จ เฉพาะตอนเป็น PR) สรุปผ่าน/ไม่ผ่านของทั้งสองงานเป็น comment
เดียวบน PR ที่ **อัปเดตทับของเดิม** ทุกรอบ push ไม่โพสต์ใหม่ซ้ำ

ชุดที่ยาวและไวต่อความเปลี่ยนแปลงของ runner (`screenshots.spec.js` เทียบภาพ, a11y เต็ม
ชุดอีกรอบ) ไม่ได้อยู่ใน `verify`/`db` แต่รันคืนละครั้งใน `.github/workflows/nightly.yml`
แทน ไม่บล็อก PR ไหนทั้งสิ้น ผลดูได้จาก Actions tab — **ไม่เปิด issue อัตโนมัติเมื่อล้ม**
ตัดออกจากขอบเขตเดิมของ #65 เพราะยังมีคนดู repo คนเดียว notification ของ GitHub บน
scheduled workflow ที่ล้มพอแล้วสำหรับตอนนี้

## ก่อนเปิด PR

ตรวจ `git diff` ทั้งหมดด้วยตาอีกรอบ และแยกให้ชัดว่า commit ไหนย้ายไฟล์ commit ไหนเปลี่ยนพฤติกรรม — diff ที่ปนกันสองอย่าง review ไม่ได้จริง
