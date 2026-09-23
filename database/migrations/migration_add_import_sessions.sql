-- รันหนึ่งครั้งสำหรับฐานข้อมูลเดิม — งานนำเข้าไฟล์เป็น session ฝั่งเซิร์ฟเวอร์ (ADR-0027, #179)
--
-- import_session        หนึ่งแถวต่อหนึ่งไฟล์ที่อัปโหลด: สถานะ การตัดสินใจ ผลตรวจล่าสุด ผลการบันทึก
-- import_session_event  ประวัติแบบเพิ่มอย่างเดียว: ใครทำอะไรเมื่อไร — ไม่มี API แก้หรือลบ
-- devices.import_session_id             session ที่สร้างเครื่องนี้
-- print_transactions.import_session_id  session ที่เขียนค่าปัจจุบันของยอดนี้ (ล้างเมื่อแก้ยอดด้วยมือ)
--
-- ไม่แตะแถวเดิม: ข้อมูลที่มีอยู่แล้วไม่รู้ที่มา จึงเป็น NULL (ไม่ใช่ "กรอกมือ") ตารางใหม่เริ่มว่าง
-- ไฟล์ต้นฉบับอยู่บนดิสก์ของ API (IMPORT_SESSION_DIR) ไม่อยู่ในฐาน

SET NAMES utf8mb4;

CREATE TABLE import_session (
    id INT AUTO_INCREMENT PRIMARY KEY,
    status ENUM('draft','validating','ready','processing','completed','failed','expired') NOT NULL DEFAULT 'draft',

    file_name VARCHAR(255) NOT NULL,
    file_size INT UNSIGNED NOT NULL,
    file_sha256 CHAR(64) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_kind VARCHAR(30) NULL,

    decisions JSON NULL,
    validation JSON NULL,
    fingerprint CHAR(64) NULL,
    result JSON NULL,
    error JSON NULL,

    created_by INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_by INT NULL,
    last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status_changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL DEFAULT NULL,

    CONSTRAINT fk_import_session_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_import_session_last_by FOREIGN KEY (last_activity_by) REFERENCES users(id),
    INDEX idx_import_session_status (status, last_activity_at),
    INDEX idx_import_session_sha (file_sha256)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE import_session_event (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    event VARCHAR(40) NOT NULL,
    actor_id INT NULL,
    detail JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT fk_import_event_session FOREIGN KEY (session_id) REFERENCES import_session(id),
    CONSTRAINT fk_import_event_actor FOREIGN KEY (actor_id) REFERENCES users(id),
    INDEX idx_import_event_session (session_id, id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE devices
    ADD COLUMN import_session_id INT NULL DEFAULT NULL,
    ADD CONSTRAINT fk_devices_import_session FOREIGN KEY (import_session_id) REFERENCES import_session(id);

ALTER TABLE print_transactions
    ADD COLUMN import_session_id INT NULL DEFAULT NULL,
    ADD CONSTRAINT fk_print_transactions_import_session FOREIGN KEY (import_session_id) REFERENCES import_session(id);
