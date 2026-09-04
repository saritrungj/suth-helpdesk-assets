# โมเดลข้อมูล

ตารางและหน้าที่ — โครงสร้างเต็มพร้อมชนิดข้อมูลและ constraint อยู่ที่ `database/schema.sql` ซึ่งเป็น source of truth

| กลุ่ม | ตาราง | หน้าที่ |
|---|---|---|
| ผู้ใช้ | `users` | บัญชี รหัสผ่านแบบ bcrypt hash และ role |
| Master Data | `brand`, `building`, `floor`, `division`, `department` | ข้อมูลอ้างอิงของอุปกรณ์และรายงาน |
| ปีงบและสัญญา | `fiscal_year`, `contracts` | ช่วงปีงบและราคาต่อหน้า |
| ทรัพย์สิน | `devices` | ข้อมูลประจำเครื่อง ตำแหน่งปัจจุบัน สัญญา และสถานะ |
| ประวัติ | `device_location_history` | ช่วงเวลาที่เครื่องอยู่แต่ละสถานที่และหน่วยงาน |
| การใช้งาน | `print_transactions` | ยอดพิมพ์หนึ่งรายการต่อเครื่องต่อเดือน |

## ข้อบังคับที่ฐานข้อมูลเป็นคนกัน

| ตาราง | ข้อบังคับ | กันอะไร |
|---|---|---|
| `print_transactions` | `UNIQUE KEY uq_device_month (device_id, month)` | ยอดพิมพ์เดือนเดียวกันถูกบันทึกซ้ำแล้วนับสองรอบ |
| `print_transactions` | `CHECK chk_print_transactions_month_ce` | เดือนแบบ พ.ศ. หลุดเข้ามาไม่ว่าทางไหน |
| `fiscal_year` | `CHECK chk_fiscal_year_start_month_ce` / `..._end_month_ce` | ช่วงเดือนของปีงบถูกกรอกเป็น พ.ศ. |

## รูปแบบค่าที่ต้องรู้

| คอลัมน์ | รูปแบบ | หมายเหตุ |
|---|---|---|
| `fiscal_year.year` | `VARCHAR` เลข **พ.ศ.** | เช่น `"2569"` |
| `fiscal_year.start_month` / `end_month` | `CHAR(7)` `YYYY-MM` **ค.ศ.** | ปีงบ 2569 = `2025-10` ถึง `2026-09` |
| `print_transactions.month` | `VARCHAR(7)` `YYYY-MM` **ค.ศ.** | รับเข้าได้ทั้ง พ.ศ./ค.ศ. แต่เก็บเป็น ค.ศ. |
| `device_location_history.effective_to` | `DATE` หรือ `NULL` | `NULL` = ช่วงปัจจุบัน |
| `devices.status` | `active` / `repair` / `retired` | `retired` คือแทงจำหน่าย ประวัติยังอยู่ |

เหตุผลของรูปแบบเดือนอยู่ที่ [ADR-0002](../decisions/0002-store-months-in-common-era.md)
