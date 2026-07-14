const express = require("express");
const router = express.Router();

const db = require("../db");


// Expense Hierarchy
router.get("/:fiscal_year_id", async (req, res) => {

    const { fiscal_year_id } = req.params;


    try {


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
                const [transactions] = await db.query(`

                    SELECT

                        pt.month,
                        pt.pages,

                        (pt.pages * ?) AS cost

                    FROM print_transactions pt


                    WHERE pt.device_id = ?


                    ORDER BY pt.month

                `,
                [
                    contract.price_per_page,
                    device.id
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