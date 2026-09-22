#!/bin/bash
# database/docker/initdb/20-app-users.sh — บัญชีฐานข้อมูลของแอปและของเครื่องมือดูข้อมูล
#
# entrypoint ของ image MySQL รันไฟล์นี้ครั้งเดียวตอนสร้างฐานครั้งแรก หลัง 10-schema.sql
# ไฟล์ที่มีสิทธิ์ execute ถูก "รัน" ไฟล์ที่ไม่มีถูก "source" เข้าไปในตัว entrypoint เอง
# บน Windows ไฟล์ที่ bind mount มามี execute เสมอ ส่วน Linux/macOS ขึ้นกับโหมดใน git —
# ไฟล์นี้จึงเก็บใน git เป็น 100755 ให้ถูก "รัน" ทุกเครื่อง (ถ้าถูก source, set -u ด้านล่าง
# จะไปมีผลกับ entrypoint ทั้งตัว) และไม่พึ่งฟังก์ชันของ entrypoint — ต่อ socket ด้วย client ตรงๆ
#
#   SUTH_APP_USER       ให้ API ใช้ — SELECT/INSERT/UPDATE/DELETE บนฐานนี้เท่านั้น
#                       API ไม่เคยสร้างหรือแก้ตาราง จึงไม่ต้องมีสิทธิ์ DDL
#                       + SHOW VIEW เพราะตัวตรวจ schema ตอนบูต (shared/schema-check.js) อ่าน
#                       นิยาม view จาก information_schema ซึ่งว่างเปล่าถ้าไม่มีสิทธิ์นี้
#   SUTH_READONLY_USER  ให้ phpMyAdmin / DBeaver — SELECT อย่างเดียว ดูได้ว่าข้อมูลเข้าหรือยัง
#                       แต่แก้ไม่ได้ เพราะการแก้ต้องผ่านกฎสิทธิ์และประวัติในชั้น API
#
# ทั้งสองบัญชีเป็น '%' เพราะ API บนเครื่อง host และ phpMyAdmin ใน container อื่น
# เข้ามาจากคนละ address — พอร์ตฐานผูก 127.0.0.1 ไว้แล้ว (compose.yaml) จึงไม่เปิดออกนอกเครื่อง
#
# entrypoint ไม่หยุดเมื่อไฟล์นี้ล้ม (ลองแล้ว) — npm run db:bootstrap จึงตรวจซ้ำว่าบัญชีแอปต่อได้

set -euo pipefail

# ค่าทั้งหมดถูกแทนลงใน SQL ตรงๆ — ชื่อจำกัดเป็นตัวอักษร ตัวเลข และ _ ส่วนรหัสห้ามมีอักขระที่
# ปิดสตริงของ SQL ได้ หรือที่ docker compose แปลความหมายเองใน env file ($ และเครื่องหมายคำพูด)
for value in "$SUTH_APP_USER" "$SUTH_READONLY_USER" "$MYSQL_DATABASE"; do
  if [[ ! "$value" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "ชื่อบัญชีและชื่อฐานต้องเป็น A-Z a-z 0-9 _ เท่านั้น (พบ \"$value\")" >&2; exit 1
  fi
done
for value in "$SUTH_APP_PASSWORD" "$SUTH_READONLY_PASSWORD"; do
  case "$value" in
    *"'"* | *'"'* | *"\\"* | *'$'*) echo "รหัสผ่านต้องไม่มี ' \" \\ หรือ \$" >&2; exit 1 ;;
  esac
done

MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket -uroot <<-EOSQL
  CREATE USER '${SUTH_APP_USER}'@'%' IDENTIFIED BY '${SUTH_APP_PASSWORD}';
  GRANT SELECT, INSERT, UPDATE, DELETE, SHOW VIEW ON \`${MYSQL_DATABASE}\`.* TO '${SUTH_APP_USER}'@'%';

  CREATE USER '${SUTH_READONLY_USER}'@'%' IDENTIFIED BY '${SUTH_READONLY_PASSWORD}';
  GRANT SELECT, SHOW VIEW ON \`${MYSQL_DATABASE}\`.* TO '${SUTH_READONLY_USER}'@'%';
EOSQL

echo "สร้างบัญชี ${SUTH_APP_USER} และ ${SUTH_READONLY_USER} แล้ว"
