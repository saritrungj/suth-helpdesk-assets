const express = require("express");
const router = express.Router();

const db = require("../db");


// GET รายการ
router.get("/", async(req,res)=>{

  try{

    const [rows] =
      await db.query(`

      SELECT

      pt.*,

      d.serial_number

      FROM print_transactions pt

      LEFT JOIN devices d
      ON pt.device_id = d.id

      ORDER BY pt.month DESC

      `);


    res.json(rows);


  }catch(err){

    res.status(500).json({
      error:err.message
    });

  }

});




// POST เพิ่มยอดพิมพ์

router.post("/", async(req,res)=>{

  try{


    const {
      device_id,
      month,
      pages
    } = req.body;



    await db.query(`

      INSERT INTO print_transactions

      (
        device_id,
        month,
        pages
      )

      VALUES (?,?,?)

    `,
    [
      device_id,
      month,
      pages
    ]);



    res.json({

      message:"บันทึกยอดพิมพ์สำเร็จ"

    });


  }catch(err){


    res.status(500).json({

      error:err.message

    });


  }


});



module.exports = router;