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


        // อ่าน Excel
        const workbook = XLSX.readFile(req.file.path);

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(sheet, {
            defval: ""
        });


        console.log("Headers:", Object.keys(rows[0] || {}));
        console.log("First Row:", rows[0]);


        // โหลด Master Data
        const [brand] = await db.query(
            "SELECT id, name FROM brand"
        );

        const [building] = await db.query(
            "SELECT id, name FROM building"
        );


        const brandMap = {};
        const buildingMap = {};


        brand.forEach((b) => {
            brandMap[String(b.name).trim()] = b.id;
        });


        building.forEach((b) => {
            buildingMap[String(b.name).trim()] = b.id;
        });



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



            const brand_id = brandMap[brand];

            const building_id = buildingMap[building];


            console.log({
                serial_number,
                brand,
                brand_id,
                building,
                building_id
            });



            if (!brand_id || !building_id) {

                console.log("SKIP:", row);

                const reasons = [];
                if (!brand_id) reasons.push(`ไม่พบยี่ห้อ "${brand || "(ว่าง)"}" ในระบบ`);
                if (!building_id) reasons.push(`ไม่พบอาคาร "${building || "(ว่าง)"}" ในระบบ`);

                skipped.push({
                    serial_number: serial_number || "(ไม่มีเลขซีเรียล)",
                    brand,
                    building,
                    reason: reasons.join(", "),
                });

                continue;
            }



            insertData.push([
                serial_number,
                brand_id,
                model,
                building_id
            ]);

        }



        console.log(
            "Insert count:",
            insertData.length
        );



        // Insert Database
        if (insertData.length > 0) {

            await db.query(
                `
                INSERT INTO devices
                (
                    serial_number,
                    brand_id,
                    model,
                    building_id
                )
                VALUES ?
                `,
                [insertData]
            );

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


        if (
            req.file &&
            fs.existsSync(req.file.path)
        ) {
            fs.unlinkSync(req.file.path);
        }


        res.status(500).json({

            error: err.message

        });

    }

};