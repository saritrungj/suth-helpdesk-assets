# กระดานอ้างอิงงานออกแบบ — SUTH Aurora

เอกสารนี้คือ **reference board** ของการรื้อหน้าตาระบบรอบ "SUTH Aurora" บันทึกว่า
ดูงานของใคร ดูเพราะอะไร และ **เอาอะไรมาใช้จริงที่ไฟล์ไหน**

กฎข้อเดียวของเอกสารนี้: ทุกแถวต้องตอบได้ว่า *"แล้วมันไปโผล่ที่ไหนในโค้ด"* ถ้าตอบ
ไม่ได้ แปลว่ายังไม่ได้เอามาใช้ ให้ย้ายไปหัวข้อท้ายเอกสารแทน

> **เรื่องลิขสิทธิ์:** งานอ้างอิงภายนอกด้านล่างเป็นของเจ้าของต้นฉบับ ใช้เพื่อ *ศึกษา
> องค์ประกอบและพฤติกรรม* เท่านั้น — **ห้ามคัดลอก asset ของ reference เหล่านั้นเข้า
> repository เด็ดขาด** ส่วน brand asset ของเจ้าของระบบเก็บได้ตาม
> [ADR-0015](../decisions/0015-brand-assets-in-repository.md) โดยมีบ้านเดียวที่
> [`docs/assets/brand/`](../assets/brand/README.md)

## ข้อควรระวังเรื่องตัวเลขความนิยม

ยอด like / view / รางวัล ที่อ้างถึงเป็น **ค่าที่พบบนหน้าสาธารณะ ณ ตอนที่ค้น**
ไม่ใช่ยอดสด และไม่ใช่การจัดอันดับของทั้งอินเทอร์เน็ต ตัวเลขพวกนี้ใช้ได้แค่เป็น
เครื่องช่วย *คัดกรอง* ว่างานชิ้นไหนมีคนจำนวนมากเห็นแล้วคิดว่าดี

**และมันไม่ใช่หลักฐานว่างานนั้นใช้จริงได้ดี** — งานบน Dribbble ส่วนใหญ่เป็นภาพนิ่ง
ที่ไม่เคยเจอข้อมูลจริง ชื่อแผนกยาวๆ ตัวเลขติดลบ หรือตารางที่มี 200 แถว สิ่งที่
เอามาได้จากงานเหล่านั้นคือ **การจัดวางและบุคลิก** ส่วนพฤติกรรมตอนข้อมูลไม่สวย
ต้องเอามาจากผลิตภัณฑ์ที่มีคนใช้งานจริง (Linear, Stripe, Attio) และจากการทดสอบเอง

---

## 1. Layout และการจัดลำดับสายตา

| แหล่ง | ที่มา | เอามาใช้ที่ |
|---|---|---|
| [Linear — Design Refresh](https://linear.app/now/behind-the-latest-design-refresh) | บทความจากทีมออกแบบผลิตภัณฑ์จริง | `app/AppSidebar.vue` — แถบเมนูเป็นพื้นหลังของงาน, แบ่งหมวดตามจังหวะใช้งาน, active มีทั้งแผ่นพื้น/ขีด/`aria-current` และย่อเป็น rail ได้ |
| [Linear Insights](https://linear.app/insights) | ผลิตภัณฑ์จริง มี drill-down | `views/Dashboard.vue` — ตัวเลขที่คลิกได้ต้องพาไปยังข้อมูลที่อธิบายตัวเลขนั้น พร้อมตัวกรองเดิม |
| [Medtech Platform — HALO LAB](https://dribbble.com/shots/19419939-Medtech-platform-dashboard-analytics-UX) | ~3.2K likes | `views/Dashboard.vue` — กริดที่มี "จุดนำสายตา" ชิ้นใหญ่หนึ่งชิ้น แทนการ์ดขนาดเท่ากันเรียงกันทั้งหน้า |
| [Stripe — Customer Detail](https://support.stripe.com/questions/updates-to-the-customer-detail-page) | เอกสารการปรับหน้าจากผู้พัฒนา | `views/AssetDetail.vue` — แยก "ข้อมูลประจำตัวที่ไม่เปลี่ยน" (serial, ยี่ห้อ) ออกจาก "สิ่งที่เปลี่ยนบ่อย" (ยอดพิมพ์, ที่ตั้ง) |
| [Attio Reporting](https://attio.com/platform/reporting) | ผลิตภัณฑ์จริง | `views/PrintTransactions.vue` — ตัวกรอง → ตาราง → การกระทำ ต้องต่อเนื่องกันโดยไม่ต้องเลื่อนกลับขึ้นไป |

**สิ่งที่ตัดสินใจจากกลุ่มนี้:** แถบเมนู 232px ย่อเป็น rail 64px ได้, topbar 56px,
เนื้อหา padding 24px, dashboard เป็นกริด 12 คอลัมน์ที่มีกราฟหลัก 8 คอลัมน์คู่กับ
แผงงานค้าง 4 คอลัมน์ — ไม่ใช่การ์ดสี่ใบเท่ากัน

## 2. พื้นผิว แสง และความรู้สึก "พรีเมียม"

| แหล่ง | ที่มา | เอามาใช้ที่ |
|---|---|---|
| [Golden Suisse — Moonsight](https://www.behance.net/gallery/186859499/Golden-Suisse) | ~6.2K appreciations, Featured UI/UX | `design/tokens.css` — แยกระดับพื้นผิวด้วย **ความสว่าง** ไม่ใช่ด้วยเงาหนักๆ; ที่ว่างรอบตัวเลขใหญ่คือสิ่งที่ทำให้ดูแพง ไม่ใช่ gradient |
| [Lando Norris — OFF+BRAND](https://www.awwwards.com/sites/lando-norris) | Site of the Year, 8.18/10 | `views/Login.vue`, `components/AuroraCanvas.vue` — เอกลักษณ์ที่จำได้ต้องมาจาก "ลายเซ็นภาพ" ชิ้นเดียวที่ใช้ซ้ำ ไม่ใช่เอฟเฟกต์กระจายทั้งเว็บ |
| [USWDS — Sign-in](https://designsystem.digital.gov/templates/authentication-pages/sign-in/) | design system ของรัฐบาลที่ใช้งานจริง | `views/Login.vue` — ฝั่งฟอร์มเป็นพื้นทึบ, ลำดับหัวเรื่อง→ช่องกรอก→คำสั่งหลัก และความช่วยเหลืออยู่ท้ายฟอร์ม |

**สิ่งที่ตัดสินใจจากกลุ่มนี้:** artwork แบบ aurora (ชั้นแสง teal→ส้ม) ใช้ **สอง
ที่เท่านั้น** — หน้าล็อกอิน และแผงสรุปบนสุดของแดชบอร์ด พื้นหลังของตาราง กราฟ
และฟอร์มยังต้องเรียบสนิทเพื่อให้อ่านข้อมูลได้เต็มที่

**ข้อที่ไม่เอาตาม Golden Suisse:** งานนั้นเป็นโหมดมืดล้วนและใช้ตัวอักษร serif
บางมากกับตัวเลขขนาดใหญ่ ซึ่งสวยในภาพนิ่งแต่อ่านยากบนจอทำงานทั้งวัน และไม่มี
ฟอนต์ serif ไทยที่คู่กันได้ — เก็บเฉพาะหลักการเว้นที่ว่างและการไล่ระดับพื้นผิว

## 3. การนำเสนอตัวเลขและกราฟ

### ทะเบียนต้นแบบ #48

| Reference | รูปแบบที่เลือกและจุดใช้ | เหตุผล / หลักฐาน |
|---|---|---|
| [Carbon data table](https://carbondesignsystem.com/components/data-table/usage/) | `AssetList.vue`: ค้นหาและตัวกรองก่อนตาราง, แก้ไขในแถว, ย้าย/ลบใน overflow menu | แยกคำสั่งรายแถวจากคำสั่งทั้งชุด; `registry.png` |
| [View Options](https://dribbble.com/shots/18146985-View-Option-Sorting) | `UiDataTable.vue`: กลุ่มเครื่องมือคอลัมน์/เต็มจอ/Excel | หาเครื่องมือมุมมองในตำแหน่งเดียว โดยคงการเรียงและ export เดิม; `registry.png` |
| [Wayflyer slide-overs](https://dribbble.com/shots/19470569-Wayflyer-Slide-overs) | `UiDrawer.vue`, `AssetForm.vue`, `MoveDeviceModal.vue`: แผงขวา หัว/footer คงที่ พื้นหลังเห็นรายการ | แก้ไขแล้วกลับคำค้น/หน้าเดิม; `edit.png`, `move.png` |

ตรวจแหล่งอ้างอิง 9 ก.ย. 2026 ใช้เป็นแนวทางองค์ประกอบ ไม่คัดลอก assets หรืออ้างว่าได้ทดสอบ usability ของต้นฉบับ ดู [วิธีเปิดหลักฐาน](../how-to/review-asset-prototype.md)

| แหล่ง | ที่มา | เอามาใช้ที่ |
|---|---|---|
| [Chart Cards — widelab](https://dribbble.com/shots/20454370-Chart-Cards) | ~2.1K likes | `ui/UiStat.vue` — ลำดับในการ์ดตัวเลข: ป้ายกำกับ → ตัวเลข+หน่วย → การเปลี่ยนแปลง → กราฟเล็ก; หน่วยตัวเล็กติดตัวเลขเสมอ ไม่แยกบรรทัด |
| [Search Results Animation — widelab](https://dribbble.com/shots/17399694-Search-Results-Animation) | ~2.7K likes | `app/AppCommandPalette.vue` — สถานะของช่องค้นหาต้องเปลี่ยนให้เห็น และผลลัพธ์ต้องแบ่งกลุ่มพร้อมป้ายบอกประเภท |

**บังคับทับทุกแหล่งข้างบน:** กฎ data visualization ของโครงการ (กราฟทุกอันผ่าน
`UiChart`, มีมุมมองตารางคู่เสมอ, ห้ามแกน y สองแกน, สีผูกกับตัวตนไม่ใช่อันดับ,
ชุดสีต้องผ่านตัวตรวจ colorblind ที่รันจริง) — ดู [design-system.md](design-system.md)

งานบน Dribbble หลายชิ้นละเมิดกฎเหล่านี้ (แกนคู่, สีไล่เฉด rainbow, ตัวเลขลอยไม่มี
หน่วย) จึงเอามาเฉพาะ **การจัดลำดับองค์ประกอบในการ์ด** ไม่เอาการเข้ารหัสข้อมูล

## 4. ตัวอักษรและความหนาแน่น

ไม่มีแหล่งภายนอกที่ตัดสินเรื่องนี้ให้ได้ เพราะงานอ้างอิงทั้งหมดเป็นภาษาอังกฤษ
ซึ่งมีความสูงบรรทัดและความยาวคำต่างจากไทยมาก

- **Anuphan** (Cadson Demak) เป็นฟอนต์ไทยไม่มีหัวที่ออกแบบมาสำหรับ UI โดยเฉพาะ
- **IBM Plex Mono** เฉพาะ serial/รหัส ที่ต้องอ่านทีละตัวอักษร
- body 14px / หัวข้อหน้า 24–28px / ตัวเลข KPI 32–40px
- ความสูงบรรทัดไทย 1.7 (สูงกว่ามาตรฐานอังกฤษ 1.5) เพราะสระบนล่างชนกัน

อยู่ที่ `design/tokens.css` และ `apps/web/index.html`

## 5. การเคลื่อนไหว

จังหวะทั้งหมดมาจากหลักเดียว: **การเคลื่อนไหวต้องบอกว่าอะไรเพิ่งเกิดขึ้น ไม่ใช่
ทำให้ดูมีชีวิต** ค่าที่ใช้อยู่ใน `design/tokens.css` เป็น token ห้าม hardcode

| จังหวะ | ค่า | ใช้กับ |
|---|---|---|
| `--dur-press` | 80ms | ปุ่มตอนกดลง |
| `--dur-hover` | 120ms | hover, focus ring |
| `--dur-pop` | 150ms | เมนู, tooltip |
| `--dur-panel` | 200ms | dialog, แผงข้าง |
| `--dur-enter` | 260ms | การเข้าหน้าครั้งแรก |
| `--dur-chart` | 250ms | กราฟปรับตามข้อมูล |

ข้อบังคับที่มาคู่กัน — **ตัวเลขเงินแสดงค่าจริงทันที ห้ามไล่นับจากศูนย์** เพราะ
คนอ่านงบไม่ได้มาดูอนิเมชัน และค่าที่กำลังวิ่งอยู่คือค่าที่ผิด และ **ห้ามมี
อนิเมชันใดๆ ขวางการกรอกข้อมูล** ในตารางยอดพิมพ์

`prefers-reduced-motion` แสดงสถานะปลายทางทันทีโดยยังคง feedback ไว้ (เปลี่ยนสี/
เส้นขอบแทนการเคลื่อนที่)

---

## สิ่งที่ดูแล้ว "ไม่" เอามาใช้ และเหตุผล

**glassmorphism / พื้นผิวเบลอโปร่ง** — เห็นแทบทุกชิ้นในกลุ่มอ้างอิง แต่ตัวหนังสือ
ไทยขนาด 14px บนพื้นเบลอที่มีข้อมูลอยู่ข้างหลังอ่านยากขึ้นจริง และ contrast วัดไม่
ได้เพราะพื้นหลังเปลี่ยนตามสิ่งที่เลื่อนผ่าน

**ตัวเลขไล่นับขึ้น (count-up)** — อยู่ในงาน dashboard เกือบทุกชิ้น แต่ระบบนี้แสดง
จำนวนเงินที่ต้องเอาไปตรวจใบแจ้งหนี้ ตัวเลขที่กำลังวิ่งคือตัวเลขที่ผิด

**พื้นหลังเคลื่อนไหวตลอดเวลา** — งานที่ได้รางวัลใช้ได้เพราะเป็นหน้า landing ที่คน
อยู่ 30 วินาที ระบบนี้คนเปิดทิ้งไว้ทั้งวัน artwork ของเราจึงเล่นจบใน 600ms แล้วหยุดนิ่ง

**แผนผังอาคารแบบ 3 มิติ / heatmap ตามผังชั้น** — สวยและตรงกับโดเมนโรงพยาบาลมาก
แต่ระบบไม่มีพิกัดของเครื่องในผังอาคาร มีแค่ชื่ออาคาร/ชั้น การวาดผังขึ้นมาจะเป็น
การ *แต่งข้อมูลที่ไม่มีจริง* ซึ่งอันตรายกว่าน่าเบื่อ

**Dribbble/Behance ในฐานะตัวตัดสินพฤติกรรม** — ใช้เลือกบุคลิกได้ แต่ไม่มีชิ้นไหน
ตอบได้ว่าตารางควรทำอย่างไรเมื่อชื่อแผนกยาว 40 ตัวอักษร หรือเมื่อ API ตอบช้า 3 วินาที
เรื่องพวกนั้นตัดสินจากการรันจริงกับฐานข้อมูลจริงและดูผลเอง

## ต้นแบบสามหน้า — รอบก่อน human gate #51

ต่อจาก reference เดิมใน SPEC #46 และ #48 โดยคง tokens/UI kit กลาง:

| แนวคิดอ้างอิง | จุดใช้ในต้นแบบ | เหตุผลและหลักฐาน |
|---|---|---|
| Carbon / View Options | เครื่องมือตารางยอดพิมพ์อยู่กลุ่มเดียว; เต็มจอคงเดือนและแถบบันทึก | เจ้าหน้าที่ตรวจขอบเขตก่อนบันทึกได้ ดูภาพ entry และพฤติกรรม fullscreen ในชุด prototype |
| Linear | ความคืบหน้าปีเป็นสรุปย่อที่กางได้; ตารางกรอกเป็นเนื้อหาหลัก | ลดส่วนที่แย่งพื้นที่แถวแรกบน 1280×720 โดยไม่ซ่อนงานค้างถาวร |
| Stripe / Attio / Chart Cards | ค่าใช้จ่ายคงลำดับช่วงเวลา → KPI พร้อมหน่วย/ส่วนลด → รายละเอียด และรักษาบริบทเมื่อสลับมุมมอง | ไม่ใช้ตัวเลขศูนย์แทน request ล้มเหลว; กลับมารายงานแล้วโหลดข้อมูลใหม่ ดูภาพ expense/department และ tests error/context |

ภาพก่อน/หลังและผลจริงอยู่ในชุดส่งมอบตาม [คู่มือตรวจสามหน้า](../how-to/review-three-page-prototype.md)
ทิศทางยังเป็นต้นแบบจนผู้ใช้รับรองที่ #51 ไม่อ้างผล usability หรือเวลาที่ลดลงเป็นเปอร์เซ็นต์จาก reference

## รอบที่ 3 — หลังผลตรวจรอบที่ 2 ของ #51

ผลตรวจรอบที่ 2 ไม่รับทิศทางภาพรวม (สี ความหนาแน่น การใช้พื้นที่ โหมดขยายตาราง) ทิศทางใหม่ผ่าน
mockup ที่ผู้ใช้เห็นชอบแล้วใน #51 ก่อนแก้โค้ด แหล่งรอบนี้เลือกจาก design system ของผลิตภัณฑ์
และงานบริการสาธารณะที่มีคนใช้จริง อ่านจากต้นฉบับ ตรวจเมื่อ 11 ก.ย. 2026

### ใช้แล้ว

| แหล่ง | สิ่งที่บอก | จุดใช้ในโค้ด |
|---|---|---|
| [Linear — How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) | กรอบ "inverted L", ลด visual noise, ไล่ระดับพื้นผิวด้วยความสว่าง | `layouts/MainLayout.vue`, `app/AppSidebar.vue`, `app/AppTopbar.vue`, `--chrome*` ใน `design/tokens.css` |
| [Radix Colors — Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) | 12 ขั้นแบ่งบทบาท พื้น / ส่วนประกอบ / เส้น / ทึบ / ตัวอักษร | ตารางบทบาทในหัวไฟล์ `design/tokens.css` |
| [Stripe — Designing accessible color systems](https://stripe.com/blog/accessible-color-systems) | ทุกเฉดสว่างเท่ากันต่อขั้น; ตัวอักษรกับพื้นห่างอย่างน้อยห้าขั้น | สเกล primitive เดิมทำตามอยู่แล้ว บันทึกเป็นกฎใน `design/tokens.css`; `--ink` เข้มขึ้นเป็น n-950 |
| [Material 3 — Tone-based surfaces](https://m3.material.io/blog/tone-based-surface-color-m3), [Side sheet](https://github.com/material-components/material-components-android/blob/master/docs/components/SideSheet.md) | แยกระดับด้วยโทนของพื้น ไม่ใช่เงาอย่างเดียว | `--sheet-head` / `--sheet-body` ใน `design/tokens.css` |
| [NN/g — Data tables](https://www.nngroup.com/articles/data-tables/), [NHS — Table](https://service-manual.nhs.uk/design-system/components/table) | hover และแถวสลับสีช่วยไล่แถว; แผงแก้ไขไม่ควรบังข้อมูลอ้างอิง | `--row-hover` / `--row-selected` / `--row-stripe` / `--scrim-panel` ใน `design/tokens.css` |

### รอใช้ในขั้นถัดไป (ยังไม่อยู่ในโค้ด)

| แหล่ง | สิ่งที่จะใช้ | ขั้น |
|---|---|---|
| [Carbon — Data table](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/data-table/usage.mdx), [Pagination](https://github.com/carbon-design-system/carbon-website/blob/main/src/pages/components/pagination/usage.mdx) | เครื่องมือตารางเป็นไอคอนได้ไม่เกินห้าปุ่ม; ตัวแบ่งหน้าอยู่ใต้ตารางเสมอ | 2 — ตารางกลาง |
| [Primer — DataTable](https://primer.style/product/components/data-table/guidelines/), [PageHeader](https://primer.style/product/components/page-header/guidelines/) | ชื่อหน้าเป็นชื่อตาราง; ตัวเลขชิดขวา tabular; ตัดข้อความเป็นทางเลือกสุดท้าย | 2 — หัวหน้าและตารางกลาง |
| [NN/g — Applying filters](https://www.nngroup.com/articles/applying-filters/) | ตัวกรองที่ใช้อยู่ต้องเห็นชัด ไม่เลื่อนหน้ากลับบนสุดระหว่างกรอง | 2–3 — แถวเครื่องมือ |
| [GOV.UK — Table](https://design-system.service.gov.uk/components/table/) | caption และ `scope` ทุกตาราง | 2 — ตารางกลาง |
