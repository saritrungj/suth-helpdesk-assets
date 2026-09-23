// apps/api/src/import/session-routes.js
//
// /api/import-sessions — งานนำเข้าไฟล์จากผู้ให้เช่า (ADR-0027, ADR-0028, ADR-0029)
//
// เฉพาะ admin ทุก endpoint admin ทุกคนเห็นและทำต่องานของกันได้ ทุกการกระทำเขียนลงประวัติพร้อมผู้ทำ
//
//   GET    /import-sessions                     งานที่ยังเปิดอยู่ (?all=1 = รวมที่ปิดแล้ว)
//   POST   /import-sessions                     อัปโหลดไฟล์ → session ใหม่ที่ตรวจแล้ว (auto=commit|resolve → ADR-0030)
//   GET    /import-sessions/:id                 สถานะ ผลตรวจ การตัดสินใจ ประวัติล่าสุด
//   GET    /import-sessions/:id/events          ประวัติทั้งหมด
//   GET    /import-sessions/:id/file            ดาวน์โหลดไฟล์ต้นฉบับ
//   PUT    /import-sessions/:id/decisions       เก็บการตัดสินใจชุดใหม่ แล้วตรวจใหม่
//   POST   /import-sessions/:id/validate        ตรวจใหม่ (เช่น หลังแก้สัญญาที่หน้าสัญญา)
//   POST   /import-sessions/:id/contracts       สร้างสัญญาที่ไฟล์อ้างถึง (เติมจากหัวไฟล์ได้)
//   POST   /import-sessions/:id/fiscal-years    สร้างปีงบที่ครอบเดือนในไฟล์
//   POST   /import-sessions/:id/auto            ให้ระบบตัดสินส่วนที่เหลือ ({ commit } = บันทึกด้วยถ้าไม่เหลืออะไรต้องถาม)
//   POST   /import-sessions/:id/commit          บันทึก
//   POST   /import-sessions/:id/abandon         ยกเลิก (กลายเป็น expired ประวัติยังอยู่)

const express = require("express");
const { z } = require("zod");
const router = express.Router();

const requireAuth = require("../auth/require-auth");
const requireAdmin = require("../auth/require-admin");
const asyncHandler = require("../shared/async-handler");
const cache = require("../shared/cache");
const db = require("../shared/db");
const { validate, idParam } = require("../shared/validate");
const { removeUploadedFile } = require("./workbook");
const { handleUpload } = require("./upload");
const store = require("./session-store");
const sessions = require("./session-service");

router.use("/import-sessions", requireAuth, requireAdmin);

const noStore = (handler) => asyncHandler(async (req, res) => {
  cache.noStore(res);
  return handler(req, res);
});

router.get(
  "/import-sessions",
  validate({ query: z.object({ all: z.enum(["0", "1"]).optional() }) }),
  noStore(async (req, res) => {
    res.json(await sessions.listForAdmins({ includeClosed: req.query.all === "1" }));
  })
);

router.post(
  "/import-sessions",
  handleUpload,
  noStore(async (req, res) => {
    try {
      // ช่องในฟอร์ม multipart — ค่าอื่นหรือไม่ส่ง = ทำเองทุกขั้นแบบเดิม
      const auto = ["commit", "resolve"].includes(req.body?.auto) ? req.body.auto : null;
      const detail = await sessions.createFromUpload(req.file, req.user, { auto });
      res.set("Location", `${req.baseUrl}/import-sessions/${detail.id}`);
      res.status(201).json(detail);
    } finally {
      // สำเร็จแล้วไฟล์ถูกย้ายไปที่เก็บของ session — ที่นี่ลบเฉพาะไฟล์ชั่วคราวที่ยังค้าง (ทางที่ล้ม)
      removeUploadedFile(req.file);
    }
  })
);

router.get(
  "/import-sessions/:id",
  validate({ params: idParam }),
  noStore(async (req, res) => {
    res.json(await sessions.detailForAdmins(req.params.id));
  })
);

router.get(
  "/import-sessions/:id/events",
  validate({ params: idParam }),
  noStore(async (req, res) => {
    await store.getSession(req.params.id);
    res.json(await store.listEvents(req.params.id));
  })
);

router.get(
  "/import-sessions/:id/file",
  validate({ params: idParam }),
  noStore(async (req, res) => {
    const session = await store.getSession(req.params.id);
    await store.addEvent(db, session.id, "file_downloaded", req.user?.id ?? null);
    res.download(store.absoluteFilePath(session), session.file_name);
  })
);

router.put(
  "/import-sessions/:id/decisions",
  validate({ params: idParam, body: z.object({ decisions: z.record(z.string(), z.unknown()) }) }),
  noStore(async (req, res) => {
    res.json(await sessions.saveDecisions(req.params.id, req.user, req.body.decisions));
  })
);

router.post(
  "/import-sessions/:id/validate",
  validate({ params: idParam }),
  noStore(async (req, res) => {
    res.json(await sessions.validateSession(req.params.id, req.user, "manual"));
  })
);

router.post(
  "/import-sessions/:id/contracts",
  validate({ params: idParam }),
  noStore(async (req, res) => {
    res.json(await sessions.createContract(req.params.id, req.user, req.body));
  })
);

router.post(
  "/import-sessions/:id/fiscal-years",
  validate({ params: idParam, body: z.object({ years: z.array(z.coerce.string().max(10)).min(1).max(10) }) }),
  noStore(async (req, res) => {
    res.json(await sessions.createFiscalYears(req.params.id, req.user, req.body.years));
  })
);

router.post(
  "/import-sessions/:id/auto",
  validate({ params: idParam, body: z.object({ commit: z.boolean().optional() }) }),
  noStore(async (req, res) => {
    res.json(await sessions.autoResolveSession(req.params.id, req.user, { commit: Boolean(req.body.commit) }));
  })
);

router.post(
  "/import-sessions/:id/commit",
  validate({ params: idParam }),
  noStore(async (req, res) => {
    res.json(await sessions.commitSession(req.params.id, req.user));
  })
);

router.post(
  "/import-sessions/:id/abandon",
  validate({ params: idParam, body: z.object({ reason: z.string().trim().max(500).optional() }) }),
  noStore(async (req, res) => {
    res.json(await sessions.abandonSession(req.params.id, req.user, req.body.reason));
  })
);

module.exports = router;
