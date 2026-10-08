# ตรวจหน้าส่งออกและนำเข้าบนเดสก์ท็อป (#280–281)

เริ่มจาก [วิธีใช้รายงาน](use-report-workflow.md) และ [วิธีนำเข้า](import-files.md) ซึ่งเป็นคำแนะนำการใช้งานหลัก หน้านี้บันทึกขอบเขตการตรวจรอบปรับ UX; สูตร ปีงบ สิทธิ์ และ HTTP API คงกฎเดิมตาม ADR

## ตรวจซ้ำ

หลัง `npm ci` และ build เว็บ รัน `npm run test:e2e:fixture --workspace @suth/web -- export-context.spec.js import-review.spec.js import-export-accessibility.spec.js` ใช้ข้อมูลสังเคราะห์ที่ขอบเขต HTTP ไม่เขียนฐานพัฒนา ตรวจ public UI ดังนี้:

- เหตุผลกำลังโหลด / โหลดล้มเหลว / ไม่มีข้อมูล แสดงใกล้การส่งออก; ใช้ Tab อ่านเหตุผลเมื่อปุ่มใช้ไม่ได้ และลองใหม่กลับมาเลือก Excel/CSV เดิมได้
- ขอบเขตไฟล์ใช้ปีงบ เดือน ตัวกรอง หรือคำค้นของ action นั้น; ผลค้นหาในค่าใช้จ่ายไม่เปลี่ยนยอดรวมทั้งหน้าหรือรูปแบบไฟล์
- สรุปนำเข้ามีปุ่มยืนยันเดิมเพียงปุ่มเดียว อยู่ในจอเมื่อเลื่อนตรวจรายการยาว และลิงก์รายละเอียดเลื่อนพร้อมย้าย focus พ้นแถบบน
- แก้ตัวเลือกแล้วซ่อน preview เก่าทันที รวมช่วงหน่วงส่งและคำขอซ้อน; การตรวจตัวเลือกล้มเหลวมีทางตรวจอีกครั้ง
- ลายนิ้วมือที่ใช้ commit เป็นชุดที่มนุษย์เห็นก่อน dialog; 409 ต้องตรวจผลล่าสุดและยืนยันใหม่, data_changed/failed/503 ไม่แสดงผลสำเร็จหรือส่ง commit ซ้ำอัตโนมัติ
- admin ทำต่องานของ admin อื่นได้ตาม ADR-0029; staff/viewer เปิดหน้านำเข้าไม่ได้; ผลสำเร็จคงจำนวนที่ API ส่งและลิงก์ปีงบเดิม

ตรวจ 1280×800 และ 1440×900 ทั้งธีม รวมพื้นที่ CSS 640×400/720×450 ที่เทียบการขยายเดสก์ท็อป 200% (ไม่ได้จำลองมือถือ) กล่องสรุปวางต่อท้ายแทน sticky เมื่อพื้นที่ไม่พอ Automated axe ตรวจเฉพาะคำอธิบายส่งออกและกล่องสรุปใหม่ ไม่ใช่ใบรับรอง WCAG ทั้งระบบ; ยังไม่ได้ทดสอบ screen reader หรือผู้ใช้จริง

ภาพสังเคราะห์ 1280×800 ก่อนใช้ baseline `4c2c663fa7f3d60d77809dc80258905813822886` และหลังใช้ build รวมก่อน freeze; ไม่มีข้อมูลบุคคลหรือฐานจริง:

| หน้าจอ | ก่อน | หลัง |
|---|---|---|
| ส่งออก สว่าง | [ภาพ](../assets/import-export-280-281/export-before-1280-light.png) | [ภาพ](../assets/import-export-280-281/export-after-1280-light.png) |
| ส่งออก มืด | [ภาพ](../assets/import-export-280-281/export-before-1280-dark.png) | [ภาพ](../assets/import-export-280-281/export-after-1280-dark.png) |
| นำเข้า สว่าง | [ภาพ](../assets/import-export-280-281/import-before-1280-light.png) | [ภาพ](../assets/import-export-280-281/import-after-1280-light.png) |
| นำเข้า มืด | [ภาพ](../assets/import-export-280-281/import-before-1280-dark.png) | [ภาพ](../assets/import-export-280-281/import-after-1280-dark.png) |

Regression ไฟล์จริงใช้ `print-comparison.spec.js`, `expense-scope.spec.js` และ `deduction-presentation.spec.js` ตรวจคอลัมน์/แผ่นงาน/ขอบเขต/ค่าเงิน/หมายเหตุเดิม ชุดฐานจริงต้องผ่าน harness `npm run verify:db` บนฐานชั่วคราวตาม [verify-changes](verify-changes.md) ห้ามชี้ไปฐานแชร์หรือ production
