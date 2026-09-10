# ตรวจต้นแบบทะเบียน (#48)

ขอบเขตต้นแบบคือ `/assets` และ drawer แก้ไข/ย้าย ใช้ admin เพื่อแก้ไข; staff/viewer อ่านและค้นหาได้ ปุ่มเพิ่มไป `/admin/add-asset` และนำเข้าไป `/admin/add-asset?tab=import` เหมือนเดิม หน้าปลายทางยังไม่ redesign ก่อน gate #51

## เปิดลอง

สำหรับการบันทึก/ย้ายจริง ใช้ [QA48 แยก](run-qa48.md) ซึ่งมีข้อมูลจำลองและคำสั่งเปิดซ้ำ ไม่ใช้ฐานเดิม ผล live-write ล่าสุดอยู่ใน `output/qa48/verify-<timestamp>/tests.log`; ผลรอบเก่าด้านล่างเป็นประวัติ ไม่ใช่ผลตรวจโค้ดล่าสุด

เปิด API และ web ตามคู่มือตั้งระบบ แล้วไป `/assets` ค้นหา → เรียง Serial → หน้าที่ 2 → แก้ไข → บันทึก → ตรวจคำค้น/การเรียง/หน้าเดิม เปิดเมนูข้อความข้างแก้ไขเพื่อย้ายเครื่อง ดูต้นทาง ปลายทางและวันที่มีผลก่อนยืนยัน

การย้ายใช้วันที่บันทึกของเซิร์ฟเวอร์ API เดิมไม่มี input วันที่ จึงไม่มีการเพิ่มช่องวันที่หรือ validation ใหม่ และไม่มีกรณี “ผู้ใช้กรอกวันที่ผิด” ให้ทดสอบ ฟอร์มยังส่ง placement เดิม 5 ฟิลด์ การแก้ไขใช้ PUT ข้อมูลเครื่องแล้ว PUT move ตาม flow เดิม; หากคำขอที่สองล้มเหลว ข้อมูลเครื่องอาจถูกบันทึกแล้ว ฟอร์มคงค่าให้ retry แต่ไม่ได้ทำให้สองคำขอเป็น transaction เดียว

## หลักฐานที่สร้างซ้ำได้

```powershell
# web ต้องทำงานอยู่ (default 5173; ตั้ง SUTH_WEB_URL หากใช้พอร์ตอื่น)
cd apps/web
$env:SUTH_EVIDENCE_FULL="1"
npx playwright test asset-drawer.spec.js asset-evidence.spec.js --output=../../output/playwright/issue-48-review-new-run
```

`SUTH_EVIDENCE_FULL=1` ให้ `asset-evidence.spec.js` ถ่ายครบ 12 แบบ ไม่ตั้งจะได้แค่ไทย-สว่างกับอังกฤษ-มืดที่ 1440×900 ซึ่งเป็นชุดที่ pre-push รันทุกครั้ง

ชุดนี้ intercept HTTP API ด้วย fixture ใน `asset-fixture.js`: เครื่อง SUTH-001–045, ชื่อหน่วยงานยาว, ราคา 0.45 บาท/แผ่น ไม่มีการเขียนฐานข้อมูลจริง หากรันพร้อมชุดอื่นต้องระบุ `--output` คนละโฟลเดอร์เพื่อไม่ให้ไฟล์ trace ชนกัน

เปลี่ยนชื่อ `--output` ให้ไม่ซ้ำในแต่ละรอบ ภาพออกภายใต้ output ของ test นั้นผ่าน `test.info().outputPath`: `after/<th|en>/<light|dark>/<1280x720|1440x900|1920x1080>/` ประกอบด้วย registry/edit/move ส่วน test พฤติกรรมเก็บ dirty, pending, request failure, list-error, empty, filtered-empty ขนาด 1440×900 ไทย/สว่าง/default ภาพเป็น manual evidence ไม่ใช่ pixel regression; ไม่ทับภาพ baseline เดิม

baseline ก่อนแก้ใช้ fixture เดียวกัน เก็บ `before/` ทั้งสองภาษา/สองธีม/สามขนาด (registry/edit) โดย `SUTH_EVIDENCE_PHASE=before` บน baseline commit `2972e176` ภาพ edit baseline แสดงปัญหาเดิมที่ modal เปิดก่อน fields พร้อม ทำให้ค่าว่าง ชุดหลักฐานรวมส่งเป็น `output/playwright/issue-48-evidence.zip` เพื่อเปิดตรวจบนเครื่องอื่นได้

## เกณฑ์ → จุดตรวจ

| เกณฑ์ | วิธีตรวจ |
|---|---|
| search เดียว, filters/chips, primary/secondary, กลุ่ม tools, Serial/ชื่อยาว | registry ภาพ 12 combinations; ตรวจที่ 1280×720 ว่าเห็นหัวตาราง/แถวแรก |
| drawer ขนาดและกลุ่มฟอร์ม/footer | edit/move ภาพ 12 combinations; keyboard/fullscreen test |
| คง search/sort/page และ clamp/แจ้ง filtered-out | edit context และ filtered-out E2E |
| dirty close/Escape/backdrop/route, pending, failure/retry | asset-drawer E2E และ states ภาพ |
| ต้นทาง/ปลายทาง, options ไม่พร้อม, payload เดิม | move retry/options E2E |
| permissions | staff/viewer E2E; API policy ไม่เปลี่ยน |
| theme/language/density/zoom/reduced motion | evidence 12 combinations; density 3 ระดับและ zoom 200% E2E |
| API/schema/domain | ตรวจ diff ต้องไม่มีการแก้ฝั่ง API/DB/domain |

## ผลตรวจรอบส่งมอบ 2026-09-10

รอบปิด P2 ล่าสุด: เพิ่ม regression ย้ายเครื่องจนหลุดคำค้นแล้วปิด drawer (ล้มที่ focus ก่อนแก้ และผ่านหลังแก้) โดย `UiDrawer` emit `focus-fallback` เมื่อ opener ถูกถอดจาก DOM ให้เจ้าของทะเบียนคืน focus ไปช่องค้นหาเฉพาะเมื่อปิดแผง ไม่แย่ง focus ระหว่างอ่านผลย้าย

เปิด API/web development แล้วรัน `npx playwright test wcag.spec.js asset-drawer.spec.js --grep-invert '4.1.3' --output=../../output/playwright/issue-48-move-wcag-final` จาก `apps/web` ด้วย `SUTH_E2E_ALLOW_WRITES=0`: **107/107 ผ่าน ไม่มี skip** (WCAG 90 + drawer fixture 17) ดู `output/playwright/issue-48-move-wcag-final.log` เว้น test ส่งคำขอล็อกอินหนึ่งรายการโดยเจตนา; ไม่มีการเขียนฐานจริง Build และ diff check ผ่าน มีคำเตือน chunk >500 kB เดิม ผลนี้แทนรอบ WCAG ที่เคยขาดตอน/skip ก่อนหน้า

- `npm test`: ผ่าน API 67 (ข้าม live-token 1), web 104, domain 32
- `npm run build` และ `git diff --check`: ผ่าน; build ยังเตือน chunk ใหญ่กว่า 500 kB
- Browser fixture: flow 16 tests และ evidence 12 combinations; ตรวจ export ทั้ง 45 แถว/คำค้น/ราคา และ scroll หลัง save เพิ่มจาก flow หลัก
- ภาพก่อน 24 ภาพ หลัง 36 ภาพ และ state 6 ภาพ; ยังต้องให้คนตรวจรับหน้าตาที่ gate #51
- Live regression หลังได้รับอนุญาต restart web ที่ 5173: 116/116 ผ่าน ไม่มี flaky; fixture 28/28 ผ่าน ผลเดิม 3 failures ไม่เกิดซ้ำ ดู `output/playwright/issue-48-qa-live.log` และ `issue-48-qa-fixture.log` เว้น test ส่งคำขอล็อกอินและไม่ทดสอบเขียนฐานจริง

### Standards review

หลังแก้ findings: `npm test`, `npm run build`, `git diff --check` ผ่าน; `npx playwright test asset-drawer.spec.js asset-evidence.spec.js report-workflow.spec.js shell.spec.js page-structure.spec.js --output=../../output/playwright/issue-48-review-final` ผ่าน 54/54 จาก `apps/web` โดยตั้ง `SUTH_E2E_ALLOW_WRITES=0` สอง regression ใหม่ล้มก่อนแก้และผ่านหลังแก้ (`issue-48-review-red` / `issue-48-review-final`) รอบนี้ไม่ได้รัน WCAG ทั้งชุดซ้ำ และยังไม่ทดสอบ live-write

Self-review diff เทียบ baseline: ไม่พบการเพิ่มกฎธุรกิจใน `ui/` หรือแก้ API/schema/auth; drawer เป็น shared primitive และเจ้าของฟอร์มควบคุม dirty/pending ผ่าน guard เดียวกัน การแก้ `UiToaster` จำเป็นต่อ save flow เพราะชื่อตัวแปรรายการเดิมบังฟังก์ชันแปลภาษาแล้วเกิด runtime error

### Spec review

Independent review สองด้านสำเร็จในรอบถัดมา: Standards ไม่พบ hard violation ใน production code แต่พบเอกสารผลตรวจเก่าและ validation branching ซ้ำ; Spec พบ fullscreen ซ่อน search/filter/notice และ focus หายเมื่อแถวหลุด filters หลัง refresh จึงเพิ่ม regression ที่ยืนยัน failures ก่อนแก้ และปรับ fullscreen ให้ครอบบริบททะเบียนพร้อม focus fallback ไป search หลัง refresh การรีวิวนี้ไม่แทน human gate หรือผล live-write; effective date ยังคงเป็นวันที่เซิร์ฟเวอร์ ไม่เพิ่ม date input/API

ข้อจำกัด: ชุด fixture พิสูจน์ UI กับ HTTP contract ไม่ใช่ผลเขียนจริงในฐาน ทดสอบ live-write ต้องมีฐานทดสอบแยกและเปิด guard ตามคู่มือ verify; ไม่ถือว่า skipped = ผ่าน ยังไม่ได้ตรวจ screen reader จริงหรือ forced colors การรับรองทิศทางหน้าตายังเป็นหน้าที่ human gate #51
