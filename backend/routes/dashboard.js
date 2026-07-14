const express = require('express');
const router = express.Router();
const db = require('../db');


// ============================================================
// GET /api/dashboard/monthly-kpi
// ============================================================

router.get('/monthly-kpi', async(req,res)=>{

try{

let sql = `

SELECT

m.*,

b.name AS building_name

FROM v_monthly_kpi m

LEFT JOIN devices d
ON m.device_id = d.id

LEFT JOIN building b
ON d.building_id = b.id

`;


const params=[];
const conditions=[];


if(req.query.month){

conditions.push(
"m.month = ?"
);

params.push(
req.query.month
);

}


if(req.query.building_name){

conditions.push(
"b.name = ?"
);

params.push(
req.query.building_name
);

}


if(conditions.length){

sql +=
" WHERE " +
conditions.join(" AND ");

}


sql += `
ORDER BY m.month ASC
`;


const [rows]=
await db.query(sql,params);


res.json(rows);


}
catch(err){

console.error(err);

res.status(500).json({
error:err.message
});

}

});



// ============================================================
// GET /api/dashboard/summary-by-building
// ============================================================

router.get('/summary-by-building', async (req,res)=>{

  try {


    let sql = `

      SELECT

        b.name AS building_name,

        SUM(v.net_pages) AS total_net_pages,

        SUM(v.total_cost) AS total_building_cost


      FROM v_monthly_kpi v


      LEFT JOIN devices d

      ON v.device_id = d.id


      LEFT JOIN building b

      ON d.building_id = b.id


      WHERE 1=1

    `;


    const params=[];



    if(req.query.building_name){


      sql += `
        AND b.name = ?
      `;


      params.push(
        req.query.building_name
      );


    }



    if(req.query.month){


      sql += `
        AND v.month = ?
      `;


      params.push(
        req.query.month
      );


    }



    sql += `

      GROUP BY
      b.name


      ORDER BY
      total_building_cost DESC

    `;



    const [rows] =
      await db.query(
        sql,
        params
      );


    res.json(rows);



  }
  catch(err){


    console.error(
      "Building Summary Error:",
      err.message
    );


    res.status(500).json({
      error:err.message
    });


  }


});




// ============================================================
// GET /api/dashboard/compare
// ============================================================

router.get('/compare', async(req,res)=>{

  try {

    let sql = `
      SELECT *
      FROM v_compare_usage_costs
    `;


    const params=[];
    const conditions=[];



    if(req.query.month){

      conditions.push(
        "month = ?"
      );

      params.push(
        req.query.month
      );

    }



    if(req.query.building_name){

      conditions.push(
        "building_name = ?"
      );

      params.push(
        req.query.building_name
      );

    }



    if(conditions.length){

      sql +=
        " WHERE " +
        conditions.join(" AND ");

    }


    sql += `
      ORDER BY month ASC
    `;



    const [rows] =
      await db.query(
        sql,
        params
      );


    res.json(rows);



  }catch(err){

    console.error(
      "Compare Error:",
      err.message
    );


    res.status(500).json({
      error:err.message
    });

  }

});




// ============================================================
// GET /api/dashboard/stats
// ============================================================

// ============================================================
// GET /api/dashboard/stats
// KPI Cards (รองรับ Filter)
// ============================================================

router.get('/stats', async(req,res)=>{

  try {


    let deviceSql = `
      SELECT COUNT(*) AS total_devices
      FROM devices d
      LEFT JOIN building b
      ON d.building_id = b.id
    `;


    let transactionSql = `
      SELECT

      COUNT(pt.id) AS total_transactions,

      COALESCE(
        SUM(pt.pages),
        0
      ) AS total_pages

      FROM print_transactions pt

      LEFT JOIN devices d
      ON pt.device_id = d.id

      LEFT JOIN building b
      ON d.building_id = b.id

    `;


    const deviceParams = [];
    const transactionParams = [];

    const deviceConditions = [];
    const transactionConditions = [];



    // Filter อาคาร
    if(req.query.building_name){


      deviceConditions.push(
        "b.name = ?"
      );


      deviceParams.push(
        req.query.building_name
      );


      transactionConditions.push(
        "b.name = ?"
      );


      transactionParams.push(
        req.query.building_name
      );


    }



    // Filter เดือน
    if(req.query.month){


      transactionConditions.push(
        "pt.month = ?"
      );


      transactionParams.push(
        req.query.month
      );


    }




    if(deviceConditions.length){


      deviceSql +=
        " WHERE " +
        deviceConditions.join(" AND ");


    }




    if(transactionConditions.length){


      transactionSql +=
        " WHERE " +
        transactionConditions.join(" AND ");


    }





    const [[deviceCount]]
      = await db.query(
        deviceSql,
        deviceParams
      );




    const [[contractCount]] =
  await db.query(`
    SELECT COUNT(*) AS total_contracts
    FROM contracts
  `);




    const [[transactionStats]]
      = await db.query(
        transactionSql,
        transactionParams
      );





    res.json({

      total_devices:
        deviceCount.total_devices,


      total_contracts:
        contractCount.total_contracts,


      total_transactions:
        transactionStats.total_transactions,


      total_pages:
        transactionStats.total_pages


    });



  }catch(err){


    console.error(
      "Stats Error:",
      err.message
    );


    res.status(500).json({
      error:err.message
    });


  }


});

// ============================================================
// GET /api/dashboard/expense
// Expense Detail
// ============================================================

router.get('/expense', async(req,res)=>{

  try {


    let sql = `

      SELECT

        v.device_id,

        d.model,

        b.name AS building_name,

        dep.name AS department_name,


        SUM(v.net_pages) AS total_pages,


        SUM(v.total_cost) AS total_cost


      FROM v_monthly_kpi v


      LEFT JOIN devices d
      ON v.device_id = d.id


      LEFT JOIN building b
      ON d.building_id = b.id


      LEFT JOIN department dep
      ON d.department_id = dep.id


      WHERE 1=1

    `;



    const params=[];



    // Filter เดือน
    if(req.query.month){


      sql += `
        AND v.month = ?
      `;


      params.push(
        req.query.month
      );


    }



    // Filter อาคาร
    if(req.query.building_name){


      sql += `
        AND b.name = ?
      `;


      params.push(
        req.query.building_name
      );


    }



    sql += `

      GROUP BY

        v.device_id,

        d.model,

        b.name,

        dep.name


      ORDER BY

        total_cost DESC

    `;



    const [rows] =
      await db.query(
        sql,
        params
      );



    res.json(rows);



  }
  catch(err){


    console.error(
      "Expense Error:",
      err.message
    );


    res.status(500).json({

      error:err.message

    });


  }


});

module.exports = router;