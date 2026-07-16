// Seed ข้อมูลเดโมสำหรับนำเสนอ — รันซ้ำได้ (ข้อมูลที่มีอยู่แล้วจะถูกข้าม)
//
//   cd backend
//   node scripts/seed-demo-data.js
//
// สร้าง: ปีงบ 2568-2569, สัญญา 4 ฉบับ, ยี่ห้อ 5, อาคาร 4 (พร้อมชั้น),
//        ฝ่าย 4 (พร้อมแผนก), เครื่อง ~20 ตัว, ยอดพิมพ์ 6 เดือน (2568-10 ถึง 2569-03)
// ยอดพิมพ์ออกแบบให้เห็นความต่างชัด: OPD สูงและพุ่งขึ้น, ฝ่ายบริหารต่ำและนิ่ง,
// บางเครื่องมี spike บางเดือน เพื่อให้กราฟ/การ์ดเปรียบเทียบดูมีเรื่องเล่า

const db = require("../db");

// ---------- helpers ----------

async function getOrCreate(table, nameCol, name, extra = {}) {
  const [rows] = await db.query(`SELECT id FROM \`${table}\` WHERE \`${nameCol}\` = ?`, [name]);
  if (rows.length > 0) return { id: rows[0].id, created: false };

  const cols = [nameCol, ...Object.keys(extra)];
  const vals = [name, ...Object.values(extra)];
  const placeholders = cols.map(() => "?").join(",");
  const [result] = await db.query(
    `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(",")}) VALUES (${placeholders})`,
    vals
  );
  return { id: result.insertId, created: true };
}

// สุ่มแบบ deterministic — รันกี่ครั้งก็ได้เลขเดิม
let rngState = 42;
function rand() {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
}

// ---------- data ----------

const MONTHS = ["2568-10", "2568-11", "2568-12", "2569-01", "2569-02", "2569-03"];

async function main() {
  let created = { master: 0, devices: 0, transactions: 0 };

  // ปีงบประมาณ
  const fy68 = await getOrCreate("fiscal_year", "year", "2568");
  const fy69 = await getOrCreate("fiscal_year", "year", "2569");

  // สัญญา (ราคาต่อแผ่นต่างกันให้เห็นผลต่อต้นทุน)
  const contracts = {};
  for (const [no, fyId, price] of [
    ["CT-001/2568", fy68.id, 0.40],
    ["CT-002/2568", fy68.id, 0.35],
    ["CT-001/2569", fy69.id, 0.45],
    ["CT-002/2569", fy69.id, 0.50],
  ]) {
    const [rows] = await db.query("SELECT id FROM contracts WHERE contract_no = ?", [no]);
    if (rows.length > 0) {
      contracts[no] = rows[0].id;
    } else {
      const [r] = await db.query(
        "INSERT INTO contracts (contract_no, fiscal_year_id, price_per_page) VALUES (?,?,?)",
        [no, fyId, price]
      );
      contracts[no] = r.insertId;
      created.master++;
    }
  }

  // ยี่ห้อ
  const brands = {};
  for (const name of ["HP", "Canon", "Epson", "Brother", "Fuji Xerox"]) {
    const r = await getOrCreate("brand", "name", name);
    brands[name] = r.id;
    if (r.created) created.master++;
  }

  // อาคาร + ชั้น
  const buildings = {};
  const floors = {};
  const buildingFloors = {
    "อาคารผู้ป่วยนอก": ["ชั้น 1", "ชั้น 2", "ชั้น 3"],
    "อาคารผู้ป่วยใน": ["ชั้น 1", "ชั้น 2", "ชั้น 3", "ชั้น 4"],
    "อาคารอำนวยการ": ["ชั้น 1", "ชั้น 2"],
    "อาคารศูนย์แพทยศาสตรศึกษา": ["ชั้น 1", "ชั้น 2"],
  };
  for (const [bName, floorNames] of Object.entries(buildingFloors)) {
    const b = await getOrCreate("building", "name", bName);
    buildings[bName] = b.id;
    if (b.created) created.master++;

    for (const fName of floorNames) {
      const [rows] = await db.query(
        "SELECT id FROM floor WHERE name = ? AND building_id = ?", [fName, b.id]
      );
      let fId;
      if (rows.length > 0) {
        fId = rows[0].id;
      } else {
        const [r] = await db.query(
          "INSERT INTO floor (name, building_id) VALUES (?,?)", [fName, b.id]
        );
        fId = r.insertId;
        created.master++;
      }
      floors[`${bName}|${fName}`] = fId;
    }
  }

  // ฝ่าย + แผนก
  const departments = {};
  const divisionDepts = {
    "ฝ่ายการแพทย์": ["OPD", "ER", "LAB", "X-RAY"],
    "ฝ่ายการพยาบาล": ["IPD ชาย", "IPD หญิง", "ICU"],
    "ฝ่ายบริหาร": ["การเงิน", "พัสดุ", "ธุรการ"],
    "ฝ่ายสนับสนุนบริการ": ["เวชระเบียน", "IT"],
  };
  for (const [dvName, deptNames] of Object.entries(divisionDepts)) {
    const dv = await getOrCreate("division", "name", dvName);
    if (dv.created) created.master++;

    for (const dpName of deptNames) {
      const [rows] = await db.query(
        "SELECT id FROM department WHERE name = ? AND division_id = ?", [dpName, dv.id]
      );
      let dpId;
      if (rows.length > 0) {
        dpId = rows[0].id;
      } else {
        const [r] = await db.query(
          "INSERT INTO department (name, division_id) VALUES (?,?)", [dpName, dv.id]
        );
        dpId = r.insertId;
        created.master++;
      }
      departments[dpName] = { id: dpId, division_id: dv.id };
    }
  }

  // เครื่องพิมพ์ — [serial, brand, model, อาคาร, ชั้น, แผนก, สัญญา, base pages/เดือน, เทรนด์/เดือน, status, price_override]
  // base สูง = แผนกงานเยอะ, trend บวก = ยอดโตขึ้นเรื่อยๆ, ลบ = ลดลง
  const devices = [
    ["PRN-OPD-001", "HP", "LaserJet M404dn", "อาคารผู้ป่วยนอก", "ชั้น 1", "OPD", "CT-001/2569", 4200, 380, "active", null],
    ["PRN-OPD-002", "HP", "LaserJet M404dn", "อาคารผู้ป่วยนอก", "ชั้น 1", "OPD", "CT-001/2569", 3800, 300, "active", null],
    ["PRN-OPD-003", "Canon", "LBP226dw", "อาคารผู้ป่วยนอก", "ชั้น 2", "OPD", "CT-001/2569", 2900, 250, "active", null],
    ["PRN-ER-001", "HP", "LaserJet M428fdw", "อาคารผู้ป่วยนอก", "ชั้น 1", "ER", "CT-001/2569", 3100, 150, "active", null],
    ["PRN-ER-002", "Brother", "HL-L5100DN", "อาคารผู้ป่วยนอก", "ชั้น 1", "ER", "CT-002/2569", 2400, 120, "active", null],
    ["PRN-LAB-001", "Epson", "M320dn", "อาคารผู้ป่วยนอก", "ชั้น 3", "LAB", "CT-002/2569", 1800, 90, "active", null],
    ["PRN-XRAY-001", "Fuji Xerox", "P285dw", "อาคารผู้ป่วยนอก", "ชั้น 3", "X-RAY", "CT-002/2569", 1200, 60, "active", null],
    ["PRN-IPD-M-001", "Canon", "LBP226dw", "อาคารผู้ป่วยใน", "ชั้น 2", "IPD ชาย", "CT-001/2569", 2200, 100, "active", null],
    ["PRN-IPD-M-002", "Canon", "LBP226dw", "อาคารผู้ป่วยใน", "ชั้น 3", "IPD ชาย", "CT-001/2569", 1900, 80, "active", null],
    ["PRN-IPD-F-001", "HP", "LaserJet M404dn", "อาคารผู้ป่วยใน", "ชั้น 2", "IPD หญิง", "CT-001/2569", 2100, 90, "active", null],
    ["PRN-IPD-F-002", "Brother", "HL-L5100DN", "อาคารผู้ป่วยใน", "ชั้น 4", "IPD หญิง", "CT-002/2569", 1700, 70, "repair", null],
    ["PRN-ICU-001", "HP", "LaserJet M428fdw", "อาคารผู้ป่วยใน", "ชั้น 4", "ICU", "CT-001/2569", 1500, 60, "active", 0.40],
    ["PRN-FIN-001", "Epson", "M320dn", "อาคารอำนวยการ", "ชั้น 1", "การเงิน", "CT-002/2568", 900, 15, "active", null],
    ["PRN-FIN-002", "Epson", "M320dn", "อาคารอำนวยการ", "ชั้น 1", "การเงิน", "CT-002/2568", 750, 10, "active", null],
    ["PRN-SUP-001", "Brother", "HL-L5100DN", "อาคารอำนวยการ", "ชั้น 2", "พัสดุ", "CT-002/2568", 650, 5, "active", null],
    ["PRN-ADM-001", "Canon", "LBP226dw", "อาคารอำนวยการ", "ชั้น 2", "ธุรการ", "CT-002/2568", 550, 0, "active", null],
    ["PRN-MR-001", "Fuji Xerox", "P285dw", "อาคารศูนย์แพทยศาสตรศึกษา", "ชั้น 1", "เวชระเบียน", "CT-001/2568", 1400, -40, "active", null],
    ["PRN-MR-002", "Fuji Xerox", "P285dw", "อาคารศูนย์แพทยศาสตรศึกษา", "ชั้น 1", "เวชระเบียน", "CT-001/2568", 1100, -30, "active", null],
    ["PRN-IT-001", "HP", "LaserJet M404dn", "อาคารศูนย์แพทยศาสตรศึกษา", "ชั้น 2", "IT", "CT-001/2568", 480, 8, "active", 0.30],
    ["PRN-OLD-001", "Epson", "M320dn", "อาคารอำนวยการ", "ชั้น 1", "ธุรการ", "CT-001/2568", 0, 0, "retired", null],
  ];

  const deviceIds = {};
  for (const [sn, brand, model, bName, fName, dept, ctNo, , , status, override] of devices) {
    const [rows] = await db.query("SELECT id FROM devices WHERE serial_number = ?", [sn]);
    if (rows.length > 0) {
      deviceIds[sn] = rows[0].id;
      continue;
    }

    const d = departments[dept];
    const [r] = await db.query(
      `INSERT INTO devices
        (serial_number, brand_id, model, building_id, floor_id, division_id, department_id, contract_id, price_override, status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        sn, brands[brand], model,
        buildings[bName], floors[`${bName}|${fName}`],
        d.division_id, d.id,
        contracts[ctNo], override, status,
      ]
    );
    deviceIds[sn] = r.insertId;
    created.devices++;
  }

  // ยอดพิมพ์รายเดือน: base + trend×เดือน ± 12% noise, ธ.ค. spike สำหรับ OPD/ER (ไข้หวัดระบาด)
  for (const [sn, , , , , , , base, trend, status] of devices) {
    if (status === "retired" || base === 0) continue;

    for (let i = 0; i < MONTHS.length; i++) {
      const month = MONTHS[i];

      const [rows] = await db.query(
        "SELECT id FROM print_transactions WHERE device_id = ? AND month = ?",
        [deviceIds[sn], month]
      );
      if (rows.length > 0) continue;

      let pages = base + trend * i;
      pages = pages * (0.88 + rand() * 0.24); // noise ±12%
      if (month === "2568-12" && (sn.includes("OPD") || sn.includes("ER"))) {
        pages *= 1.35; // spike ธันวาคม
      }
      pages = Math.max(0, Math.round(pages));

      await db.query(
        "INSERT INTO print_transactions (device_id, month, pages) VALUES (?,?,?)",
        [deviceIds[sn], month, pages]
      );
      created.transactions++;
    }
  }

  console.log("✅ Seed เสร็จสิ้น");
  console.log(`   Master Data ใหม่: ${created.master} รายการ`);
  console.log(`   เครื่องใหม่: ${created.devices} เครื่อง`);
  console.log(`   ยอดพิมพ์ใหม่: ${created.transactions} รายการ (${MONTHS[0]} ถึง ${MONTHS[MONTHS.length - 1]})`);

  // สรุปภาพรวมให้เห็นทันที
  const [summary] = await db.query(`
    SELECT month,
           SUM(pages_printed) AS pages,
           ROUND(SUM(total_cost), 2) AS cost
    FROM v_monthly_kpi GROUP BY month ORDER BY month
  `);
  console.log("\n📊 ยอดรวมรายเดือน:");
  console.table(summary.map((r) => ({
    เดือน: r.month,
    "ยอดพิมพ์ (แผ่น)": Number(r.pages).toLocaleString(),
    "ค่าใช้จ่าย (บาท)": Number(r.cost).toLocaleString(),
  })));

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed error:", err.message);
  process.exit(1);
});
