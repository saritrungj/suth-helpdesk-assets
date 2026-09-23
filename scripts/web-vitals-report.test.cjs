const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLine, p75, summarize } = require("./web-vitals-report.cjs");

const pretty = (vital) => `\x1b[36m14:47:57 INFO \x1b[0m web-vital vital=${JSON.stringify(vital)}`;
const json = (vital) => JSON.stringify({ time: "2026-09-23T07:47:57.000Z", level: "info", message: "web-vital", vital });

test("อ่านได้ทั้ง log แบบ pretty (มีสี) และ JSON — ตัวเลือก CSS ที่มีช่องว่างไม่พัง", () => {
  const vital = { name: "INP", value: 320, rating: "poor", page: "/assets", target: "div.row > button.save" };
  assert.deepEqual(parseLine(pretty(vital)), vital);
  assert.deepEqual(parseLine(json(vital)), vital);
});

test("ข้ามบรรทัดอื่นและบรรทัดเสีย", () => {
  assert.equal(parseLine("14:00:00 INFO  GET /api/devices status=200"), null);
  assert.equal(parseLine("14:00:00 INFO  web-vital vital={broken"), null);
  assert.equal(parseLine(JSON.stringify({ message: "other", vital: {} })), null);
});

test("p75 แบบ nearest-rank", () => {
  assert.equal(p75([1, 2, 3, 4]), 3);
  assert.equal(p75([10]), 10);
  assert.equal(p75([5, 1, 4, 2, 3, 8, 7, 6]), 6);
});

test("สรุปรายหน้า: p75 เทียบเกณฑ์ และบอก element ต้นเหตุที่ไม่ดีบ่อยที่สุด", () => {
  const rows = summarize([
    { name: "INP", value: 80, rating: "good", page: "/assets", target: "a.link" },
    { name: "INP", value: 350, rating: "poor", page: "/assets", target: "button.save" },
    { name: "INP", value: 400, rating: "poor", page: "/assets", target: "button.save" },
    { name: "INP", value: 250, rating: "needs-improvement", page: "/assets", target: "input.search" },
    { name: "LCP", value: 900, rating: "good", page: "/login" },
  ]);
  const inp = rows.find((r) => r.name === "INP");
  assert.equal(inp.p75, 350);
  assert.equal(inp.pass, false);
  assert.equal(inp.worstTarget, "button.save");
  assert.deepEqual([inp.good, inp.ni, inp.poor], [1, 1, 2]);
  const lcp = rows.find((r) => r.name === "LCP");
  assert.equal(lcp.pass, true);
  assert.equal(lcp.worstTarget, undefined);
});
