const express = require("express");
const router = express.Router();

const db = require("../shared/db");
const authMiddleware = require("../auth/require-auth");

// รับ query.month เป็นเดือนเดียว "YYYY-MM" หรือหลายเดือนคั่นด้วย comma "YYYY-MM,YYYY-MM"
// (ตอนกดเลือกด่วน "ไตรมาส"/"ครึ่งปี" จาก MonthPicker ฝั่งหน้า "ค่าใช้จ่ายแยกตามสัญญา")
// parseMonths() แปลง พ.ศ. เป็น ค.ศ. ให้ด้วย — ดู @suth/domain
const {
    parseMonths,
    costSatangAt,
    effectivePriceSatang,
    fromSatang,
    sumSatang,
} = require("@suth/domain");

// ต้อง login ก่อนถึงจะดูค่าใช้จ่ายได้ (เดิมไม่มีการป้องกันเลย)
router.use(authMiddleware);


// เครื่องที่ยังไม่ได้ผูกกับสัญญาใดๆ — เดิมหน้า Expense จะไม่แสดงเครื่องกลุ่มนี้เลย
// เพราะ hierarchy ยึดสัญญาเป็นหลัก ต้องประกาศ route นี้ไว้ก่อน "/:fiscal_year_id"
// ไม่งั้น express จะจับ "/unassigned-devices" เป็นค่า fiscal_year_id แทน
router.get("/unassigned-devices", async (req, res) => {
    try {
        const [devices] = await db.query(`
            SELECT
                d.id,
                d.serial_number,
                d.model,
                d.price_override,
                b.name AS brand_name
            FROM devices d
            LEFT JOIN brand b ON d.brand_id = b.id
            WHERE d.contract_id IS NULL
            ORDER BY d.serial_number
        `);

        for (const device of devices) {
            const [transactions] = await db.query(`
                SELECT
                    pt.month,
                    pt.pages
                FROM print_transactions pt
                WHERE pt.device_id = ?
                ORDER BY pt.month
            `,
            [device.id]);

            // คิดเงินเป็นจำนวนเต็มสตางค์ใน JS ไม่คิดใน SQL — ดู packages/domain/money.cjs
            // เครื่องกลุ่มนี้ไม่มีสัญญา จึงมีได้แค่ราคาเฉพาะเครื่อง
            const priceSatang = effectivePriceSatang(device.price_override, null);

            device.monthly = transactions.map((row) => {
                const satang = costSatangAt(row.pages, priceSatang);
                return { ...row, cost_satang: satang, cost: fromSatang(satang) };
            });

            device.total_cost_satang = sumSatang(device.monthly.map((m) => m.cost_satang));
            device.total_cost = fromSatang(device.total_cost_satang);
        }

        const total_cost_satang = sumSatang(devices.map((d) => d.total_cost_satang));

        res.json({ devices, total_cost_satang, total_cost: fromSatang(total_cost_satang) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


// Expense Hierarchy
router.get("/:fiscal_year_id", async (req, res) => {

    const { fiscal_year_id } = req.params;


    try {

        // ดึงช่วงเดือน (ต.ค.-ก.ย.) ของปีงบนี้ก่อน — เดิมโค้ดข้างล่างไม่มีการกรองเดือนเลย
        // ทำให้ยอดพิมพ์/ค่าใช้จ่ายรายเดือนที่ดึงมาเป็นประวัติทั้งหมดของเครื่อง ไม่ใช่แค่ของปีงบที่เลือก
        const [[fiscalYear]] = await db.query(
            `SELECT start_month, end_month FROM fiscal_year WHERE id = ?`,
            [fiscal_year_id]
        );

        if (!fiscalYear) {
            return res.status(404).json({ error: "ไม่พบปีงบประมาณนี้" });
        }

        const { start_month, end_month } = fiscalYear;

        // Filter เดือน (ไม่บังคับ) — ถ้าไม่ส่งมาเลย ยังเห็นข้อมูลทั้งปีงบเหมือนเดิม
        // ถ้าเลือกมา (เดือนเดียว หรือหลายเดือนจากปุ่มเลือกด่วน "ไตรมาส"/"ครึ่งปี") จะกรองเหลือ
        // เฉพาะเดือนที่เลือก โดยยังคง AND อยู่ในช่วงปีงบเดิมไว้เป็นเซฟตี้อีกชั้น
        const monthsFilter = parseMonths(req.query.month);


        // ดึงสัญญาตามปีงบ — เรียงตามเลขที่สัญญา (เดิมไม่มี ORDER BY เลย ลำดับที่ขึ้นจะสุ่มตามลำดับ
        // แถวในตาราง ทำให้สัญญาสลับที่ไปมาเวลาโหลดหน้าใหม่ เปิด/ปิด accordion แล้วงง)
        const [contracts] = await db.query(`

            SELECT

                c.id,
                c.contract_no,
                c.price_per_page

            FROM contracts c

            WHERE c.fiscal_year_id = ?

            ORDER BY c.contract_no

        `,
        [
            fiscal_year_id
        ]);



        for (const contract of contracts) {


            // ดึงเครื่องในสัญญา — เรียงตาม serial number ให้หาเครื่องเจอง่าย (เดิมไม่มี ORDER BY)
            const [devices] = await db.query(`

                SELECT

                    d.id,
                    d.serial_number,
                    d.model,
                    d.price_override,

                    b.name AS brand_name

                FROM devices d

                LEFT JOIN brand b
                ON d.brand_id = b.id

                WHERE d.contract_id = ?

                ORDER BY d.serial_number

            `,
            [
                contract.id
            ]);




            for (const device of devices) {


                // ดึงยอดพิมพ์รายเดือน
                // ใช้ COALESCE(device.price_override, contract.price_per_page, 0) เหมือนกับ
                // schema.sql (v_monthly_kpi ฯลฯ) — เดิมโค้ดตรงนี้อิงแค่ contract.price_per_page
                // ตัวเดียว พอสัญญาไหนไม่ได้กรอกราคาต่อแผ่นไว้ (price_per_page = NULL) ค่าใช้จ่าย
                // จะกลายเป็น NULL ทั้งหมดทันที (ทั้งที่บางเครื่องมี price_override ของตัวเองอยู่แล้ว)
                // ทำให้หน้า "ค่าใช้จ่ายแยกตามสัญญา" โชว์ 0.00 บาท เหมือนไม่มีเลขค่าใช้จ่ายเลย
                let transactionSql = `

                    SELECT

                        pt.month,
                        pt.pages

                    FROM print_transactions pt


                    WHERE pt.device_id = ?
                    AND pt.month BETWEEN ? AND ?

                `;

                const transactionParams = [
                    device.id,
                    start_month,
                    end_month
                ];

                if (monthsFilter.length) {
                    transactionSql += ` AND pt.month IN (?) `;
                    transactionParams.push(monthsFilter);
                }

                transactionSql += ` ORDER BY pt.month `;

                const [transactions] = await db.query(
                    transactionSql,
                    transactionParams
                );



                // คิดเงินเป็นจำนวนเต็มสตางค์ใน JS ไม่คิดใน SQL — ดู packages/domain/money.cjs
                const priceSatang = effectivePriceSatang(
                    device.price_override,
                    contract.price_per_page
                );

                device.monthly = transactions.map((row) => {
                    const satang = costSatangAt(row.pages, priceSatang);
                    return { ...row, cost_satang: satang, cost: fromSatang(satang) };
                });


                // รวมค่าใช้จ่ายเครื่อง — บวกในหน่วยสตางค์ ไม่บวก float ของบาท
                device.total_cost_satang = sumSatang(
                    device.monthly.map((m) => m.cost_satang)
                );
                device.total_cost = fromSatang(device.total_cost_satang);


            }


            contract.devices = devices;



            // รวมค่าใช้จ่ายสัญญา — บวกในหน่วยสตางค์ ไม่บวก float ของบาท
            contract.total_cost_satang = sumSatang(
                devices.map((d) => d.total_cost_satang)
            );
            contract.total_cost = fromSatang(contract.total_cost_satang);


        }



        res.json({

            fiscal_year_id,

            month: monthsFilter.length ? monthsFilter.join(",") : null,

            contracts

        });



    }
    catch(err){

        console.error(err);


        res.status(500).json({

            error: err.message

        });

    }


});


module.exports = router;