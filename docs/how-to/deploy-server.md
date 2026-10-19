# นำ Docker images ขึ้น server

การ deploy กับข้อมูลจริงต้องได้รับอนุมัติตาม [CONTRIBUTING](../../CONTRIBUTING.md) พร้อม [checklist production](prepare-for-production.md), backup และ restore rehearsal ที่ผ่านก่อน ขั้นตอนนี้เป็นคู่มือ ไม่ใช่หลักฐานว่า server ใดได้รับการตรวจหรือ deploy แล้ว สถานะจริงอยู่ใน [deployment reference](../reference/deployment.md)

## เตรียมรุ่นและฐาน

ใช้ source จาก commit ที่อนุมัติและผ่าน `npm run verify` กับ `npm run verify:docker` เครื่องต้องมี Docker Engine/Compose v2 และ MySQL 8.4 เดิม คำสั่ง build/เปิด/หยุดและที่เก็บ volumes อยู่ใน [คู่มือ Compose](deploy-docker-compose.md)

ตรวจ MySQL container และชื่อ network จริง เช่น:

```sh
docker inspect mysql84 --format '{{range $name, $network := .NetworkSettings.Networks}}{{println $name}}{{end}}'
```

ตั้ง `SUTH_DB_HOST=mysql84` และ `SUTH_MYSQL_NETWORK` ตามผลจริง (`docker-compose_modern_net` เป็นเพียงตัวอย่าง) API ใช้พอร์ต MySQL ภายใน `3306` ไม่ใช่พอร์ตที่ publish บน host และไม่ใช้ `localhost` เป็น DB host ภายใน container

ผู้ดูแลต้องเตรียม schema และบัญชี runtime เฉพาะแอปตาม [คู่มือตั้งระบบ](set-up-development.md) และ [migration](run-migrations.md) ไม่ใช้ root ไม่โหลด schema ทับฐานเดิม และไม่คัดลอก SQL dump/ข้อมูลอัปโหลดไปไว้ใน source/image การย้ายข้อมูลเป็นกระบวนการแยกตาม [release/recovery](release-and-recovery.md)

## Environment และเครือข่าย

สร้าง `.env.assets` แบบส่วนตัวจาก `compose.assets.env.example` เก็บสิทธิ์ไฟล์ให้เฉพาะผู้ดูแลอ่านได้ ตั้งรหัสบัญชีฐานและ JWT สุ่มจริง โดยไม่บันทึกค่าใน Git, log หรือ ticket ค่าที่ต่างจาก local:

```dotenv
SUTH_NODE_ENV=production
SUTH_PUBLIC_ORIGIN=https://helpdesk.example.org
SUTH_TRUST_PROXY_HOPS=2
SUTH_PROXY_NETWORK=helpdesk-proxy
```

เปลี่ยน origin เป็นโดเมนจริง ตัวอย่างนี้มี Nginx หน้า HTTPS หนึ่งชั้น แล้วผ่าน Nginx ของแอปอีกหนึ่งชั้น จึงใช้ trust proxy 2 หากเส้นทางต่างกันต้องนับใหม่ตาม [environment reference](../reference/environment.md) ไม่เปลี่ยน auth/session policy ของ API

`SUTH_MYSQL_NETWORK` ให้ API ติดต่อฐาน ส่วน `SUTH_PROXY_NETWORK` ให้ Nginx ด้านหน้าติดต่อ `suth-assets-proxy:80` ทั้งสองเป็น external networks ที่ต้องมีอยู่จริง เชื่อม Nginx ด้านหน้าเข้ากับ network ที่กำหนดโดยคง network ของบริการเดิมไว้ ตรวจ Compose/Nginx syntax ก่อนเปลี่ยนบริการจริง

## Reverse proxy และ TLS

ใน HTTPS server block ของ Nginx ด้านหน้าที่มี certificate ของโดเมนจริงแล้ว ใช้ upstream ของ project:

```nginx
location / {
    proxy_pass http://suth-assets-proxy:80;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 25m;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
}
```

คง certificate/HTTP-to-HTTPS redirect ของ vhost เดิม และให้ผู้ดูแลตรวจ `nginx -t` ก่อน reload พอร์ต `8081` ของแอป bind เฉพาะ loopback; Nginx ที่อยู่ใน Docker ต้องเรียก service ผ่าน shared network ข้างบน

## เปิดและตรวจรับ

ใช้คำสั่ง Compose จาก [คู่มือ local](deploy-docker-compose.md#build-และเปิด) พร้อมไฟล์ environment ของ server จากนั้นตรวจ `/api/health/live`, `/api/health` และ `/login` ผ่านโดเมน HTTPS จริง ตรวจ Login, role, ทะเบียนและรายงานตาม [release/recovery](release-and-recovery.md) บันทึก commit, ผลตรวจและ rollback ตามกระบวนการหน่วยงาน

- API ไม่ healthy: ตรวจ log, network, schema readiness และสิทธิ์บัญชีแอป
- 502: ตรวจว่าทั้ง proxy อยู่ network เดียวกันและ upstream resolve ได้
- Login ไม่ค้าง: ตรวจ HTTPS, production mode และ origin/cookie configuration

การ build image ผ่านไม่แทน authenticated production acceptance หรือการซ้อม reboot/backup ห้ามใช้ `down -v` ลบข้อมูลเพื่อแก้ปัญหา
