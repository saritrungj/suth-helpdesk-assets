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

// ช่วงก่อนหน้า — คืน N เดือนที่อยู่ก่อนหน้า "เดือนแรก" ของช่วงที่เลือกทันที (N = จำนวนเดือนในช่วงที่เลือก)
// เพื่อให้เทียบ "ช่วงนี้" (อาจเป็น 1 เดือน หรือทั้งไตรมาส/ครึ่งปี ที่ MonthPicker เลือกด่วนมาให้) กับ
// "ช่วงก่อนหน้า" ที่มีจำนวนเดือนเท่ากันเสมอ ไม่ใช่แค่เทียบเดือนก่อนเดือนเดียวเหมือนเดิม
function previousPeriodMonths(sortedMonths) {
  if (!sortedMonths.length) return [];
  const result = [];
  let cursor = sortedMonths[0];
  for (let i = 0; i < sortedMonths.length; i++) {
    cursor = previousMonthOf(cursor);
    result.unshift(cursor);
  }
  return result;
}

// % เปลี่ยนแปลง — null หมายถึงคำนวณไม่ได้ (ไม่มีข้อมูลเดือนก่อน)
function calcChangePercent(current, previous, hasPrevious) {
  if (!hasPrevious) return null;
  if (previous === 0) return current > 0 ? null : 0; // จากไม่มีข้อมูลเป็นมีข้อมูล ถือว่า "ใหม่" ไม่ใช่ %
  return ((current - previous) / previous) * 100;
}

router.get('/by-department', async (req, res) => {
  const { fiscal_year_id } = req.query;

  // ช่วงที่เทียบแนวโน้ม — รับได้ทั้งเดือนเดียว หรือหลายเดือนคั่นด้วย comma (ตอนกดเลือกด่วน
  // "ไตรมาส"/"ครึ่งปี" จาก MonthPicker) เหมือน parseMonths() ที่ใช้กับ filter อื่นๆ ในไฟล์นี้
  const currentMonths = parseMonths(req.query.month).sort();
  const previousMonths = previousPeriodMonths(currentMonths);
  const currentMonthsSet = new Set(currentMonths);
  const previousMonthsSet = new Set(previousMonths);

  try {
    // อิงตามปีงบที่เลือก (เหมือนหน้า "ค่าใช้จ่ายแยกตามสัญญา") — เดิม route นี้ไม่กรองปีงบเลย
    // ดึงยอดพิมพ์ทุกเดือนที่มีในระบบมารวม ทำให้ยอดรวมไม่ตรงกับหน้า Expense ที่กรองตามปีงบ
    // ถ้าไม่ส่ง fiscal_year_id มา (เผื่อ backward-compat) จะคงพฤติกรรมเดิมคือรวมทุกเดือน
    let fiscalYear = null;
    if (fiscal_year_id) {
      const [[fy]] = await db.query(
        `SELECT start_month, end_month FROM fiscal_year WHERE id = ?`,
        [fiscal_year_id]
      );

      if (!fy) {
        return res.status(404).json({ error: "ไม่พบปีงบประมาณนี้" });
      }

      fiscalYear = fy;
    }

    const [divisions] = await db.query('SELECT id, name FROM division ORDER BY name');
    const [departments] = await db.query('SELECT id, name, division_id FROM department ORDER BY name');

    // Query เดียว ดึงทุกเครื่อง + ยอดพิมพ์ทุกเดือนของทุกเครื่องพร้อมกัน (LEFT JOIN)
    // เครื่องที่ไม่เคยมีคนกรอกยอดพิมพ์เลย (หรือไม่มีข้อมูลในช่วงปีงบนี้) จะได้ month/net_pages/total_cost
    // เป็น NULL แถวเดียว — เงื่อนไขช่วงเดือนต้องอยู่ใน "ON" ไม่ใช่ "WHERE" ไม่งั้น LEFT JOIN จะ
    // กลายเป็น INNER JOIN โดยปริยาย (เครื่องที่ไม่มีข้อมูลในช่วงนี้จะหายไปจากรายงานทั้งเครื่อง)
    //
    // effective_department_id: แผนกที่เครื่อง "สังกัดอยู่จริง ณ เดือนนั้น" ไม่ใช่แผนกปัจจุบันของเครื่อง —
    // join กับ device_location_history โดยเทียบวันที่ 1 ของเดือนนั้นกับช่วง effective_from/effective_to
    // เครื่องที่เคยย้ายแผนกระหว่างทาง ยอดพิมพ์เดือนเก่าจะยังค้างอยู่กับแผนกเดิมที่เคยสังกัดตอนนั้น
    // (แถวที่ไม่มีประวัติตรงช่วงเลย เช่น ยังไม่เคยรัน backfill หรือไม่มียอดพิมพ์เดือนนั้น
    // จะ fallback ไปใช้ d.department_id ปัจจุบันแทน กันไม่ให้เครื่องหลุดจากรายงาน)
    const sql = `
      SELECT
        d.id AS device_id,
        d.serial_number,
        d.model,
        b.name AS brand_name,
        v.month,
        v.net_pages,
        v.total_cost,
        COALESCE(h.department_id, d.department_id) AS effective_department_id
      FROM devices d
      LEFT JOIN brand b ON d.brand_id = b.id
      LEFT JOIN v_monthly_kpi v
        ON v.device_id = d.id
        ${fiscalYear ? 'AND v.month BETWEEN ? AND ?' : ''}
      LEFT JOIN device_location_history h
        ON h.device_id = d.id
        AND v.month IS NOT NULL
        -- เทียบระดับเดือนล้วนๆ (v.month คือ 'YYYY-MM') ไม่ใช่เทียบกับวันที่ 1 ของเดือนตรงๆ กับ
        -- effective_from/effective_to แบบวันที่จริง — เพราะถ้าย้ายกลางเดือน (ไม่ใช่วันที่ 1)
        -- เดือนนั้นจะไม่ตรงเงื่อนไขกับช่วงไหนเลย ยอดพิมพ์เดือนนั้นเลยหายไปจากรายงาน
        AND v.month >= DATE_FORMAT(h.effective_from, '%Y-%m')
        AND (h.effective_to IS NULL OR v.month < DATE_FORMAT(h.effective_to, '%Y-%m'))
      ORDER BY effective_department_id, d.serial_number, v.month
    `;
    const params = fiscalYear ? [fiscalYear.start_month, fiscalYear.end_month] : [];

    const [rows] = await db.query(sql, params);

    // จัดกลุ่มแถวดิบให้เป็น device -> { ...info, monthly: [...] }
    // key เป็น "department_id:device_id" (ไม่ใช่แค่ device_id เฉยๆ) เพราะเครื่องเดียวอาจมีบาง
    // เดือนสังกัดแผนกเดิม บางเดือนสังกัดแผนกใหม่ (ย้ายกลางปีงบ) ต้องแยกเป็นคนละก้อนในรายงาน
    // ไม่ให้ยอดของสองแผนกไปปนกันเป็นเครื่องเดียว
    const deviceMap = new Map();
    const deviceDeptCount = new Map(); // นับว่าเครื่องแต่ละตัวไปโผล่กี่แผนก (ไว้ติดป้าย "ย้ายแผนกระหว่างช่วงนี้")

    for (const row of rows) {
      const key = `${row.effective_department_id ?? 'none'}:${row.device_id}`;

      if (!deviceMap.has(key)) {
        deviceMap.set(key, {
          id: row.device_id,
          serial_number: row.serial_number,
          model: row.model,
          brand_name: row.brand_name,
          department_id: row.effective_department_id,
          monthly: [],
        });

        deviceDeptCount.set(row.device_id, (deviceDeptCount.get(row.device_id) || 0) + 1);
      }

      if (row.month) {
        deviceMap.get(key).monthly.push({
          month: row.month,
          net_pages: row.net_pages,
          total_cost: row.total_cost,
        });
      }
    }

    for (const device of deviceMap.values()) {
      device.total_pages = device.monthly.reduce((sum, r) => sum + Number(r.net_pages || 0), 0);
      device.total_cost = device.monthly.reduce((sum, r) => sum + Number(r.total_cost || 0), 0);
      // true ถ้าเครื่องนี้ (serial เดียวกัน) ไปโผล่มากกว่า 1 แผนกในรายงานนี้ เพราะย้ายแผนกระหว่างช่วงเวลาที่ดู
      device.moved_during_period = (deviceDeptCount.get(device.id) || 1) > 1;

      if (currentMonths.length) {
        // รวมยอดของทุกเดือนในช่วงที่เลือก (ไม่ใช่แค่เดือนเดียวเหมือนเดิม) แล้วเทียบกับช่วงก่อนหน้า
        // ที่มีจำนวนเดือนเท่ากัน — รองรับทั้งเลือก 1 เดือน หรือเลือกด่วนเป็นไตรมาส/ครึ่งปี
        const currentRows = device.monthly.filter((r) => currentMonthsSet.has(r.month));
        const previousRows = device.monthly.filter((r) => previousMonthsSet.has(r.month));

        device.current_month_pages = currentRows.reduce((s, r) => s + Number(r.net_pages || 0), 0);
        device.previous_month_pages = previousRows.reduce((s, r) => s + Number(r.net_pages || 0), 0);
        device.current_month_cost = currentRows.reduce((s, r) => s + Number(r.total_cost || 0), 0);
        device.previous_month_cost = previousRows.reduce((s, r) => s + Number(r.total_cost || 0), 0);
        device.has_current_data = currentRows.length > 0;
        device.has_previous_data = previousRows.length > 0;
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

      if (currentMonths.length) {
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

    res.json({
      month: currentMonths.length ? currentMonths.join(',') : null,
      fiscal_year_id: fiscal_year_id || null,
      divisions: divisionList,
      unassignedDevices,
    });

  } catch (err) {
    console.error('By-department error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/dashboard/highlights
// ข้อมูลเสริมสำหรับหน้า Dashboard เท่านั้น (ไม่ซ้ำกับหน้าอื่น):
//   - device_status : จำนวนเครื่องแยกตามสถานะ (ใช้งาน/ซ่อม/ปลดระวาง)
//   - top_departments : Top 5 แผนกที่มีค่าใช้จ่ายสูงสุด/น้อยสุด (ดูรายละเอียดเต็มได้ที่หน้า "ยอดพิมพ์แยกตามฝ่าย/แผนก")
//     ?department_order=asc -> น้อยที่สุดก่อน | ค่าอื่น/ไม่ส่ง -> มากที่สุดก่อน (default)
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

    // ?department_order=asc -> แผนกค่าใช้จ่ายน้อยที่สุดก่อน | ค่าอื่น/ไม่ส่ง -> มากที่สุดก่อน (default)
    // whitelist ค่าก่อนต่อ string ตรงๆ ลง SQL เพราะ ASC/DESC ใช้ผ่าน parameterized query (?) ไม่ได้
    const departmentOrderDir = req.query.department_order === 'asc' ? 'ASC' : 'DESC';

    topDeptSql += `
      GROUP BY d.department_id, dept.name, divi.name
      ORDER BY total_cost ${departmentOrderDir}
      LIMIT 5
    `;

    const [top_departments] = await db.query(topDeptSql, topDeptParams);

    // ---------- 2.5) Top/Bottom 5 devices by pages printed ----------
    // ใช้ LEFT JOIN จาก devices (ไม่ใช่เริ่มจาก v_monthly_kpi แบบ top_departments ด้านบน)
    // เพราะโจทย์ "เครื่องไหนปริ้นน้อยที่สุด" ต้องเห็นเครื่องที่ไม่เคยมีคนกรอกยอดเลยด้วย
    // (ถ้าเริ่มจาก v_monthly_kpi เครื่อง 0 หน้าจะไม่มีแถวให้ join เลย หลุดออกจากอันดับ "น้อยที่สุด" ไปเงียบๆ)
    // เงื่อนไขเดือนจึงต้องอยู่ใน ON ของ LEFT JOIN ไม่ใช่ WHERE ไม่งั้น LEFT JOIN จะกลายเป็น INNER JOIN โดยปริยาย
    let topDeviceJoin = 'LEFT JOIN v_monthly_kpi v ON v.device_id = d.id';
    const topDeviceJoinParams = [];

    if (highlightMonths.length) {
      topDeviceJoin = 'LEFT JOIN v_monthly_kpi v ON v.device_id = d.id AND v.month IN (?)';
      topDeviceJoinParams.push(highlightMonths);
    }

    let topDeviceSql = `
      SELECT
        d.id AS device_id,
        d.serial_number,
        d.model,
        d.status,
        b.name AS building_name,
        dept.name AS department_name,
        COALESCE(SUM(v.net_pages), 0) AS total_pages,
        COALESCE(SUM(v.total_cost), 0) AS total_cost
      FROM devices d
      LEFT JOIN building b ON d.building_id = b.id
      LEFT JOIN department dept ON d.department_id = dept.id
      ${topDeviceJoin}
      WHERE 1=1
    `;
    const topDeviceParams = [...topDeviceJoinParams];

    if (building_name) {
      topDeviceSql += ' AND b.name = ? ';
      topDeviceParams.push(building_name);
    }

    // ?device_order=asc -> น้อยที่สุดก่อน (เครื่องปริ้นน้อย) | ค่าอื่น/ไม่ส่ง -> มากที่สุดก่อน (default)
    // whitelist ค่าก่อนต่อ string ตรงๆ ลง SQL เพราะ ASC/DESC ใช้ผ่าน parameterized query (?) ไม่ได้
    const deviceOrderDir = req.query.device_order === 'asc' ? 'ASC' : 'DESC';

    topDeviceSql += `
      GROUP BY d.id, d.serial_number, d.model, d.status, b.name, dept.name
      ORDER BY total_pages ${deviceOrderDir}
      LIMIT 5
    `;

    const [top_devices] = await db.query(topDeviceSql, topDeviceParams);

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

    res.json({ device_status, top_departments, top_devices, contracts });
  } catch (err) {
    console.error('Highlights Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;