# งาน #294 — Login R7 และ app R2

วันที่ 2026-10-09 · branch `codex/294-app-design` · base `71da92acbce61f31af0629bb9c24eb948f812098`

## เป้าหมายและขอบเขต

[Issue #294](https://github.com/saritrungj/suth-helpdesk-assets/issues/294) เป็นเกณฑ์ที่ผู้ใช้อนุมัติ: นำ Login R7 และแนวทาง R2 ไปใช้จริงครบ 20 routed pages ทั้งสองธีม ผ่านชั้น design/ui/app เดิม ส่ง integration PR รวมหนึ่งใบ ผู้ใช้อนุมัติ commit/push/PR และขอรับสรุปโดยไม่ต้องเปิดภาพ; ยังไม่อนุมัติ merge/deploy

ทำเฉพาะ UI, responsive workspace, brand/navigation, effects และ remember-username แบบ opt-in คง API/session/roles/redirect กฎธุรกิจและ dirty/pending guards ไม่เปลี่ยน schema, dependency, lockfile หรือ authentication architecture ไม่ปิด #289/#290 อัตโนมัติ

## สิ่งที่ทำและการตัดสินใจ

- ใช้โลโก้ day/night ต้นฉบับและ Login คอลัมน์กลาง สีและพื้นหลังเชื่อมกันทั้งแอป พื้นข้อมูลและฟอร์มทึบ
- ใช้ Lucide เดิม ย้ายปุ่มพับไว้ท้าย sidebar ลดหัวเรื่องซ้ำ topbar เพิ่มข้อมูลชื่อองค์กรเต็ม และเมนูมือถือแบบ modal ที่กัก/คืน focus
- เลย์เอาต์กลางตอบสนองต่อความกว้าง workspace ที่เหลือจริง รวมจอกว้าง 2560px, จอแคบ 320px และจอเตี้ย 1164×501px
- เก็บเฉพาะชื่อผู้ใช้เมื่อเลือกเอง ไม่เก็บ password/session token ใช้ success/error/429/redirect เดิม
- พบและแก้ labels กราฟล้น, ตารางนำเข้าล้น, focus ใน WebKit, contrast primary hover และ padding ซ้อน/พื้นที่กด checkbox ของ Login โดยคง regression assertions
- ไม่เพิ่ม ADR เพราะใช้สถาปัตยกรรมเดิมและเป็นการเปลี่ยน UI ที่ย้อนกลับได้ บ้านหลักอยู่ที่ [design-system](docs/explanation/design-system.md), [design-references](docs/explanation/design-references.md), [accessibility](docs/reference/accessibility.md) และ [brand assets](docs/assets/brand/README.md)

## การตรวจสอบ

- `npm run verify` ผ่าน: Web 348, API 296, domain 73, root scripts 12; API opt-in เดิมข้าม 1 เคสเพราะไม่มี SUTH_API_TOKEN
- Chromium fixture 402/402; Firefox 155 และ WebKit 26.6 focused parity 84/84 ต่อ engine ไม่มี skip/flaky
- `npm run verify:db` ผ่าน 201/201 ไม่มี skip/flaky บนฐาน QA ชั่วคราวแยก; harness ล้าง MySQL หลังตรวจ
- Build และ initial JavaScript gzip budget ผ่าน 196.4/200 KiB; `git diff --check` ผ่าน
- เคส QA เดิมที่พบ field width 196px และ checkbox 18px กลับมาผ่านหลังแก้โดยไม่ลด assertions; rendered fields ≥200px, controls ≥24px และปุ่ม submit อยู่ในจอ 320×640px

ยังไม่ได้ตรวจด้วย NVDA/JAWS/VoiceOver, password manager จริง, Voice Control หรืออุปกรณ์มือถือจริง ผล automated tests ไม่ใช่การรับรอง WCAG ทั้งระบบ

## รีวิวและการแก้รอบแรก

Candidateแรก11282750b8849e9923423542238c565e9af027ef ถูกรีวิวกับ baseเดิม พบป้ายกราฟยาวยังล้นเพราะ clampเฉพาะจุดกึ่งกลาง16px พิสูจน์แดงด้วยค่า1.23หมื่นที่320pxแล้วแก้เป็นวัดDOMจริง มีguardไม่ให้ผลrenderเก่าทับresizeใหม่ และคงค่าครบในtooltip/table แถบบันทึกเปลี่ยนเป็นพื้นทึบตามdesign-system ตรวจชุดรวมและฐานQAซ้ำผ่านตามรายการข้างบน

Standards/Spec/Security+Domain agents หยุดด้วยaccount usage limitก่อนจบทุกverdict ข้อความระหว่างทางของSpecระบุยังไม่พบfinding แต่ไม่ใช่ผลอนุมัติครบ ด่านรีวิวcandidateล่าสุดจึงยังไม่ผ่านและยังไม่ได้push/เปิดPR ไม่ได้merge/deploy

## สถานะส่งมอบและขั้นตอนถัดไป

ไฟล์นี้บันทึกพร้อม candidate commit; ดู commit จาก `git log -1` การรีวิวต้องใช้ SHA ที่จับด้วย `D:/ai-playbook/scripts/review-candidate.mjs` หลัง working tree สะอาด ตาม policy ของ skill

ขั้นตอนถัดไป: เมื่อagentsใช้งานได้ ให้รีวิวรอบสองcandidateล่าสุดกับbaseเดิม71da92acbce61f31af0629bb9c24eb948f812098 ผ่านStandards/SpecและSecurity/Domain ตามpolicyสูงสุดสองรอบ แล้วตรวจ `--expect` ก่อนpushผ่านpre-push hook ยืนยันremoteSHAและเปิดPRตามauthorityข้างต้น หลักฐานหลังรีวิวและ PR URL เก็บใน PR/ignored output เพื่อไม่เพิ่ม commit ที่ยังไม่รีวิว

Checkpoint ต้นแบบ `e2e8704` บน `feat/294-login-prototype` ยังเป็น local checkpoint; ไฟล์ production และต้นฉบับโลโก้ที่ต้องส่งมอบรวมใน candidate นี้ ไม่ถือว่า checkpoint local เข้าถึงได้จากเครื่องอื่นก่อน push

