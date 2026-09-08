// .claude/skills/run-web/driver.mjs
// REPL driver for @suth/web (Vue 3 + Vite SPA). Headless Chromium via
// playwright-core — no chromium-cli in this environment, so this fills the
// same role: an agent sends stdin commands, gets stdout results back.
//
// Run from apps/web/ with the Vite dev server already up:
//   node .claude/skills/run-web/driver.mjs
//
// Primary agent path: pipe a whole batch script to stdin via heredoc (see
// SKILL.md) — one process, runs to completion, no terminal multiplexer
// needed. If tmux IS available, it also works as a live REPL under
// send-keys/capture-pane, same commands either way.
import { chromium } from "playwright-core";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE_URL = process.env.SUTH_WEB_URL || "http://localhost:5173";
const SHOT_DIR = process.env.SCREENSHOT_DIR || path.resolve(process.cwd(), "e2e/.driver-shots");
fs.mkdirSync(SHOT_DIR, { recursive: true });

let browser = null;
let page = null;
let consoleLog = []; // { type, text } — console messages + failed requests since last launch/nav

function attachPageListeners(p) {
  p.on("console", (msg) => consoleLog.push({ type: msg.type(), text: msg.text() }));
  p.on("pageerror", (err) => consoleLog.push({ type: "pageerror", text: String(err) }));
  p.on("requestfailed", (req) =>
    consoleLog.push({ type: "requestfailed", text: `${req.url()} ${req.failure()?.errorText}` }),
  );
}

const COMMANDS = {
  // launch [light|dark]  — start headless Chromium. Optional color-scheme
  // emulation, since this app's theming (incl. AuroraCanvas tokens) is
  // driven by prefers-color-scheme, not a class toggle.
  async launch(colorScheme) {
    if (browser) return console.log("already launched");
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: colorScheme === "dark" ? "dark" : colorScheme === "light" ? "light" : undefined,
      locale: "th-TH",
    });
    page = await context.newPage();
    attachPageListeners(page);
    console.log("launched. base url:", BASE_URL);
  },

  // theme <light|dark> — flip color-scheme emulation without relaunching.
  async theme(scheme) {
    if (!page) return console.log("ERROR: launch first");
    if (scheme !== "light" && scheme !== "dark") return console.log("ERROR: theme light|dark");
    await page.emulateMedia({ colorScheme: scheme });
    console.log("theme ->", scheme);
  },

  // nav <path> — e.g. `nav /login`. Clears the console/request log first.
  async nav(p) {
    if (!page) return console.log("ERROR: launch first");
    consoleLog = [];
    const url = new URL(p || "/", BASE_URL).toString();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    console.log("nav ->", url);
  },

  async "wait-for"(sel) {
    if (!page) return console.log("ERROR: launch first");
    try {
      await page.waitForSelector(sel, { timeout: 10_000 });
      console.log("found:", sel);
    } catch {
      console.log("TIMEOUT:", sel);
    }
  },

  async click(sel) {
    if (!page) return console.log("ERROR: launch first");
    try {
      await page.click(sel, { timeout: 5_000 });
      console.log("click", sel, "-> OK");
    } catch (e) {
      console.log("click", sel, "-> ERROR:", e.message.split("\n")[0]);
    }
  },

  // fill <sel> <text...> — Playwright's input pipeline, not eval(el.value=...)
  // (Vue's v-model listens on real input events; eval-set values don't fire it).
  async fill(rest) {
    if (!page) return console.log("ERROR: launch first");
    const sp = rest.indexOf(" ");
    const sel = sp === -1 ? rest : rest.slice(0, sp);
    const text = sp === -1 ? "" : rest.slice(sp + 1);
    try {
      await page.fill(sel, text, { timeout: 5_000 });
      console.log("fill", sel, "-> OK");
    } catch (e) {
      console.log("fill", sel, "-> ERROR:", e.message.split("\n")[0]);
    }
  },

  async press(key) {
    if (!page) return console.log("ERROR: launch first");
    await page.keyboard.press(key);
    console.log("press", key);
  },

  async text(sel) {
    if (!page) return console.log("ERROR: launch first");
    console.log(
      await page.evaluate((s) => (s ? document.querySelector(s) : document.body)?.innerText ?? "(null)", sel || null),
    );
  },

  async eval(expr) {
    if (!page) return console.log("ERROR: launch first");
    try {
      console.log(JSON.stringify(await page.evaluate(expr)));
    } catch (e) {
      console.log("ERROR:", e.message.split("\n")[0]);
    }
  },

  // screenshot [name] — full-page PNG -> SHOT_DIR/<name>.png
  async screenshot(name) {
    if (!page) return console.log("ERROR: launch first");
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + ".png");
    await page.screenshot({ path: f, fullPage: true });
    console.log("screenshot:", f);
  },

  // console [--errors] — dump buffered console/pageerror/requestfailed
  // entries collected since the last launch/nav.
  console(arg) {
    const ERROR_TYPES = new Set(["error", "pageerror", "requestfailed"]);
    const rows = arg === "--errors" ? consoleLog.filter((r) => ERROR_TYPES.has(r.type)) : consoleLog;
    if (!rows.length) return console.log("(none)");
    for (const r of rows) console.log(`[${r.type}]`, r.text);
  },

  async quit() {
    if (browser) await browser.close().catch(() => {});
    browser = null;
    page = null;
  },

  help() {
    console.log("commands:", Object.keys(COMMANDS).join(", "));
  },
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "driver> " });

// readline fires "line" for every buffered line as soon as it arrives — with
// a heredoc, that's ALL lines, synchronously, before the first async command
// finishes. Without this queue, "nav" runs concurrently with "launch" and
// hits a null `page`. Chain everything through one promise so each command
// completes before the next starts, batch script or not.
let queue = Promise.resolve();

// In batch/heredoc mode, stdin's EOF closes the readline interface before
// the queue above has drained (see the "close" handler below) — any
// rl.prompt() called afterward throws ERR_USE_AFTER_CLOSE. Harmless in that
// mode (there's no interactive terminal to prompt anyway), so swallow it.
function safePrompt() {
  try {
    rl.prompt();
  } catch {
    /* interface already closed — batch mode, nothing to prompt */
  }
}

rl.on("line", (line) => {
  queue = queue.then(async () => {
    const trimmed = line.trim();
    const sp = trimmed.indexOf(" ");
    const cmd = sp === -1 ? trimmed : trimmed.slice(0, sp);
    const rest = sp === -1 ? "" : trimmed.slice(sp + 1);
    if (!cmd) return safePrompt();
    const fn = COMMANDS[cmd];
    if (!fn) {
      console.log("unknown:", cmd, "- try: help");
      return safePrompt();
    }
    try {
      await fn(rest);
    } catch (e) {
      console.log("ERROR:", e.message);
    }
    if (cmd === "quit") {
      rl.close();
      process.exit(0);
    }
    safePrompt();
  });
});
rl.on("close", () => {
  // stdin EOF (heredoc/pipe ends) fires this immediately — before the queued
  // line handlers above have actually run their awaits. Append to the same
  // queue instead of quitting here directly, or a batch script's commands
  // never execute at all.
  queue = queue.then(async () => {
    await COMMANDS.quit();
    process.exit(0);
  });
});

console.log(`@suth/web driver - base ${BASE_URL} - "help" for commands, "launch" to start`);
rl.prompt();
