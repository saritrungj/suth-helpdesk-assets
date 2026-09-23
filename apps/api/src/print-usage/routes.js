// apps/api/src/print-usage/routes.js
//
// ยอดพิมพ์รายเดือนของแต่ละเครื่อง — งานที่เจ้าหน้าที่ทำซ้ำทุกเดือนกับเครื่องเป็นร้อย
//
// นี่คือจุดที่ข้อมูลเข้าสู่ระบบ ทุกบาทในทุกรายงานคำนวณจากตัวเลขที่กรอกที่นี่
// การกรอกผิดหนึ่งช่องทำให้ค่าใช้จ่ายทั้งแผนกเพี้ยน จึงตรวจสองชั้น
//
//   - ชั้นรูปแบบ: เดือนต้องเป็น "YYYY-MM" (รับ พ.ศ. แล้วแปลงเป็น ค.ศ. ตาม ADR-0002)
//     จำนวนหน้าต้องเป็นจำนวนเต็มไม่ติดลบ
//   - ชั้นสามัญสำนึก: จำนวนหน้าต่อเดือนที่เกินเพดาน (ดู MAX_PAGES_PER_MONTH ใน
//     @suth/domain) แทบแน่นอนว่าเป็นการกรอกเลขมิเตอร์สะสมแทนยอดของเดือนนั้น
//     หรือกดเกินมาหนึ่งหลัก — ปฏิเสธพร้อมบอกเหตุผล ดีกว่าปล่อยผ่านแล้วให้คนไป
//     ไล่หาทีหลังว่าทำไมค่าใช้จ่ายเดือนนั้นสูงผิดปกติ
//
// สิ่งที่เพิ่มรอบนี้: **GET /coverage** ตอบว่า "เดือนไหนของปีงบนี้ยังกรอกไม่ครบ
// และขาดกี่เครื่อง" ในคำขอเดียว เดิมฝั่งเว็บต้องดึงยอดทั้งหมดมาแล้วนับเองในเบราว์เซอร์
// ซึ่งทำให้หน้าแรกต้องรอโหลดข้อมูลทั้งปีก่อนจะบอกได้ว่ามีงานค้างอยู่ไหม

const express = require("express");
const { z } = require("zod");

const router = express.Router();
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const requireAuth = require("../auth/require-auth");
const requireStaff = require("../auth/require-staff");
const { validate, monthString, blankToNull } = require("../shared/validate");
const { notFound } = require("../shared/http-error");
const cache = require("../shared/cache");
const { readCoverageScope } = require("../shared/coverage-scope");
const { primaryMeterId, assertReadingsPriced } = require("../devices/meters");
const {
  MAX_PAGES_PER_MONTH,
  fiscalYearMonths,
  computeCoverage,
  currentMonth,
} = require("@suth/domain");

router.use(requireAuth);

/**
 * จำนวนหน้าที่กรอกได้
 *
 * `null` มีความหมายต่างจาก `0` อย่างชัดเจนและสำคัญมาก
 *   - 0    = เดือนนี้ตรวจแล้ว เครื่องไม่ได้พิมพ์อะไรเลย
 *   - null = เดือนนี้ยังไม่ได้ตรวจ (หรือผู้ใช้ลบค่าที่เคยกรอกออก)
 * ตัวแรกนับเป็น "กรอกแล้ว" ในความคืบหน้า ตัวหลังไม่นับ — ถ้าปนกันเมื่อไหร่
 * รายงานความคืบหน้าจะโกหกทันทีว่างานเสร็จแล้วทั้งที่ยังไม่ได้ไปอ่านมิเตอร์
 */
/**
 * จำนวนหน้าของหนึ่งเดือน — ตัวเลข 0 ขึ้นไป หรือ `null` ที่แปลว่า "ล้างค่าทิ้ง"
 *
 * ## ⚠️ ต้องใช้ preprocess ห้ามใช้ union เฉยๆ
 *
 * เดิมเขียนเป็น `z.union([z.coerce.number()..., z.literal(""), z.null(), z.undefined()])`
 * ซึ่ง **ผิดแบบเงียบสนิท** เพราะ union ไล่ลองตัวเลือกตามลำดับ และ
 * `z.coerce.number()` รับ `null` ได้ (`Number(null) === 0`) กับ `""` ได้
 * (`Number("") === 0`) มันจึงชนะตั้งแต่ตัวเลือกแรก แล้ว `z.null()` ไม่เคยถูกใช้เลย
 *
 * ผลที่ตามมาคือ **การล้างยอดที่บันทึกไว้ทำไม่ได้เลยทั้งระบบ** — ส่ง `null` ไป
 * แล้วได้ `0` บันทึกลงฐานแทน ซึ่งคนละความหมายกันโดยสิ้นเชิง
 *
 *   0     = อ่านมิเตอร์แล้ว เดือนนั้นไม่ได้พิมพ์เลย  -> นับว่า "กรอกแล้ว"
 *   null  = ยังไม่ได้อ่าน / ขอลบที่เคยกรอกไว้ทิ้ง     -> นับว่า "ยังไม่กรอก"
 *
 * และเพราะ 0 ถูกนับว่ากรอกแล้ว เดือนที่ผู้ใช้ตั้งใจล้างจึงกลายเป็น "ครบแล้ว"
 * บนแดชบอร์ด — ระบบรายงานว่างานเสร็จทั้งที่ข้อมูลถูกลบไป
 *
 * (บั๊กชนิดเดียวกับที่เคยทำให้ "ไม่กรอกราคา" กลายเป็น "ราคา 0 บาท" — ดู
 * `optionalMoney` ใน src/shared/validate.js ซึ่งแก้ด้วยวิธีเดียวกันนี้)
 */
const pagesField = z
  .preprocess(
    blankToNull,
    z.union([
      z.null(),
      z.coerce
        .number()
        .int("จำนวนหน้าต้องเป็นจำนวนเต็ม")
        .min(0, "จำนวนหน้าต้องไม่ติดลบ")
        .max(
          MAX_PAGES_PER_MONTH,
          `จำนวนหน้าต่อเดือนสูงผิดปกติ (เกิน ${MAX_PAGES_PER_MONTH.toLocaleString("th-TH")}) กรุณาตรวจสอบว่ากรอกยอดของเดือนนี้ ไม่ใช่เลขมิเตอร์สะสม`
        ),
    ])
  )
  .transform((value) => (typeof value === "number" ? value : null));

const fiscalYearIdQuery = z.object({
  fiscal_year_id: z.coerce.number({ error: "กรุณาระบุปีงบประมาณ" }).int().positive("กรุณาระบุปีงบประมาณ"),
});

/**
 * ความครบถ้วนรับตัวกรองชุดเดียวกับแดชบอร์ด
 *
 * เดิมเส้นนี้นับทั้งระบบเสมอ ไม่รับตัวกรองเลย ส่วนแดชบอร์ดนับตามตัวกรองที่เลือก
 * ผู้ใช้ที่เลือกอาคารแล้วเปิดสองหน้าจึงเห็น "ความครบถ้วน" คนละตัวเลขบนข้อมูล
 * ชุดเดียวกัน โดยไม่มีอะไรบอกว่าทำไม
 */
const coverageQuery = fiscalYearIdQuery.extend({
  building_name: z.string().trim().max(255).optional(),
  contract_id: z.coerce.number().int().positive().optional(),
});

/**
 * ดึงช่วงเดือนของปีงบ — ใช้ซ้ำในเกือบทุกเส้นทางของไฟล์นี้
 * @param {number} id
 * @returns {Promise<{ start_month: string, end_month: string }>}
 */
async function fiscalYearRange(id) {
  const [[row]] = await db.query("SELECT start_month, end_month FROM fiscal_year WHERE id = ?", [id]);
  if (!row) throw notFound("ไม่พบปีงบประมาณที่ระบุ");
  return row;
}

/**
 * บันทึกยอดพิมพ์หนึ่งช่อง
 *
 * รวมไว้ที่เดียวเพราะเดิมตรรกะ "ค่าว่าง = ลบแถวทิ้ง" ถูกเขียนไว้ในเส้นทาง bulk-device
 * อย่างเดียว ส่วนเส้นทาง bulk ธรรมดาแค่ข้ามไปเฉยๆ ผลคือลบค่าที่กรอกผิดออกจากหน้า
 * "กรอกทั้งเดือน" แล้วค่าเก่ายังค้างอยู่ในฐานข้อมูล และตัวนับความคืบหน้าไม่ลดลงตาม
 *
 * ช่องบนหน้าจอคือมิเตอร์ขาวดำของเครื่อง (devices/meters.js) — มิเตอร์สีเข้าทาง
 * ไฟล์ของผู้ให้เช่าเท่านั้น การล้างช่องจึงลบเฉพาะยอดของมิเตอร์นั้น
 *
 * @returns {Promise<{ outcome: "saved"|"cleared"|"skipped", meterId: number, unchanged?: boolean }>}
 */
async function writeReading(conn, deviceId, month, pages) {
  const meterId = await primaryMeterId(conn, deviceId);

  if (pages === null) {
    const [result] = await conn.query("DELETE FROM print_transactions WHERE meter_id = ? AND month = ?", [
      meterId,
      month,
    ]);
    return { outcome: result.affectedRows > 0 ? "cleared" : "skipped", meterId };
  }

  // ยอดเดิมที่ส่งมาซ้ำด้วยจำนวนหน้าเท่าเดิมไม่ใช่ยอดใหม่ — หน้าต่างกรอกทั้งปีส่งครบทุกเดือนเสมอ (#154)
  const [[existing]] = await conn.query(
    "SELECT pages FROM print_transactions WHERE meter_id = ? AND month = ?",
    [meterId, month]
  );
  const unchanged = existing !== undefined && Number(existing.pages) === pages;

  // ON DUPLICATE KEY UPDATE พึ่ง UNIQUE KEY (meter_id, month) ใน schema.sql
  // ถ้าคีย์นั้นหายไป การกดบันทึกซ้ำเดือนเดิมจะเพิ่มแถวใหม่ทุกครั้งและยอดจะถูกนับซ้ำ
  //
  // เลขมิเตอร์ต้นงวด/สิ้นงวด (จากไฟล์ผู้ให้เช่า) ถูกล้างเฉพาะเมื่อจำนวนหน้าเปลี่ยน เพราะยอดใหม่
  // ไม่ได้มาจากสองค่านั้นแล้ว — หน้าต่างกรอกทั้งปีส่งครบ 12 เดือนเสมอ ถ้าล้างทุกครั้ง แก้เดือน
  // เดียวก็ลบเลขมิเตอร์ของทุกเดือนที่ไม่ได้แก้ (#143) ใช้ <=> ให้ NULL เทียบได้
  //
  // ⚠️ ลำดับการกำหนดค่าสำคัญ: MySQL ประมวลผลซ้ายไปขวาและค่าด้านขวาเห็น pages ที่กำหนดแล้ว
  // สองบรรทัดเลขมิเตอร์จึงต้องมาก่อน pages เสมอ
  await conn.query(
    `INSERT INTO print_transactions (device_id, meter_id, month, pages)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       meter_start = IF(pages <=> VALUES(pages), meter_start, NULL),
       meter_end = IF(pages <=> VALUES(pages), meter_end, NULL),
       pages = VALUES(pages)`,
    [deviceId, meterId, month, pages]
  );

  return { outcome: "saved", meterId, unchanged };
}

/**
 * บันทึกหลายช่องใน transaction เดียว แล้วตรวจว่าทุกยอดที่บันทึกหาราคาได้
 * ถ้าหาไม่ได้แม้รายการเดียว ทั้งชุดถูกย้อน (ADR-0021)
 *
 * ยอดที่ส่งซ้ำด้วยจำนวนหน้าเท่าเดิมไม่ถูกตรวจราคา — การเขียนค่าเดิมทำให้ราคาเปลี่ยนไม่ได้ ถ้าหา
 * ราคาไม่ได้อยู่แล้ว (ยอดเก่าก่อน ADR-0021) ก็ไม่ใช่ความผิดของการบันทึกครั้งนี้ เดิมยอดเก่าหนึ่งเดือน
 * ทำให้หน้าต่างกรอกทั้งปีบันทึกเดือนอื่นไม่ได้เลย (#154) — กฎเดียวกับด่านของการแก้เครื่อง
 * (devices/meters.js unpricedDeviceReadingKeys) ส่วนยอดที่แก้ค่าหรือเพิ่มใหม่ยังต้องหาราคาได้เสมอ
 *
 * @param {Array<{ deviceId: number, month: string, pages: number|null }>} items
 */
async function writeReadings(conn, items) {
  const counts = { saved: 0, cleared: 0, skipped: 0 };
  const saved = [];

  for (const item of items) {
    const { outcome, meterId, unchanged } = await writeReading(conn, item.deviceId, item.month, item.pages);
    counts[outcome] += 1;
    if (outcome === "saved" && !unchanged) saved.push({ meterId, month: item.month });
  }

  await assertReadingsPriced(conn, saved);
  return counts;
}

// ============================================================
// GET /api/print-transactions — ยอดของช่องกรอก (กรองด้วย ?month=)
//
// คืนเฉพาะมิเตอร์ขาวดำ หนึ่งแถวต่อเครื่องต่อเดือน — ตรงกับที่ช่องกรอกเขียน (writeReading →
// primaryMeterId) และกับ /by-device เดิมคืนทุกมิเตอร์ หน้ากรอกจัดกลุ่มตามเครื่องแล้วเก็บแถวสุดท้าย
// เครื่องมิเตอร์สีจึงแสดงยอดสีในช่องขาวดำ แล้วการล้างช่องนั้นลบยอดขาวดำทิ้ง (#145)
// ยอดรวมทุกมิเตอร์ของรายงานอยู่ที่ /dashboard/monthly-kpi
// ============================================================
router.get(
  "/",
  validate({ query: z.object({ month: monthString.optional() }) }),
  asyncHandler(async (req, res) => {
    const conditions = ["mc.is_color = 0"];
    const params = [];

    if (req.query.month) {
      conditions.push("pt.month = ?");
      params.push(req.query.month);
    }

    const [rows] = await db.query(
      `SELECT pt.id, pt.device_id, pt.month, pt.pages, d.serial_number
       FROM print_transactions pt
       JOIN device_meter dm ON dm.id = pt.meter_id
       JOIN meter_category mc ON mc.id = dm.category_id
       LEFT JOIN devices d ON pt.device_id = d.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY pt.month DESC, d.serial_number`,
      params
    );

    cache.operationalData(res);
    res.json(rows);
  })
);

// ============================================================
// GET /api/print-transactions/months — เดือนที่เคยมีการบันทึกแล้ว
// ============================================================
router.get(
  "/months",
  asyncHandler(async (req, res) => {
    const [rows] = await db.query("SELECT DISTINCT month FROM print_transactions ORDER BY month DESC");

    cache.operationalData(res);
    res.json(rows.map((row) => row.month));
  })
);

// ============================================================
// GET /api/print-transactions/coverage?fiscal_year_id=ID
//
// "ปีงบนี้กรอกไปถึงไหนแล้ว" — ตอบในคำขอเดียวว่าแต่ละเดือนมีกี่เครื่องที่กรอกแล้ว
// จากทั้งหมดกี่เครื่อง พร้อมรายชื่อเดือนที่ยังไม่ครบ
//
// ทำไมต้องมี: หน้าแรกต้องบอกให้ได้ทันทีว่า "มีงานค้างอยู่ไหม" ซึ่งเป็นคำถามแรก
// ที่เจ้าหน้าที่เปิดระบบมาถาม เดิมตอบคำถามนี้ไม่ได้เลยจนกว่าจะดาวน์โหลดยอดพิมพ์
// ทั้งปีมานับในเบราว์เซอร์ — ช้าและสิ้นเปลืองสำหรับตัวเลขสองตัว
//
// นับเฉพาะเครื่องที่สถานะ active เพราะเครื่องที่ปลดระวางหรือส่งซ่อมอยู่ไม่มีมิเตอร์
// ให้ไปอ่าน การนับรวมเข้าไปจะทำให้ความคืบหน้าไม่มีวันถึง 100% และตัวเลขนั้นจะถูก
// เพิกเฉยไปในที่สุด
// ============================================================
router.get(
  "/coverage",
  validate({ query: coverageQuery }),
  asyncHandler(async (req, res) => {
    const range = await fiscalYearRange(req.query.fiscal_year_id);
    const months = fiscalYearMonths({ startMonth: range.start_month, endMonth: range.end_month });

    // ตัวเลขชุดเดียวกับที่แดชบอร์ดใช้ ผ่านฟังก์ชันเดียวกัน — ดู shared/coverage-scope.js
    const scope = await readCoverageScope({
      months,
      startMonth: range.start_month,
      endMonth: range.end_month,
      buildingName: req.query.building_name,
      contractId: req.query.contract_id,
    });

    const thisMonth = currentMonth();
    const { coverage, incompleteMonths } = computeCoverage({
      fyMonths: months,
      ...scope,
      today: thisMonth,
    });

    // ยอดแผ่นรวมของแต่ละเดือนไม่ใช่ส่วนหนึ่งของความครบถ้วน แต่หน้าบันทึกยอดใช้แสดง
    // ข้างช่องกรอก จึงดึงแยกมาต่อเข้ากับผลด้านบน
    const [pageRows] = await db.query(
      `SELECT pt.month, SUM(pt.pages) AS total_pages
       FROM print_transactions pt
       WHERE pt.month BETWEEN ? AND ?
       GROUP BY pt.month`,
      [range.start_month, range.end_month]
    );
    const pagesByMonth = new Map(pageRows.map((row) => [row.month, Number(row.total_pages)]));

    // คืนทุกเดือนของปีงบเสมอ รวมเดือนที่ยังไม่มีข้อมูลเลย — ฝั่งเว็บจะได้วาดตาราง
    // 12 ช่องได้โดยไม่ต้องเติมเดือนที่ขาดเอง (ซึ่งเคยทำให้เดือนที่ยังไม่กรอกหายไป
    // จากหน้าจอทั้งเดือน แทนที่จะขึ้นเป็นช่องว่างที่รอการกรอก)
    const monthRows = coverage.months.map((entry) => ({
      month: entry.month,
      filled: entry.filled_devices,
      total: entry.required_devices,
      total_pages: pagesByMonth.get(entry.month) || 0,
      complete: entry.status === "complete",
      status: entry.status,
      // เดือนนี้และเดือนถัดไปยังอ่านมิเตอร์ปิดยอดไม่ได้ จึงไม่ใช่ "งานค้าง"
      // แยกธงไว้ให้ทุกฝั่งที่ใช้ข้อมูลนี้ตัดสินใจเหมือนกัน — เดิมหน้าเว็บกับ
      // แดชบอร์ดนับไม่ตรงกันเพราะต่างคนต่างตีความ
      in_progress: entry.month >= thisMonth,
    }));

    cache.operationalData(res);
    res.json({
      fiscal_year_id: req.query.fiscal_year_id,
      // จำนวนเครื่องที่ต้องกรอกเปลี่ยนไปได้ในแต่ละเดือน ค่านี้คือของเดือนปัจจุบัน
      // ไว้ให้หน้าที่ต้องการตัวเลขเดียว — ตัวเลขรายเดือนที่ถูกต้องอยู่ใน months[]
      total_devices: coverage.months.find((m) => m.month === thisMonth)?.required_devices ?? 0,
      months: monthRows,
      coverage,
      // เดือนที่ควรไปทำต่อ — เดือนแรกที่ยังไม่ครบและจบไปแล้ว
      // ว่างเมื่อยังยืนยันไม่ได้ เพราะงานถัดไปตอนนั้นคือไปตรวจยืนยันเครื่อง ไม่ใช่กรอกยอด
      next_incomplete_month: incompleteMonths[0] ?? null,

      // เดือนที่หน้ากรอกยอดควรเปิดให้เป็นค่าเริ่มต้น
      //
      // ต่างจาก next_incomplete_month ตรงที่ตอบได้เสมอ ไม่ว่าจะมีงานค้างหรือไม่
      // และไม่ว่าความครบถ้วนจะยืนยันได้หรือยัง — หน้าจอต้องเปิดเดือนใดเดือนหนึ่ง
      // เสมอ ไม่มีสถานะ "ไม่เปิดเดือนไหนเลย"
      //
      // เคยคำนวณอยู่ฝั่งเว็บ ทั้งที่ในโค้ดตรงนั้นเขียนคอมเมนต์เตือนตัวเองไว้ว่า
      // "ห้ามคำนวณซ้ำ ไม่งั้นสองที่จะตอบไม่ตรงกันสักวัน" — แล้ววันนั้นก็มาถึง
      // ตอนที่เทสกับหน้าเว็บใช้กฎ fallback คนละแบบแล้วไปแก้ยอดคนละเดือนกัน
      default_entry_month:
        incompleteMonths[0] ??
        // ไม่มีงานค้าง (หรือยังยืนยันไม่ได้) — เปิดเดือนล่าสุดที่จบแล้วไว้ให้แก้
        // ย้อนหลัง เดือนปัจจุบันยังอ่านมิเตอร์ปิดยอดไม่ได้จึงไม่ใช่ค่าเริ่มต้นที่ดี
        monthRows.filter((row) => !row.in_progress).at(-1)?.month ??
        months.at(-1) ??
        null,
    });
  })
);

// ============================================================
// GET /api/print-transactions/summary?fiscal_year_id=ID
// นับเฉพาะมิเตอร์หลักขาวดำ ให้ตรงกับช่องกรอกและยอดเดือนในตารางหลัก (#159)
// ============================================================
router.get(
  "/summary",
  validate({ query: fiscalYearIdQuery }),
  asyncHandler(async (req, res) => {
    const range = await fiscalYearRange(req.query.fiscal_year_id);

    const [rows] = await db.query(
      `SELECT
         totals.device_id,
         totals.filled,
         totals.total_pages,
         totals.latest_month,
         latest.pages AS latest_pages
       FROM (
         SELECT pt.device_id, COUNT(DISTINCT pt.month) AS filled, SUM(pt.pages) AS total_pages, MAX(pt.month) AS latest_month
         FROM print_transactions pt
         JOIN device_meter dm ON dm.id = pt.meter_id
         JOIN meter_category mc ON mc.id = dm.category_id
         WHERE mc.is_color = 0 AND pt.month BETWEEN ? AND ?
         GROUP BY pt.device_id
       ) totals
       -- ยอดล่าสุดของมิเตอร์ขาวดำ ให้ตรงกับ total_pages ข้างบน
       JOIN (
         SELECT pt.device_id, pt.month, SUM(pt.pages) AS pages
         FROM print_transactions pt
         JOIN device_meter dm ON dm.id = pt.meter_id
         JOIN meter_category mc ON mc.id = dm.category_id
         WHERE mc.is_color = 0 AND pt.month BETWEEN ? AND ?
         GROUP BY pt.device_id, pt.month
       ) latest
         ON latest.device_id = totals.device_id AND latest.month = totals.latest_month`,
      [range.start_month, range.end_month, range.start_month, range.end_month]
    );

    cache.operationalData(res);
    res.json(rows);
  })
);

// ============================================================
// GET /api/print-transactions/by-device/:deviceId?fiscal_year_id=ID
// ยอดพิมพ์ทั้งปีงบของเครื่องเดียว (ใช้ตอนเปิดหน้าต่างกรอก 12 เดือน)
// ============================================================
router.get(
  "/by-device/:deviceId",
  validate({
    params: z.object({ deviceId: z.coerce.number().int().positive("รหัสเครื่องไม่ถูกต้อง") }),
    query: fiscalYearIdQuery,
  }),
  asyncHandler(async (req, res) => {
    const range = await fiscalYearRange(req.query.fiscal_year_id);

    // หน้าต่างกรอกทั้งปีแก้ได้เฉพาะมิเตอร์หลัก จึงคืนเฉพาะยอดของมิเตอร์นั้น
    const [rows] = await db.query(
      `SELECT pt.month, pt.pages
       FROM print_transactions pt
       JOIN device_meter dm ON dm.id = pt.meter_id
       JOIN meter_category mc ON mc.id = dm.category_id
       WHERE pt.device_id = ? AND mc.is_color = 0 AND pt.month BETWEEN ? AND ?
       ORDER BY pt.month`,
      [req.params.deviceId, range.start_month, range.end_month]
    );

    cache.operationalData(res);
    res.json(rows);
  })
);

// ============================================================
// POST /api/print-transactions — บันทึกทีละช่อง
// ============================================================
router.post(
  "/",
  requireStaff,
  validate({
    body: z.object({
      device_id: z.coerce.number().int().positive("กรุณาระบุเครื่อง"),
      month: monthString,
      pages: pagesField,
    }),
  }),
  asyncHandler(async (req, res) => {
    const { device_id, month, pages } = req.body;

    const { saved, cleared } = await db.withTransaction((conn) =>
      writeReadings(conn, [{ deviceId: device_id, month, pages }])
    );
    const outcome = saved ? "saved" : cleared ? "cleared" : "skipped";

    res.json({
      message: outcome === "cleared" ? "ลบยอดพิมพ์ของเดือนนี้แล้ว" : "บันทึกยอดพิมพ์สำเร็จ",
      outcome,
    });
  })
);

// ============================================================
// POST /api/print-transactions/bulk — เดือนเดียว หลายเครื่อง
// (หน้ากรอกรายเดือน: ไล่อ่านมิเตอร์ทุกเครื่องในเดือนนั้น)
// ============================================================
router.post(
  "/bulk",
  requireStaff,
  validate({
    body: z.object({
      month: monthString,
      items: z
        .array(
          z.object({
            device_id: z.coerce.number().int().positive(),
            pages: pagesField,
          })
        )
        .min(1, "ไม่มีรายการให้บันทึก")
        .max(2000, "บันทึกได้ครั้งละไม่เกิน 2000 รายการ"),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { month, items } = req.body;

    const result = await db.withTransaction((conn) =>
      writeReadings(
        conn,
        items.map((item) => ({ deviceId: item.device_id, month, pages: item.pages }))
      )
    );

    res.json({ message: describe(result), ...result });
  })
);

// ============================================================
// POST /api/print-transactions/bulk-device — เครื่องเดียว หลายเดือน
// (หน้าต่างกรอกทั้งปีงบ: ข้อมูลมิเตอร์มักถูกไล่เก็บย้อนหลังทีเดียวหลายเดือน)
//
// ต้องส่งครบทุกเดือนเสมอ รวมเดือนที่ผู้ใช้ลบจนว่าง เพราะ API ต้องรู้ว่าให้ลบค่าที่
// เคยบันทึกไว้ทิ้ง ไม่ใช่แค่ "ไม่พูดถึงเดือนนั้น" — สองอย่างนี้ต่างกัน
// ============================================================
router.post(
  "/bulk-device",
  requireStaff,
  validate({
    body: z.object({
      device_id: z.coerce.number().int().positive("กรุณาระบุเครื่อง"),
      items: z
        .array(z.object({ month: monthString, pages: pagesField }))
        .min(1, "ไม่มีรายการให้บันทึก")
        .max(120, "บันทึกได้ครั้งละไม่เกิน 120 เดือน"),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { device_id, items } = req.body;

    const result = await db.withTransaction((conn) =>
      writeReadings(
        conn,
        items.map((item) => ({ deviceId: device_id, month: item.month, pages: item.pages }))
      )
    );

    res.json({ message: describe(result), ...result });
  })
);

/**
 * สรุปผลการบันทึกเป็นข้อความเดียวที่บอกสิ่งที่เกิดขึ้นจริง
 * "บันทึก 5 เดือน / ลบออก 2 เดือน" มีประโยชน์กว่า "สำเร็จ" เพราะผู้ใช้ตรวจได้ทันที
 * ว่าตรงกับที่ตั้งใจไหม โดยเฉพาะตอนวางข้อมูลจากตารางคำนวณมาทีเดียวหลายช่อง
 */
function describe({ saved, cleared }) {
  const parts = [];
  if (saved) parts.push(`บันทึก ${saved} รายการ`);
  if (cleared) parts.push(`ลบออก ${cleared} รายการ`);
  return parts.length ? parts.join(" / ") : "ไม่มีการเปลี่ยนแปลง";
}

module.exports = router;

// เปิดให้เทสเรียกใช้ schema ตัวจริง ไม่ใช่ให้เทสสร้างสำเนาขึ้นมาเอง —
// สำเนาจะผ่านเสมอแม้ของจริงจะพัง ซึ่งเป็นเทสที่ให้ความมั่นใจผิดๆ
module.exports.pagesField = pagesField;
module.exports.writeReadings = writeReadings;
