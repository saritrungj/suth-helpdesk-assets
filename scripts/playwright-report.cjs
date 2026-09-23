const fs = require("node:fs");

function skippedCases(suites, parents = []) {
  const cases = [];
  for (const suite of suites || []) {
    const path = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        if (test.status !== "skipped") continue;
        const reason = test.annotations?.find((item) => item.type === "skip")?.description;
        cases.push(`${[...path, spec.title].join(" › ")}${reason ? ` — ${reason}` : ""}`);
      }
    }
    cases.push(...skippedCases(suite.suites, path));
  }
  return cases;
}

function assertRequiredCoverage(report, label) {
  const stats = report?.stats;
  if (!stats || !Number.isInteger(stats.expected) || !Number.isInteger(stats.skipped)) {
    throw new Error(`${label}: รายงาน Playwright ไม่มีจำนวนเคสที่ตรวจสอบได้`);
  }
  const skipped = skippedCases(report.suites);
  if (stats.expected < 1 || stats.skipped > 0) {
    const details = skipped.length ? `\n${skipped.map((item) => `- ${item}`).join("\n")}` : "";
    throw new Error(`${label}: ผ่าน ${stats.expected}, ข้าม ${stats.skipped}${details}`);
  }
  return `${label} — ผ่าน ${stats.expected} เคส, ข้าม 0 เคส`;
}

function assertReportFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label}: ไม่มีรายงาน Playwright — ยืนยัน coverage ไม่ได้`);
  return assertRequiredCoverage(JSON.parse(fs.readFileSync(file, "utf8")), label);
}

module.exports = { assertRequiredCoverage, assertReportFile };
