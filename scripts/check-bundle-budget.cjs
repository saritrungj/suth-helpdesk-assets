// scripts/check-bundle-budget.cjs — performance budget of the JS every page loads up front
//
//   node scripts/check-bundle-budget.cjs [apps/web/dist]
//
// Reads index.html from the build: <script type="module" src> plus <link rel="modulepreload">
// are the files the browser downloads before the first page renders (the login page too).
// Sums their gzip size and fails when:
//   1. it exceeds INITIAL_JS_GZIP_BUDGET_KB — a budget that only goes up on purpose
//   2. a library that only some pages use has slipped into those files (FORBIDDEN_IN_INITIAL)
//
// Why: chart.js used to ride along in the shared chunk only because ui/index.js re-exported
// UiChart, so every page paid for a library only two pages use (#169), and nothing caught it.
// The charts are now lightweight-charts via UiStockChart (#212) — same rule, new marker.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

/** Raise only with a reason in the PR — measured 2026-09-23 after removing chart.js: see #169 */
const INITIAL_JS_GZIP_BUDGET_KB = 200;

/** Libraries that must load only on the pages that use them — marker = text that survives minification */
const FORBIDDEN_IN_INITIAL = [
  { name: "lightweight-charts", marker: "utm_medium=lwc-link", hint: "import UiStockChart directly from ../ui/UiStockChart.vue, not through ui/index.js" },
  { name: "xlsx (SheetJS)", marker: "SheetJS", hint: "use await import(\"xlsx\") as in lib/export-xlsx.js" },
];

/** Paths of the JS files index.html loads up front */
function initialScripts(html) {
  const files = new Set();
  for (const m of html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)) files.add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g)) files.add(m[1]);
  return [...files];
}

function check(distDir) {
  const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  const scripts = initialScripts(html);
  if (!scripts.length) return { ok: false, problems: ["no JS found in index.html — run npm run build first"], rows: [], totalKb: 0 };

  const problems = [];
  const rows = scripts.map((src) => {
    const code = fs.readFileSync(path.join(distDir, src.replace(/^\//, "")));
    const gzipKb = zlib.gzipSync(code, { level: 9 }).length / 1024;
    for (const lib of FORBIDDEN_IN_INITIAL) {
      if (code.includes(lib.marker)) problems.push(`${lib.name} is in ${src}, which every page loads — ${lib.hint}`);
    }
    return { src, gzipKb };
  });
  const totalKb = rows.reduce((sum, row) => sum + row.gzipKb, 0);
  if (totalKb > INITIAL_JS_GZIP_BUDGET_KB) {
    problems.push(`initial JS is ${totalKb.toFixed(1)} KB gzip, over the ${INITIAL_JS_GZIP_BUDGET_KB} KB budget`);
  }
  return { ok: problems.length === 0, problems, rows, totalKb };
}

module.exports = { check, initialScripts, INITIAL_JS_GZIP_BUDGET_KB, FORBIDDEN_IN_INITIAL };

if (require.main === module) {
  const dist = path.resolve(process.argv[2] || path.join(__dirname, "..", "apps", "web", "dist"));
  const result = check(dist);
  for (const row of result.rows) console.log(`  ${row.src.padEnd(44)} ${row.gzipKb.toFixed(1).padStart(7)} KB gzip`);
  console.log(`bundle budget — initial JS ${result.totalKb.toFixed(1)} / ${INITIAL_JS_GZIP_BUDGET_KB} KB gzip`);
  for (const problem of result.problems) console.error(`✖ ${problem}`);
  process.exitCode = result.ok ? 0 : 1;
}
