const fs = require("fs");
const XLSX = require("xlsx");
const db = require("../db");
const { recordLocationHistory } = require("./deviceController");

// ============================================================
// แปลง "เดือน/ปี พ.ศ. 2 หลัก" ในหัวคอลัมน์ไฟล์มิเตอร์ (เช่น "meter 9/67",
// "meter10/67", "meter 1/68") ให้เป็น "YYYY-MM" (ค.ศ.) ที่ตรงกับเดือนจริง
//
// ⚠️ ห้ามใช้ "ลำดับคอลัมน์" (column position) มาเดาว่าเป็นเดือนไหนของปีงบ
// เพราะไฟล์ Excel เดิมเรียงคอลัมน์เดือนเริ่มจาก "กันยายน" (เดือนก่อนปีงบใหม่)
// ไม่ได้เริ่มจาก "ตุลาคม" แบบปีงบราชการไทยที่ระบบใช้ (ดู backend/utils/fiscalYear.js)
// ถ้า map ตามตำแหน่งคอลัมน์ตรงๆ ยอดของเดือนกันยาจะไปตกที่เดือนตุลาแทน (เพี้ยนทั้งแถว)
// จึงต้อง "อ่านชื่อเดือน/ปีจากหัวคอลัมน์" ทุกครั้ง แล้วคำนวณเป็นเดือนปฏิทินจริงเสมอ
// เมื่อเดือนจริงถูกต้องแล้ว การ query ด้วยช่วงปีงบ (start_month/end_month) ฝั่ง
// print-transactions.js ก็จะแบ่งเดือนเข้าปีงบที่ถูกต้องเองโดยอัตโนมัติ
function parseMeterMonthHeader(header) {
  const match = String(header || "").match(/meter\s*(\d{1,2})\s*\/\s*(\d{2})/i);
  if (!match) return null;

  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;

  // ปี พ.ศ. ในไฟล์เก็บแค่ 2 หลัก (เช่น "67" = 2567) — เดาศตวรรษ 2500 เอา
  // เพราะไฟล์นี้เป็นข้อมูลปีงบปัจจุบัน ไม่มีทางเป็นปี 2400 หรือ 2600
  const beYearFull = 2500 + Number(match[2]);
  const ceYear = beYearFull - 543;

  return `${ceYear}-${String(month).padStart(2, "0")}`;
}

exports.importDevices = async (req, res) => {

    let conn;

    try {

        if (!req.file) {
            return res.status(400).json({
                error: "กรุณาอัปโหลดไฟล์ Excel"
            });
        }


        // อ่าน Excel
        const workbook = XLSX.readFile(req.file.path);

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(sheet, {
            defval: ""
        });


        // โหลด Master Data — ต้องครบทุกฟิลด์ที่ฟอร์ม "เพิ่มทรัพย์สิน" (เพิ่มทีละรายการ) รองรับ
        // (brand/building เดิม + floor/division/department/contract ที่เทมเพลตสัญญาไว้แต่ import เดิมไม่เคยอ่าน)
        const [brand] = await db.query("SELECT id, name FROM brand");
        const [building] = await db.query("SELECT id, name FROM building");
        const [floor] = await db.query("SELECT id, building_id, name FROM floor");
        const [division] = await db.query("SELECT id, name FROM division");
        const [department] = await db.query("SELECT id, division_id, name FROM department");
        const [contract] = await db.query("SELECT id, contract_no FROM contracts");


        const brandMap = {};
        const buildingMap = {};
        // ชื่อชั้น/แผนก ไม่ unique ทั้งระบบ (ซ้ำกันได้คนละอาคาร/คนละฝ่าย) ต้อง scope คีย์ด้วย
        // building_id / division_id เหมือนที่ AssetForm.vue กรอง floor ตาม building ที่เลือกไว้
        const floorMap = {};
        const divisionMap = {};
        const departmentMap = {};
        const contractMap = {};

        brand.forEach((b) => { brandMap[String(b.name).trim()] = b.id; });
        building.forEach((b) => { buildingMap[String(b.name).trim()] = b.id; });
        floor.forEach((f) => { floorMap[`${f.building_id}::${String(f.name).trim()}`] = f.id; });
        division.forEach((d) => { divisionMap[String(d.name).trim()] = d.id; });
        department.forEach((d) => { departmentMap[`${d.division_id}::${String(d.name).trim()}`] = d.id; });
        contract.forEach((c) => { contractMap[String(c.contract_no).trim()] = c.id; });


        const insertData = [];
        const skipped = []; // แถวที่ import ไม่ได้ พร้อมเหตุผล ให้ frontend แสดงให้ผู้ใช้แก้ไขได้


        for (const row of rows) {


            const serial_number = String(
                row.serial_number ||
                row.Serial_Number ||
                row["Serial Number"] ||
                row.SN ||
                row.sn ||
                ""
            ).trim();


            const brand = String(
                row.brand ||
                row.Brand ||
                row.ยี่ห้อ ||
                ""
            ).trim();


            const model = String(
                row.model ||
                row.Model ||
                row.รุ่น ||
                ""
            ).trim();


            const building = String(
                row.building ||
                row.Building ||
                row.อาคาร ||
                ""
            ).trim();

            // ฟิลด์เพิ่มเติมที่ฟอร์ม "เพิ่มทรัพย์สิน" (เพิ่มทีละรายการ) กรอกได้ — ไม่บังคับเหมือน brand/building
            const floorName = String(row.floor || row.Floor || row.ชั้น || "").trim();
            const divisionName = String(row.division || row.Division || row.ฝ่าย || "").trim();
            const departmentName = String(row.department || row.Department || row.แผนก || "").trim();
            const contractNo = String(row.contract_no || row["Contract No"] || row.เลขที่สัญญา || "").trim();
            const priceOverrideRaw = String(
                row.price_override ?? row["Price Override"] ?? row.ราคาเฉพาะเครื่อง ?? ""
            ).trim();
            const location = String(row.location || row.Location || row.ตำแหน่ง || "").trim();


            // สถานะ — ถ้าไม่กรอกมา/พิมพ์ค่าที่ไม่รู้จัก ให้ default เป็น "active" เหมือนฟอร์มเพิ่มทีละรายการ
            // รองรับทั้งค่า enum อังกฤษ (active/repair/retired) และป้ายภาษาไทยที่ผู้ใช้อาจพิมพ์มา
            const STATUS_MAP = {
                active: "active",
                repair: "repair",
                retired: "retired",
                "ใช้งานอยู่": "active",
                "ซ่อมบำรุง": "repair",
                "ปลดระวาง": "retired",
            };

            const statusRaw = String(
                row.status ||
                row.Status ||
                row.สถานะ ||
                ""
            ).trim();

            const status = STATUS_MAP[statusRaw.toLowerCase()] || STATUS_MAP[statusRaw] || "active";


            const brand_id = brandMap[brand];

            const building_id = buildingMap[building];


            const reasons = [];
            if (!brand_id) reasons.push(`ไม่พบยี่ห้อ "${brand || "(ว่าง)"}" ในระบบ`);
            if (!building_id) reasons.push(`ไม่พบอาคาร "${building || "(ว่าง)"}" ในระบบ`);


            // ฟิลด์เสริม — ถ้าผู้ใช้กรอกมาต้องหาเจอจริง (กันพิมพ์ชื่อผิด/สะกดคลาดเงียบๆ)
            // แต่ถ้าเว้นว่างไว้ก็ปล่อยผ่านเป็น null ได้เหมือนตอนไม่เลือกใน dropdown ของฟอร์มเพิ่มทีละรายการ
            let floor_id = null;
            if (floorName) {
                floor_id = building_id ? floorMap[`${building_id}::${floorName}`] : undefined;
                if (!floor_id) reasons.push(`ไม่พบชั้น "${floorName}" ในอาคาร "${building || "(ว่าง)"}"`);
            }

            let division_id = null;
            if (divisionName) {
                division_id = divisionMap[divisionName];
                if (!division_id) reasons.push(`ไม่พบฝ่าย "${divisionName}" ในระบบ`);
            }

            let department_id = null;
            if (departmentName) {
                department_id = division_id ? departmentMap[`${division_id}::${departmentName}`] : undefined;
                if (!department_id) {
                    reasons.push(
                        divisionName
                            ? `ไม่พบแผนก "${departmentName}" ในฝ่าย "${divisionName}"`
                            : `ไม่พบแผนก "${departmentName}" (กรุณาระบุคอลัมน์ฝ่ายด้วย)`
                    );
                }
            }

            let contract_id = null;
            if (contractNo) {
                contract_id = contractMap[contractNo];
                if (!contract_id) reasons.push(`ไม่พบเลขที่สัญญา "${contractNo}" ในระบบ`);
            }

            let price_override = null;
            if (priceOverrideRaw !== "") {
                const parsedPrice = Number(priceOverrideRaw);
                if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
                    reasons.push(`ราคาเฉพาะเครื่อง "${priceOverrideRaw}" ไม่ใช่ตัวเลข`);
                } else {
                    price_override = parsedPrice;
                }
            }


            if (reasons.length) {

                skipped.push({
                    serial_number: serial_number || "(ไม่มีเลขซีเรียล)",
                    brand,
                    building,
                    reason: reasons.join(", "),
                });

                continue;
            }



            insertData.push({
                serial_number,
                brand_id,
                model: model || null,
                building_id,
                floor_id,
                location: location || null,
                division_id,
                department_id,
                contract_id,
                price_override,
                status,
            });

        }



        // Insert ทีละแถวในทรานแซกชันเดียว (แทนที่จะ bulk INSERT ... VALUES ?) เพราะต้องได้ insertId
        // ของแต่ละเครื่องมาเปิด "ช่วงประวัติแรก" ผ่าน recordLocationHistory เหมือนฟอร์มเพิ่มทีละรายการ
        // (ดู deviceController.js create()) ไม่งั้นเครื่องที่มาจาก import จะไม่มีประวัติการย้ายเลย
        // และหน้ารายงานที่อ้างอิงปีงบ/ช่วงเวลาของ device_location_history จะไม่เห็นเครื่องกลุ่มนี้
        if (insertData.length > 0) {

            conn = await db.getConnection();
            await conn.beginTransaction();

            for (const d of insertData) {
                const [result] = await conn.query(
                    `
                    INSERT INTO devices
                    (
                        serial_number,
                        brand_id,
                        model,
                        building_id,
                        floor_id,
                        location,
                        division_id,
                        department_id,
                        contract_id,
                        price_override,
                        status
                    )
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)
                    `,
                    [
                        d.serial_number,
                        d.brand_id,
                        d.model,
                        d.building_id,
                        d.floor_id,
                        d.location,
                        d.division_id,
                        d.department_id,
                        d.contract_id,
                        d.price_override,
                        d.status,
                    ]
                );

                await recordLocationHistory(conn, result.insertId, {
                    building_id: d.building_id,
                    floor_id: d.floor_id,
                    location: d.location,
                    division_id: d.division_id,
                    department_id: d.department_id,
                });
            }

            await conn.commit();

        }



        // ลบไฟล์ชั่วคราว
        fs.unlinkSync(req.file.path);



        res.json({

            message: "Import สำเร็จ",

            total_rows: rows.length,

            inserted: insertData.length,

            skipped

        });



    } catch (err) {


        console.error("IMPORT ERROR:", err);

        if (conn) {
            try { await conn.rollback(); } catch (rollbackErr) { console.error("IMPORT ROLLBACK ERROR:", rollbackErr); }
        }

        if (
            req.file &&
            fs.existsSync(req.file.path)
        ) {
            fs.unlinkSync(req.file.path);
        }


        // ซ้ำเลขซีเรียล — ให้ error อ่านง่ายเหมือนตอนเพิ่มทีละรายการ (ER_DUP_ENTRY)
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "มีเลขซีเรียลในไฟล์ซ้ำกับที่มีอยู่แล้วในระบบ กรุณาตรวจสอบและลบแถวที่ซ้ำออกก่อนนำเข้าใหม่",
            });
        }

        res.status(500).json({

            error: err.message

        });

    } finally {
        if (conn) conn.release();
    }

};


// ============================================================
// นำเข้ายอดพิมพ์รายเดือน (มิเตอร์) จากไฟล์ Excel ต้นฉบับ (ชีทแบบ "ไฟล์โปรเจคสยอง")
// เข้าตาราง print_transactions โดยจับคู่เครื่องด้วยเลข SN.
//
// หัวตารางในไฟล์จริงอยู่ "แถวที่ 2" (แถวที่ 1 เป็นแค่หัวข้อรวม/merge cell)
// จึงอ่านเป็น array ของแถวดิบก่อน (header: 1) แล้วค่อยหาแถวหัวตารางเองจาก
// เซลล์ที่ขึ้นต้นด้วย "SN" แทนที่จะ hardcode เลขแถว เผื่อไฟล์ในอนาคตขยับแถว
// ============================================================
exports.importPrintTransactions = async (req, res) => {

    try {

        if (!req.file) {
            return res.status(400).json({
                error: "กรุณาอัปโหลดไฟล์ Excel"
            });
        }

        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const raw = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
            raw: true,
        });

        // หาแถวหัวตาราง: แถวแรกที่มีเซลล์ขึ้นต้นด้วย "SN" (ไม่สนตัวพิมพ์เล็ก/ใหญ่ หรือมีจุดต่อท้าย)
        const headerRowIndex = raw.findIndex((row) =>
            row.some((cell) => /^sn\.?$/i.test(String(cell || "").trim()))
        );

        if (headerRowIndex === -1) {
            return res.status(400).json({
                error: "ไม่พบแถวหัวตาราง (หาคอลัมน์ SN. ไม่เจอ) — ไฟล์นี้อาจไม่ใช่รูปแบบที่รองรับ"
            });
        }

        const headerRow = raw[headerRowIndex];

        const snColIndex = headerRow.findIndex((cell) =>
            /^sn\.?$/i.test(String(cell || "").trim())
        );

        // เก็บ "index คอลัมน์ -> เดือนจริง (YYYY-MM)" เฉพาะคอลัมน์ meter M/YY เท่านั้น
        // (ไม่ยุ่งกับคอลัมน์ "พิมพ์ประจำเดือน"/"พิมพ์สะสม" ที่ซ้ำ/เป็นยอดคำนวณ ไม่ใช่ค่าดิบ)
        const meterColumns = [];
        headerRow.forEach((cell, idx) => {
            const month = parseMeterMonthHeader(cell);
            if (month) meterColumns.push({ idx, month });
        });

        if (!meterColumns.length) {
            return res.status(400).json({
                error: "ไม่พบคอลัมน์มิเตอร์รายเดือน (เช่น \"meter 9/67\") ในไฟล์นี้"
            });
        }

        // โหลดเครื่องทั้งหมดมา map SN -> device_id (trim กันช่องว่างเกินจากไฟล์ Excel)
        const [devices] = await db.query("SELECT id, serial_number FROM devices");
        const deviceMap = {};
        devices.forEach((d) => {
            deviceMap[String(d.serial_number).trim().toUpperCase()] = d.id;
        });

        const upserts = []; // [device_id, month, pages]
        const skipped = [];

        for (let r = headerRowIndex + 1; r < raw.length; r++) {
            const row = raw[r];
            if (!row || !row.length) continue;

            const sn = String(row[snColIndex] || "").trim();
            if (!sn) continue; // แถวว่าง

            const device_id = deviceMap[sn.toUpperCase()];
            if (!device_id) {
                skipped.push({ serial_number: sn, reason: `ไม่พบเครื่อง SN "${sn}" ในระบบ` });
                continue;
            }

            for (const { idx, month } of meterColumns) {
                const cellValue = row[idx];

                // ข้ามเซลล์ว่าง/ไม่ใช่ตัวเลข (เดือนที่เครื่องยังไม่ติดตั้ง หรือยังไม่มีการอ่านมิเตอร์)
                if (cellValue === "" || cellValue === null || cellValue === undefined) continue;

                const pages = Number(cellValue);
                if (Number.isNaN(pages) || pages < 0) continue;

                upserts.push([device_id, month, pages]);
            }
        }

        if (upserts.length > 0) {
            await db.query(
                `
                INSERT INTO print_transactions (device_id, month, pages)
                VALUES ?
                ON DUPLICATE KEY UPDATE pages = VALUES(pages)
                `,
                [upserts]
            );
        }

        fs.unlinkSync(req.file.path);

        res.json({
            message: "Import ยอดพิมพ์รายเดือนสำเร็จ",
            months_found: [...new Set(meterColumns.map((m) => m.month))].sort(),
            rows_upserted: upserts.length,
            skipped,
        });

    } catch (err) {

        console.error("IMPORT PRINT TRANSACTIONS ERROR:", err);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: err.message
        });

    }

};