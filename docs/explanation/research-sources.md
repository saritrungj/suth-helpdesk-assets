# แหล่งอ้างอิงภายนอกและสิ่งที่เอามาใช้จริง

เอกสารนี้บันทึกว่าการออกแบบรอบล่าสุดอ้างอิงอะไรจากภายนอกบ้าง และ **แต่ละข้อไปโผล่
ที่ไหนในโค้ด** — เพื่อให้คนที่มาแก้ทีหลังรู้ว่ากฎแต่ละข้อมีที่มา ไม่ใช่รสนิยมของคน
ที่เขียนวันนั้น และตรวจสอบเองได้ว่ายังสมเหตุสมผลอยู่ไหม

## วิธีที่ใช้ค้น และข้อจำกัดที่ต้องรู้

ค้นแบบ **เจาะจงหัวข้อจากแหล่งที่เป็นมาตรฐานหรือมีข้อมูลสนับสนุน** ไม่ใช่กวาดเว็บ
จำนวนมากแล้วสรุปตามความถี่ที่พบ เหตุผล: ในหัวข้ออย่างการออกแบบแดชบอร์ดหรือสีของกราฟ
บทความส่วนใหญ่บนเว็บคัดลอกกันเองต่อๆ มา การอ่านเพิ่มอีกร้อยชิ้นจึงเพิ่มความมั่นใจ
โดยไม่เพิ่มความถูกต้อง

**ข้อที่ตรวจสอบได้ด้วยการรัน จะถูกรันเสมอ ไม่เชื่อบทความ** — เช่นชุดสีของกราฟ
ถูกตรวจด้วยสคริปต์จำลองภาวะตาบอดสีจริง ซึ่งเคยจับได้ว่าชุดสีที่ "ดูโอเค" มีคู่สีที่
คนตาบอดสีเขียว-แดงแยกไม่ออก (ΔE 4.1) — เป็นข้อผิดพลาดที่การอ่านบทความเพิ่มไม่มีทางเจอ

## สิ่งที่เอามาใช้ และที่อยู่ในโค้ด

### ฝั่ง API

| สิ่งที่นำมาใช้ | แหล่ง | อยู่ที่ |
|---|---|---|
| รูปแบบข้อผิดพลาดมาตรฐาน `application/problem+json` | [RFC 9457](https://datatracker.ietf.org/doc/html/rfc9457) | `src/shared/http-error.js`, [ADR-0010](../decisions/0010-problem-details-and-api-conventions.md) |
| เพดานจำนวนรายการต่อหน้าเมื่อขอแบ่งหน้า (ไม่ส่ง `per_page` ยังดึงทั้งหมดได้) | [Zalando RESTful API Guidelines](https://opensource.zalando.com/restful-api-guidelines/) | `apps/api/src/devices/controller.js` (`listQuery`) |
| error handler ตัวเดียวคู่กับคลาส error ของตัวเอง | [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices) | `index.js`, `src/shared/http-error.js` |
| ตรวจข้อมูลขาเข้าที่ปากทางก่อน handler เห็น | เดียวกัน | `src/shared/validate.js` |
| ถือ `unhandledRejection` / `uncaughtException` เป็นเรื่องร้ายแรงและปิดโปรแกรม | เดียวกัน | `index.js` |
| `Cache-Control` + `stale-while-revalidate` คู่กับ ETag ที่ Express สร้างให้อยู่แล้ว | [Optimizing REST APIs with Conditional Requests and ETags](https://zuplo.com/learning-center/optimizing-rest-apis-with-conditional-requests-and-etags) | `src/shared/cache.js` |

**ข้อที่ตรวจสอบเองแล้ว:** Express สร้าง ETag ให้ทุกคำตอบอยู่แล้วโดยค่าเริ่มต้น
สิ่งที่ขาดจริงคือ `Cache-Control` — ยืนยันด้วยการยิงคำขอซ้ำพร้อม `If-None-Match`
แล้วได้ `304` ขนาด 0 ไบต์ (ก่อนหน้านี้ได้ JSON เต็มก้อนทุกครั้ง)

### ฝั่งเว็บ

| สิ่งที่นำมาใช้ | แหล่ง | อยู่ที่ |
|---|---|---|
| เอาสิ่งที่ต้องลงมือทำขึ้นก่อนตัวเลข และคำเตือนต้องมีบริบท + ก้าวถัดไป | [NN/g — 10 Best Application UIs](https://www.nngroup.com/articles/10-best-application-uis/), [Pencil & Paper — Dashboard UX patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards) | `components/AttentionPanel.vue`, `api/src/dashboard/overview.js` |
| จัดโครงตามวิธีที่งานเกิดขึ้นจริง ไม่ใช่ตามโครงสร้างฐานข้อมูล | [B2B Dashboard Information Architecture](https://dardesign.io/blog/b2b-dashboard-information-architecture-2026) | `app/navigation.js` |
| เปิดเผยข้อมูลทีละชั้น (progressive disclosure) | เดียวกัน | แผงตัวกรองที่พับได้ใน `views/AssetList.vue` |
| รองรับการวางข้อมูลจากตารางคำนวณ และต้องมีปุ่มเลิกทำ | [Beyond the Form: Designing Bulk Data Entry](https://maybeachtech.com/?post=handsontable-bulk-data-entry) | `lib/paste-numbers.js`, `views/PrintTransactions.vue` |
| นิยามกฎการตรวจข้อมูลไว้ที่เดียวให้ทั้งสองฝั่งใช้ | เดียวกัน | `packages/domain/constraints.cjs` |
| ลดภาระความจำในฟอร์ม — โครงสร้าง ความชัดเจน และการช่วยเหลือ | [NN/g — 4 Principles to Reduce Cognitive Load in Forms](https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/) | `components/PeriodPicker.vue`, `ui/UiField.vue` |
| ตัวเลขชิดขวาและใช้ตัวเลขความกว้างคงที่ในตาราง | [Data Table Design UX Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) | `ui/UiDataTable.vue`, `design/utilities.css` (`numeral`) |
| ตัวเลือกช่วงวันที่ต้องมีตัวเลือกสำเร็จรูปก่อนปฏิทิน | [UX Patterns — Date Range](https://uxpatterns.dev/patterns/forms/date-range) | `components/PeriodPicker.vue` |

### กราฟและสี

| สิ่งที่นำมาใช้ | แหล่ง | อยู่ที่ |
|---|---|---|
| กฎการเลือกรูปแบบกราฟ สีตามหน้าที่ และรายการสิ่งที่ห้ามทำ | ชุดวิธีการ data visualization ที่ใช้ในโครงการนี้ | `ui/UiChart.vue`, [design-system.md](design-system.md) |
| ตรวจชุดสีด้วยการจำลองภาวะตาบอดสี ไม่ใช่ดูด้วยตา | Machado-Oliveira-Fernandes (2009) | `design/tokens.css` (`--chart-1` ถึง `--chart-8`) |

### เครื่องมือที่ให้ AI เรียก

| สิ่งที่นำมาใช้ | แหล่ง | อยู่ที่ |
|---|---|---|
| ถือว่าข้อมูลขาเข้าของเครื่องมือเชื่อไม่ได้ เพราะมาจากโมเดล ไม่ใช่จากผู้ใช้ | [NSA/CISA — MCP Security Design](https://media.defense.gov/2026/Jun/02/2003943289/-1/-1/0/CSI_MCP_SECURITY.PDF) | `AGENTS.md` §"เครื่องมือที่ให้ AI เรียกได้ ต้องอ่านอย่างเดียว" — กฎยังมีผลแม้ถอด `apps/mcp/` ออกแล้ว ดู [ADR-0012](../decisions/0012-remove-mcp-server.md) |

## สิ่งที่อ่านแล้ว "ไม่" เอามาใช้ และเหตุผล

การไม่เอามาใช้เป็นการตัดสินใจเหมือนกัน และมักมีประโยชน์กับคนอ่านทีหลังมากกว่า

**การแบ่งหน้าแบบ cursor** — Zalando แนะนำว่า offset pagination ไม่ทนต่อข้อมูลขนาดใหญ่
ถูกต้องในกรณีทั่วไป แต่ระบบนี้มีเครื่องหลักร้อย ไม่ใช่หลักล้าน และผู้ใช้ต้องการกระโดด
ไปหน้าที่ต้องการโดยตรง ซึ่ง cursor ทำไม่ได้ — เลือก offset โดยรู้ข้อแลกเปลี่ยน

**ตารางแบบเสมือน (virtual scrolling)** — คำแนะนำเรื่องตารางข้อมูลขนาดใหญ่พูดถึงเรื่องนี้
แทบทุกแหล่ง แต่ตารางที่ยาวที่สุดในระบบนี้อยู่ที่หลักร้อยแถว ซึ่งเบราว์เซอร์รับไหวสบาย
การเพิ่มไลบรารีเข้ามาจะแลกความซับซ้อนกับปัญหาที่ยังไม่มี

**AI สร้างกราฟให้เอง / ถามด้วยภาษาพูดในหน้าเว็บ** — เป็นแนวโน้มที่ทุกแหล่งพูดถึงในปี
2026 แต่ระบบนี้ตอบคำถามชุดเดิมซ้ำๆ ทุกเดือน ซึ่งกราฟที่ออกแบบไว้ล่วงหน้าทำได้ดีกว่า
และเชื่อถือได้มากกว่า — เคยลองตอบความต้องการ "ถามเป็นภาษาพูด" ด้วยเซิร์ฟเวอร์ MCP
ที่อยู่นอกหน้าเว็บ แต่ถอดออกแล้วเพราะไม่มีผู้ใช้จริง ดู [ADR-0012](../decisions/0012-remove-mcp-server.md)

**ดึงข้อมูลจากเว็บสาธารณะเข้ามาแสดงในระบบ** — พิจารณาแล้วไม่มีข้อมูลสาธารณะชุดใดที่
เกี่ยวข้องกับทะเบียนเครื่องพิมพ์ภายในโรงพยาบาล การใส่เข้ามาจะเป็นการเพิ่มสิ่งที่ต้อง
ดูแลและเป็นช่องทางเข้าถึงจากภายนอก โดยไม่ตอบคำถามของใครเลย
