-- database/migrations/migration_add_contract_meter_cycle_day.sql
--
-- วันเริ่มรอบมิเตอร์ของสัญญา (#221) — รายงานของผู้ให้เช่าบางสัญญาตัดรอบวันที่ 24 ถึง 23 แล้วเรียกรอบตามเดือนที่จบ
-- เครื่องที่ติดตั้งตั้งแต่วันตัดรอบขึ้นไปจึงมียอดครั้งแรกในรายงานเดือนถัดไป (ดู packages/domain billingPeriodStart)
-- NULL = ตัดรอบสิ้นเดือน (วันที่ 1) ระบบนำเข้าตั้งค่าให้เองจากงวดในหัวรายงานมิเตอร์
-- เพิ่มคอลัมน์อย่างเดียว ไม่แตะข้อมูลเดิม

ALTER TABLE contracts
    ADD COLUMN meter_cycle_day TINYINT UNSIGNED NULL AFTER vat_rate,
    ADD CONSTRAINT chk_contracts_meter_cycle_day CHECK (meter_cycle_day IS NULL OR meter_cycle_day BETWEEN 1 AND 28);
