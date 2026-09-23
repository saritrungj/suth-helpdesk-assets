const fs = require("fs");
const crypto = require("crypto");
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const { badRequest, conflict } = require("../shared/http-error");
const { today } = require("../devices/contract-history");
const { readAllSheets, readRawSheets, removeUploadedFile } = require("./workbook");
const { parseDecisions } = require("./decisions");
const { parseRegistryWorkbook } = require("./registry-sheet");
const { planRegistryImport } = require("./registry-plan");
const { loadRegistryContext, applyRegistryPlan, describeRegistryPlan } = require("./registry-import");
const {
  loadMeters,
  readingsFromSheets,
  compareWithExisting,
  readingsToken,
  writeCandidates,
  checkWrittenReadings,
  PreviewRollback,
} = require("./readings-import");

// ชั้น HTTP ของการนำเข้าเท่านั้น — ตรรกะอยู่ใน workbook.js, decisions.js, registry-*.js และ
// readings-import.js ซึ่ง import session ใช้ร่วมกัน (#178)

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
// นำเข้าทะเบียนเครื่อง (#132)
//
// รับเทมเพลตของระบบ รายงานสถานะเครื่องของผู้ให้เช่า (หลายแผ่น หัวรายงานก่อนหัวตาราง)
// และรายงานมิเตอร์รายงวด ดู import/registry-sheet.js
//
// ## ตรวจก่อน แล้วค่อยบันทึก
//
//   mode=preview  อ่านไฟล์ วางแผน แล้วตอบว่าจะสร้าง/เติม/ข้ามอะไร และยังต้องตัดสินอะไร
//   mode=commit   วางแผนใหม่จากไฟล์เดิม + decisions แล้วบันทึกทั้งก้อนใน transaction เดียว
//
// ไม่มี token ระหว่างสองขั้นเหมือนหน้ายอดมิเตอร์ เพราะ commit วางแผนใหม่จากข้อมูลปัจจุบัน
// ทุกครั้ง แผนที่ไม่ครบ (ชื่อที่ยังไม่ตัดสิน สัญญาที่ไม่มี) ถูกปฏิเสธก่อนเขียน
//
// decisions (JSON ในช่อง form) = สิ่งที่ผู้ดูแลเลือกในหน้าตรวจ ดู registry-plan.js
// ============================================================

exports.importDevices = asyncHandler(async (req, res) => {
    try {
        // routes.js ดักกรณีไม่แนบไฟล์ไว้แล้ว ที่นี่กันไว้อีกชั้นเผื่อมีคนต่อ handler นี้เข้า route ใหม่
        if (!req.file) throw badRequest("กรุณาเลือกไฟล์ที่ต้องการนำเข้า", { code: "no_file" });

        const mode = String(req.body?.mode || "preview");
        if (mode !== "preview" && mode !== "commit") {
            throw badRequest("โหมดการนำเข้าไม่ถูกต้อง", { code: "invalid_import_mode" });
        }
        const decisions = parseDecisions(req.body?.decisions);

        const parsed = parseRegistryWorkbook(readAllSheets(req.file.path, req.file.originalname));
        if (!parsed) {
            throw badRequest("ไม่พบตารางทะเบียนเครื่องในไฟล์", {
                code: "registry_not_found",
                detail: "ต้องมีคอลัมน์เลขซีเรียล (เช่น Serial No., SN., serial_number) และคอลัมน์รุ่นหรืออาคาร ในแถวหัวตารางภายใน 15 แถวแรก",
            });
        }

        const planWith = (context) => planRegistryImport({ rows: parsed.rows, ...context, decisions, today: today() });

        if (mode === "preview") {
            const context = await loadRegistryContext(db);
            return res.json({ mode, ...describeRegistryPlan(parsed, planWith(context), context) });
        }

        // บันทึก: อ่านข้อมูลและวางแผนใหม่ใน transaction เดียวกับการเขียน — สิ่งที่คนอื่นแก้ระหว่าง
        // ที่ผู้ดูแลกำลังตรวจไฟล์อยู่ ถูกนับรวมในแผนนี้ ไม่ใช่แผนเก่าตอนกดตรวจ
        const { described, result } = await db.withTransaction(async (conn) => {
            const context = await loadRegistryContext(conn);
            const plan = planWith(context);
            if (!plan.valid) {
                throw badRequest("ยังบันทึกไม่ได้ มีรายการที่ต้องตัดสินหรือแก้ก่อน", {
                    code: "import_needs_decisions",
                    detail: "ตรวจไฟล์อีกครั้งแล้วตัดสินชื่อ หมวดมิเตอร์ และสัญญาที่ขึ้นเตือนให้ครบ",
                });
            }
            return {
                described: describeRegistryPlan(parsed, plan, context),
                result: await applyRegistryPlan(conn, plan, { userId: req.user?.id ?? null }),
            };
        });
        res.json({ mode, ...described, created: result.created, filled: result.filled });
    } catch (err) {
        // ไม่ตอบ error เอง — โยนต่อให้ handler กลางแปลงเป็น Problem Details (ADR-0010)
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
//      ไฟล์จริงเก็บนอก repo (repo เป็น public) — หัวตารางดูที่ docs/reference/import-format.md
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

exports.importPrintTransactions = asyncHandler(async (req, res) => {
    try {
        // routes.js ดักกรณีไม่แนบไฟล์ไว้แล้ว ที่นี่กันไว้อีกชั้นเผื่อมีคนต่อ handler
        // นี้เข้า route ใหม่โดยลืม handleUpload
        if (!req.file) throw badRequest("กรุณาเลือกไฟล์ที่ต้องการนำเข้า", { code: "no_file" });

        const sheets = readRawSheets(req.file.path);

        const meters = await loadMeters(db);
        const { vendor, format, candidates, errors, months } = readingsFromSheets(sheets, meters);
        const { existingMap, newRows, overwriteRows, unchangedRows } = await compareWithExisting(db, candidates, months);

        const fileDigest = crypto.createHash("sha256").update(fs.readFileSync(req.file.path)).digest("hex");
        const previewToken = readingsToken(fileDigest, candidates, existingMap);
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

// ให้เทสอ่านไฟล์จริงผ่านทางเดียวกับที่ API ใช้ (CSV ต้องอ่านเป็นข้อความ)
exports.readAllSheets = readAllSheets;
