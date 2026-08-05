const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');

// อ่านอย่างเดียว แต่ต้อง login ก่อน (เดิมไม่มีการป้องกันเลย)
router.use(authMiddleware);


// รับ query.month เป็นเดือนเดียว "YYYY-MM" หรือหลายเดือนคั่นด้วย comma
// "YYYY-MM,YYYY-MM" (ตามที่ MonthPicker หน้า Dashboard ส่งมาตอนเลือกได้หลายเดือน)
// คืนเป็น array เสมอ ว่างเปล่าถ้าไม่ได้ส่งมา ใช้คู่กับ "col IN (?)" ผ่าน mysql2
function parseMonths(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}


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


const monthlyKpiMonths = parseMonths(req.query.month);
if(monthlyKpiMonths.length){

conditions.push(
"m.month IN (?)"
);

params.push(
monthlyKpiMonths
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



    const summaryMonths = parseMonths(req.query.month);
    if(summaryMonths.length){


      sql += `
        AND v.month IN (?)
      `;


      params.push(
        summaryMonths
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



    const compareMonths = parseMonths(req.query.month);
    if(compareMonths.length){

      conditions.push(
        "month IN (?)"
      );

      params.push(
        compareMonths
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
    const statsMonths = parseMonths(req.query.month);
    if(statsMonths.length){


      transactionConditions.push(
        "pt.month IN (?)"
      );


      transactionParams.push(
        statsMonths
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

// ============================================================
// GET /api/dashboard/by-department
// มุมมองแบบองค์กร: ฝ่าย -> แผนก -> เครื่อง -> ยอดพิมพ์รายเดือน
// พร้อมเทียบเดือนที่เลือก (?month=YYYY-MM) กับเดือนก่อนหน้า
// เพื่อบอกว่าแผนกนี้ปริ้นเพิ่มขึ้น (แดง) หรือลดลง (เขียว) พร้อม % จริง
//
// ปรับปรุงจากเดิม: เดิมวน query ทีละฝ่าย->แผนก->เครื่อง->เดือน (N+1)
// ตอนนี้ใช้แค่ 3 query คงที่ ไม่ว่าจะมีกี่เครื่อง แล้วจัดกลุ่มฝั่ง JS แทน
// ============================================================

function previousMonthOf(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// % เปลี่ยนแปลง — null หมายถึงคำนวณไม่ได้ (ไม่มีข้อมูลเดือนก่อน)
function calcChangePercent(current, previous, hasPrevious) {
  if (!hasPrevious) return null;
  if (previous === 0) return current > 0 ? null : 0; // จากไม่มีข้อมูลเป็นมีข้อมูล ถือว่า "ใหม่" ไม่ใช่ %
  return ((current - previous) / previous) * 100;
}

router.get('/by-department', async (req, res) => {
  const { month } = req.query;

  try {
    const [divisions] = await db.query('SELECT id, name FROM division ORDER BY name');
    const [departments] = await db.query('SELECT id, name, division_id FROM department ORDER BY name');

    // Query เดียว ดึงทุกเครื่อง + ยอดพิมพ์ทุกเดือนของทุกเครื่องพร้อมกัน (LEFT JOIN)
    // เครื่องที่ไม่เคยมีคนกรอกยอดพิมพ์เลยจะได้ month/net_pages/total_cost เป็น NULL แถวเดียว
    const [rows] = await db.query(`
      SELECT
        d.id AS device_id,
        d.serial_number,
        d.model,
        d.department_id,
        b.name AS brand_name,
        v.month,
        v.net_pages,
        v.total_cost
      FROM devices d
      LEFT JOIN brand b ON d.brand_id = b.id
      LEFT JOIN v_monthly_kpi v ON v.device_id = d.id
      ORDER BY d.department_id, d.id, v.month
    `);

    // จัดกลุ่มแถวดิบให้เป็น device -> { ...info, monthly: [...] }
    const deviceMap = new Map();

    for (const row of rows) {
      if (!deviceMap.has(row.device_id)) {
        deviceMap.set(row.device_id, {
          id: row.device_id,
          serial_number: row.serial_number,
          model: row.model,
          brand_name: row.brand_name,
          department_id: row.department_id,
          monthly: [],
        });
      }

      if (row.month) {
        deviceMap.get(row.device_id).monthly.push({
          month: row.month,
          net_pages: row.net_pages,
          total_cost: row.total_cost,
        });
      }
    }

    const prevMonth = month ? previousMonthOf(month) : null;

    for (const device of deviceMap.values()) {
      device.total_pages = device.monthly.reduce((sum, r) => sum + Number(r.net_pages || 0), 0);
      device.total_cost = device.monthly.reduce((sum, r) => sum + Number(r.total_cost || 0), 0);

      if (month) {
        const current = device.monthly.find((r) => r.month === month);
        const previous = device.monthly.find((r) => r.month === prevMonth);

        device.current_month_pages = current ? Number(current.net_pages) : 0;
        device.previous_month_pages = previous ? Number(previous.net_pages) : 0;
        device.current_month_cost = current ? Number(current.total_cost) : 0;
        device.previous_month_cost = previous ? Number(previous.total_cost) : 0;
        device.has_current_data = !!current;
        device.has_previous_data = !!previous;
      }
    }

    // จัดกลุ่มเครื่องเข้าแผนก
    const departmentMap = new Map(
      departments.map((dep) => [dep.id, { ...dep, devices: [] }])
    );

    const unassignedDevices = [];

    for (const device of deviceMap.values()) {
      if (device.department_id && departmentMap.has(device.department_id)) {
        departmentMap.get(device.department_id).devices.push(device);
      } else {
        unassignedDevices.push(device);
      }
    }

    // สรุปยอดรวม + แนวโน้มระดับแผนก
    for (const department of departmentMap.values()) {
      department.total_pages = department.devices.reduce((sum, d) => sum + d.total_pages, 0);
      department.total_cost = department.devices.reduce((sum, d) => sum + d.total_cost, 0);

      if (month) {
        department.current_month_pages = department.devices.reduce((sum, d) => sum + (d.current_month_pages || 0), 0);
        department.previous_month_pages = department.devices.reduce((sum, d) => sum + (d.previous_month_pages || 0), 0);
        department.current_month_cost = department.devices.reduce((sum, d) => sum + (d.current_month_cost || 0), 0);
        department.previous_month_cost = department.devices.reduce((sum, d) => sum + (d.previous_month_cost || 0), 0);

        const hasCurrentData = department.devices.some((d) => d.has_current_data);
        const hasPreviousData = department.devices.some((d) => d.has_previous_data);

        department.change_percent = calcChangePercent(
          department.current_month_pages,
          department.previous_month_pages,
          hasPreviousData
        );

        department.cost_change_percent = calcChangePercent(
          department.current_month_cost,
          department.previous_month_cost,
          hasPreviousData
        );

        if (!hasCurrentData && !hasPreviousData) {
          department.trend = 'no-data';
        } else if (department.current_month_pages > department.previous_month_pages) {
          department.trend = 'up';
        } else if (department.current_month_pages < department.previous_month_pages) {
          department.trend = 'down';
        } else {
          department.trend = 'flat';
        }
      }
    }

    // จัดกลุ่มแผนกเข้าฝ่าย — แผนกที่ division_id ไม่ตรงกับฝ่ายไหนเลย (ข้อมูลเพี้ยน/ฝ่ายถูกลบ)
    // จะถูกจัดไว้ในฝ่ายเสมือน "ไม่ได้ระบุฝ่าย" แทนที่จะหายไปเงียบๆ จากรายงาน
    const divisionMap = new Map(
      divisions.map((div) => [div.id, { ...div, departments: [] }])
    );

    const UNASSIGNED_DIVISION_ID = '__unassigned__';
    const unassignedDivision = {
      id: UNASSIGNED_DIVISION_ID,
      name: 'ไม่ได้ระบุฝ่าย',
      departments: [],
    };

    for (const department of departmentMap.values()) {
      if (department.division_id && divisionMap.has(department.division_id)) {
        divisionMap.get(department.division_id).departments.push(department);
      } else {
        unassignedDivision.departments.push(department);
      }
    }

    let divisionList = [...divisionMap.values()];

    if (unassignedDivision.departments.length > 0) {
      divisionList.push(unassignedDivision);
    }

    // รวมยอดระดับฝ่าย + เรียงจากมากไปน้อยตามค่าใช้จ่าย (แผนก/ฝ่ายที่ใช้เยอะสุดขึ้นก่อน)
    for (const division of divisionList) {
      division.total_pages = division.departments.reduce((sum, d) => sum + d.total_pages, 0);
      division.total_cost = division.departments.reduce((sum, d) => sum + d.total_cost, 0);
      division.departments.sort((a, b) => b.total_cost - a.total_cost);
    }

    divisionList.sort((a, b) => b.total_cost - a.total_cost);

    res.json({ month: month || null, divisions: divisionList, unassignedDevices });

  } catch (err) {
    console.error('By-department error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/dashboard/highlights
// ข้อมูลเสริมสำหรับหน้า Dashboard เท่านั้น (ไม่ซ้ำกับหน้าอื่น):
//   - device_status : จำนวนเครื่องแยกตามสถานะ (ใช้งาน/ซ่อม/ปลดระวาง)
//   - top_departments : Top 5 แผนกที่มีค่าใช้จ่ายสูงสุด (ดูรายละเอียดเต็มได้ที่หน้า "ยอดพิมพ์แยกตามฝ่าย/แผนก")
//   - contracts : สรุปการใช้งานแยกตามสัญญา (จำนวนเครื่อง/หน้า/ค่าใช้จ่ายต่อสัญญา)
// รองรับ filter เดียวกับ /stats คือ ?building_name= และ ?month=
// ============================================================

router.get('/highlights', async (req, res) => {
  const { building_name, month } = req.query;

  try {
    // ---------- 1) Device status breakdown ----------
    let deviceStatusSql = `
      SELECT d.status, COUNT(*) AS count
      FROM devices d
      LEFT JOIN building b ON d.building_id = b.id
    `;
    const deviceStatusParams = [];

    if (building_name) {
      deviceStatusSql += ' WHERE b.name = ? ';
      deviceStatusParams.push(building_name);
    }

    deviceStatusSql += ' GROUP BY d.status ';

    const [statusRows] = await db.query(deviceStatusSql, deviceStatusParams);

    // เติมสถานะที่ไม่มีข้อมูลให้เป็น 0 เสมอ เพื่อให้ frontend ไม่ต้องเช็ค undefined
    const statusOrder = ['active', 'repair', 'retired'];
    const statusMap = new Map(statusRows.map((r) => [r.status, Number(r.count)]));

    const device_status = statusOrder.map((status) => ({
      status,
      count: statusMap.get(status) || 0,
    }));

    // ---------- 2) Top 5 departments by cost ----------
    let topDeptSql = `
      SELECT
        d.department_id,
        dept.name AS department_name,
        divi.name AS division_name,
        SUM(v.net_pages) AS total_pages,
        SUM(v.total_cost) AS total_cost
      FROM v_monthly_kpi v
      JOIN devices d ON v.device_id = d.id
      LEFT JOIN department dept ON d.department_id = dept.id
      LEFT JOIN division divi ON dept.division_id = divi.id
      LEFT JOIN building b ON d.building_id = b.id
      WHERE 1=1
    `;
    const topDeptParams = [];
    const highlightMonths = parseMonths(month);

    if (highlightMonths.length) {
      topDeptSql += ' AND v.month IN (?) ';
      topDeptParams.push(highlightMonths);
    }

    if (building_name) {
      topDeptSql += ' AND b.name = ? ';
      topDeptParams.push(building_name);
    }

    topDeptSql += `
      GROUP BY d.department_id, dept.name, divi.name
      ORDER BY total_cost DESC
      LIMIT 5
    `;

    const [top_departments] = await db.query(topDeptSql, topDeptParams);

    // ---------- 3) Contract usage summary ----------
    let contractJoin = 'LEFT JOIN v_monthly_kpi v ON v.device_id = d.id';
    const contractParams = [];

    if (highlightMonths.length) {
      contractJoin = 'LEFT JOIN v_monthly_kpi v ON v.device_id = d.id AND v.month IN (?)';
      contractParams.push(highlightMonths);
    }

    let contractSql = `
      SELECT
        c.id,
        c.contract_no,
        fy.year AS fiscal_year,
        c.price_per_page,
        COUNT(DISTINCT d.id) AS device_count,
        COALESCE(SUM(v.net_pages), 0) AS total_pages,
        COALESCE(SUM(v.total_cost), 0) AS total_cost
      FROM contracts c
      LEFT JOIN fiscal_year fy ON c.fiscal_year_id = fy.id
      LEFT JOIN devices d ON d.contract_id = c.id
      LEFT JOIN building b ON d.building_id = b.id
      ${contractJoin}
      WHERE 1=1
    `;

    if (building_name) {
      contractSql += ' AND b.name = ? ';
      contractParams.push(building_name);
    }

    contractSql += `
      GROUP BY c.id, c.contract_no, fy.year, c.price_per_page
      ORDER BY total_cost DESC
    `;

    const [contracts] = await db.query(contractSql, contractParams);

    res.json({ device_status, top_departments, contracts });
  } catch (err) {
    console.error('Highlights Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;