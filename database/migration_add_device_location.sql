-- รันหนึ่งครั้งสำหรับฐานข้อมูลเดิม เพื่อเพิ่มตำแหน่งย่อยของเครื่อง
ALTER TABLE devices
  ADD COLUMN location VARCHAR(255) NULL AFTER floor_id;
