const iconv = require("iconv-lite");
const csv = require("csv-parser");
const fs = require("fs");
const db = require("../db");

exports.importDevices = async (req, res) => {
    try {
        const rows = [];

        const [brands] = await db.query("SELECT id, name FROM brand");
        const [buildings] = await db.query("SELECT id, name FROM building");

        const brandMap = {};
        const buildingMap = {};

        brands.forEach(b => {
            brandMap[b.name.trim()] = b.id;
        });

        buildings.forEach(b => {
            buildingMap[b.name.trim()] = b.id;
        });

        fs.createReadStream(req.file.path)
            // 🔥 FIX 1: decode ให้ถูก (Excel ไทยส่วนมาก = win874)
            .pipe(iconv.decodeStream("win874"))
            .pipe(csv())
            .on("data", (row) => {
                rows.push(row);
            })
            .on("end", async () => {

                const insertData = [];

                for (const row of rows) {

                    const cleanRow = {};

                    for (let key in row) {
                        // 🔥 FIX 2: ลบ BOM + normalize key
                        const cleanKey = key
                            .replace(/^\uFEFF/, "")  // BOM
                            .trim()
                            .toLowerCase();

                        cleanRow[cleanKey] = (row[key] || "").trim();
                    }

                    // 🔥 FIX 3: กัน header id เพี้ยน (๏ปฟid)
                    // ignore id column ได้เลย
                    const brand_id = brandMap[cleanRow.brand];
                    const building_id = buildingMap[cleanRow.building];

                    if (!brand_id || !building_id) {
                        console.log("SKIP ROW:", cleanRow);
                        continue;
                    }

                    insertData.push([
                        cleanRow.serial_number,
                        brand_id,
                        cleanRow.model,
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
            });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
};