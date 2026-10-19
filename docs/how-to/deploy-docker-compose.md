# รันแอปด้วย Docker Compose แยก

`compose.assets.yaml` เปิด API, เว็บ และ Nginx เป็น project แยก เชื่อม MySQL 8.4 ที่เตรียมไว้แล้วผ่าน external network ไม่สร้างฐานหรือรัน migration อัตโนมัติ พอร์ตพัฒนาปกติยังเหมือนเดิม

Docker images ไม่มีข้อมูลธุรกิจหรือ credentials; build context กรอง environment, uploads, SQL dump และ ZIP ออก API รันด้วยผู้ใช้ `node`; เว็บ build ด้วย npm lockfile แล้วเสิร์ฟด้วย Nginx โดยเรียก API ผ่าน `/api` บน origin เดียวกัน

## ตั้งค่าบนเครื่อง local

ตรวจชื่อ MySQL container และ network จริงก่อน ตัวอย่างเครื่องที่ใช้ `db84-modern`:

```powershell
docker inspect db84-modern --format '{{range $name, $network := .NetworkSettings.Networks}}{{println $name}}{{end}}'
Copy-Item compose.assets.env.example .env.assets
```

คัดลอกเฉพาะเมื่อยังไม่มี `.env.assets` และแก้ค่าตามเครื่องนี้ ตัวอย่าง local HTTP:

```dotenv
SUTH_DB_HOST=db84-modern
SUTH_MYSQL_NETWORK=php-docker_default
SUTH_PROXY_NETWORK=php-docker_default
SUTH_NODE_ENV=development
SUTH_TRUST_PROXY_HOPS=1
SUTH_HTTP_PORT=8081
SUTH_PUBLIC_ORIGIN=http://localhost:8081
```

ชื่อ network ข้างบนเป็นตัวอย่าง ต้องใช้ผล inspect จริง ไฟล์ตัวอย่างใน repo ใช้ค่าเริ่มต้นสำหรับ server (`mysql84` และ production); local จึงต้องเปลี่ยนค่าข้างบนให้ครบ ตั้ง `SUTH_DB_NAME`, `SUTH_DB_USER` และรหัสบัญชีแอปที่มีสิทธิ์บนฐานนั้นเอง ไม่ใช้ root เป็นบัญชี runtime และไม่เปลี่ยนรหัสของฐาน shared เพื่อทดสอบ

ตั้ง `SUTH_DB_PASSWORD` และ `SUTH_JWT_SECRET` ในไฟล์ส่วนตัว; JWT ต้องสุ่มอย่างน้อย 32 ตัวอักษร เช่นผลจาก `openssl rand -hex 32` ไฟล์ `.env.assets` ถูก Git ละเว้นแล้ว ค่า production ใช้ cookie แบบ Secure; การเลือก development ข้างบนใช้เฉพาะ HTTP บน loopback สำหรับ local เท่านั้น

## Build และเปิด

รันจาก root ของ repo:

```powershell
docker compose -p suth-assets --env-file .env.assets -f compose.assets.yaml config --quiet
docker compose -p suth-assets --env-file .env.assets -f compose.assets.yaml up -d --build --wait
docker compose -p suth-assets --env-file .env.assets -f compose.assets.yaml ps
curl.exe -fsS http://localhost:8081/api/health
```

เปิด [หน้า Login local](http://localhost:8081/login) API `3000` และเว็บ `80` เปิดเฉพาะใน Docker; host publish เฉพาะ `127.0.0.1:8081` จึงไม่ยึดพอร์ต 80/443 หรือพอร์ตของแอปอื่น หากเปลี่ยน origin/พอร์ตให้แก้ environment ทั้งคู่ให้ตรงกัน

uploads และ import sessions อยู่ใน named volumes ของ project การอัปเดตใช้ `up -d --build --wait` เดิม ส่วน `down` หยุดเฉพาะ project และเก็บ volumes ไว้ ห้ามใช้ `down -v` กับข้อมูลที่ต้องเก็บ

ฐานต้องพร้อมตาม [คู่มือฐาน Docker](run-docker-database.md) และ [คู่มือ migration](run-migrations.md) ก่อนเปิดแอป การสร้าง schema/บัญชีและ migration เป็นงานผู้ดูแลที่ต้องได้รับอนุมัติ ไม่ทำอัตโนมัติจาก Compose

## ตรวจโดยไม่แตะฐาน shared

```powershell
npm run verify
npm run verify:docker
```

ดูขอบเขตและพอร์ตของ QA ใน [คู่มือตรวจการเปลี่ยนแปลง](verify-changes.md) การส่งขึ้น server, TLS, proxy อีกชั้นและ rollback อยู่ใน [คู่มือ server](deploy-server.md)
