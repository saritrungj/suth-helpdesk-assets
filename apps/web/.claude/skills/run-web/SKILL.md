---
name: run-web
description: Build, run, and drive the @suth/web Vue 3 SPA (login, dashboard, asset/print/expense screens). Use when asked to start the web app, take a screenshot of a page, fill in or submit a form, check console errors, or verify a UI change actually renders in a browser.
---

`@suth/web` is a Vue 3 + Vite SPA. There's no `chromium-cli` in this
environment, so drive it via the headless-Chromium REPL at
`.claude/skills/run-web/driver.mjs` (uses `playwright-core`, already
hoisted to the repo-root `node_modules` by the npm workspace install —
no extra install). The primary interface is piping a whole batch
script to the driver's stdin via heredoc; see **Run (agent path)**.

All paths below are relative to `apps/web/`.

**Environment note:** this was built and verified on a Windows (win32)
dev box, not a Linux container. There's no `tmux` and no `xvfb` here —
neither is needed: `chromium.launch({ headless: true })` opens the
bundled Chromium directly, no X server involved. If you're running this
skill from a Linux container instead, the same driver and commands work
unchanged (add `xvfb-run` only if you ever flip `headless: false`).

## Prerequisites

Node >=20 (repo's `engines` field). Nothing OS-level to install — no
`apt-get`/browser packages were needed; `@playwright/test`'s postinstall
already fetched a Chromium binary during the workspace's `npm install`.

If a fresh clone is missing the browser binary (`driver.mjs` throws
`Executable doesn't exist` on `launch`):

```bash
npx playwright install chromium
```

## Setup

Install once, from the **repo root** (npm workspaces — installing
inside `apps/web/` alone won't link `@suth/domain`). Use an absolute
`cd`, not a relative `cd ..`, if you're chaining it with other commands
in one call — a relative `cd` here has landed the next command in the
wrong directory in this session:

```bash
cd /path/to/suth-helpdesk-assets && npm install
```

## Build

Not needed for dev/driving. Verified it still works for a production
smoke check:

```bash
npm run build   # -> dist/, ✓ built in ~1.3s
```

## Run (agent path)

1. Start the dev server in the background and wait for it to actually serve:

```bash
npm run dev &
timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
```

2. Drive it by piping a command script to the driver's stdin:

```bash
node .claude/skills/run-web/driver.mjs <<'EOF'
launch light
nav /login
wait-for h1
screenshot login-light
theme dark
nav /login
wait-for h1
screenshot login-dark
fill input[name=username] tester
fill input[name=password] secret123
click .login__password-toggle
click .login__access summary
wait-for text=ติดต่อฝ่าย
click button[type=submit]
wait-for .login__fields [class*=alert]
screenshot login-after-submit
console --errors
quit
EOF
```

This exact script was run in this session end-to-end against the login
page redesign (AuroraCanvas hero background) — it typed credentials,
toggled password visibility, expanded the help `<details>`, submitted,
and captured the resulting network-error alert. Screenshots land in
`e2e/.driver-shots/<name>.png` (override with `SCREENSHOT_DIR`);
`SUTH_WEB_URL` overrides the base URL (default `http://localhost:5173`,
same env var the Playwright e2e config reads).

If `tmux` **is** available (e.g. a Linux container — not this session,
so this path is unverified), the driver's line-based protocol also
fits the usual `send-keys`/`capture-pane` REPL wrapping other skills in
this repo use: launch it under tmux instead of the heredoc, then
`send-keys` one driver command at a time.

Stop the dev server when done (Windows — no `lsof`; on Linux use
`lsof -ti:5173 -sTCP:LISTEN | xargs -r kill`):

```bash
pid=$(netstat -ano | grep ':5173' | grep LISTENING | awk '{print $NF}' | head -1)
powershell -Command "Stop-Process -Id $pid -Force"
```

### Driver commands

| command | what it does |
|---|---|
| `launch [light\|dark]` | start headless Chromium; optional color-scheme emulation |
| `theme <light\|dark>` | flip color-scheme emulation without relaunching |
| `nav <path>` | goto `<base>/<path>`, `waitUntil: networkidle`; clears the console/request log |
| `wait-for <selector>` | `waitForSelector`, 10s timeout |
| `click <selector>` | real Playwright click (not DOM `.click()` — this app has no overlay-layer issue) |
| `fill <selector> <text...>` | Playwright's fill, not `eval(el.value=...)` — see Gotchas |
| `press <key>` | keyboard press |
| `text [selector]` | print `innerText` (body if no selector) |
| `eval <js>` | evaluate expression in the page, print JSON |
| `screenshot [name]` | full-page PNG -> `e2e/.driver-shots/<name>.png` |
| `console [--errors]` | dump buffered console/pageerror/requestfailed entries since last launch/nav; `--errors` filters to error-ish types only |
| `quit` | close the browser, exit |

## Run (human path)

```bash
npm run dev   # -> http://localhost:5173, Ctrl-C to stop
```

Opens fine standalone — the login page renders and the form works —
but actually logging in needs `apps/api` on :3000 plus a real MySQL DB
(see root `AGENTS.md`); without that, submitting shows the "can't reach
server" alert, which is correct behavior, not a bug.

## Test

```bash
npm run test        # vitest — verified: 12 files, 99 tests, all pass, ~5s
npm run test:e2e    # playwright — most specs need apps/api on :3000 + real MySQL
```

Verified `test:e2e` with the API **not** running: it completes cleanly
in ~3s — `131 skipped, 8 passed`, no hang, no failure. The 8 that pass
don't touch the backend; everything that needs a logged-in session
(including all of `login-wcag.spec.js`, `15 skipped` run alone) skips
per the suite's own header comment rather than failing red. That's
intentional design in this suite, not a gap in this skill.

## Gotchas

- **Readline fires every heredoc line before the first async command
  resolves.** A plain `rl.on('line', async ...)` runs `nav` concurrently
  with `launch`, hitting a null `page`. Fixed in the committed driver by
  chaining every command through one `queue` promise — if you add
  commands, keep using that pattern, not a bare async handler.
- **`rl.close()` fires immediately when heredoc/stdin hits EOF** — before
  the queued commands above have actually run. A naive `close` handler
  that quits right away means a batch script never executes anything.
  The fix: append the quit to the *same* queue instead of racing it.
- **Vue's `v-model` needs real input events.** `eval "el.value = '...'"`
  sets the DOM value but never fires Vue's reactivity — the field looks
  filled but the component's state doesn't change. Use the driver's
  `fill` command (goes through Playwright's real input pipeline), not `eval`.
- **Theme is `prefers-color-scheme`, not a CSS class.** Login/Dashboard's
  `AuroraCanvas` and the `--surface`/`--aurora-*` tokens key off the media
  query, so `context.emulateMedia({ colorScheme })` (the `launch light|dark`
  / `theme` commands) is how you switch themes here — toggling a `dark`
  class on `<html>` does nothing in this app.
- **`console --errors` will always show two `ERR_CONNECTION_REFUSED`
  lines** (`/api/auth/me`, and `/api/auth/login` after a submit) unless
  `apps/api` is also running on :3000. That's the app-shell session
  check and the login POST hitting a server that isn't there — expected
  in a web-only run, not a regression to chase.

## Troubleshooting

- **`Cannot find module 'playwright-core'`**: the driver was run from
  outside the repo tree (Node's module resolution walks up directories
  looking for `node_modules`, and it stops at the filesystem root). Run
  it with cwd inside `apps/web/` (or anywhere under the repo), not a
  copy elsewhere.
- **Driver connects but nothing matches / stale content**: Vite does
  **not** error with `EADDRINUSE` when :5173 is taken — it silently
  tries 5174, 5175, ... and serves from there instead (verified: two
  leftover servers pushed a third to :5175). A driver hardcoded to
  `SUTH_WEB_URL`'s default will then be talking to an old server on a
  different port, not the one you just started. Always kill whatever's
  already listening on :5173 first (see the kill command under Run
  (agent path)) rather than relying on a port-in-use error to tell you —
  `npm run dev &`'s `$!` is only the npm wrapper PID and won't stop the
  Vite process it spawned, so kill by port, not by that PID.
- **`Error [ERR_USE_AFTER_CLOSE]: readline was closed`**: something
  called `rl.prompt()` after stdin's `close` event already tore down
  the interface. The committed driver guards every prompt call through
  `safePrompt()` for exactly this reason — if you're extending the
  driver and hit this again, route new prompt calls through it too.
