-- database/migrations/migration_add_audit_log.sql
--
-- บันทึกการตรวจย้อนหลัง: ใครแก้อะไร เมื่อไร จากค่าอะไรเป็นค่าอะไร (audit 2026-09-24 F05, ADR-0035)
-- รันครั้งเดียวกับฐานที่มีอยู่แล้ว — ฐานใหม่ได้ตารางนี้จาก schema.sql
-- เพิ่มตารางใหม่อย่างเดียว ไม่แตะข้อมูลเดิม

CREATE TABLE audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    user_id INT NULL,
    username VARCHAR(50) NULL,
    action VARCHAR(20) NOT NULL,
    entity VARCHAR(40) NOT NULL,
    entity_id INT NULL,
    entity_key VARCHAR(100) NULL,
    summary VARCHAR(255) NOT NULL,
    before_value JSON NULL,
    after_value JSON NULL,
    request_id VARCHAR(64) NULL,

    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_entity (entity, entity_id, occurred_at),
    INDEX idx_audit_time (occurred_at),
    INDEX idx_audit_user (user_id, occurred_at)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
