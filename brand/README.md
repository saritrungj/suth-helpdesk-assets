# ไฟล์ต้นฉบับโลโก้

`logo-suth.jpg` คือไฟล์ต้นฉบับความละเอียดเต็ม (4096×4096, พื้นขาว) เก็บไว้ที่นี่
เพื่อให้สร้างไฟล์ที่เว็บใช้จริงขึ้นมาใหม่ได้ ไม่ได้ถูกโหลดโดยแอปโดยตรง

ไฟล์ที่เว็บใช้จริงอยู่ใน `apps/web/public/` และสร้างจากไฟล์นี้ด้วย ffmpeg:

```sh
# ตัดขอบขาวส่วนเกินออก (เหลือเฉพาะตัวโลโก้ + เว้นระยะเล็กน้อย) แล้วย่อ
ffmpeg -y -i brand/logo-suth.jpg \
  -vf "crop=3776:1552:136:1280,scale=480:-2" \
  apps/web/public/logo-suth.png

# ไอคอนหน้าจอโฮมของ iOS — จัดโลโก้กลางกรอบสี่เหลี่ยมพื้นขาว
ffmpeg -y -i brand/logo-suth.jpg \
  -vf "crop=3776:1552:136:1280,scale=164:68,pad=180:180:8:56:white" \
  apps/web/public/apple-touch-icon.png

# favicon
ffmpeg -y -i brand/logo-suth.jpg \
  -vf "crop=3776:1552:136:1280,scale=58:24,pad=64:64:3:20:white" \
  apps/web/public/favicon.png
```

โลโก้เป็นภาพ **พื้นขาวทึบ** (ไม่มีพื้นหลังโปร่งใส) เวลาวางในหน้าเว็บจึงต้องวางบนแผ่น
`bg-white` เสมอ — ห้ามใช้ `bg-gray-50` เพราะ `bg-gray-*` ถูกพลิกเป็นสีเข้มในโหมดมืด
(ดู `apps/web/src/style.css`) แล้วจะเห็นเป็นกล่องขาวลอยอยู่บนพื้นเข้ม

## โลโก้ปรากฏที่ไหนบ้าง

`screenshots/` เก็บภาพหน้าจอจริงของทุกจุดที่ใช้โลโก้ ไว้เทียบตอนที่ต้องเปลี่ยนโลโก้หรือปรับขนาดรอบหน้า
ถ่ายด้วย Chrome headless จาก dev server (ย่อจาก DPR 2 เหลือ 1 เท่า)

| ภาพ | จุดที่ใช้ | ไฟล์ที่เกี่ยวข้อง |
|---|---|---|
| `login-dark.png` / `login-light.png` | หน้าเข้าสู่ระบบ | `apps/web/src/views/Login.vue` |
| `dashboard-dark.png` / `dashboard-light.png` | แถบเมนูด้านข้าง และแถบด้านบน | `apps/web/src/components/Sidebar.vue`, `Navbar.vue` |
| `mobile-sidebar-dark.png` | แถบเมนูตอนเปิดบนจอมือถือ (390px) | `apps/web/src/components/Sidebar.vue` |

จุดที่ต้องดูทุกครั้งที่เปลี่ยนโลโก้ คือโหมดมืด — เป็นโหมดเริ่มต้นของระบบ และเป็นโหมดที่แผ่นรอง
`bg-white` มีผลจริง ส่วนโหมดสว่างแผ่นรองจะกลืนกับพื้นจนแทบไม่เห็น
