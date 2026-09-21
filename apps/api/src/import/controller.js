const fs = require("fs");
const crypto = require("crypto");
const XLSX = require("xlsx");
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const { badRequest, conflict } = require("../shared/http-error");
const { recordLocationHistory } = require("../devices/controller");
const { recordContractHistory, today } = require("../devices/contract-history");
const { setDeviceMeters, assertReadingsPriced } = require("../devices/meters");
const { MAX_PAGES_PER_MONTH, normalizeMonth } = require("@suth/domain");

/** เพดานไฟล์ยอดพิมพ์ต่อการนำเข้าหนึ่งครั้ง — ไฟล์รายงวดจริงมีไม่กี่สิบแผ่น แผ่นละไม่กี่ร้อยแถว */
const MAX_IMPORT_SHEETS = 60;
const MAX_IMPORT_ROWS = 50000;
const { rowFieldProblems } = require("./row-rules");
const { parseVendorWorkbook, comparableContractNo } = require("./vendor-meter");

// ============================================================
// ตัวช่วยที่ทั้งสอง handler ใช้ร่วมกัน
// ============================================================

/**
 * ลบไฟล์ที่อัปโหลดเข้ามาชั่วคราว — ต้องเรียกใน finally เสมอ
 *
 * เดิมการลบถูกเขียนซ้ำสามที่ (ทางสำเร็จหนึ่ง ทาง catch อีกสอง) ซึ่งแปลว่าเส้นทาง
 * ที่ไม่ได้ผ่านสามจุดนั้นจะทิ้งไฟล์ค้างไว้ใน uploads/ ตลอดไป
 *
 * การลบเองก็พังได้ (ไฟล์ถูกลบไปแล้ว สิทธิ์ไม่พอ) — ห้ามให้ error ตอนเก็บกวาด
 * ไปทับ error ตัวจริงที่กำลังจะถูกโยนออกไป
 */
function removeUploadedFile(file) {
  if (!file || !file.path) return;

  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (err) {
    console.error("IMPORT TEMP FILE CLEANUP ERROR:", err);
  }
}

/**
 * อ่านไฟล์ที่อัปโหลดมาเป็นแผ่นงานแรก — ไฟล์ที่ SheetJS แกะไม่ออกต้องเป็น 400 ไม่ใช่ 500
 *
 * ด่านนามสกุล/MIME ที่ routes.js กันไว้เชื่อได้แค่ชื่อไฟล์กับหัวที่ client ส่งมา ซึ่ง
 * ทั้งสองอย่างผู้ส่งตั้งเองได้ ไฟล์ HTML ที่ถูกเปลี่ยนนามสกุลเป็น .xlsx (ซึ่งเกิดจริง
 * เวลาคน "Save as" จากระบบอื่น) จึงผ่านด่านนั้นมาแล้วไประเบิดตอน XLSX.readFile
 * ผู้ใช้เห็น "เกิดข้อผิดพลาดในระบบ" ซึ่งบอกไม่ได้ว่าต้องไปแก้อะไร
 */
function readWorkbook(filePath) {
  try {
    return XLSX.readFile(filePath);
  } catch (err) {
    throw badRequest("ไฟล์นี้เปิดเป็นตารางไม่ได้", {
      code: "unreadable_file",
      detail: "ไฟล์อาจเสียหาย หรือเป็นไฟล์ชนิดอื่นที่ถูกเปลี่ยนนามสกุลมาเป็น .xlsx/.csv — ลองเปิดด้วย Excel แล้วบันทึกใหม่",
    });
  }
}

function readFirstSheet(filePath) {
  const workbook = readWorkbook(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw badRequest("ไม่พบแผ่นงานในไฟล์", {
      code: "no_sheet",
      detail: "ไฟล์นี้ไม่มีแผ่นงานที่อ่านข้อมูลได้",
    });
  }

  return sheet;
}

/**
 * แปลง error ของฐานข้อมูลที่มีความหมายเฉพาะกับการนำเข้า ให้เป็น ApiError
 *
 * `fromDatabaseError` กลางแปลง ER_DUP_ENTRY เป็น "มีข้อมูลนี้อยู่ในระบบแล้ว"
 * ซึ่งถูกต้องแต่ไม่ช่วยคนที่กำลังนำเข้าไฟล์ 300 แถว — ที่นี่บอกได้ว่าให้ไปดู
 * เลขซีเรียลที่ซ้ำ error อื่นปล่อยผ่านไปให้ handler กลางจัดการตามปกติ
 */
function asImportError(err) {
  if (err && err.code === "ER_DUP_ENTRY") {
    return conflict("มีเลขซีเรียลในไฟล์ซ้ำกับที่มีอยู่แล้วในระบบ", {
      code: "duplicate_serial",
      detail: "กรุณาตรวจสอบและลบแถวที่ซ้ำออกก่อนนำเข้าใหม่",
    });
  }

  return err;
}

// ============================================================
// แปลง "เดือน/ปี พ.ศ. 2 หลัก" ในหัวคอลัมน์ไฟล์มิเตอร์ (เช่น "meter 9/67",
// "meter10/67", "meter 1/68") ให้เป็น "YYYY-MM" (ค.ศ.) ที่ตรงกับเดือนจริง
//
// ⚠️ ห้ามใช้ "ลำดับคอลัมน์" (column position) มาเดาว่าเป็นเดือนไหนของปีงบ
// เพราะไฟล์ Excel เดิมเรียงคอลัมน์เดือนเริ่มจาก "กันยายน" (เดือนก่อนปีงบใหม่)
// ไม่ได้เริ่มจาก "ตุลาคม" แบบปีงบราชการไทยที่ระบบใช้ (ดู @suth/domain)
// ถ้า map ตามตำแหน่งคอลัมน์ตรงๆ ยอดของเดือนกันยาจะไปตกที่เดือนตุลาแทน (เพี้ยนทั้งแถว)
// จึงต้อง "อ่านชื่อเดือน/ปีจากหัวคอลัมน์" ทุกครั้ง แล้วคำนวณเป็นเดือนปฏิทินจริงเสมอ
// เมื่อเดือนจริงถูกต้องแล้ว การ query ด้วยช่วงปีงบ (start_month/end_month) ฝั่ง
// print-transactions.js ก็จะแบ่งเดือนเข้าปีงบที่ถูกต้องเองโดยอัตโนมัติ
function parseMeterMonthHeader(header) {
  const match = String(header || "").match(/meter\s*(\d{1,2})\s*\/\s*(\d{2})/i);
  if (!match) return null;

  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;

  // ปี พ.ศ. ในไฟล์เก็บแค่ 2 หลัก (เช่น "67" = 2567) — เดาศตวรรษ 2500 เอา
  // เพราะไฟล์นี้เป็นข้อมูลปีงบปัจจุบัน ไม่มีทางเป็นปี 2400 หรือ 2600
  const beYearFull = 2500 + Number(match[2]);

  // ส่งต่อให้ normalizeMonth() แปลง พ.ศ. เป็น ค.ศ. — การลบ 543 อยู่ที่ @suth/domain ที่เดียว
  return normalizeMonth(`${beYearFull}-${month}`);
}

exports.importDevices = asyncHandler(async (req, res) => {

    try {

        // routes.js ดักกรณีไม่แนบไฟล์ไว้แล้ว ที่นี่กันไว้อีกชั้นเผื่อมีคนต่อ handler
        // นี้เข้า route ใหม่โดยลืม handleUpload
        if (!req.file) throw badRequest("กรุณาเลือกไฟล์ที่ต้องการนำเข้า", { code: "no_file" });


        // อ่าน Excel
        const sheet = readFirstSheet(req.file.path);

        const rows = XLSX.utils.sheet_to_json(sheet, {
            defval: ""
        });


        // โหลด Master Data — ต้องครบทุกฟิลด์ที่ฟอร์ม "เพิ่มทรัพย์สิน" (เพิ่มทีละรายการ) รองรับ
        // (brand/building เดิม + floor/division/department/contract ที่เทมเพลตสัญญาไว้แต่ import เดิมไม่เคยอ่าน)
        const [brand] = await db.query("SELECT id, name FROM brand");
        const [building] = await db.query("SELECT id, name FROM building");
        const [floor] = await db.query("SELECT id, building_id, name FROM floor");
        const [division] = await db.query("SELECT id, name FROM division");
        const [department] = await db.query("SELECT id, division_id, name FROM department");
        const [contract] = await db.query(
            "SELECT id, contract_no, DATE_FORMAT(effective_from, '%Y-%m-%d') AS effective_from FROM contracts"
        );
        const [meterCategory] = await db.query("SELECT id, code, name FROM meter_category WHERE is_color = 0");


        const brandMap = {};
        const buildingMap = {};
        // ชื่อชั้น/แผนก ไม่ unique ทั้งระบบ (ซ้ำกันได้คนละอาคาร/คนละฝ่าย) ต้อง scope คีย์ด้วย
        // building_id / division_id เหมือนที่ AssetForm.vue กรอง floor ตาม building ที่เลือกไว้
        const floorMap = {};
        const divisionMap = {};
        const departmentMap = {};
        const contractMap = {};

        brand.forEach((b) => { brandMap[String(b.name).trim()] = b.id; });
        building.forEach((b) => { buildingMap[String(b.name).trim()] = b.id; });
        floor.forEach((f) => { floorMap[`${f.building_id}::${String(f.name).trim()}`] = f.id; });
        division.forEach((d) => { divisionMap[String(d.name).trim()] = d.id; });
        department.forEach((d) => { departmentMap[`${d.division_id}::${String(d.name).trim()}`] = d.id; });
        contract.forEach((c) => { contractMap[String(c.contract_no).trim()] = c.id; });
        const contractStart = new Map(contract.map((c) => [c.id, c.effective_from]));
        // หมวดมิเตอร์หลัก รับได้ทั้งชื่อไทยและรหัส (ADR-0023)
        // Map ไม่ใช่ {} เพราะชื่อในไฟล์อย่าง "constructor" ต้องไม่เจอ property ที่ติดมากับ prototype
        const categoryMap = new Map();
        meterCategory.forEach((m) => {
            categoryMap.set(String(m.name).trim(), m.id);
            categoryMap.set(String(m.code).trim(), m.id);
        });


        const insertData = [];
        const skipped = []; // แถวที่ import ไม่ได้ พร้อมเหตุผล ให้ frontend แสดงให้ผู้ใช้แก้ไขได้

        // ซีเรียลที่เจอไปแล้วในไฟล์เดียวกัน — ต้องรายงานเป็นเหตุผลรายแถว ไม่ใช่ปล่อยให้
        // ไปชน UNIQUE KEY ตอน INSERT แล้วทั้งไฟล์ล้มด้วยข้อความที่ชี้ไปผิดแถว
        const seenSerials = new Set();


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

            // ฟิลด์เพิ่มเติมที่ฟอร์ม "เพิ่มทรัพย์สิน" (เพิ่มทีละรายการ) กรอกได้ — ไม่บังคับเหมือน brand/building
            const floorName = String(row.floor || row.Floor || row.ชั้น || "").trim();
            const divisionName = String(row.division || row.Division || row.ฝ่าย || "").trim();
            const departmentName = String(row.department || row.Department || row.แผนก || "").trim();
            const contractNo = String(row.contract_no || row["Contract No"] || row.เลขที่สัญญา || "").trim();
            const priceOverrideRaw = String(
                row.price_override ?? row["Price Override"] ?? row.ราคาพิเศษเฉพาะเครื่อง ?? ""
            ).trim();
            const location = String(row.location || row.Location || row.ตำแหน่ง || "").trim();
            const categoryName = String(row.meter_category || row["Meter Category"] || row.หมวดมิเตอร์ || "").trim();


            // สถานะ — ถ้าไม่กรอกมา/พิมพ์ค่าที่ไม่รู้จัก ให้ default เป็น "active" เหมือนฟอร์มเพิ่มทีละรายการ
            // รองรับทั้งค่า enum อังกฤษ (active/repair/retired) และป้ายภาษาไทยที่ผู้ใช้อาจพิมพ์มา
            const STATUS_MAP = {
                active: "active",
                repair: "repair",
                retired: "retired",
                "ใช้งานอยู่": "active",
                "ซ่อมบำรุง": "repair",
                "ปลดระวาง": "retired",
            };

            const statusRaw = String(
                row.status ||
                row.Status ||
                row.สถานะ ||
                ""
            ).trim();

            const status = STATUS_MAP[statusRaw.toLowerCase()] || STATUS_MAP[statusRaw] || "active";


            const brand_id = brandMap[brand];

            const building_id = buildingMap[building];


            const reasons = [];

            // กฎที่ตรวจได้จากตัวแถวเอง อยู่ใน row-rules.js เพื่อให้เขียนเทสได้โดยไม่ต้องมีฐานข้อมูล (#85)
            reasons.push(...rowFieldProblems({ serial_number, model, location }, seenSerials));

            if (!brand_id) reasons.push(`ไม่พบยี่ห้อ "${brand || "(ว่าง)"}" ในระบบ`);
            if (!building_id) reasons.push(`ไม่พบอาคาร "${building || "(ว่าง)"}" ในระบบ`);


            // ฟิลด์เสริม — ถ้าผู้ใช้กรอกมาต้องหาเจอจริง (กันพิมพ์ชื่อผิด/สะกดคลาดเงียบๆ)
            // แต่ถ้าเว้นว่างไว้ก็ปล่อยผ่านเป็น null ได้เหมือนตอนไม่เลือกใน dropdown ของฟอร์มเพิ่มทีละรายการ
            let floor_id = null;
            if (floorName) {
                floor_id = building_id ? floorMap[`${building_id}::${floorName}`] : undefined;
                if (!floor_id) reasons.push(`ไม่พบชั้น "${floorName}" ในอาคาร "${building || "(ว่าง)"}"`);
            }

            let division_id = null;
            if (divisionName) {
                division_id = divisionMap[divisionName];
                if (!division_id) reasons.push(`ไม่พบฝ่าย "${divisionName}" ในระบบ`);
            }

            let department_id = null;
            if (departmentName) {
                department_id = division_id ? departmentMap[`${division_id}::${departmentName}`] : undefined;
                if (!department_id) {
                    reasons.push(
                        divisionName
                            ? `ไม่พบแผนก "${departmentName}" ในฝ่าย "${divisionName}"`
                            : `ไม่พบแผนก "${departmentName}" (กรุณาระบุคอลัมน์ฝ่ายด้วย)`
                    );
                }
            }

            let contract_id = null;
            if (contractNo) {
                contract_id = contractMap[contractNo];
                if (!contract_id) reasons.push(`ไม่พบเลขที่สัญญา "${contractNo}" ในระบบ`);
            }

            let meter_category_id = null;
            if (categoryName) {
                meter_category_id = categoryMap.get(categoryName) ?? null;
                if (!meter_category_id) reasons.push(`ไม่พบหมวดมิเตอร์ "${categoryName}" ในระบบ`);
            }

            let price_override = null;
            if (priceOverrideRaw !== "") {
                const parsedPrice = Number(priceOverrideRaw);
                if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
                    reasons.push(`ราคาพิเศษเฉพาะเครื่อง "${priceOverrideRaw}" ไม่ใช่ตัวเลข`);
                } else {
                    price_override = parsedPrice;
                }
            }


            if (reasons.length) {

                skipped.push({
                    serial_number: serial_number || "(ไม่มีเลขซีเรียล)",
                    brand,
                    building,
                    reason: reasons.join(", "),
                });

                continue;
            }



            // นับซีเรียลนี้เข้าไปเฉพาะเมื่อแถวผ่านจริง — แถวที่ถูกข้ามด้วยเหตุผลอื่น
            // ไม่ควรไปกันแถวถัดไปที่มีซีเรียลเดียวกันและอาจจะถูกต้อง
            seenSerials.add(serial_number);

            insertData.push({
                serial_number,
                brand_id,
                model: model || null,
                building_id,
                floor_id,
                location: location || null,
                division_id,
                department_id,
                contract_id,
                price_override,
                status,
                meter_category_id,
            });

        }



        // Insert ทีละแถวในทรานแซกชันเดียว (แทนที่จะ bulk INSERT ... VALUES ?) เพราะต้องได้ insertId
        // ของแต่ละเครื่องมาเปิด "ช่วงประวัติแรก" ผ่าน recordLocationHistory เหมือนฟอร์มเพิ่มทีละรายการ
        // (ดู deviceController.js create()) ไม่งั้นเครื่องที่มาจาก import จะไม่มีประวัติการย้ายเลย
        // และหน้ารายงานที่อ้างอิงปีงบ/ช่วงเวลาของ device_location_history จะไม่เห็นเครื่องกลุ่มนี้
        if (insertData.length > 0) {

            await db.withTransaction(async (conn) => {

            for (const d of insertData) {
                const [result] = await conn.query(
                    `
                    INSERT INTO devices
                    (
                        serial_number,
                        brand_id,
                        model,
                        building_id,
                        floor_id,
                        location,
                        division_id,
                        department_id,
                        contract_id,
                        price_override,
                        status
                    )
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)
                    `,
                    [
                        d.serial_number,
                        d.brand_id,
                        d.model,
                        d.building_id,
                        d.floor_id,
                        d.location,
                        d.division_id,
                        d.department_id,
                        d.contract_id,
                        d.price_override,
                        d.status,
                    ]
                );

                await recordLocationHistory(conn, result.insertId, {
                    building_id: d.building_id,
                    floor_id: d.floor_id,
                    location: d.location,
                    division_id: d.division_id,
                    department_id: d.department_id,
                });

                // ช่วงการคิดเงินแรก — ไม่มีช่วงนี้ ยอดของเครื่องจะหาราคาไม่ได้ทั้งที่ไฟล์ระบุ
                // สัญญาไว้ ราคาของสัญญามีผลตลอดอายุสัญญา (ADR-0021) จึงเริ่มที่วันเริ่มสัญญา
                await recordContractHistory(
                    conn,
                    result.insertId,
                    { contractId: d.contract_id, priceOverride: d.price_override },
                    contractStart.get(d.contract_id) || today()
                );

                await setDeviceMeters(conn, result.insertId, { primaryCategoryId: d.meter_category_id });
            }

            });

        }



        res.json({

            message: "Import สำเร็จ",

            total_rows: rows.length,

            inserted: insertData.length,

            skipped

        });



    } catch (err) {
        // ไม่ตอบ error เอง — โยนต่อให้ handler กลางแปลงเป็น Problem Details
        // ตาม ADR-0010 ข้อความดิบของ MySQL จึงไม่มีทางหลุดออกไปถึงเบราว์เซอร์
        throw asImportError(err);
    } finally {
        removeUploadedFile(req.file);
    }

});


// ============================================================
// นำเข้ายอดพิมพ์ (มิเตอร์)
//
// รับสองรูปแบบ ตรวจรูปแบบเองจากหัวตาราง
//
//   1. รายงานมิเตอร์รายงวดของผู้ให้เช่า (ADR-0023) — หลายแผ่น แผ่นละงวด มีเลขมิเตอร์
//      ต้นงวด/สิ้นงวดและราคาต่อหน้า ดู import/vendor-meter.js
//   2. เทมเพลตเดิม — แผ่นเดียว คอลัมน์ "meter M/YY" เป็นยอดรายเดือนของมิเตอร์หลัก
//      ตัวอย่างที่ docs/meter-import-source.xlsx
//
// ## ตรวจด้วยการเขียนจริงแล้วย้อนกลับ
//
// ขั้นตรวจไฟล์ (preview) เขียนยอดลงฐานใน transaction แล้วอ่านผลจาก v_monthly_kpi
// ก่อนย้อนกลับ กฎราคาจึงอยู่ใน view ที่เดียว และตัวเลขที่ผู้ใช้เห็นในหน้าตรวจคือ
// ตัวเลขเดียวกับที่รายงานจะแสดงหลังกดยืนยัน สิ่งที่ตรวจ
//
//   - ทุกยอดต้องหาราคาได้ (ADR-0021)
//   - ราคาในแถวของไฟล์ต้องเท่าราคาในระบบ — จับหมวดมิเตอร์ผิดหรือราคาสัญญาผิดได้
//   - เลขที่สัญญาในหัวแผ่นต้องเป็นสัญญาที่คิดเงินเครื่องนั้นในงวดนั้น
//
// ยอดตามใบแจ้งหนี้รายหมวดของทุกงวดในไฟล์ถูกส่งกลับไปให้เทียบกับใบของผู้ให้เช่า
// ============================================================

/** มิเตอร์ทั้งหมด จัดตามเครื่อง — { primary, color } */
async function loadMeters(conn) {
  const [devices] = await conn.query("SELECT id, serial_number FROM devices");
  const [meters] = await conn.query(
    `SELECT dm.id, dm.device_id, mc.is_color
     FROM device_meter dm
     JOIN meter_category mc ON mc.id = dm.category_id
     ORDER BY mc.sort_order, dm.id`
  );

  const byDevice = new Map();
  for (const meter of meters) {
    const entry = byDevice.get(meter.device_id) ?? { primary: null, color: null };
    if (meter.is_color) entry.color ??= meter.id;
    else entry.primary ??= meter.id;
    byDevice.set(meter.device_id, entry);
  }

  const bySerial = new Map();
  for (const device of devices) {
    bySerial.set(String(device.serial_number).trim().toUpperCase(), {
      deviceId: device.id,
      ...(byDevice.get(device.id) ?? { primary: null, color: null }),
    });
  }
  return bySerial;
}

/** รายงานของผู้ให้เช่า → ยอดรายมิเตอร์ */
function mapVendorReadings(vendor, meters) {
  const candidates = [];
  const errors = [...vendor.errors];
  const seen = new Set();

  for (const reading of vendor.readings) {
    const where = {
      sheet: reading.sheet,
      row: reading.row,
      serial_number: reading.serial_number,
      month: reading.month,
    };
    const device = meters.get(reading.serial_number.toUpperCase());
    if (!device) {
      errors.push({ ...where, reason: `ไม่พบเครื่อง SN "${reading.serial_number}" ในทะเบียน — ลงทะเบียนเครื่องก่อน` });
      continue;
    }

    const meterId = reading.meter === "color" ? device.color : device.primary;
    if (!meterId) {
      errors.push({
        ...where,
        reason:
          reading.meter === "color"
            ? "ไฟล์มีแถวมิเตอร์สีของเครื่องนี้ แต่ในทะเบียนเครื่องนี้ไม่มีมิเตอร์สี"
            : "เครื่องนี้ยังไม่มีมิเตอร์ในทะเบียน",
      });
      continue;
    }

    const key = `${meterId}|${reading.month}`;
    if (seen.has(key)) {
      errors.push({ ...where, reason: "มิเตอร์และงวดนี้ซ้ำกันในไฟล์" });
      continue;
    }
    seen.add(key);

    candidates.push({
      device_id: device.deviceId,
      meter_id: meterId,
      meter: reading.meter,
      serial_number: reading.serial_number,
      month: reading.month,
      pages: reading.pages,
      meter_start: reading.meter_start,
      meter_end: reading.meter_end,
      file_price: reading.file_price,
      contract_no: reading.contract_no,
      sheet: reading.sheet,
      row: reading.row,
    });
  }

  return { candidates, errors, months: [...new Set(vendor.sheets.map((s) => s.month))].sort() };
}

/** เทมเพลตเดิม (meter M/YY) → ยอดของมิเตอร์หลัก */
function mapTemplateReadings(raw, meters) {
  const headerRowIndex = raw.findIndex((row) =>
    row.some((cell) => /^sn\.?$/i.test(String(cell || "").trim()))
  );
  if (headerRowIndex === -1) {
    throw badRequest("ไม่พบแถวหัวตารางในไฟล์", {
      code: "header_row_not_found",
      detail:
        "หาคอลัมน์ \"SN.\" หรือหัวตาราง \"Meter Start/Meter End\" ไม่เจอ ไฟล์นี้อาจไม่ใช่รูปแบบที่รองรับ — ดูตัวอย่างที่ docs/reference/import-format.md",
    });
  }

  const headerRow = raw[headerRowIndex];
  const snColIndex = headerRow.findIndex((cell) => /^sn\.?$/i.test(String(cell || "").trim()));

  // เก็บ "index คอลัมน์ -> เดือนจริง (YYYY-MM)" เฉพาะคอลัมน์ meter M/YY เท่านั้น
  // (ไม่ยุ่งกับคอลัมน์ "พิมพ์ประจำเดือน"/"พิมพ์สะสม" ที่ซ้ำ/เป็นยอดคำนวณ ไม่ใช่ค่าดิบ)
  const meterColumns = [];
  headerRow.forEach((cell, idx) => {
    const month = parseMeterMonthHeader(cell);
    if (month) meterColumns.push({ idx, month });
  });
  if (!meterColumns.length) {
    throw badRequest("ไม่พบคอลัมน์มิเตอร์รายเดือนในไฟล์", {
      code: "meter_columns_not_found",
      detail: "หัวคอลัมน์ต้องอยู่ในรูป \"meter M/YY\" เช่น \"meter 9/67\" หรือเป็นรายงานมิเตอร์ของผู้ให้เช่า",
    });
  }

  const candidates = [];
  const errors = [];
  const seenKeys = new Set();

  for (let r = headerRowIndex + 1; r < raw.length; r++) {
    const row = raw[r];
    if (!row || !row.length) continue;

    const sn = String(row[snColIndex] || "").trim();
    if (!sn) continue;

    const device = meters.get(sn.toUpperCase());
    if (!device || !device.primary) {
      errors.push({ row: r + 1, serial_number: sn, reason: `ไม่พบเครื่อง SN "${sn}" ในระบบ` });
      continue;
    }

    for (const { idx, month } of meterColumns) {
      const cellValue = row[idx];

      // ช่องว่าง = ไม่เปลี่ยนข้อมูลเดิม ส่วน 0 = ยืนยันว่าเดือนนั้นเป็นศูนย์
      if (cellValue === "" || cellValue === null || cellValue === undefined) continue;

      const pages = Number(cellValue);
      if (!Number.isFinite(pages) || pages < 0 || !Number.isInteger(pages) || pages > MAX_PAGES_PER_MONTH) {
        errors.push({
          row: r + 1,
          serial_number: sn,
          month,
          reason: `ยอดพิมพ์ต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง ${MAX_PAGES_PER_MONTH.toLocaleString("th-TH")} (พบ "${cellValue}")`,
        });
        continue;
      }

      const key = `${device.primary}|${month}`;
      if (seenKeys.has(key)) {
        errors.push({ row: r + 1, serial_number: sn, month, reason: "Serial และเดือนนี้ซ้ำกันในไฟล์" });
        continue;
      }
      seenKeys.add(key);
      candidates.push({
        device_id: device.deviceId,
        meter_id: device.primary,
        meter: "primary",
        serial_number: sn,
        month,
        pages,
        meter_start: null,
        meter_end: null,
        file_price: null,
        contract_no: null,
        row: r + 1,
      });
    }
  }

  return { candidates, errors, months: [...new Set(meterColumns.map((m) => m.month))].sort() };
}

async function writeCandidates(conn, rows) {
  if (!rows.length) return;
  await conn.query(
    `INSERT INTO print_transactions (device_id, meter_id, month, meter_start, meter_end, pages)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       pages = VALUES(pages), meter_start = VALUES(meter_start), meter_end = VALUES(meter_end)`,
    [rows.map((row) => [row.device_id, row.meter_id, row.month, row.meter_start, row.meter_end, row.pages])]
  );
}

/**
 * ตรวจยอดที่เพิ่งเขียน (ใน transaction เดียวกัน) กับราคาและสัญญาในระบบ
 * แล้วสรุปยอดตามใบแจ้งหนี้ของทุกงวดในไฟล์
 */
async function checkWrittenReadings(conn, candidates, months) {
  const errors = [];
  const warnings = [];

  try {
    await assertReadingsPriced(conn, candidates.map((row) => ({ meterId: row.meter_id, month: row.month })));
  } catch (err) {
    if (err?.code !== "unpriced_reading") throw err;
    errors.push(...(err.errors ?? []));
  }

  if (!candidates.length) return { errors, warnings, invoice: [] };

  const [priced] = await conn.query(
    `SELECT v.meter_id, v.month, v.price_per_page, c.contract_no
     FROM v_monthly_kpi v
     LEFT JOIN contracts c ON c.id = v.billing_contract_id
     WHERE v.month IN (?) AND v.meter_id IN (?)`,
    [months, [...new Set(candidates.map((row) => row.meter_id))]]
  );
  const systemBy = new Map(priced.map((row) => [`${row.meter_id}|${row.month}`, row]));

  for (const row of candidates) {
    const system = systemBy.get(`${row.meter_id}|${row.month}`);
    if (!system || system.price_per_page === null) continue; // รายงานไว้แล้วข้างบน
    const where = { sheet: row.sheet, row: row.row, serial_number: row.serial_number, month: row.month };

    if (row.file_price !== null && Math.abs(Number(system.price_per_page) - row.file_price) > 0.00001) {
      errors.push({
        ...where,
        reason: `ราคาในไฟล์ ${row.file_price} ไม่ตรงกับราคาในระบบ ${Number(system.price_per_page)} — ตรวจหมวดมิเตอร์ของเครื่องหรือราคาในสัญญา`,
      });
    }
    if (row.contract_no && comparableContractNo(row.contract_no) !== comparableContractNo(system.contract_no)) {
      errors.push({
        ...where,
        reason: `ไฟล์เป็นของสัญญา ${row.contract_no} แต่ในระบบเครื่องนี้คิดเงินใต้สัญญา ${system.contract_no ?? "(ไม่มี)"}`,
      });
    }
  }

  // เลขต้นงวดควรเท่าเลขสิ้นงวดของงวดก่อนของมิเตอร์เดียวกัน — ไม่เท่าแปลว่ามียอดหาย
  // หรือซ้ำระหว่างงวด เตือนแต่ไม่ปฏิเสธ เพราะผู้ให้เช่าเป็นคนออกเลขทั้งสองค่า
  const [gaps] = await conn.query(
    `SELECT pt.meter_id, pt.month, pt.meter_start, prev.meter_end AS previous_end, prev.month AS previous_month
     FROM print_transactions pt
     JOIN print_transactions prev ON prev.meter_id = pt.meter_id AND prev.month = (
       SELECT MAX(p2.month) FROM print_transactions p2 WHERE p2.meter_id = pt.meter_id AND p2.month < pt.month
     )
     WHERE pt.month IN (?) AND pt.meter_id IN (?)
       AND pt.meter_start IS NOT NULL AND prev.meter_end IS NOT NULL
       AND pt.meter_start <> prev.meter_end`,
    [months, [...new Set(candidates.map((row) => row.meter_id))]]
  );
  const candidateBy = new Map(candidates.map((row) => [`${row.meter_id}|${row.month}`, row]));
  for (const gap of gaps) {
    const row = candidateBy.get(`${gap.meter_id}|${gap.month}`);
    if (!row) continue;
    warnings.push({
      sheet: row.sheet,
      row: row.row,
      serial_number: row.serial_number,
      month: row.month,
      reason: `เลขต้นงวด ${gap.meter_start} ไม่เท่าเลขสิ้นงวด ${gap.previous_end} ของงวด ${gap.previous_month}`,
    });
  }

  const [invoice] = await conn.query(
    `SELECT v.month, c.contract_no, v.meter_category AS category, v.price_per_page,
            SUM(v.pages_printed) AS pages, SUM(v.net_pages) AS net_pages, SUM(v.total_cost) AS line_total
     FROM v_monthly_kpi v
     LEFT JOIN contracts c ON c.id = v.billing_contract_id
     WHERE v.month IN (?) AND v.billing_contract_id IN (
       SELECT DISTINCT v2.billing_contract_id FROM v_monthly_kpi v2
       WHERE v2.month IN (?) AND v2.meter_id IN (?)
     )
     GROUP BY v.month, c.contract_no, v.meter_category_id, v.meter_category, v.price_per_page
     ORDER BY v.month, c.contract_no, v.meter_category_id`,
    [months, months, [...new Set(candidates.map((row) => row.meter_id))]]
  );

  return {
    errors,
    warnings,
    invoice: invoice.map((line) => ({
      month: line.month,
      contract_no: line.contract_no,
      category: line.category,
      price_per_page: line.price_per_page === null ? null : String(line.price_per_page),
      pages: Number(line.pages),
      net_pages: String(line.net_pages),
      line_total: line.line_total === null ? null : String(line.line_total),
    })),
  };
}

/** ส่งสัญญาณให้ withTransaction ย้อนกลับ พร้อมผลตรวจของขั้น preview */
class PreviewRollback extends Error {
  constructor(result) {
    super("preview");
    this.result = result;
  }
}

exports.importPrintTransactions = asyncHandler(async (req, res) => {
    try {
        // routes.js ดักกรณีไม่แนบไฟล์ไว้แล้ว ที่นี่กันไว้อีกชั้นเผื่อมีคนต่อ handler
        // นี้เข้า route ใหม่โดยลืม handleUpload
        if (!req.file) throw badRequest("กรุณาเลือกไฟล์ที่ต้องการนำเข้า", { code: "no_file" });

        const workbook = readWorkbook(req.file.path);
        // ไฟล์ 5MB ที่บีบอัดได้ดีกางออกเป็นแถวได้มหาศาล — นับจากขอบเขตของแผ่นก่อนแปลง
        // ทุกแถวเป็น object และก่อนยิงคำสั่งเขียนก้อนเดียว (ไฟล์จริงมีไม่กี่แผ่น แผ่นละไม่กี่ร้อยแถว)
        const declaredRows = workbook.SheetNames.reduce((sum, name) => {
            const ref = workbook.Sheets[name]?.["!ref"];
            return sum + (ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0);
        }, 0);
        if (workbook.SheetNames.length > MAX_IMPORT_SHEETS || declaredRows > MAX_IMPORT_ROWS) {
            throw badRequest("ไฟล์ใหญ่เกินกว่าที่นำเข้าได้ในครั้งเดียว", {
                code: "import_too_large",
                detail: `นำเข้าได้ไม่เกิน ${MAX_IMPORT_SHEETS} แผ่น และรวมไม่เกิน ${MAX_IMPORT_ROWS.toLocaleString("th-TH")} แถวต่อไฟล์ — แยกไฟล์เป็นหลายครั้ง`,
            });
        }
        const sheets = workbook.SheetNames.map((name) => ({
            name,
            rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: true }),
        }));
        if (!sheets.length) {
            throw badRequest("ไม่พบแผ่นงานในไฟล์", { code: "no_sheet", detail: "ไฟล์นี้ไม่มีแผ่นงานที่อ่านข้อมูลได้" });
        }

        const meters = await loadMeters(db);
        const vendor = parseVendorWorkbook(sheets);
        const format = vendor ? "vendor" : "template";
        const { candidates, errors, months } = vendor
            ? mapVendorReadings(vendor, meters)
            : mapTemplateReadings(sheets[0].rows, meters);

        const existingMap = new Map();
        if (candidates.length) {
            const [existing] = await db.query(
                "SELECT meter_id, month, pages FROM print_transactions WHERE meter_id IN (?) AND month IN (?)",
                [[...new Set(candidates.map((row) => row.meter_id))], months]
            );
            for (const row of existing) existingMap.set(`${row.meter_id}|${row.month}`, Number(row.pages));
        }

        const newRows = [];
        const overwriteRows = [];
        const unchangedRows = [];
        for (const row of candidates) {
            const key = `${row.meter_id}|${row.month}`;
            if (!existingMap.has(key)) newRows.push(row);
            else if (existingMap.get(key) === row.pages) unchangedRows.push(row);
            else overwriteRows.push({ ...row, previous_pages: existingMap.get(key) });
        }

        const fileDigest = crypto.createHash("sha256").update(fs.readFileSync(req.file.path)).digest("hex");
        // ผูก token กับทั้งไฟล์และค่าเดิมที่ผู้ใช้เห็นในหน้าตรวจ หากมีคนแก้ยอด
        // ระหว่างเปิด preview กับกดยืนยัน token จะไม่ตรงและระบบจะให้ตรวจใหม่
        // แทนการเขียนทับค่าที่ผู้ใช้ไม่เคยเห็น
        const previewToken = crypto
            .createHash("sha256")
            .update(fileDigest)
            .update(JSON.stringify(candidates.map((row) => ({
                meter_id: row.meter_id,
                month: row.month,
                pages: row.pages,
                meter_start: row.meter_start,
                meter_end: row.meter_end,
                previous_pages: existingMap.has(`${row.meter_id}|${row.month}`)
                    ? existingMap.get(`${row.meter_id}|${row.month}`)
                    : null,
            }))))
            .digest("hex");
        const mode = String(req.body?.mode || "preview");
        if (mode !== "preview" && mode !== "commit") {
            throw badRequest("โหมดการนำเข้าไม่ถูกต้อง", { code: "invalid_import_mode" });
        }
        if (mode === "commit") {
            if (errors.length) {
                throw badRequest("ไฟล์ยังมีข้อมูลที่ต้องแก้ จึงยังบันทึกไม่ได้", {
                    code: "import_validation_failed",
                    errors,
                });
            }
            if (!req.body?.preview_token || req.body.preview_token !== previewToken) {
                throw badRequest("กรุณาตรวจไฟล์ล่าสุดก่อนยืนยันบันทึก", { code: "preview_required" });
            }
        }

        const rowsToWrite = [...newRows, ...overwriteRows];
        let checked;
        try {
            checked = await db.withTransaction(async (conn) => {
                await writeCandidates(conn, rowsToWrite);
                const result = await checkWrittenReadings(conn, candidates, months);
                if (mode === "preview") throw new PreviewRollback(result);
                if (result.errors.length) {
                    throw badRequest("ไฟล์ยังมีข้อมูลที่ต้องแก้ จึงยังบันทึกไม่ได้", {
                        code: "import_validation_failed",
                        errors: result.errors,
                    });
                }
                return result;
            });
        } catch (err) {
            if (!(err instanceof PreviewRollback)) throw err;
            checked = err.result;
        }

        const allErrors = [...errors, ...checked.errors];
        const summary = {
            format,
            months_found: months,
            sheets: vendor ? vendor.sheets : undefined,
            invoice: checked.invoice,
            warnings: checked.warnings,
        };

        if (mode === "preview") {
            return res.json({
                ...summary,
                valid: allErrors.length === 0,
                preview_token: allErrors.length ? null : previewToken,
                new_rows: newRows,
                overwrite_rows: overwriteRows,
                unchanged_rows: unchangedRows,
                errors: allErrors,
            });
        }

        return res.json({
            ...summary,
            message: "Import ยอดพิมพ์สำเร็จ",
            rows_upserted: rowsToWrite.length,
            unchanged: unchangedRows.length,
        });
    } catch (err) {
        // โยนต่อให้ handler กลาง — ดูเหตุผลที่ importDevices
        throw asImportError(err);
    } finally {
        removeUploadedFile(req.file);
    }
});
