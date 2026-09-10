# เอกสารของโปรเจกต์

เอกสารแบ่งตาม [Diátaxis](https://diataxis.fr/) — สี่ประเภทตามสิ่งที่ผู้อ่านกำลังต้องการ ไม่ใช่ตามหัวข้อ เพราะเอกสารที่อ่านแล้วอึดอัดส่วนใหญ่เกิดจากเอาความต้องการสี่แบบมาปนในไฟล์เดียว

| ถ้าคุณกำลัง… | ไปที่ |
|---|---|
| อยากเข้าใจว่าทำไมระบบเป็นแบบนี้ | [`explanation/`](explanation/) |
| มีงานเฉพาะหน้าต้องทำให้เสร็จ | [`how-to/`](how-to/) |
| ต้องเปิดหาค่า ชื่อคอลัมน์ หรือ endpoint | [`reference/`](reference/) |
| อยากรู้ว่าทำไมถึงตัดสินใจแบบนั้น | [`decisions/`](decisions/) |
| ทำงานใน repo นี้ในฐานะ AI agent | [`agents/`](agents/) และ [`AGENTS.md`](../AGENTS.md) |

## explanation — เพื่อความเข้าใจ

อ่านตอนไม่รีบ เพื่อให้เห็นภาพว่าระบบทำงานยังไงและทำไม

- [กฎธุรกิจและโดเมน](explanation/domain.md) — ปีงบประมาณ การคิดค่าใช้จ่าย ประวัติการย้ายเครื่อง และบทบาทผู้ใช้
- [สถาปัตยกรรม](explanation/architecture.md) — โครงสร้างระบบ โครงสร้างโค้ด และเหตุผลที่จัดแบบนี้
- [Design system ของหน้าเว็บ](explanation/design-system.md) — สามชั้น token/ui/app ประกอบกันเป็นหน้าตาของระบบยังไง (ดู [ADR-0008](decisions/0008-design-system-tokens-and-ui-kit.md))
- [กระดานอ้างอิงงานออกแบบ](explanation/design-references.md) — ดูงานของใคร เพราะอะไร และเอามาใช้จริงที่ไฟล์ไหน
- [แหล่งอ้างอิงภายนอก](explanation/research-sources.md) — มาตรฐานและบทความที่อ้างอิงตอนออกแบบรอบล่าสุด และไปโผล่ที่ไหนในโค้ด

## how-to — เพื่อทำงานให้เสร็จ

อ่านตอนมีงานอยู่ตรงหน้า ทำตามทีละขั้นจนจบ

- [ตั้งระบบสำหรับพัฒนา](how-to/set-up-development.md)
- [รัน migration กับฐานข้อมูลเดิม](how-to/run-migrations.md)
- [นำเข้าไฟล์ Excel/CSV](how-to/import-files.md)
- [ตรวจยอดและติดตามงานจากรายงาน](how-to/use-report-workflow.md)
- [ตรวจการเปลี่ยนแปลงก่อนส่งมอบ](how-to/verify-changes.md)
- [เปิดและทดสอบ QA แยกสำหรับ #48](how-to/run-qa48.md)
- [เตรียมขึ้น production](how-to/prepare-for-production.md)

## reference — เพื่อเปิดหา

ไม่ได้เขียนให้อ่านรวด แต่ให้เปิดหาข้อเท็จจริงแล้วปิด

- [โมเดลข้อมูล](reference/data-model.md) — ตารางและหน้าที่
- [ขอบเขต API](reference/api.md) — prefix และความรับผิดชอบ
- [ตัวแปร environment](reference/environment.md)
- [รูปแบบไฟล์นำเข้า](reference/import-format.md)
- [ระบบกับ WCAG 2.2 ระดับ AA](reference/accessibility.md) — ขอบเขตของเทส ผลที่ตรวจแล้ว และสิ่งที่ยังไม่ได้ตรวจ

## decisions — บันทึกการตัดสินใจ

[ADR](decisions/) หนึ่งไฟล์ต่อหนึ่งการตัดสินใจที่ย้อนกลับยาก เขียนตอนตัดสิน ไม่ใช่ตอนสรุปทีหลัง

รายการทั้งหมดพร้อมสถานะอยู่ใน [สารบัญ ADR](decisions/README.md)

## agents — สำหรับ AI agent

ข้อตกลงเฉพาะของ repo นี้ที่ agent ต้องรู้ ส่วนวิธีทำงานร่วมกับทีมอยู่ใน [`AGENTS.md`](../AGENTS.md)

- [เอกสารโดเมนสำหรับ agent](agents/domain.md) — อ่านไฟล์ไหนก่อนเริ่มสำรวจโค้ด
- [Issue tracker](agents/issue-tracker.md) — ใช้ GitHub Issues ผ่าน `gh` CLI
- [Triage labels](agents/triage-labels.md) — 5 บทบาทมาตรฐาน map กับ label จริงบน GitHub

## นอกโฟลเดอร์นี้

- [README ของโปรเจกต์](../README.md) — สถานะปัจจุบัน วิธีเริ่มพัฒนา และโครงสร้าง repository
- [CHANGELOG](../CHANGELOG.md) — สิ่งที่เปลี่ยนและผู้ใช้สังเกตเห็นได้
- [ข้อตกลงการทำงานของทีม](../CONTRIBUTING.md) — ลำดับการทำงาน ชื่อ branch และข้อความ commit

---

**กฎที่ทำให้เอกสารชุดนี้ไม่เน่า**

1. หนึ่งไฟล์ตอบหนึ่งคำถาม ถ้าบอกไม่ได้ว่าไฟล์นี้ตอบอะไร แปลว่ายังไม่ควรมีไฟล์นี้
2. ห้าม commit สิ่งที่ generate จากโค้ดได้ เพราะมันจะผิดในที่สุดโดยไม่มีอะไรเตือน
3. เอกสารเปลี่ยนใน PR เดียวกับโค้ด แยกเมื่อไหร่จะตามไม่ทันตั้งแต่ครั้งที่สอง
