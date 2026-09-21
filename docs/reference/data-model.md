# โมเดลข้อมูล

ตารางและหน้าที่ — โครงสร้างเต็มพร้อมชนิดข้อมูลและ constraint อยู่ที่ `database/schema.sql` ซึ่งเป็น source of truth

| กลุ่ม | ตาราง | หน้าที่ |
|---|---|---|
| ผู้ใช้ | `users` | บัญชี รหัสผ่านแบบ bcrypt hash และ role |
| Master Data | `brand`, `building`, `floor`, `division`, `department` | ข้อมูลอ้างอิงของอุปกรณ์และรายงาน |
| ปีงบและสัญญา | `fiscal_year`, `contracts`, `contract_price_line` | ช่วงปีงบ อายุสัญญา และราคาต่อหมวดมิเตอร์ |
| ทรัพย์สิน | `devices` | ข้อมูลประจำเครื่อง ตำแหน่งปัจจุบัน สัญญา และสถานะ |
| ประวัติ | `device_location_history` | ช่วงเวลาที่เครื่องอยู่แต่ละสถานที่และหน่วยงาน |
| ประวัติ | `device_service_period` | ช่วงเวลาที่เครื่องต้องบันทึกยอดพิมพ์ (ติดตั้งแล้ว + ใช้งานอยู่) |
| ประวัติ | `device_contract_history` | ช่วงเวลาที่เครื่องถูกคิดเงินภายใต้สัญญาฉบับไหน ด้วยราคาเฉพาะเครื่องเท่าไหร่ |
| มิเตอร์ | `meter_category`, `device_meter` | หมวดราคาและมิเตอร์ขาวดำ/สีของแต่ละเครื่อง |
| การใช้งาน | `print_transactions` | ยอดพิมพ์หนึ่งรายการต่อมิเตอร์ต่องวด พร้อมเลขต้นงวด/สิ้นงวด |

สองตารางประวัติตอบคนละคำถาม และ **ใช้กฎการเทียบเดือนต่างกันโดยตั้งใจ**

| ตาราง | ตอบคำถามว่า | ปลายช่วง |
|---|---|---|
| `device_location_history` | ยอดของเดือนนี้เป็นของหน่วยงานไหน | **ไม่รวม** เดือนที่ย้าย — ยอดหนึ่งเดือนมีเจ้าของได้คนเดียว |
| `device_service_period` | เดือนนี้เครื่องไหนต้องกรอกยอด | **รวม** เดือนที่ปิดช่วง — ติดตั้งอยู่แม้บางส่วนของเดือนก็ต้องกรอก ([ADR-0018](../decisions/0018-separate-installation-status.md) Q20) |

กฎอยู่ที่ `apps/api/src/shared/effective-location-sql.js` และ `packages/domain/service-period.cjs` ตามลำดับ — ห้ามรวมเป็นฟังก์ชันเดียวกันเพราะเห็นว่าหน้าตาคล้ายกัน

## ข้อบังคับที่ฐานข้อมูลเป็นคนกัน

| ตาราง | ข้อบังคับ | กันอะไร |
|---|---|---|
| `print_transactions` | `UNIQUE KEY uq_meter_month (meter_id, month)` | ยอดของมิเตอร์เดียวกันในงวดเดียวกันถูกนับซ้ำ |
| `contract_price_line` | `UNIQUE KEY (contract_id, category_id)` | สัญญามีราคาซ้ำในหมวดเดียวกัน |
| `device_meter` | `UNIQUE KEY (device_id, category_id)` | เครื่องมีมิเตอร์หมวดเดียวกันซ้ำ |
| `print_transactions` | `CHECK chk_print_transactions_month_ce` | เดือนแบบ พ.ศ. หลุดเข้ามาไม่ว่าทางไหน |
| `fiscal_year` | `CHECK chk_fiscal_year_start_month_ce` / `..._end_month_ce` | ช่วงเดือนของปีงบถูกกรอกเป็น พ.ศ. |
| `device_service_period` | `CHECK chk_device_service_period_order` | ช่วงที่สิ้นสุดก่อนเริ่ม ซึ่งจะทำให้เดือนนั้นหายจากตัวส่วนเงียบๆ |
| `device_contract_history` | `CHECK chk_device_contract_history_order` | ช่วงการคิดเงินที่สิ้นสุดก่อนเริ่ม |
| `contracts` | `CHECK chk_contracts_effective_order` | ช่วงที่สัญญามีผลซึ่งสิ้นสุดก่อนเริ่ม |

## รูปแบบค่าที่ต้องรู้

| คอลัมน์ | รูปแบบ | หมายเหตุ |
|---|---|---|
| `fiscal_year.year` | `VARCHAR` เลข **พ.ศ.** | เช่น `"2569"` |
| `fiscal_year.start_month` / `end_month` | `CHAR(7)` `YYYY-MM` **ค.ศ.** | ปีงบ 2569 = `2025-10` ถึง `2026-09` |
| `print_transactions.month` | `VARCHAR(7)` `YYYY-MM` **ค.ศ.** | รับเข้าได้ทั้ง พ.ศ./ค.ศ. แต่เก็บเป็น ค.ศ. |
| `device_location_history.effective_to` | `DATE` หรือ `NULL` | `NULL` = ช่วงปัจจุบัน |
| `device_service_period.effective_to` | `DATE` หรือ `NULL` | `NULL` = ยังรับผิดชอบยอดอยู่ |
| `devices.status` | `active` / `repair` / `retired` | `retired` คือแทงจำหน่าย ประวัติยังอยู่ |
| `devices.installation_status` | `installed` / `not_installed` / `NULL` | **`NULL` = ยังไม่มีใครตรวจ ไม่ใช่ "ยังไม่ได้ติดตั้ง"** |
| `devices.service_unverified_before` | `DATE` หรือ `NULL` | `NULL` = ยืนยันครบทุกช่วงเวลา · วันที่ = ก่อนวันนั้นยังยืนยันไม่ได้ |
| `contracts.effective_from` / `effective_to` | `DATE` บังคับ | อายุสัญญาที่ราคา ค่าเช่า และ VAT มีผล ([ADR-0023](../decisions/0023-contract-term-price-lines-and-meters.md)) |
| `contract_price_line.price_per_page` | `DECIMAL(10,4)` | ราคาต่อหน้าของหนึ่งหมวดมิเตอร์ |
| `device_contract_history.contract_id` | `INT` หรือ `NULL` | `NULL` = รู้ว่าช่วงนั้นไม่ได้ผูกสัญญา ต่างจาก "ไม่มีช่วงเลย" ซึ่งแปลว่าไม่รู้ |
| `v_monthly_kpi.total_cost` | `DECIMAL` หรือ `NULL` | ส่วนของยอดรายการราคาต่องวดที่กระจายกลับมายังมิเตอร์ · `NULL` = หาราคาไม่ได้ ซึ่งทางเขียนปฏิเสธแล้ว จึงเหลือเฉพาะยอดเก่าก่อน [ADR-0021](../decisions/0021-contract-price-applies-on-save.md) |

เหตุผลของรูปแบบเดือนอยู่ที่ [ADR-0002](../decisions/0002-store-months-in-common-era.md)
