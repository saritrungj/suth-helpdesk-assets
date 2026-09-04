# รัน migration กับฐานข้อมูลเดิม

ใช้เมื่อฐานข้อมูลมีข้อมูลอยู่แล้วและต้องอัปโครงสร้างให้ทันโค้ด ถ้าเป็นฐานข้อมูลใหม่ให้ใช้ `database/schema.sql` แทน ดู [ตั้งระบบสำหรับพัฒนา](set-up-development.md)

> การเปลี่ยน schema และการรันกับ production **ต้องได้รับอนุมัติก่อนเสมอ**

## 1. สำรองข้อมูลก่อน

```sh
mysqldump -u root -p your_database > backup-before-migration.sql
```

migration เหล่านี้เป็น one-time change ไม่ได้ออกแบบให้รันซ้ำได้ ถ้าพลาดต้องกู้จาก backup

## 2. ตรวจว่าฐานข้อมูลขาดตัวไหน

ดูโครงสร้างปัจจุบันก่อนแล้วเลือกเฉพาะที่ยังขาด อย่ารันทั้งชุดโดยไม่ตรวจ

```sh
mysql -u root -p your_database -e "DESCRIBE fiscal_year; DESCRIBE devices; SHOW INDEX FROM print_transactions;"
```

## 3. รันตามลำดับ

ลำดับสำคัญ เพราะบางตัวพึ่งพาตัวก่อนหน้า

| ลำดับ | ไฟล์ | เพิ่มอะไร |
|---|---|---|
| 1 | `migration_unique_print_transactions.sql` | `UNIQUE KEY (device_id, month)` กันยอดซ้ำ |
| 2 | `migration_add_fiscal_year_range.sql` | `fiscal_year.start_month` / `end_month` |
| 3 | `migration_add_device_location.sql` | `devices.location` |
| 4 | `migration_add_device_location_history.sql` | ตารางประวัติการย้าย (ต้องมีข้อ 3 ก่อน) |
| 5 | `migration_normalize_month_to_ce.sql` | แปลงเดือน พ.ศ. เป็น ค.ศ. และเพิ่ม `CHECK` |

```sh
mysql -u root -p your_database < database/migration_add_device_location.sql
```

## 4. ตรวจผล

```sh
mysql -u root -p your_database -e "SELECT year, start_month, end_month FROM fiscal_year; SELECT MIN(month), MAX(month), COUNT(*) FROM print_transactions;"
```

`start_month` / `end_month` ต้องเป็น ค.ศ. เช่น ปีงบ 2569 ได้ `2025-10` ถึง `2026-09` และ `month` ใน `print_transactions` ต้องเป็น ค.ศ. ทั้งหมด จำนวนแถวต้องเท่าเดิม

## ถ้า migration ตัวที่ 5 หยุดกลางคัน

ข้อความจะบอกว่าพบยอดพิมพ์เดือนเดียวกันถูกบันทึกไว้ทั้งแบบ พ.ศ. และ ค.ศ. — ตั้งใจให้หยุดโดยไม่แตะข้อมูล เพราะต้องมีคนตัดสินว่ายอดไหนถูก

หาแถวที่ชนกัน:

```sql
SELECT be.device_id, be.month AS be_month, ce.month AS ce_month, be.pages, ce.pages
FROM print_transactions be
JOIN print_transactions ce
  ON ce.device_id = be.device_id
 AND ce.month = CONCAT(CAST(SUBSTRING(be.month,1,4) AS UNSIGNED) - 543, SUBSTRING(be.month,5))
WHERE CAST(SUBSTRING(be.month,1,4) AS UNSIGNED) >= 2400;
```

รวมหรือลบให้เหลือแถวเดียวต่อเครื่องต่อเดือน แล้วรัน migration ใหม่

เหตุผลเบื้องหลังอยู่ที่ [ADR-0002](../decisions/0002-store-months-in-common-era.md)
