# รัน migration กับฐานข้อมูลเดิม

ใช้เมื่อฐานข้อมูลมีข้อมูลอยู่แล้วและต้องอัปโครงสร้างให้ทันโค้ด ถ้าเป็นฐานข้อมูลใหม่ให้ใช้ `database/schema.sql` แทน ดู [ตั้งระบบสำหรับพัฒนา](set-up-development.md) — ไฟล์ migration ทั้งหมดอยู่ใน `database/migrations/`

> การเปลี่ยน schema และการรันกับ production **ต้องได้รับอนุมัติก่อนเสมอ**

## 1. สำรองข้อมูลก่อน

```sh
mysqldump --default-character-set=utf8mb4 --routines --triggers --single-transaction -u root -p your_database > backup-before-migration.sql
```

migration เหล่านี้เป็น one-time change ไม่ได้ออกแบบให้รันซ้ำได้ ถ้าพลาดต้องกู้จาก backup

## 2. ตรวจว่าฐานข้อมูลขาดตัวไหน

**ไม่ต้องไล่ดูเอง — สตาร์ต API แล้วมันบอก**

```sh
npm run dev:api
```

ถ้าฐานข้อมูลตามโค้ดไม่ทัน เซิร์ฟเวอร์จะ**ไม่เปิด** และพิมพ์ออกมาว่าขาดอะไรและต้องรันไฟล์ไหนตามลำดับไหน:

```text
ฐานข้อมูลยังไม่ได้อัปเดตให้ตรงกับโค้ดรุ่นนี้ ต้องรัน migration ที่ค้างอยู่ก่อน:

  migration_add_device_service_period.sql
      - ไม่มีคอลัมน์ devices.installation_status
      - ไม่มีตาราง device_service_period
```

ด่านนี้อยู่ที่ [`apps/api/src/shared/schema-check.js`](../../apps/api/src/shared/schema-check.js) — มีไว้เพราะของเดิมไม่มีอะไรฟ้องเลย เซิร์ฟเวอร์เปิดขึ้นมาปกติแล้วผู้ใช้เป็นคนไปเจอเองทีละหน้าในรูปของ `เกิดข้อผิดพลาดในระบบ` กับ HTTP 500 ที่ไม่บอกสาเหตุ

> **เพิ่ม migration ใหม่ต้องเพิ่มบรรทัดใน `schema-check.js` ด้วย** ถ้าลืม ฐานที่ตามไม่ทันจะกลับไปพังเป็น 500 เงียบๆ เหมือนเดิม — มีเทสผูก `schema.sql` กับรายการนั้นไว้ แต่เทสตรวจได้แค่ว่า "ของที่ประกาศไว้มีจริง" ไม่ได้ตรวจว่า "ประกาศครบ"

## 3. รันตามลำดับ

ลำดับสำคัญ เพราะบางตัวพึ่งพาตัวก่อนหน้า

| ลำดับ | ไฟล์ | เพิ่มอะไร |
|---|---|---|
| 1 | `migration_unique_print_transactions.sql` | `UNIQUE KEY (device_id, month)` กันยอดซ้ำ |
| 2 | `migration_add_fiscal_year_range.sql` | `fiscal_year.start_month` / `end_month` |
| 3 | `migration_add_device_location.sql` | `devices.location` |
| 4 | `migration_add_device_location_history.sql` | ตารางประวัติการย้าย (ต้องมีข้อ 3 ก่อน) |
| 5 | `migration_normalize_month_to_ce.sql` | แปลงเดือน พ.ศ. เป็น ค.ศ. และเพิ่ม `CHECK` |
| 6 | `migration_update_page_deduction_to_two_percent.sql` | เปลี่ยน view รายงานให้หัก 2% จากจำนวนหน้าดิบ |
| 7 | `migration_add_device_service_period.sql` | สถานะการติดตั้ง ช่วงความรับผิดชอบ และ index ของเดือน |
| 8 | `migration_round_cost_per_reading.sql` | ให้ view ปัดค่าใช้จ่ายทีละรายการ ให้ตรงกับที่โค้ดคำนวณ (ต้องรันหลังข้อ 6) |
| 9 | `migration_add_effective_pricing.sql` | ราคาผูกกับช่วงที่มีผลจริง และประวัติว่าเครื่องคิดเงินภายใต้สัญญาไหน (ต้องรันหลังข้อ 8) |
| 10 | `migration_billing_lines_and_meters.sql` | อายุสัญญา รายการราคาต่อหมวด มิเตอร์ ราคา 4 ตำแหน่ง และการปัดยอดระดับรายการราคา (ต้องรันหลังข้อ 9) |
| 11 | `migration_add_master_aliases.sql` | ชื่อเรียกอื่นของยี่ห้อ อาคาร และฝ่าย ([ADR-0025](../decisions/0025-master-data-aliases.md)) |

```sh
mysql --default-character-set=utf8mb4 -u root -p your_database < database/migrations/migration_add_device_location.sql
```

> ⚠️ **ต้องมี `--default-character-set=utf8mb4` ทุกครั้ง**
>
> client ของ MySQL/MariaDB บน Windows ใช้ charset ของ console เป็นค่าเริ่มต้น
> (มักเป็น cp874 หรือ cp1252) การ pipe ไฟล์ SQL เข้าไปโดยไม่ระบุ charset จะทำให้
> ข้อความไทยทุกตัวถูกเข้ารหัสซ้อนตอนเขียนลงฐาน
>
> ที่อันตรายคือมัน **ไม่ error และดูปกติเมื่ออ่านผ่าน client ตัวเดิม** เพราะแปลง
> กลับด้วยวิธีเดียวกัน แต่แอปที่ต่อด้วย utf8mb4 จะอ่านได้เป็นอักขระขยะ ชื่ออาคาร
> และแผนกจะไม่ตรงกับตัวกรอง แล้วรายงานจะว่างเปล่าโดยไม่มีอะไรฟ้อง
>
> ใช้กับทุกคำสั่งในหน้านี้ รวมถึง `mysqldump` ตอนสำรองและตอนกู้คืน

## 4. ตรวจผล

```sh
mysql -u root -p your_database -e "SELECT year, start_month, end_month FROM fiscal_year; SELECT MIN(month), MAX(month), COUNT(*) FROM print_transactions; SELECT COUNT(*) AS readings_without_meter FROM print_transactions WHERE meter_id IS NULL; SELECT COUNT(*) AS unpriced FROM v_monthly_kpi WHERE total_cost IS NULL;"
```

`start_month` / `end_month` และ `print_transactions.month` ต้องเป็น ค.ศ. จำนวนแถวต้องเท่าเดิม และ `readings_without_meter` ต้องเป็น `0`

`unpriced` หลังข้อ 10 ต้อง**ไม่มากกว่าก่อนรัน** (นับก่อนรันด้วย `SELECT COUNT(*) FROM v_monthly_kpi WHERE total_cost IS NULL`) — ยอดที่หาราคาไม่ได้อยู่แล้วคือเดือนที่ไม่มีสัญญาคิดเงินหรืออยู่นอกอายุสัญญา migration ไม่เดาสัญญาให้ ดูรายการและสาเหตุได้ที่ลิ้นชักแจ้งเตือนบนหน้าภาพรวม แล้วแก้ที่ต้นเหตุ: แก้อายุสัญญาตามเอกสาร หรือผูกเครื่องกับสัญญาโดยระบุวันเริ่มคิดเงินย้อนหลังในหน้าแก้เครื่อง ยอดเงินในเดือนที่มีราคาอยู่แล้วอาจต่างจากเดิมไม่กี่สตางค์ เพราะปัดที่ระดับรายการราคาตาม [ADR-0022](../decisions/0022-round-at-invoice-line-and-allocate.md)

ถ้าข้อ 10 หยุดทันทีพร้อมข้อความ "พบสัญญาที่มีวันเริ่มหรือวันสิ้นสุดเพียงค่าเดียว" หรือ "ไม่มีทั้งช่วงที่มีผลและปีงบ" ยังไม่มีอะไรถูกแก้ ให้กรอกวันเริ่มและวันสิ้นสุดของสัญญาเหล่านั้นตามเอกสารแล้วรันใหม่

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
