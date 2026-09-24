# Architecture Decision Records

บันทึกการตัดสินใจที่ **ย้อนกลับยาก** — หนึ่งไฟล์ต่อหนึ่งการตัดสินใจ

## กติกา

- เขียนตอนตัดสินใจ ไม่ใช่ตอนสรุปทีหลัง คุณค่าอยู่ที่ทางเลือกที่ถูกตัดทิ้ง ซึ่งเป็นสิ่งแรกที่ลืม
- เลขเรียงต่อกัน ไม่ใช้ซ้ำ ไม่แก้ไฟล์เก่าเมื่อเปลี่ยนใจ — เขียนฉบับใหม่แล้วตั้งสถานะฉบับเก่าเป็น `Superseded by ADR-XXXX`
- ยาวหนึ่งหน้าพอ ถ้ายาวกว่านั้นแปลว่าเป็นเอกสารออกแบบ ไม่ใช่บันทึกการตัดสินใจ
- เขียนเฉพาะเรื่องที่กลับตัวแล้วเจ็บ — เลือกฐานข้อมูล รูปแบบวันที่ โมเดลสิทธิ์ ส่วนการเลือก utility library ไม่ต้อง

## สถานะที่ใช้

| สถานะ | ความหมาย |
|---|---|
| `Proposed` | เสนอแล้ว ยังไม่ตัดสิน |
| `Accepted` | ตัดสินแล้ว และมีผลกับโค้ดปัจจุบัน |
| `Superseded by ADR-XXXX` | ถูกแทนที่ด้วยการตัดสินใจใหม่ |
| `Deferred` | ยังไม่ผิด แต่สมมติฐานที่ตั้งไว้เปลี่ยนไป ต้องตัดสินใหม่เมื่อจะใช้จริง |

## รายการ

| # | เรื่อง | สถานะ |
|---|---|---|
| [0001](0001-thai-fiscal-year-oct-sep.md) | ปีงบประมาณไทยคือ ต.ค. ถึง ก.ย. | Accepted |
| [0002](0002-store-months-in-common-era.md) | เก็บเดือนเป็น ค.ศ. รับเข้าได้ทั้ง พ.ศ. และ ค.ศ. | Accepted |
| [0003](0003-sheetjs-from-vendor-registry.md) | ติดตั้ง SheetJS จาก registry ของผู้พัฒนา ไม่ใช่ npm | Accepted |
| [0004](0004-workspace-and-feature-folders.md) | จัด repository เป็น workspace และแบ่งโค้ดตามความสามารถ | Accepted |
| [0005](0005-database-engine.md) | เลือก database engine สำหรับระบบที่เขียนใหม่ — PostgreSQL | Deferred |
| [0006](0006-session-cookie-instead-of-localstorage.md) | เก็บ token ของ session ใน cookie แบบ httpOnly | Accepted |
| [0007](0007-improve-in-place-instead-of-rewriting.md) | ปรับปรุงระบบเดิมต่อ ไม่เขียนใหม่ | Accepted |
| [0008](0008-design-system-tokens-and-ui-kit.md) | สร้าง design system เป็นชั้น token + ชุด component กลาง | Accepted |
| [0009](0009-tanstack-query-as-the-data-layer.md) | ใช้ TanStack Query เป็นชั้นดึงข้อมูลของฝั่งเว็บ | Accepted |
| [0010](0010-problem-details-and-api-conventions.md) | ข้อผิดพลาดแบบ Problem Details และข้อตกลงร่วมของ API | Accepted |
| [0011](0011-read-only-mcp-server.md) | เซิร์ฟเวอร์ MCP แบบอ่านอย่างเดียว | Superseded by ADR-0012 |
| [0012](0012-remove-mcp-server.md) | ถอดเซิร์ฟเวอร์ MCP ออกจาก repository | Accepted |
| [0013](0013-localized-reporting.md) | แยกภาษาแสดงผลออกจากข้อมูลรายงาน | Accepted |
| [0014](0014-resolve-overlapping-location-history.md) | เลือกประวัติตำแหน่งที่มีผลเพียงช่วงเดียวต่อเดือน | Accepted |
| [0015](0015-brand-assets-in-repository.md) | เก็บ brand asset ของเจ้าของระบบไว้ใน repository | Accepted |
| [0016](0016-isolated-qa-database-and-bootstrap-harness.md) | ฐาน QA แยก และ harness ที่ต่อ MySQL ตรงเฉพาะ bootstrap | Accepted |
| [0017](0017-two-percent-page-deduction.md) | หักจำนวนหน้าพิมพ์ 2% และใช้กับยอดย้อนหลังทุกปีงบ | Accepted — ข้อการปัดเงิน superseded by ADR-0022 |
| [0018](0018-separate-installation-status.md) | แยกสถานะการติดตั้งจากสถานะการใช้งานของเครื่อง | Accepted — implemented; ยังไม่ได้รันกับฐานข้อมูลจริง |
| [0019](0019-effective-pricing-history.md) | ใช้ราคาตามช่วงที่มีผลจริงในการคำนวณย้อนหลัง | Accepted — ขั้นยืนยันราคา superseded by ADR-0021; ราคาเดียวต่อสัญญา superseded by ADR-0023 |
| [0020](0020-single-scope-dashboard.md) | หน้าภาพรวมมีตัวกรองชั้นเดียว และเป็นหน้าวิเคราะห์หน้าเดียว | Accepted · หน้าเดียวแก้โดย 0033 |
| [0021](0021-contract-price-applies-on-save.md) | ราคาในสัญญาใช้คิดเงินทันทีที่บันทึก ไม่มีขั้นยืนยันราคา | Accepted |
| [0022](0022-round-at-invoice-line-and-allocate.md) | ปัดเงินที่ระดับรายการราคาต่องวดให้ตรงใบแจ้งหนี้ แล้วกระจายเศษสตางค์ | Accepted |
| [0023](0023-contract-term-price-lines-and-meters.md) | สัญญามีอายุของตัวเองและรายการราคา ยอดพิมพ์บันทึกรายมิเตอร์ต่องวด | Accepted |
| [0024](0024-docker-development-database.md) | ฐานข้อมูลบน Docker Compose ด้วย MySQL 8.4 LTS ฐานเดียวที่เป็นข้อมูลจริง | Accepted |
| [0025](0025-master-data-aliases.md) | ชื่อเรียกอื่นของยี่ห้อ อาคาร และฝ่าย | Accepted |
| [0026](0026-raw-registry-import.md) | นำเข้าทะเบียนเครื่องจากไฟล์ดิบ: ตรวจก่อน ให้คนตัดสินชื่อ และเติมเฉพาะช่องที่ว่าง | Accepted |
| [0027](0027-import-session-lifecycle.md) | งานนำเข้าไฟล์เป็น session ฝั่งเซิร์ฟเวอร์ที่มีวงจรชีวิตและประวัติ | Accepted |
| [0028](0028-import-commit-strategy.md) | บันทึกการนำเข้าแบบคำนวณก่อน แล้วเขียนผลใน transaction เดียวที่สั้น | Accepted |
| [0029](0029-import-session-visibility.md) | ผู้ดูแลทุกคนเห็นและทำต่องานนำเข้าของกันได้ ทุกการกระทำมีชื่อผู้ทำ | Accepted |
| [0030](0030-automatic-import.md) | นำเข้าอัตโนมัติ: ระบบตัดสินแทนเมื่อไม่มีทางเลือกอื่น หยุดถามเมื่อการเดาอาจทำข้อมูลเสีย | Accepted · บันทึกเองแทนด้วย 0034 |
| [0031](0031-purge-unsaved-import-sessions.md) | ลบงานนำเข้าที่ไม่เคยบันทึกทิ้งถาวรได้ และงานนำเข้าเป็นทางเดียวของการนำเข้า | Accepted |
| [0032](0032-separate-development-database.md) | ฐานพัฒนาแยกจากฐานจริง ใช้ข้อมูลตัวอย่าง และใช้รหัสคนละชุด | Accepted |
| [0033](0033-overview-and-compare-pages.md) | หน้าภาพรวม (ช่วงเวลา+สัญญา) กับหน้าเปรียบเทียบเป็นสองมุมมองของแถวชุดเดียวกัน | Accepted |
| [0034](0034-import-preview-before-write.md) | นำเข้าไฟล์: แสดงสิ่งที่จะเกิดก่อน สัญญาและปีงบเป็นแผนจนกว่าจะกดยืนยัน | Accepted |
| [0035](0035-audit-log.md) | บันทึกการตรวจย้อนหลังของทุกการแก้ไขด้วยมือ และกันกรอกยอดทับกัน | Accepted |
