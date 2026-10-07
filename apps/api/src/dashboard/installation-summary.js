// Current registry snapshot, independent of fiscal periods and reading history (#274).
const express = require("express");
const { z } = require("zod");
const db = require("../shared/db");
const asyncHandler = require("../shared/async-handler");
const { validate } = require("../shared/validate");
const cache = require("../shared/cache");

const router = express.Router();
const contractIds = z.string().max(2000).regex(/^(?:\d+|unassigned)(?:,(?:\d+|unassigned))*$/)
  .transform((value) => [...new Set(value.split(",").map((part) => part === "unassigned" ? part : Number(part)))])
  .pipe(z.array(z.union([z.number().int().positive().safe(), z.literal("unassigned")])).max(100));
const query = z.object({ contract_ids: contractIds.optional() });

router.get("/installation-summary", validate({ query }), asyncHandler(async (req, res) => {
  const selection = req.query.contract_ids;
  const ids = selection?.filter((id) => id !== "unassigned") ?? [];
  const clauses = [];
  if (ids.length) clauses.push("contract_id IN (?)");
  if (selection?.includes("unassigned")) clauses.push("contract_id IS NULL");
  const [[counts]] = await db.query(
    `SELECT COALESCE(SUM(installation_status = 'installed'), 0) AS installed,
            COALESCE(SUM(installation_status = 'not_installed'), 0) AS not_installed,
            COALESCE(SUM(installation_status IS NULL), 0) AS unverified
     FROM devices
     ${clauses.length ? `WHERE (${clauses.join(" OR ")})` : ""}`,
    ids.length ? [ids] : []
  );
  cache.operationalData(res);
  res.json({
    installed: Number(counts.installed),
    not_installed: Number(counts.not_installed),
    unverified: Number(counts.unverified),
  });
}));

module.exports = router;
module.exports.query = query;
