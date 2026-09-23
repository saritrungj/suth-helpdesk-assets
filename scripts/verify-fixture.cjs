const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { assertReportFile } = require("./playwright-report.cjs");

const root = path.resolve(__dirname, "..");
const reportFile = path.join(root, "apps", "web", "e2e", ".artifacts", "fixture-results.json");

function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "localhost", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function main() {
  fs.rmSync(reportFile, { force: true });
  const webPort = await unusedPort();
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : "npm";
  const args = npmCli
    ? [npmCli, "run", "test:e2e:fixture", "--workspace", "@suth/web"]
    : ["run", "test:e2e:fixture", "--workspace", "@suth/web"];
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32" && !npmCli,
    env: {
      ...process.env,
      CI: "1",
      SUTH_WEB_URL: `http://localhost:${webPort}`,
      SUTH_E2E_REPORT_FILE: reportFile,
    },
  });
  if (result.error || result.status !== 0) throw new Error(`fixture E2E ล้ม (exit ${result.status ?? "unknown"})`);
  console.log(assertReportFile(reportFile, "verify:fixture"));
}

main().catch((error) => {
  console.error(`verify:fixture: ${error.message}`);
  process.exitCode = 1;
});
