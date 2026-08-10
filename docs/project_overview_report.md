# รายงานสรุปโครงการ Hospital IT Asset Management

เอกสารฉบับนี้สรุปโครงการจากโค้ดและไฟล์ที่มีอยู่จริงใน repository `D:\suth-helpdesk-assets` โดยครอบคลุมวัตถุประสงค์ ผู้ใช้งาน ความสามารถ สถาปัตยกรรม การทำงาน เทคโนโลยี โครงสร้างฐานข้อมูล API และรายละเอียดไฟล์/โฟลเดอร์

วันที่ตรวจสอบ: 10 สิงหาคม 2026  
สถานะก่อนจัดทำรายงาน: branch `main`, working tree สะอาด  
จำนวนไฟล์ที่ Git ติดตามก่อนเพิ่มรายงาน: 91 ไฟล์  
ไฟล์รายงานนี้: `docs/project_overview_report.md`

## 1. สรุปสั้นที่สุด

นี่คือเว็บแอปภายในสำหรับโรงพยาบาล ใช้บริหารทรัพย์สิน IT โดยเน้นเครื่องพิมพ์และเครื่องถ่ายเอกสาร ระบบช่วยให้ทีม IT และผู้บริหารสามารถ:

- เก็บทะเบียนเครื่อง เช่น Serial Number, ยี่ห้อ, รุ่น, อาคาร, ชั้น, ฝ่าย, แผนก และสถานะเครื่อง
- ผูกเครื่องกับสัญญาและปีงบประมาณ รวมถึงราคาต่อแผ่น
- บันทึกยอดพิมพ์รายเดือนจากมิเตอร์ หรือกรอกทีละเครื่องครบ 12 เดือน
- คำนวณจำนวนหน้าสุทธิและค่าใช้จ่ายโดยอัตโนมัติ
- ดู Dashboard, KPI, กราฟ, ค่าใช้จ่ายตามสัญญา อาคาร ฝ่าย และแผนก
- เปรียบเทียบการใช้งานระหว่างเดือน
- นำเข้าข้อมูลจาก CSV/Excel และรายงานแถวที่นำเข้าไม่ได้พร้อมเหตุผล
- ควบคุมสิทธิ์ด้วย Login, JWT และบทบาทผู้ใช้

จุดเด่นเชิงธุรกิจของเวอร์ชันปัจจุบันคือการแก้ปัญหาการนับยอดผิดปีงบ โดยใช้ปีงบราชการไทยจริง คือ 1 ตุลาคมถึง 30 กันยายน แทนการสมมติว่าปีงบตรงกับมกราคมถึงธันวาคม

## 2. ระบบนี้ทำเกี่ยวกับอะไร เพื่ออะไร และทำให้ใคร

### 2.1 ทำเกี่ยวกับอะไร

ระบบจัดการวงจรข้อมูลของเครื่องพิมพ์/เครื่องถ่ายเอกสารในโรงพยาบาล ตั้งแต่ข้อมูลประจำตัวเครื่อง สถานที่ตั้ง หน่วยงาน สัญญา ราคาต่อหน้า ยอดพิมพ์รายเดือน ไปจนถึงรายงานการใช้งานและค่าใช้จ่าย

ในเชิงข้อมูล ระบบมี 3 กลุ่มหลัก:

1. **ข้อมูลอ้างอิง (Master Data)** — ยี่ห้อ อาคาร ชั้น ฝ่าย แผนก ปีงบประมาณ และสัญญา
2. **ข้อมูลทรัพย์สินและการใช้งาน** — เครื่องพิมพ์/เครื่องถ่ายเอกสาร และยอดพิมพ์รายเดือน
3. **ข้อมูลสรุปเพื่อการตัดสินใจ** — KPI, ค่าใช้จ่าย, แนวโน้ม, การเปรียบเทียบ และลำดับหน่วยงานที่ใช้สูงสุด

### 2.2 ทำไปเพื่ออะไร

- เปลี่ยนการจัดการข้อมูลจากไฟล์ Excel/ชีตกระจาย ๆ ให้เป็นฐานข้อมูลกลาง
- ลดปัญหาชื่ออาคาร/แผนก/ยี่ห้อไม่ตรงกันด้วยการเก็บเป็น ID และ Foreign Key
- ทำให้รู้ว่าเครื่องใดอยู่ที่ไหน อยู่ในความดูแลของหน่วยงานใด และอยู่ในสัญญาอะไร
- ตรวจสอบยอดพิมพ์และค่าใช้จ่ายรายเดือน/รายปีงบได้เป็นระบบ
- สนับสนุนการบริหารงบประมาณ การตรวจสอบการใช้ทรัพยากร และการวางแผนบำรุงรักษา
- รองรับการนำเข้าข้อมูลจากไฟล์เดิมโดยจับคู่กับข้อมูล Master Data ก่อนบันทึก
- แก้ความคลาดเคลื่อนของปีงบไทยที่คร่อม 2 ปีปฏิทิน

### 2.3 ทำให้ใคร

| กลุ่มผู้ใช้ | สิ่งที่ใช้ระบบ | สิทธิ์ตามโค้ดปัจจุบัน |
|---|---|---|
| ผู้ดูแลระบบ/ทีม IT | จัดการ Master Data, ทะเบียนเครื่อง, สัญญา, ปีงบ และนำเข้าไฟล์ | `admin` จัดการข้อมูลได้ |
| เจ้าหน้าที่/ผู้บันทึกข้อมูล | ดูทรัพย์สิน บันทึกยอดพิมพ์ และดูรายงาน | ผู้ใช้ที่ Login แล้วอ่านข้อมูลได้ และบันทึกยอดพิมพ์ได้ |
| ผู้บริหาร/ผู้ดูข้อมูล | ดู Dashboard, KPI, ค่าใช้จ่าย และการเปรียบเทียบ | ผู้ใช้ที่ Login แล้วอ่านรายงานได้ |
| ทีมฐานข้อมูล/Backend | ติดตั้ง Schema, Migration และ Seed | ใช้ไฟล์ใน `database/` และเอกสาร Handoff |

ฐานข้อมูลประกาศบทบาทไว้ 3 ค่า คือ `admin`, `staff`, `viewer` แต่ Middleware ปัจจุบันตรวจละเอียดเพียงว่าเป็น `admin` หรือไม่ใช่ `admin` ดังนั้น `staff` และ `viewer` มีสิทธิ์เท่ากันในทางปฏิบัติสำหรับ endpoint ที่อนุญาตให้ผู้ใช้ทั่วไป และทั้งคู่ยังสามารถ POST ยอดพิมพ์ได้

## 3. ความสามารถของระบบที่มีอยู่

### 3.1 Login และ Session

- หน้า Login อยู่ที่ `/login`
- Frontend ส่ง `username` และ `password` ไปที่ `POST /api/auth/login`
- Backend ตรวจผู้ใช้จากตาราง `users` และเปรียบเทียบรหัสผ่านด้วย `bcrypt.compare`
- เมื่อสำเร็จออก JWT อายุ 8 ชั่วโมง โดยมี `id`, `username` และ `role` อยู่ใน payload
- Frontend เก็บ token และข้อมูล user ใน `localStorage`
- Axios interceptor แนบ `Authorization: Bearer <token>` ให้อัตโนมัติ
- ถ้า API ตอบ `401` จะล้าง auth state แสดงข้อความ และ redirect กลับ Login
- Login มี rate limit 10 ครั้งต่อ 15 นาทีต่อ IP โดยไม่นับ request ที่สำเร็จ
- Error ของ username ไม่มีอยู่จริงและ password ผิดใช้ข้อความเดียวกัน เพื่อลดการเดา username

### 3.2 ทะเบียนทรัพย์สิน

หน้า `/assets` แสดงเครื่องทั้งหมดพร้อม:

- Serial Number
- Brand และ Model
- อาคารและชั้น
- ฝ่ายและแผนก
- เลขที่สัญญาและปีงบ
- ราคาต่อแผ่นที่ใช้งานจริง
- สถานะ `active`, `repair`, `retired`

ฟังก์ชันในหน้าทะเบียน:

- ค้นหาด้วย Serial, Model, Brand และเลขที่สัญญา
- กรองตาม Brand, อาคาร, ชั้น, ฝ่าย, แผนก และสถานะ
- เรียงคอลัมน์
- ค้นหาทั่วไปใน DataTable
- แบ่งหน้า
- Export CSV ที่เปิดด้วย Excel ได้ และใส่ UTF-8 BOM เพื่อรองรับภาษาไทย
- Admin เพิ่ม แก้ไข และลบเครื่อง
- ฟอร์มเพิ่ม/แก้ไขเป็น Modal เดียวกัน
- เลือกอาคารแล้วกรองชั้นให้เหลือเฉพาะชั้นของอาคารนั้น
- เลือกฝ่ายแล้วกรองแผนกให้เหลือเฉพาะแผนกของฝ่ายนั้น

### 3.3 Master Data

Admin สามารถจัดการข้อมูลอ้างอิงต่อไปนี้:

- Brand / ยี่ห้อ
- Building / อาคาร
- Floor / ชั้น ซึ่งผูกกับอาคาร
- Division / ฝ่าย
- Department / แผนก ซึ่งผูกกับฝ่าย
- Fiscal Year / ปีงบประมาณ
- Contract / สัญญา ซึ่งผูกกับปีงบและราคาต่อแผ่น

หน้าจัดการส่วนใหญ่มี CRUD, ตารางค้นหา/เรียง/แบ่งหน้า/Export CSV และกล่องยืนยันก่อนลบ

### 3.4 ปีงบประมาณไทย

ปีงบประมาณถูกเก็บเป็นเลข พ.ศ. เช่น `2569` และมีช่วงเดือนจริงเพิ่มเข้ามาเป็น:

- `start_month`: รูปแบบ `YYYY-MM`
- `end_month`: รูปแบบ `YYYY-MM`

ตัวอย่าง:

```text
ปีงบ พ.ศ. 2569 = 2025-10 ถึง 2026-09
```

ปีงบที่เลือกใน Navbar เป็น Global State ใช้ร่วมกันใน Dashboard, หน้ากรอกยอดพิมพ์, ค่าใช้จ่าย และรายงานฝ่าย/แผนก อีกทั้ง sync กับ query parameter `?fy=<id>` เพื่อให้ refresh หรือแชร์ลิงก์แล้วยังรักษาปีงบที่เลือกไว้

### 3.5 สัญญาและราคาต่อแผ่น

สัญญามีข้อมูลหลัก:

- เลขที่สัญญา
- ปีงบประมาณ
- ราคาต่อแผ่น (`price_per_page`)

เครื่องสามารถกำหนด `price_override` ได้ หากเครื่องใดมีราคาเฉพาะเครื่อง ราคานี้จะทับราคาจากสัญญา

### 3.6 บันทึกยอดพิมพ์รายเดือน

หน้า `/print-transactions` ทำงานในระดับเครื่อง:

- แสดงรายการเครื่องทั้งหมด
- กรองตามอาคาร ชั้น ฝ่าย แผนก ยี่ห้อ สถานะเครื่อง และสถานะการกรอกข้อมูล
- สรุปว่าแต่ละเครื่องกรอกแล้วกี่เดือนจาก 12 เดือนของปีงบที่เลือก
- สถานะการกรอกเป็น `ครบ 12 เดือน`, `กรอกบางส่วน`, หรือ `ยังไม่ได้กรอก`
- เปิด Modal เพื่อกรอกยอดพิมพ์ของเครื่องหนึ่งเครื่องครบ 12 เดือน
- เดือนใน Modal เรียงตามปีงบจริง ตุลาคมถึงกันยายน และแสดงปี พ.ศ. กำกับทุกเดือน
- บันทึกหลายเดือนใน transaction เดียว
- ถ้ากรอกเดือนเดิมซ้ำจะ update แทนการสร้างแถวซ้ำ
- ไม่รับจำนวนหน้าติดลบ

### 3.7 Dashboard

หน้า `/dashboard` มี:

- KPI: จำนวนอุปกรณ์, จำนวนสัญญา, จำนวนรายการพิมพ์ และจำนวนหน้าพิมพ์
- Filter อาคารและเดือน โดยค่าเริ่มต้นเป็นทั้ง 12 เดือนของปีงบที่เลือก
- สถานะเครื่องพิมพ์: ใช้งานอยู่, ซ่อมบำรุง, ปลดระวาง
- Top 5 แผนกที่มีค่าใช้จ่ายสูงสุด
- สรุปการใช้งานแยกตามสัญญา จำนวนเครื่อง จำนวนหน้า และค่าใช้จ่าย
- แท็บกราฟ `การใช้งาน` และ `ค่าใช้จ่าย`
- กราฟจำนวนหน้ารายเดือน
- กราฟจำนวนหน้ารายอาคาร
- กราฟค่าใช้จ่ายรายเดือน
- กราฟค่าใช้จ่ายรายอาคาร
- Loading skeleton และข้อความ error พร้อมปุ่มลองใหม่ในส่วน KPI/Highlights

### 3.8 ค่าใช้จ่ายแยกตามสัญญา

หน้า `/expense` แสดงลำดับชั้น:

```text
ปีงบที่เลือก
└── สัญญา
    └── เครื่อง
        └── ค่าใช้จ่ายรายเดือน
```

ฟังก์ชัน:

- รวมค่าใช้จ่ายและจำนวนหน้าทั้งปีงบ
- เปิด/ปิดรายละเอียดระดับสัญญาและระดับเครื่อง
- กรองข้อมูลตามช่วงเดือนของปีงบจริง
- แสดงเครื่องที่ยังไม่ได้ผูกสัญญาแยกต่างหาก เพื่อไม่ให้หายจากรายงาน

### 3.9 เปรียบเทียบข้อมูลรายเดือน

หน้า `/compare`:

- เลือกได้หลายเดือนในปีงบ
- เก็บรายการเดือนที่เลือกไว้ใน URL `?months=YYYY-MM,...`
- เปรียบเทียบจำนวนหน้าพิมพ์รวม, จำนวนหน้าสุทธิ, ค่าใช้จ่ายรวม, จำนวนเครื่องที่มีการใช้งาน และต้นทุนเฉลี่ยต่อหน้า
- แสดงเปอร์เซ็นต์การเปลี่ยนแปลงระหว่างเดือนแรกกับเดือนสุดท้าย
- มีตารางเปรียบเทียบและกราฟแยกตามตัวชี้วัด

### 3.10 ยอดพิมพ์แยกตามฝ่าย/แผนก

หน้า `/by-department` แสดงลำดับชั้น:

```text
ฝ่าย
└── แผนก
    └── เครื่อง
        └── ยอดพิมพ์/ค่าใช้จ่ายรายเดือน
```

ฟังก์ชัน:

- กรองค้นหาชื่อฝ่าย แผนก รุ่น และ Serial Number
- เลือกเดือนหนึ่งเดือนเพื่อเทียบกับเดือนก่อนหน้า
- แสดงแนวโน้มเพิ่มขึ้น/ลดลง/เท่าเดิม/ไม่มีข้อมูล
- แสดงเปอร์เซ็นต์และผลต่างทั้งจำนวนหน้าและค่าใช้จ่าย
- เลือกหลายฝ่ายและหลายแผนกเพื่อสร้างกราฟเส้นเปรียบเทียบ
- สลับ metric ระหว่างค่าใช้จ่ายกับจำนวนหน้า
- เลือกช่วงเดือนบนกราฟเพื่อ zoom/pan แบบง่าย
- ขยายทั้งหมด/ย่อทั้งหมด
- แสดงเครื่องที่ยังไม่ได้ผูกฝ่ายหรือแผนกแยกไว้

### 3.11 นำเข้าข้อมูลจากไฟล์

หน้า `/admin/import-devices` รับ `.csv`, `.xlsx`, `.xls` ผ่าน Dropzone/เลือกไฟล์ โดยจำกัดขนาด 5 MB และเฉพาะ Admin

การนำเข้าอุปกรณ์:

1. อ่าน worksheet แรกด้วยแพ็กเกจ `xlsx`
2. รองรับชื่อคอลัมน์หลายแบบ เช่น `serial_number`, `Serial_Number`, `Serial Number`, `SN`, `sn`
3. จับคู่ชื่อ Brand กับตาราง `brand`
4. จับคู่ชื่อ Building กับตาราง `building`
5. แถวที่จับคู่ไม่ได้จะถูกข้ามและส่งเหตุผลกลับไปให้ผู้ใช้
6. แถวที่ผ่านจะถูก INSERT ลง `devices`
7. ลบไฟล์ชั่วคราวหลังจบการประมวลผล

การนำเข้ามิเตอร์พิมพ์จาก Excel ต้นฉบับมี endpoint Backend แยกต่างหาก:

- ค้นหาแถวหัวตารางจากเซลล์ `SN` หรือ `SN.`
- อ่านเฉพาะคอลัมน์รูปแบบ `meter M/YY`
- แปลงปี พ.ศ. 2 หลักและเดือนให้เป็น `YYYY-MM`
- จับคู่เครื่องด้วย Serial Number แบบ trim และไม่สนตัวพิมพ์เล็ก/ใหญ่
- ข้ามแถว/เซลล์ที่ไม่รู้จักหรือไม่ใช่ตัวเลข
- Upsert ลง `print_transactions`

### 3.12 UI/UX ที่มีในระบบ

- Vue Router และ Layout แยก Auth/Main
- Sidebar Responsive บนมือถือ/แท็บเล็ต
- Navbar มีปีงบ, สลับโหมดสี, ข้อมูลผู้ใช้ และ Logout
- โหมดมืดเป็นค่าเริ่มต้น และจำค่าด้วย `localStorage`
- Toast กลางสำหรับ success/error/info
- Confirm Dialog กลางแทน `window.confirm`
- Searchable Select และ Month Picker แบบ custom
- Skeleton loading
- Chart.js รองรับธีมมืด/สว่าง
- รองรับ reduced motion ผ่าน CSS

หน้า `/report` มีอยู่ใน Router และเมนู แต่ `frontend/src/views/Report.vue` ปัจจุบันยังแสดงเพียงหัวข้อ `Report` ยังไม่มีฟังก์ชันรายงานจริง

## 4. สถาปัตยกรรมระบบ

```text
ผู้ใช้/Browser
    │
    │ Vue 3 SPA + Vue Router + Axios
    ▼
Frontend Vite :5173
    │ Authorization: Bearer JWT
    │ CORS
    ▼
Express API :3000
    ├── Helmet / CORS / JSON parser / Rate limit
    ├── JWT auth middleware
    ├── Admin middleware
    ├── Routes + Controllers
    ├── Multer + XLSX สำหรับ Import
    └── mysql2/promise connection pool
            │
            ▼
        MySQL Database
        ├── Master tables
        ├── Asset/contract tables
        ├── print_transactions
        └── Reporting views
```

### 4.1 Backend

- Node.js ใช้ CommonJS (`require`/`module.exports`)
- Express เปิดใช้งานที่ port จาก `process.env.PORT` หรือค่าเริ่มต้น `3000`
- CORS ปัจจุบันอนุญาต origin `http://localhost:5173` เท่านั้น
- `helmet()` เพิ่ม HTTP security headers
- `express.json()` รองรับ request body แบบ JSON
- `mysql2/promise` ใช้ connection pool จำนวนสูงสุด 10 connections
- มี health check `GET /` ส่งชื่อระบบและ version
- มี 404 handler และ error handler กลาง
- Route `/api/auth` ถูก mount ก่อน route `/api` เพราะ `master-data.js` ใช้ `router.use(authMiddleware)` ครอบทั้ง router

### 4.2 Frontend

- Vue 3 Single Page Application
- Vite เป็น dev server/build tool
- Vue Router ใช้ `createWebHistory`
- Axios instance กลางใน `src/services/api.js`
- State ใช้ Vue `reactive`, `ref`, `computed`, `watch` แบบ custom store ไม่ได้ใช้ Pinia/Vuex
- Chart ใช้ Chart.js ผ่าน `vue-chartjs`
- Styling ใช้ Tailwind CSS v4 ผ่าน `@tailwindcss/vite` และ CSS variable สำหรับธีม

### 4.3 การไหลของ Request โดยทั่วไป

1. ผู้ใช้เปิดหน้า Vue
2. Router Guard ตรวจ token และ role ใน `localStorage`
3. Component เรียก `api.get/post/put/delete`
4. Axios interceptor เติม JWT
5. Express รับ request และผ่าน `authMiddleware`
6. ถ้าเป็น write/admin route จะผ่าน `adminMiddleware` เพิ่ม
7. Route หรือ Controller สร้าง SQL แบบ parameterized query
8. MySQL ตอบผลลัพธ์
9. Frontend แสดงตาราง กราฟ Toast หรือ error state

## 5. หลักการคำนวณและกฎธุรกิจ

### 5.1 ปีงบประมาณ

ฟังก์ชันใน `backend/utils/fiscalYear.js` ใช้ offset พ.ศ. 543:

```text
ceEnd   = beYear - 543
ceStart = ceEnd - 1
start   = ceStart-10
end     = ceEnd-09
```

เช่น:

```text
2569 - 543 = 2026
เริ่มปีงบ = 2025-10
สิ้นสุดปีงบ = 2026-09
```

Frontend สร้าง 12 เดือนจาก `start_month` เดินไปทีละเดือน ไม่ใช้การวน `01` ถึง `12` ของปีเดียว

### 5.2 จำนวนหน้าสุทธิและค่าใช้จ่าย

View `v_monthly_kpi` กำหนดสูตรหลัก:

```text
net_pages = pages × 0.8
effective_price = price_override ถ้ามี ไม่เช่นนั้น contract.price_per_page ถ้ามี ไม่เช่นนั้น 0
total_cost = net_pages × effective_price
```

ตัวอย่าง ถ้ากรอก 10,000 หน้า และราคา 0.34 บาทต่อหน้า:

```text
หน้าสุทธิ = 10,000 × 0.8 = 8,000 หน้า
ค่าใช้จ่าย = 8,000 × 0.34 = 2,720 บาท
```

หมายเหตุ: ชื่อ `net_pages` และการคูณ `0.8` สื่อว่าระบบหัก 20% ตาม KPI/นโยบายของข้อมูลต้นทาง ไม่ใช่จำนวนหน้าที่อ่านจากมิเตอร์โดยตรง

### 5.3 การป้องกันยอดซ้ำ

ตาราง `print_transactions` มี Unique Key `(device_id, month)` และ endpoint บันทึกใช้:

```sql
INSERT ... ON DUPLICATE KEY UPDATE pages = VALUES(pages)
```

จึงบันทึกเดือนเดิมซ้ำแล้วแก้ไขยอดเดิมแทนการเพิ่มแถวใหม่

### 5.4 รูปแบบเดือน

Backend normalize เดือนจากทั้ง `YYYY-7` และ `YYYY-07` ให้เป็น `YYYY-07` และ reject ค่าเดือนที่ไม่ใช่ 1–12 หรือไม่ตรงรูปแบบ

### 5.5 การเทียบแนวโน้ม

`/dashboard/by-department` คำนวณเดือนก่อนหน้าโดยถอยจากเดือนที่เลือกหนึ่งเดือน และคำนวณ:

```text
change_percent = (current - previous) / previous × 100
```

กรณีเดือนก่อนเป็น 0 หรือไม่มีข้อมูล จะไม่แสดงเปอร์เซ็นต์ที่ทำให้เข้าใจผิด และใช้สถานะข้อมูลใหม่/ไม่มีข้อมูลแทน

## 6. รายการ Backend API

Base URL ของ Frontend คือ `http://localhost:3000/api`

### 6.1 Authentication และระบบพื้นฐาน

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| GET | `/` | ไม่ต้อง login | Health check; อยู่นอก `/api` |
| POST | `/api/auth/login` | ไม่ต้อง login | Login และออก JWT |

### 6.2 Master Data

ทุก endpoint ในกลุ่มนี้ต้อง Login; GET ใช้ได้กับผู้ใช้ที่ Login แล้ว ส่วน POST/PUT/DELETE ต้องเป็น Admin

| Resource | Endpoint หลัก | ความสัมพันธ์ |
|---|---|---|
| Brand | `/api/brands` และ `/api/brands/:id` | ตาราง `brand` |
| Building | `/api/buildings` และ `/api/buildings/:id` | ตาราง `building` |
| Division | `/api/divisions` และ `/api/divisions/:id` | ตาราง `division` |
| Floor | `/api/floors` และ `/api/floors/:id` | ต้องส่ง `building_id` |
| Department | `/api/departments` และ `/api/departments/:id` | ต้องส่ง `division_id` |
| Fiscal Year | `/api/fiscal-years` และ `/api/fiscal-years/:id` | ใช้ `year`, `start_month`, `end_month` |

### 6.3 อุปกรณ์

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| GET | `/api/devices` | Login | รายการเครื่องพร้อมชื่อ Master Data และสัญญา |
| GET | `/api/devices/:id` | Login | ดูเครื่องหนึ่งรายการ |
| POST | `/api/devices` | Admin | เพิ่มเครื่อง; validate ด้วย Zod |
| PUT | `/api/devices/:id` | Admin | แก้ไขเครื่อง |
| DELETE | `/api/devices/:id` | Admin | ลบเครื่อง |

ฟิลด์ที่รับใน POST/PUT ได้แก่ `serial_number`, `brand_id`, `model`, `building_id`, `floor_id`, `division_id`, `department_id`, `contract_id`, `price_override`, `status`

### 6.4 สัญญา

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| GET | `/api/contracts` | Login | รายการสัญญาพร้อมปีงบ |
| GET | `/api/contracts/:id` | Login | ดูสัญญาหนึ่งรายการ |
| POST | `/api/contracts` | Admin | เพิ่มสัญญา |
| PUT | `/api/contracts/:id` | Admin | แก้ไขสัญญา |
| DELETE | `/api/contracts/:id` | Admin | ลบสัญญา |

### 6.5 ยอดพิมพ์

ทุก endpoint กลุ่มนี้ต้อง Login แต่ปัจจุบันไม่บังคับ Admin สำหรับการบันทึก

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/print-transactions?month=YYYY-MM` | รายการยอดพิมพ์ทั้งหมด หรือกรองเดือน |
| GET | `/api/print-transactions/months` | รายชื่อเดือนที่เคยมีข้อมูล |
| POST | `/api/print-transactions` | Upsert ยอดพิมพ์ 1 เครื่อง/1 เดือน |
| POST | `/api/print-transactions/bulk` | Upsert หลายเครื่องของเดือนเดียวใน DB transaction |
| GET | `/api/print-transactions/summary?fiscal_year_id=ID` | นับเดือนที่กรอกและยอดรวมต่อเครื่องในปีงบ |
| GET | `/api/print-transactions/by-device/:deviceId?fiscal_year_id=ID` | ดึงยอด 12 เดือนของเครื่องในปีงบ |
| POST | `/api/print-transactions/bulk-device` | Upsert หลายเดือนของเครื่องเดียวใน DB transaction |

### 6.6 Dashboard และรายงาน

ทุก endpoint กลุ่มนี้ต้อง Login

| Method | Path | หน้าที่/ตัวกรอง |
|---|---|---|
| GET | `/api/dashboard/monthly-kpi` | รายละเอียด KPI รายเดือน; รองรับ `month` หลายค่าคั่น comma และ `building_name` |
| GET | `/api/dashboard/summary-by-building` | รวมหน้าสุทธิ/ค่าใช้จ่ายตามอาคาร; รองรับ `month`, `building_name` |
| GET | `/api/dashboard/compare` | อ่าน view สำหรับเปรียบเทียบ; รองรับ `month`, `building_name` |
| GET | `/api/dashboard/stats` | KPI cards; รองรับ `month`, `building_name` |
| GET | `/api/dashboard/expense` | ค่าใช้จ่ายรวมระดับเครื่อง; รองรับ `month`, `building_name` |
| GET | `/api/dashboard/by-department` | โครงสร้างฝ่าย→แผนก→เครื่อง; รองรับ `fiscal_year_id`, `month` |
| GET | `/api/dashboard/highlights` | สถานะเครื่อง, Top 5 แผนก, สรุปตามสัญญา; รองรับ `month`, `building_name` |

### 6.7 ค่าใช้จ่ายและ Import

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| GET | `/api/expense/unassigned-devices` | Login | เครื่องที่ไม่มีสัญญา พร้อมยอดค่าใช้จ่าย |
| GET | `/api/expense/:fiscal_year_id` | Login | ค่าใช้จ่ายตามสัญญา/เครื่องในช่วงปีงบ |
| POST | `/api/devices/import` | Admin | Import เครื่องจาก CSV/Excel |
| POST | `/api/print-transactions/import` | Admin | Import มิเตอร์จาก Excel ต้นฉบับ |

## 7. โครงสร้างฐานข้อมูล

### 7.1 ตารางและฟิลด์สำคัญ

| ตาราง | หน้าที่ | ฟิลด์สำคัญ |
|---|---|---|
| `users` | ผู้ใช้ระบบ | `id`, `username`, `password`, `role`, `created_at` |
| `fiscal_year` | ปีงบและช่วงเดือน | `id`, `year`, `start_month`, `end_month`, `status` |
| `brand` | ยี่ห้อ | `id`, `name`, `status` |
| `building` | อาคาร | `id`, `name`, `status` |
| `floor` | ชั้น | `id`, `building_id`, `name`, `status` |
| `division` | ฝ่าย | `id`, `name`, `status` |
| `department` | แผนก | `id`, `division_id`, `name`, `status` |
| `contracts` | สัญญา | `id`, `contract_no`, `fiscal_year_id`, `price_per_page` |
| `devices` | เครื่องพิมพ์/ถ่ายเอกสาร | `id`, `serial_number`, FK Master Data, `contract_id`, `price_override`, `status` |
| `print_transactions` | ยอดพิมพ์รายเดือน | `id`, `device_id`, `month`, `pages` |

### 7.2 ความสัมพันธ์หลัก

```text
fiscal_year 1 ─── * contracts 1 ─── * devices 1 ─── * print_transactions

building 1 ─── * floor
division 1 ─── * department

devices ─── brand
devices ─── building
devices ─── floor
devices ─── division
devices ─── department
```

Foreign Key ที่มีอยู่ช่วยป้องกันการอ้างถึง ID ที่ไม่มีอยู่ แต่ `devices` ยังมีทั้ง `division_id` และ `department_id` แยกกัน โดยฐานข้อมูลไม่ได้บังคับว่า department ที่เลือกต้องอยู่ใน division เดียวกัน และไม่ได้บังคับว่า floor ต้องอยู่ใน building เดียวกัน โค้ด Frontend ช่วยกรองตัวเลือก แต่ Backend ไม่ได้ validate ความสอดคล้องนี้ซ้ำ

### 7.3 Reporting Views

#### `v_monthly_kpi`

แปลงข้อมูล `print_transactions` ให้พร้อมใช้ในรายงาน โดย JOIN กับ `devices` และ `contracts` และสร้าง `pages_printed`, `net_pages`, `total_cost`

#### `v_summary_by_building`

รวม `net_pages` และ `total_building_cost` ตามชื่ออาคาร

#### `v_compare_usage_costs`

เตรียมข้อมูลสำหรับการเปรียบเทียบ โดยรวมเดือน ปีงบ Serial, สถานที่ หน่วยงาน Brand จำนวนหน้าสุทธิ ราคาต่อหน้า และค่าใช้จ่ายรวม

### 7.4 Constraints และสถานะ

- `username`, `year`, `brand.name`, `building.name`, `division.name`, `contract_no`, `devices.serial_number` เป็น Unique ตามตาราง
- `print_transactions` มี Unique `(device_id, month)`
- Master Data มี `status` `active/inactive`
- Devices มี `status` `active/repair/retired`
- Foreign Key ส่วนใหญ่ไม่ได้กำหนด `ON DELETE CASCADE`
- ตารางฐานข้อมูลไม่มี `created_at/updated_at` สำหรับอุปกรณ์และยอดพิมพ์ จึงไม่มี audit trail ในระดับ row

## 8. ลำดับการทำงานสำคัญ

### 8.1 ผู้ใช้เข้าสู่ระบบ

```text
เปิดหน้าใด ๆ ที่ไม่ใช่ /login
  └─ Router Guard หา token ไม่พบ → redirect /login?redirect=...
       └─ Login ส่ง username/password
            └─ API ตรวจ bcrypt และออก JWT 8 ชั่วโมง
                 └─ เก็บ token/user ใน localStorage
                      └─ กลับหน้าที่ผู้ใช้กำลังจะเปิด หรือ /dashboard
```

### 8.2 Admin เพิ่มเครื่อง

```text
Admin เปิด /admin/add-asset หรือกดเพิ่มจาก /assets
  └─ AssetForm โหลด Brand/Building/Floor/Division/Department/Contract
       └─ เลือกอาคาร → กรองชั้น
       └─ เลือกฝ่าย → กรองแผนก
            └─ POST /api/devices
                 └─ authMiddleware → adminMiddleware → Zod → INSERT devices
                      └─ ปิด Modal และ refresh ตาราง
```

### 8.3 บันทึกยอดพิมพ์

```text
Navbar เลือกปีงบ
  └─ fiscalYearState มี activeId และ start/end month
       └─ PrintTransactions ขอ /print-transactions/summary
            └─ ผู้ใช้เปิดเครื่องหนึ่งรายการ
                 └─ GET /by-device/:id?fiscal_year_id=...
                      └─ Frontend สร้างรายการ ต.ค.–ก.ย.
                           └─ POST /bulk-device
                                └─ normalize เดือน + validate หน้า
                                     └─ transaction + upsert 12 เดือน
```

### 8.4 Dashboard

```text
DashboardFilter โหลดอาคารและเดือนที่มีข้อมูล
  └─ จำกัดเดือนด้วยช่วงปีงบ active
       └─ emit filter = building_name + month list
            ├─ Dashboard โหลด /dashboard/stats
            ├─ Dashboard โหลด /dashboard/highlights
            └─ Chart components โหลด endpoint ของตัวเอง
```

### 8.5 Import Excel ต้นฉบับ

```text
Admin upload Excel
  └─ Multer ตรวจ extension/MIME และขนาด <= 5 MB
       └─ XLSX อ่าน worksheet แรก
            └─ หาแถว SN.
                 └─ อ่าน meter M/YY จากชื่อหัวคอลัมน์
                      └─ แปลงเป็น YYYY-MM
                           └─ map SN → device_id
                                └─ upsert print_transactions
                                     └─ ลบไฟล์ชั่วคราว + ส่ง skipped กลับ
```

## 9. Tech Stack และทักษะที่ใช้

### 9.1 Backend/Server

| เทคโนโลยี/แพ็กเกจ | เวอร์ชันใน `package.json` | การใช้งาน |
|---|---:|---|
| Node.js | ไม่ได้กำหนดใน package | Runtime ของ API |
| Express | `^5.2.1` | HTTP server และ routing |
| CommonJS | ตั้งค่า `type: commonjs` | รูปแบบ module ฝั่ง Backend |
| MySQL2 | `^3.22.5` | Connection pool และ parameterized query |
| dotenv | `^17.4.2` | โหลด `.env` |
| bcrypt | `^6.0.0` | ตรวจรหัสผ่านแบบ hash |
| jsonwebtoken | `^9.0.3` | JWT session |
| express-rate-limit | `^8.6.1` | จำกัดการลอง Login |
| helmet | `^8.2.0` | Security headers |
| cors | `^2.8.6` | อนุญาต Frontend เรียก API |
| zod | `^4.4.3` | Validate payload ของ devices |
| multer | `^2.2.0` | รับไฟล์ upload แบบ multipart |
| xlsx | `^0.18.5` | อ่าน Excel และรูปแบบตาราง |
| csv-parser | `^3.2.1` | มีใน dependency แต่ไม่พบการเรียกใช้ใน source ปัจจุบัน |
| iconv-lite | `^0.7.3` | มีใน dependency แต่ไม่พบการเรียกใช้ใน source ปัจจุบัน |
| nodemon | `^3.1.14` | Dev dependency สำหรับ `npm run dev` |

ทักษะ Backend ที่เห็นจากโค้ด: REST API design, middleware chain, JWT authentication, role authorization, SQL JOIN/GROUP BY/VIEW, transaction handling, bulk upsert, file upload validation, Excel parsing, mapping Master Data, error handling และ input validation

### 9.2 Frontend/Client

| เทคโนโลยี/แพ็กเกจ | เวอร์ชันใน `package.json` | การใช้งาน |
|---|---:|---|
| Vue | `^3.5.38` | UI และ reactive state |
| Vue Router | `^5.1.0` | SPA routing และ navigation guard |
| Vite | `^8.1.0` | Dev server และ production build |
| `@vitejs/plugin-vue` | `^6.0.7` | ประมวลผล Vue SFC |
| Tailwind CSS | `^4.3.1` | Utility-first styling |
| `@tailwindcss/vite` | `^4.3.1` | เชื่อม Tailwind กับ Vite |
| Axios | `^1.18.1` | HTTP client และ interceptors |
| Chart.js | `^4.5.1` | วาดกราฟบน Canvas |
| vue-chartjs | `^5.3.4` | Vue wrapper ของ Chart.js |

ทักษะ Frontend ที่เห็นจากโค้ด: Vue Composition API, `<script setup>`, reusable component, custom composable, reactive store, route guard, responsive layout, data table, client-side filter/sort/pagination/export, modal/dialog, upload UX, Chart.js, CSS variables, dark/light theme และ accessibility เบื้องต้น

### 9.3 Database/SQL

- MySQL relational schema
- Normalized Master Data และ Foreign Key
- SQL View สำหรับ KPI และ reporting
- `DECIMAL(10,2)` สำหรับราคา
- `CHAR(7)`/`VARCHAR(7)` สำหรับเดือน `YYYY-MM`
- Migration สำหรับแก้ schema เดิม
- Seed data สำหรับ Demo
- Deduplication ก่อนเพิ่ม Unique Key

### 9.4 วิธีพัฒนาและมาตรฐานที่มี

- ใช้ JavaScript ไม่ได้ใช้ TypeScript
- Backend ใช้ semicolon และ CommonJS
- Frontend ใช้ Vue SFC/ES module และ Tailwind class
- มี `package-lock.json` ทั้ง Backend และ Frontend
- ไม่มี ESLint, Prettier, test runner หรือ coverage threshold ใน repository
- `backend npm test` ยังเป็น placeholder ที่จบด้วย exit code 1

## 10. โครงสร้างไฟล์และโฟลเดอร์ทั้งหมด

### 10.1 ระดับ Root

| Path | หน้าที่ |
|---|---|
| `AGENTS.md` | แนวทางทำงานใน repository เช่น คำสั่งรัน ระบบตั้งชื่อ ความปลอดภัย และ workflow ของทีม |
| `LICENSE` | Apache License 2.0 |
| `README.md` | บันทึก root cause และแนวทางแก้บั๊ก Print Usage/ค่าใช้จ่ายไม่ตรงปีงบ ไม่ใช่คู่มือติดตั้งฉบับเต็ม |
| `backend/` | Express/MySQL API |
| `frontend/` | Vue/Vite SPA |
| `database/` | Schema, migrations และ dummy data |
| `docs/` | Handoff, ตัวอย่าง Import และไฟล์ Excel ต้นฉบับ |

### 10.2 `backend/`

#### ไฟล์ระดับ Backend

| Path | หน้าที่ |
|---|---|
| `backend/.env.example` | ตัวอย่าง `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` |
| `backend/.gitignore` | ไม่ติดตาม `node_modules`, `.env`, log และ `hash.js` |
| `backend/package.json` | ชื่อโปรเจกต์, scripts และ dependencies ของ API |
| `backend/package-lock.json` | lock dependency versions ของ Backend |
| `backend/db.js` | สร้าง MySQL promise pool, ตั้งค่า connection limit 10 และตรวจ connection ตอนเริ่ม |
| `backend/index.js` | สร้าง Express app, middleware กลาง, mount routes, health check, 404/error handler และ start server |

#### `backend/controllers/`

| Path | หน้าที่ |
|---|---|
| `backend/controllers/deviceController.js` | GET list/detail, POST, PUT, DELETE devices; JOIN ชื่อ Master Data; validate ด้วย Zod; handle duplicate Serial |
| `backend/controllers/importController.js` | Import devices จาก Excel/CSV และ Import print transactions จาก Excel มิเตอร์; parse เดือน พ.ศ.; map SN/Brand/Building; skipped rows; cleanup temp file |

#### `backend/middlewares/`

| Path | หน้าที่ |
|---|---|
| `backend/middlewares/authMiddleware.js` | อ่าน Bearer token, verify JWT ด้วย `JWT_SECRET`, ใส่ decoded user ใน `req.user` |
| `backend/middlewares/adminMiddleware.js` | อนุญาตเฉพาะ `req.user.role === 'admin'` |

#### `backend/routes/`

| Path | หน้าที่ |
|---|---|
| `backend/routes/auth.js` | Login, bcrypt comparison, JWT sign และ login rate limit |
| `backend/routes/devices.js` | ผูก auth/admin middleware กับ device controller |
| `backend/routes/master-data.js` | CRUD แบบ generic สำหรับ Brand/Building/Division และ CRUD แบบมี parent สำหรับ Floor/Department รวมถึง Fiscal Year |
| `backend/routes/contracts.js` | CRUD สัญญาและ JOIN ปีงบ |
| `backend/routes/print-transactions.js` | อ่าน/บันทึกยอดพิมพ์, normalize เดือน, bulk transaction, summary และข้อมูลรายเครื่องตามปีงบ |
| `backend/routes/dashboard.js` | Endpoint KPI, summary อาคาร, compare, stats, expense, by-department และ highlights |
| `backend/routes/expense.js` | ค่าใช้จ่ายตามปีงบ/สัญญา/เครื่อง และกลุ่มเครื่องที่ไม่มีสัญญา |
| `backend/routes/importRoutes.js` | Multer file filter/size limit และ route Import ที่ต้องเป็น Admin |

#### `backend/utils/`

| Path | หน้าที่ |
|---|---|
| `backend/utils/fiscalYear.js` | Single source of truth สำหรับแปลงปีงบ พ.ศ. เป็น `startMonth`/`endMonth` แบบ ต.ค.–ก.ย. |

### 10.3 `frontend/`

#### ไฟล์ตั้งค่าและเอกสาร

| Path | หน้าที่ |
|---|---|
| `frontend/.gitignore` | ignore log, `node_modules`, `dist` และไฟล์ editor |
| `frontend/.vscode/extensions.json` | แนะนำ extension `Vue.volar` |
| `frontend/package.json` | scripts `dev`, `build`, `preview` และ dependencies ของ SPA |
| `frontend/package-lock.json` | lock dependency versions ของ Frontend |
| `frontend/README.md` | README template เดิมของ Vue/Vite ยังไม่ได้ปรับเป็นเอกสารระบบจริง |
| `frontend/vite.config.js` | เปิดใช้ Vue plugin และ Tailwind Vite plugin |
| `frontend/index.html` | HTML shell, favicon, Thai language, Google Fonts, title และตั้งค่าโหมดสีก่อน render |

#### `frontend/src/`

| Path | หน้าที่ |
|---|---|
| `frontend/src/main.js` | สร้าง Vue app, import global CSS, register router และ mount เมื่อ router ready |
| `frontend/src/App.vue` | เลือก `AuthLayout`/`MainLayout` ตาม route meta และ mount Toast/Confirm กลาง |
| `frontend/src/style.css` | Tailwind import, CSS variables ของโหมดมืด/สว่าง, typography, scrollbar, focus outline และ reduced motion |

#### `frontend/src/layouts/`

| Path | หน้าที่ |
|---|---|
| `frontend/src/layouts/MainLayout.vue` | Layout หลัก: Sidebar + Navbar + RouterView |
| `frontend/src/layouts/AuthLayout.vue` | Layout สำหรับหน้า Login มีเพียง RouterView |

#### `frontend/src/router/`

| Path | หน้าที่ |
|---|---|
| `frontend/src/router/index.js` | ประกาศ routes, lazy-load หน้าหลัก/หน้า Admin, scroll behavior และ auth/admin guard |

Routes ที่ประกาศ:

| Route | View | ประเภท |
|---|---|---|
| `/login` | `Login.vue` | Auth |
| `/` | redirect `/dashboard` | Main |
| `/dashboard` | `Dashboard.vue` | Main |
| `/assets` | `AssetList.vue` | Main |
| `/expense` | `Expense.vue` | Main |
| `/compare` | `Compare.vue` | Main |
| `/by-department` | `ByDepartment.vue` | Main |
| `/report` | `Report.vue` | Main แต่ยังเป็น placeholder |
| `/print-transactions` | `PrintTransactions.vue` | Main |
| `/admin/brands` | `admin/Brand.vue` | Admin |
| `/admin/buildings` | `admin/Building.vue` | Admin |
| `/admin/floors` | `admin/Floor.vue` | Admin |
| `/admin/divisions` | `admin/Division.vue` | Admin |
| `/admin/departments` | `admin/Department.vue` | Admin |
| `/admin/fiscal-years` | `admin/FiscalYear.vue` | Admin |
| `/admin/contracts` | `admin/Contract.vue` | Admin |
| `/admin/add-asset` | `admin/AddAsset.vue` | Admin |
| `/admin/import-devices` | `ImportDevices.vue` | Admin |

#### `frontend/src/services/`

| Path | หน้าที่ |
|---|---|
| `frontend/src/services/api.js` | Axios instance, base URL, request interceptor แนบ JWT และ response interceptor จัดการ 401/session expiry |

#### `frontend/src/store/`

| Path | หน้าที่ |
|---|---|
| `frontend/src/store/auth.js` | reactive auth user, set/clear token และ user ใน localStorage |
| `frontend/src/store/fiscalYear.js` | Global fiscal year list/activeId, load/refresh, range, สร้าง 12 เดือน และ sync URL query |
| `frontend/src/store/theme.js` | dark/light mode, localStorage key `suth-ui-mode`, set `data-mode` บน `<html>` |
| `frontend/src/store/ui.js` | เปิด/ปิด Mobile Sidebar |
| `frontend/src/store/toast.js` | state และ helper `toastSuccess`, `toastError`, `toastInfo` พร้อม timeout |
| `frontend/src/store/confirmDialog.js` | Promise-based confirm dialog กลาง |

#### `frontend/src/composables/`

| Path | หน้าที่ |
|---|---|
| `frontend/src/composables/useChartTheme.js` | อ่าน CSS variables ตามธีมเพื่อกำหนด text/grid/legend/tooltip ของ Chart.js แบบ reactive |

#### `frontend/src/components/`

| Path | หน้าที่ |
|---|---|
| `BuildingChart.vue` | Bar chart จำนวนหน้าสุทธิแยกตามอาคารจาก `/dashboard/summary-by-building` |
| `BuildingCostChart.vue` | Bar chart ค่าใช้จ่ายแยกตามอาคารจาก endpoint เดียวกัน |
| `CostChart.vue` | Bar chart ค่าใช้จ่ายรายเดือนจาก `/dashboard/compare` |
| `MonthlyChart.vue` | Bar chart จำนวนหน้าสุทธิรายเดือนจาก `/dashboard/monthly-kpi` |
| `DashboardFilter.vue` | Filter อาคารและหลายเดือน; จำกัดเดือนตามปีงบ active |
| `MonthPicker.vue` | Dropdown เดือนแบบหลายเลือก เรียง ต.ค.–ก.ย. และรองรับ max จำนวนเดือน |
| `DepartmentPicker.vue` | Multi-select ฝ่าย/แผนก พร้อมค้นหา |
| `SearchableSelect.vue` | Select แบบค้นหาได้และปิดเมื่อคลิกนอก component |
| `DataTable.vue` | ตาราง reusable: search, sort, pagination, sticky header, export CSV และ slots |
| `SortIcon.vue` | ไอคอนสถานะการเรียง none/asc/desc |
| `ChevronIcon.vue` | ไอคอนลูกศรของ dropdown/accordion |
| `Sidebar.vue` | เมนูหลัก/Admin, responsive mobile sidebar และ inline SVG icons |
| `Navbar.vue` | ปีงบ global, theme switcher, user info, logout และ mobile menu button |
| `ThemeSwitcher.vue` | ปุ่มสลับ dark/light mode |
| `ToastContainer.vue` | แสดง Toast แบบ teleport ไป body |
| `ConfirmDialog.vue` | แสดง Dialog ยืนยัน, focus ปุ่ม และรองรับ Escape |
| `SkeletonBlock.vue` | Placeholder loading แบบ pulse |

#### `frontend/src/views/`

| Path | หน้าที่ |
|---|---|
| `frontend/src/views/Login.vue` | ฟอร์ม Login และ redirect หลังสำเร็จ |
| `frontend/src/views/Dashboard.vue` | KPI, highlights, ตารางสรุป และกราฟการใช้งาน/ค่าใช้จ่าย |
| `frontend/src/views/AssetList.vue` | รายการและ filter ทรัพย์สิน, DataTable, CRUD action สำหรับ Admin |
| `frontend/src/views/AssetForm.vue` | Modal เพิ่ม/แก้ไขเครื่อง; โหลด Master Data และ validate เบื้องต้น |
| `frontend/src/views/PrintTransactions.vue` | รายการเครื่อง สถานะการกรอก และ Modal กรอก 12 เดือน |
| `frontend/src/views/Expense.vue` | ค่าใช้จ่ายแบบ accordion สัญญา→เครื่อง→เดือน |
| `frontend/src/views/Compare.vue` | เปรียบเทียบหลายเดือน ตาราง metric และกราฟ |
| `frontend/src/views/ByDepartment.vue` | Hierarchy ฝ่าย→แผนก→เครื่อง และกราฟแนวโน้ม |
| `frontend/src/views/ImportDevices.vue` | Dropzone upload CSV/Excel และสรุปแถวที่สำเร็จ/ข้าม |
| `frontend/src/views/Report.vue` | Placeholder หัวข้อ Report เท่านั้น |

#### `frontend/src/views/admin/`

| Path | หน้าที่ |
|---|---|
| `admin/AddAsset.vue` | เปิด `AssetForm.vue` ในโหมดเพิ่ม และกลับ `/assets` หลังบันทึก/ยกเลิก |
| `admin/Brand.vue` | CRUD Brand และ DataTable |
| `admin/Building.vue` | CRUD Building และ DataTable |
| `admin/Floor.vue` | CRUD Floor พร้อมเลือก Building |
| `admin/Division.vue` | CRUD Division และ DataTable |
| `admin/Department.vue` | CRUD Department พร้อมเลือก Division |
| `admin/FiscalYear.vue` | CRUD ปีงบ และ refresh Global fiscal year state |
| `admin/Contract.vue` | CRUD สัญญา เลือกปีงบ และราคาต่อแผ่น |

#### `frontend/public/` และ `frontend/src/assets/`

| Path | หน้าที่/สถานะ |
|---|---|
| `frontend/public/favicon.svg` | Favicon ที่ `index.html` เรียกใช้ |
| `frontend/public/icons.svg` | Static SVG icons; ไม่พบการอ้างใช้จาก source หลักปัจจุบัน |
| `frontend/src/assets/hero.png` | Raster asset; ไม่พบการอ้างใช้จาก source หลักปัจจุบัน |
| `frontend/src/assets/vue.svg` | Asset template ของ Vue; ไม่พบการอ้างใช้ |
| `frontend/src/assets/vite.svg` | Asset template ของ Vite; ไม่พบการอ้างใช้ |

### 10.4 `database/`

| Path | หน้าที่ |
|---|---|
| `database/schema.sql` | สร้างตาราง users, Master Data, contracts, devices, print_transactions และ reporting views รวมถึง prototype users |
| `database/migration_add_fiscal_year_range.sql` | เพิ่ม/backfill `start_month` และ `end_month` ให้ `fiscal_year` เดิม |
| `database/migration_unique_print_transactions.sql` | รวม duplicate ยอดพิมพ์เดิมก่อนเพิ่ม Unique `(device_id, month)` |
| `database/seed_dummy_data.sql` | ล้างและสร้างข้อมูลจำลองปีงบ, Master Data, สัญญา, 5 เครื่อง และยอดพิมพ์ |

### 10.5 `docs/`

| Path | รายละเอียด |
|---|---|
| `docs/handoff_document.md` | เอกสารส่งมอบ Prototype, Login, Schema/ETL และแนวทางใช้ seed/import |
| `docs/mock_import_devices.csv` | CSV ตัวอย่าง 5 แถว มี serial, brand, model, building, floor, division, department, contract และ price override |
| `docs/ไฟล์โปรเจคสยอง.xlsx` | Excel ต้นฉบับ 1 worksheet, dimension `A1:AY461`, หัวตารางจริงอยู่แถว 2 และมีคอลัมน์ `meter M/YY` |
| `docs/#U0e44#U0e1f#U0e25#U0e4c#U0e42#U0e1b#U0e23#U0e08#U0e04#U0e2a#U0e22#U0e2d#U0e07.xlsx` | ไฟล์ชื่อรูปแบบ Unicode escape ที่มีเนื้อหาเดียวกับ Excel ภาษาไทยด้านบน |
| `docs/project_overview_report.md` | รายงานฉบับนี้ |

ไฟล์ Excel ทั้งสองไฟล์มีขนาด 237,893 bytes และ SHA-256 เดียวกัน จึงเป็นสำเนาเนื้อหาเดียวกันต่างชื่อไฟล์

## 11. ข้อมูลตัวอย่างและเอกสาร Handoff

### 11.1 Dummy Data ที่มีใน `seed_dummy_data.sql`

- ปีงบ `2566`: `2022-10` ถึง `2023-09`
- ปีงบ `2567`: `2023-10` ถึง `2024-09`
- Brand: HP, Canon, Epson, Brother
- อาคาร: อาคารบริหาร, อาคารผู้ป่วยนอก (OPD), อาคารฉุกเฉิน (ER)
- ฝ่าย: ฝ่ายบริหารงานทั่วไป, ฝ่ายการแพทย์, ฝ่ายการพยาบาล
- แผนก: การเงินและบัญชี, ทรัพยากรบุคคล, อายุรกรรม, ศัลยกรรม, ฉุกเฉิน
- สัญญา: `CONT-67-001`, `CONT-66-009`
- เครื่อง 5 เครื่อง ได้แก่ HP, Canon, Epson, Brother และ HP โดยมีสถานะ active/repair/retired ปะปนกัน
- Epson เครื่องหนึ่งมี `price_override = 1.50`
- ยอดพิมพ์ตัวอย่างอยู่ช่วง `2025-01` ถึง `2025-03`

ข้อสังเกต: วันที่ยอดพิมพ์ตัวอย่าง `2025-01` ถึง `2025-03` อยู่นอกช่วงของปีงบ 2566 และ 2567 ที่ seed ไว้ ดังนั้นถ้าเลือกปีงบจาก seed ปัจจุบัน หน้า Expense/Print Summary อาจไม่พบยอดในปีงบที่เลือก ทั้งที่มี transaction อยู่ นี่เป็นจุดที่ควรปรับ seed ให้ช่วงปีงบกับ transaction สอดคล้องกันก่อนใช้ Demo

### 11.2 Excel ต้นฉบับ

จากการตรวจ metadata ของ workbook:

- มี worksheet เดียวชื่อ `Sheet1`
- ใช้พื้นที่ `A1:AY461` หรือ 51 คอลัมน์ และประมาณ 459 แถวข้อมูลหลังหัวตาราง
- แถว 1 เป็นหัวข้อรวม/ข้อมูลประกอบ
- แถว 2 เป็น header จริง
- คอลัมน์หลักประกอบด้วยสัญญา, No., Model, SN., Printer Name, Building, Floor, แผนก, Group, ราคา และมิเตอร์
- คอลัมน์มิเตอร์เริ่มจาก `meter 9/67` และต่อเนื่องถึง `meter 8/68`
- มีคอลัมน์คำนวณจากไฟล์เดิม เช่น จำนวนพิมพ์รวม, ลดการพิมพ์ 20%, ค่าเฉลี่ย, KPI และยอดสะสม

โค้ด `importPrintTransactions` ออกแบบให้ไม่พึ่งตำแหน่งคอลัมน์ แต่หา header `SN.` และอ่านชื่อ `meter M/YY` โดยตรง จึงรองรับกรณีคอลัมน์อื่นขยับได้ดีกว่า mapping ตามตำแหน่ง

### 11.3 สิ่งที่ Handoff ระบุเทียบกับ repository จริง

Handoff ระบุชื่อ `schema_v3_normalized.sql` และ `backend/hash.js` แต่ไม่พบไฟล์สองชื่อนี้ใน repository ปัจจุบัน ขณะที่มี `database/schema.sql` และมี bcrypt hash ฝังใน `schema.sql` แทน

ดังนั้นเอกสาร Handoff เป็นบริบทการส่งมอบจากช่วงก่อนหน้า ควรปรับให้ตรงกับโครงสร้างปัจจุบันก่อนส่งให้ทีมใหม่ใช้อ้างอิง

## 12. วิธีติดตั้งและรันระบบตามไฟล์ปัจจุบัน

### 12.1 เตรียม Backend

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

ค่าเริ่มต้นใน `.env.example`:

```text
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=test
JWT_SECRET=your_secret_key_here
```

ควรเปลี่ยน `DB_PASSWORD`, `DB_NAME` และ `JWT_SECRET` ให้เหมาะกับ environment จริง และไม่ commit `.env`

Backend จะเปิดที่ `http://localhost:3000` และตรวจได้ด้วย:

```text
GET http://localhost:3000/
```

### 12.2 เตรียม Database

สำหรับฐานข้อมูลใหม่:

```powershell
mysql -u root -p your_database < database/schema.sql
mysql -u root -p your_database < database/seed_dummy_data.sql
```

สำหรับฐานข้อมูลเดิมที่ยังไม่มีการแก้ schema ต้องพิจารณารัน migration ตามสภาพจริง:

```powershell
mysql -u root -p your_database < database/migration_unique_print_transactions.sql
mysql -u root -p your_database < database/migration_add_fiscal_year_range.sql
```

ปัจจุบัน `schema.sql` รวมทั้ง `start_month/end_month` และ Unique Key ไว้แล้ว ดังนั้นห้ามรัน migration ที่เพิ่มสิ่งเดียวกันซ้ำบนฐานข้อมูลที่สร้างจาก `schema.sql` แล้ว เพราะจะเจอ duplicate column หรือ duplicate key

### 12.3 เตรียม Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend จะเปิดที่ `http://localhost:5173` ตาม CORS และ Axios base URL ที่ hardcode ไว้

Production build:

```powershell
npm run build
npm run preview
```

## 13. สถานะการตรวจสอบรอบนี้

สิ่งที่ตรวจสอบแล้ว:

- Git branch/status ก่อนสร้างรายงาน
- รายการไฟล์ tracked และ hidden/config files
- Backend entrypoint, middleware, controllers และ routes
- Frontend router, layout, views, components, stores, services และ styles
- SQL schema, views, migrations และ seed data
- Handoff document, CSV ตัวอย่าง และโครงสร้าง Excel ต้นฉบับ
- ความสอดคล้องของเอกสารกับไฟล์จริงใน repository

สิ่งที่ยังไม่ได้รันในการจัดทำรายงาน:

- `npm install`
- `npm run build` ของ Frontend เนื่องจากใน workspace ไม่มี `node_modules` ณ เวลาตรวจสอบ
- Backend กับ MySQL จริง
- Smoke test authenticated API
- การรัน migration/seed กับฐานข้อมูลจริง
- Automated tests เพราะ repository ยังไม่มี test framework และ `backend npm test` เป็น placeholder

## 14. ข้อสังเกต ความเสี่ยง และงานที่ควรพิจารณาต่อ

### 14.1 ความปลอดภัยและการใช้งานจริง

- `.env.example` ใช้ `JWT_SECRET=your_secret_key_here` ต้องเปลี่ยนก่อนใช้งานจริง
- `schema.sql` มี user ทดลอง `admin` และ `user1` พร้อม hash ของรหัสผ่าน prototype ตามเอกสาร Handoff ควรเปลี่ยนหรือลบก่อน Production
- Token เก็บใน `localStorage`; หากนำไป Production ควรทบทวนความเสี่ยง XSS และพิจารณา HttpOnly Secure cookie หรือมาตรการที่เหมาะสม
- CORS hardcode เป็น localhost ต้องทำเป็น environment configuration เมื่อ deploy
- ไม่มีการจัดการ refresh token, revoke token หรือ audit log
- อาจต้องเพิ่ม validation ของ payload สัญญา, Master Data และ Import ให้เข้มเท่ากับ device ที่ใช้ Zod

### 14.2 ความสอดคล้องของสิทธิ์

- Database มี `staff` และ `viewer` แต่ Backend ไม่แยกสิทธิ์สองบทบาทนี้
- ผู้ใช้ที่ Login แล้วทุกบทบาทสามารถ POST `/print-transactions` ได้ หากไม่ต้องการให้ viewer บันทึกข้อมูลควรเพิ่ม policy/middleware
- Frontend ซ่อนเมนู Admin ตาม role แต่การป้องกันที่เชื่อถือได้จริงอยู่ที่ Backend ซึ่งปัจจุบันมีเฉพาะบาง route

### 14.3 การลบข้อมูลและ Soft Delete

- Schema มี status สำหรับ Master Data และอุปกรณ์ ทำให้มีแนวคิด soft delete/retire
- แต่ CRUD Master Data ใช้ `DELETE` จริง และ `deviceController.remove` ใช้ `DELETE FROM devices`
- ไม่มี `ON DELETE CASCADE` ดังนั้นการลบเครื่องที่มี `print_transactions` หรือการลบ Master Data ที่ถูกอ้างอิงอาจติด Foreign Key หรือทำให้การจัดการประวัติไม่ตรงกับแนวคิด soft delete
- ควรใช้การเปลี่ยน status เป็นหลัก และกำหนดกติกาการลบข้อมูลที่มีประวัติให้ชัดเจน

### 14.4 การนำเข้าไฟล์

- `importDevices` ใช้ Brand และ Building เป็นตัว map หลัก แม้ CSV ตัวอย่างจะมี Floor, Division, Department, Contract และ price override แต่โค้ดปัจจุบันไม่ได้บันทึกฟิลด์เหล่านี้จากไฟล์อุปกรณ์
- Import อุปกรณ์ไม่ได้ใช้ transaction ครอบการ insert และไม่มีการตรวจ duplicate Serial ล่วงหน้าแบบรายแถว ถ้ามี duplicate อาจทำให้ batch ล้มเหลวทั้งชุด
- Parser เดือนของไฟล์มิเตอร์เดา `2500 + YY` จึงควรทบทวนเมื่อข้อมูลข้ามช่วงศตวรรษหรือมีรูปแบบปี 4 หลัก
- Multer ตรวจ MIME และ extension แต่ควรตรวจ content จริงเพิ่มหากเปิดรับไฟล์จากภายนอก
- Dependency `csv-parser` และ `iconv-lite` มีอยู่แต่ยังไม่ถูกใช้ จึงควรตัดออกหรือทำให้เป็นส่วนหนึ่งของ workflow CSV/encoding อย่างชัดเจน

### 14.5 ความถูกต้องของรายงาน

- `v_monthly_kpi` รวมข้อมูลโดยไม่กรอง `device.status`; เครื่อง `repair` หรือ `retired` ยังมีข้อมูลอยู่ในรายงานได้ ซึ่งอาจถูกต้องหรือไม่ขึ้นกับนโยบายธุรกิจ
- `/dashboard/stats` กรองจำนวน transaction/pages ตามเดือนและอาคาร แต่ `total_devices` ไม่ได้กรองตามเดือน และ `total_contracts` ไม่ได้กรองตามปีงบหรืออาคาร จึงควรกำหนดนิยาม KPI ให้ชัด
- `/expense/unassigned-devices` ไม่มี `fiscal_year_id` และรวมประวัติยอดพิมพ์ทุกเดือนของเครื่องที่ไม่มีสัญญา ขณะที่หน้า Expense หลักกรองตามปีงบ
- หน้า Dashboard ใช้ปีงบผ่าน Filter ของ Frontend แต่ endpoint บางตัวรับเพียงเดือนที่ส่งมา จึงควรรักษาการส่งช่วงปีงบจาก client หรือเพิ่ม fiscal-year filter ที่ Backend เพื่อกันการเรียกตรงแล้วได้ข้อมูลข้ามปี
- Seed transaction อยู่คนละช่วงกับ fiscal years ที่ seed ไว้ ทำให้ Demo อาจดูเหมือนระบบไม่มีข้อมูล

### 14.6 คุณภาพซอฟต์แวร์และการดูแลต่อ

- ไม่มี automated test สำหรับ fiscal year boundary, calculation, auth, import และ API
- `Report.vue` ยังไม่ทำงานจริง แม้มีเมนูรายงาน
- `frontend/README.md` ยังเป็นข้อความ template ของ Vue/Vite
- Root `README.md` เน้น release note ของ fiscal-year fix มากกว่าคู่มือระบบ
- Handoff อ้างชื่อไฟล์ที่ไม่มีอยู่จริงในปัจจุบัน
- ไม่มี Docker/CI/CD/deployment config หรือ environment config สำหรับ production
- Frontend มี asset จาก template ที่ไม่ได้ใช้งาน ควรลบหรือจัดหมวดให้ชัดเพื่อลดความสับสน

## 15. บทสรุปเชิงผู้บริหาร

โครงการนี้เป็นระบบศูนย์กลางสำหรับบริหารเครื่องพิมพ์และค่าใช้จ่ายการพิมพ์ของโรงพยาบาล โดยเชื่อมข้อมูลทรัพย์สิน สถานที่ หน่วยงาน สัญญา ปีงบ และยอดมิเตอร์เข้าด้วยกัน จุดประสงค์หลักคือทำให้ทีม IT และผู้บริหารเห็นข้อมูลเครื่องและค่าใช้จ่ายได้จากแหล่งเดียว ลดการรวมข้อมูลจาก Excel ด้วยมือ และรองรับการวิเคราะห์การใช้งานตามช่วงเวลาจริง

ในด้านฟังก์ชัน ระบบมีแกนหลักค่อนข้างครบสำหรับ Prototype/ระบบภายใน ได้แก่ Login, Asset Registry, Master Data, Contract, Fiscal Year, Print Usage, Import, Dashboard, Expense และ Department/Monthly Comparison Report ส่วนที่ยังไม่สมบูรณ์คือหน้า Report จริง การทดสอบอัตโนมัติ การแยกสิทธิ์ staff/viewer และการ harden ด้าน Production/Security

ประเด็นทางเทคนิคที่ควรยึดเป็นหลักเมื่อพัฒนาต่อคือ:

1. ใช้ `fiscal_year.start_month/end_month` เป็นแหล่งอ้างอิงเดียวของปีงบ
2. รักษา Unique `(device_id, month)` และ upsert เพื่อไม่ให้ยอดซ้ำ
3. คงสูตร `pages × 0.8 × effective price` ให้ตรงกันทุก endpoint/view
4. รักษาการ map ข้อมูลนำเข้าด้วยชื่อ/ID ไม่ใช้ตำแหน่งคอลัมน์เป็นตัวเดา
5. เพิ่ม test รอบขอบเขต ต.ค.–ก.ย. และทดสอบ migration/seed บนฐานข้อมูลสะอาด
6. แยกกติกา “ลบจริง” กับ “ปลดระวาง/ปิดใช้งาน” ให้ชัดก่อนนำไปใช้กับข้อมูลจริง
