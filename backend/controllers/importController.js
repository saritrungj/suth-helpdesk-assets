const fs = require("fs");
const XLSX = require("xlsx");
const db = require("../db");

// ============================================================
// Import Devices จากไฟล์ CSV / Excel
//
// คอลัมน์ที่รองรับ (ชื่อ header ยืดหยุ่น ไทย/อังกฤษ):
//   จำเป็น : serial_number (SN), brand (ยี่ห้อ), building (อาคาร)
//   ไม่บังคับ: model (รุ่น), floor (ชั้น), division (ฝ่าย),
//             department (แผนก), contract_no (เลขสัญญา)
//
// - แถวที่ serial ซ้ำกับใน DB จะเป็นการอัปเดตข้อมูลแทน (upsert)
// - แถวที่ข้อมูลจำเป็นไม่ครบ/หาใน Master Data ไม่เจอ จะถูกข้าม
//   และรายงานกลับพร้อมเหตุผล
// ============================================================

// อ่านค่าจาก row โดยลองหลายชื่อ header
function pick(row, keys) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
            return String(row[key]).trim();
        }
    }
    return "";
}

exports.importDevices = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "กรุณาอัปโหลดไฟล์ CSV หรือ Excel"
            });
        }

        // อ่านไฟล์ (xlsx รองรับทั้ง .csv .xlsx .xls)
        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        // โหลด Master Data ทั้งหมดมาทำ map ชื่อ → id
        const [brands] = await db.query("SELECT id, name FROM brand");
        const [buildings] = await db.query("SELECT id, name FROM building");
        const [floors] = await db.query("SELECT id, name, building_id FROM floor");
        const [divisions] = await db.query("SELECT id, name FROM division");
        const [departments] = await db.query("SELECT id, name, division_id FROM department");
        const [contracts] = await db.query("SELECT id, contract_no FROM contracts");

        const brandMap = {};
        brands.forEach((b) => { brandMap[b.name.trim()] = b.id; });

        const buildingMap = {};
        buildings.forEach((b) => { buildingMap[b.name.trim()] = b.id; });

        // ชั้นซ้ำชื่อกันได้ข้ามอาคาร → key เป็น "building_id|ชื่อชั้น"
        const floorMap = {};
        floors.forEach((f) => { floorMap[`${f.building_id}|${f.name.trim()}`] = f.id; });

        const divisionMap = {};
        divisions.forEach((d) => { divisionMap[d.name.trim()] = d.id; });

        // แผนกซ้ำชื่อกันได้ข้ามฝ่าย → key เป็น "division_id|ชื่อแผนก"
        // และ map ตรงชื่อไว้เผื่อไม่ระบุฝ่ายในไฟล์
        const departmentMap = {};
        const departmentByName = {};
        departments.forEach((d) => {
            departmentMap[`${d.division_id}|${d.name.trim()}`] = d.id;
            departmentByName[d.name.trim()] = d.id;
        });

        const contractMap = {};
        contracts.forEach((c) => { contractMap[c.contract_no.trim()] = c.id; });

        const insertData = [];
        const skipped = [];

        rows.forEach((row, index) => {
            const rowNo = index + 2; // +2 = ข้าม header และนับจาก 1

            const serial_number = pick(row, ["serial_number", "Serial_Number", "Serial Number", "SN", "sn"]);
            const brand = pick(row, ["brand", "Brand", "ยี่ห้อ"]);
            const model = pick(row, ["model", "Model", "รุ่น"]);
            const building = pick(row, ["building", "Building", "อาคาร"]);
            const floor = pick(row, ["floor", "Floor", "ชั้น"]);
            const division = pick(row, ["division", "Division", "ฝ่าย"]);
            const department = pick(row, ["department", "Department", "แผนก"]);
            const contract_no = pick(row, ["contract_no", "Contract_No", "Contract", "contract", "เลขสัญญา", "สัญญา"]);

            // ---- ตรวจข้อมูลจำเป็น ----
            if (!serial_number) {
                skipped.push({ row: rowNo, reason: "ไม่มี serial_number" });
                return;
            }

            const brand_id = brandMap[brand];
            if (!brand_id) {
                skipped.push({ row: rowNo, serial_number, reason: `ไม่พบยี่ห้อ "${brand}" ใน Master Data` });
                return;
            }

            const building_id = buildingMap[building];
            if (!building_id) {
                skipped.push({ row: rowNo, serial_number, reason: `ไม่พบอาคาร "${building}" ใน Master Data` });
                return;
            }

            // ---- ข้อมูลไม่บังคับ: หาไม่เจอ = เว้นว่าง ไม่ข้ามทั้งแถว ----
            const floor_id = floor ? (floorMap[`${building_id}|${floor}`] || null) : null;

            const division_id = division ? (divisionMap[division] || null) : null;

            let department_id = null;
            if (department) {
                department_id = division_id
                    ? (departmentMap[`${division_id}|${department}`] || null)
                    : (departmentByName[department] || null);
            }

            const contract_id = contract_no ? (contractMap[contract_no] || null) : null;
            if (contract_no && !contract_id) {
                skipped.push({ row: rowNo, serial_number, reason: `ไม่พบเลขสัญญา "${contract_no}" — นำเข้าโดยไม่ผูกสัญญา` });
                // ไม่ return: แค่เตือน แถวนี้ยังนำเข้า
            }

            insertData.push([
                serial_number,
                brand_id,
                model || null,
                building_id,
                floor_id,
                division_id,
                department_id,
                contract_id,
            ]);
        });

        // Insert / Update (serial ซ้ำ = อัปเดตข้อมูลตำแหน่งและสัญญา)
        if (insertData.length > 0) {
            await db.query(
                `
                INSERT INTO devices
                    (serial_number, brand_id, model, building_id, floor_id, division_id, department_id, contract_id)
                VALUES ?
                ON DUPLICATE KEY UPDATE
                    brand_id = VALUES(brand_id),
                    model = VALUES(model),
                    building_id = VALUES(building_id),
                    floor_id = VALUES(floor_id),
                    division_id = VALUES(division_id),
                    department_id = VALUES(department_id),
                    contract_id = VALUES(contract_id)
                `,
                [insertData]
            );
        }

        // ลบไฟล์ชั่วคราว
        fs.unlinkSync(req.file.path);

        res.json({
            message: `Import สำเร็จ ${insertData.length} รายการ` +
                (skipped.length > 0 ? ` (มีข้อควรตรวจสอบ ${skipped.length} รายการ)` : ""),
            total_rows: rows.length,
            inserted: insertData.length,
            skipped
        });
    } catch (err) {
        console.error("IMPORT ERROR:", err);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: err.message
        });
    }
};
