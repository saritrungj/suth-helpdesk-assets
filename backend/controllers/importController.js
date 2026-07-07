const fs = require("fs");
const XLSX = require("xlsx");
const db = require("../db");

exports.importDevices = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "กรุณาอัปโหลดไฟล์ Excel"
            });
        }

        // อ่านไฟล์ Excel
        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {
            defval: ""
        });

        // โหลดข้อมูล Master
        const [brands] = await db.query(
            "SELECT id, name FROM brand"
        );

        const [buildings] = await db.query(
            "SELECT id, name FROM building"
        );

        const brandMap = {};
        const buildingMap = {};

        brands.forEach((b) => {
            brandMap[b.name.trim()] = b.id;
        });

        buildings.forEach((b) => {
            buildingMap[b.name.trim()] = b.id;
        });

        console.log("Headers:", Object.keys(rows[0] || {}));
        console.log("First Row:", rows[0]);

        const insertData = [];

        for (const row of rows) {

            const serial_number = String(row.serial_number || "").trim();
            const brand = String(row.brand || "").trim();
            const model = String(row.model || "").trim();
            const building = String(row.building || "").trim();

            const brand_id = brandMap[brand];
            const building_id = buildingMap[building];

            console.log("Building:", building);
            console.log("Building ID:", building_id);

            if (!brand_id || !building_id) {
                console.log("SKIP:", row);
                continue;
            }

            insertData.push([
                serial_number,
                brand_id,
                model,
                building_id
            ]);
        }

        if (insertData.length > 0) {
            await db.query(
                `INSERT INTO devices
                (serial_number, brand_id, model, building_id)
                VALUES ?`,
                [insertData]
            );
        }

        fs.unlinkSync(req.file.path);

        res.json({
            message: "Import สำเร็จ",
            total_rows: rows.length,
            inserted: insertData.length
        });

    } catch (err) {
        console.error(err);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: err.message
        });
    }
};