const express = require("express");
const router = express.Router();

const db = require("../db");
const authMiddleware = require("../middlewares/authMiddleware");

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
        `);

        for (const device of devices) {
            const [transactions] = await db.query(`
                SELECT
                    pt.month,
                    pt.pages,
                    (pt.pages * 0.8 * COALESCE(?, 0)) AS cost
                FROM print_transactions pt
                WHERE pt.device_id = ?
                ORDER BY pt.month
            `,
            [device.price_override, device.id]);

            device.monthly = transactions;
            device.total_cost = transactions.reduce((sum, item) => sum + Number(item.cost), 0);
        }

        const total_cost = devices.reduce((sum, d) => sum + d.total_cost, 0);

        res.json({ devices, total_cost });
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


        // ดึงสัญญาตามปีงบ
        const [contracts] = await db.query(`

            SELECT

                c.id,
                c.contract_no,
                c.price_per_page

            FROM contracts c

            WHERE c.fiscal_year_id = ?

        `,
        [
            fiscal_year_id
        ]);



        for (const contract of contracts) {


            // ดึงเครื่องในสัญญา
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
                const [transactions] = await db.query(`

                    SELECT

                        pt.month,
                        pt.pages,

                        (pt.pages * 0.8 * COALESCE(?, ?, 0)) AS cost

                    FROM print_transactions pt


                    WHERE pt.device_id = ?
                    AND pt.month BETWEEN ? AND ?


                    ORDER BY pt.month

                `,
                [
                    device.price_override,
                    contract.price_per_page,
                    device.id,
                    start_month,
                    end_month
                ]);



                device.monthly = transactions;


                // รวมค่าใช้จ่ายเครื่อง
                device.total_cost =
                    transactions.reduce(
                        (sum,item)=>
                        sum + Number(item.cost),
                        0
                    );


            }


            contract.devices = devices;



            // รวมค่าใช้จ่ายสัญญา
            contract.total_cost =
                devices.reduce(
                    (sum,d)=>
                    sum + d.total_cost,
                    0
                );


        }



        res.json({

            fiscal_year_id,

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