---
name: finish-issue
description: Drives an approved issue through implementation, regression and Standards/Spec review until ready for human acceptance. Use when explicitly asked to finish an issue end-to-end or resume its completion loop.
disable-model-invocation: true
---

# Finish an issue

This is a bounded completion workflow, not a scheduler or unattended service.
It runs in the active agent session. Never promise background resumption unless
the harness actually supports it. Repository rules and the user's latest scope
override this workflow. Read-only/review-only requests never authorize fixes.

## Establish the completion contract

1. Read root `AGENTS.md`, `CONTRIBUTING.md` and `docs/agents/issue-tracker.md`.
   Check branch/status; stop on main. Preserve existing work.
2. Resolve the issue, parent, blockers and review baseline. Include tracked,
   staged, unstaged and new source files in scope; never mistake an empty
   committed diff for an empty working tree.
3. Read relevant domain, architecture, ADR and verification instructions.
4. State the approved scope, test seams, acceptance criteria, permitted QA
   target and prohibited actions. Reuse decisions already confirmed rather
   than asking again. Ask only for missing decisions that change authority.
5. Keep a checkpoint at `output/finish-issue/<number>/checkpoint.md` using the
   structure below. It is an ignored local record, never an authority source.
   On resume recheck branch, current diff, service identity and evidence freshness.

## Execute the convergence loop

1. Reproduce one scoped failure through an agreed public seam. Follow `tdd`
   if available: failing regression first, smallest fix next, then green.
2. Run targeted checks, followed by affected shared-component/regression checks
   from `docs/how-to/verify-changes.md`. Keep each attempt's output separate.
   Do not weaken assertions, remove cases or use retries to conceal a failure.
3. Invoke `code-review` when available: independent Standards and Spec agents
   review the pinned baseline plus the entire working-tree/new-file diff.
   If unavailable, review each axis separately and disclose the lack of independence.
4. Validate findings against source/spec. Fix confirmed in-scope findings without
   another approval round. Re-run affected checks and review the latest patch.
   Record why a finding was rejected or deferred; do not silently drop it.
5. Continue while meaningful authorized work remains. A successful command or
   one review report is not a completion condition. Send brief progress updates
   during work, not a final handoff at each phase boundary.

## Completion and stopping

Ready for human acceptance means every in-scope acceptance criterion has current
evidence, required checks passed, no unresolved blocking Standards/Spec findings,
and reproducible test/review instructions. Skipped or unavailable tests are not
passes. Explicit human gates remain open; do not close tracker issues by default.

Stop for new authority (production, schema/migration, auth/security, secrets,
destructive reset or scope expansion), missing external decisions, or a genuine
impasse. After three attempts with the same failure and no new evidence, stop
blind retries, diagnose safe alternatives and report the consolidated blocker
if none remains. A retry limit never means success.

Never commit, push, merge, deploy, delete a branch or modify production without
an explicit separate instruction. QA writes require approval for the exact
isolated target and must use existing web/API interfaces. No AI write tool or
direct business-data DB path is introduced by this workflow. Bootstrap authority
is separate from ordinary test execution.

## Checkpoint and final handoff

Record: issue/parent/baseline/branch; approved and forbidden operations; acceptance
matrix; current phase; changed files; failures and dispositions; exact commands
with output paths and pass/fail/skip counts; remaining work; safe next command.
Do not store credentials, tokens or sensitive records in checkpoints or traces.

Final handoff: ready or blocked; changes; Standards and Spec separately; check
results and limitations; evidence and how to try it; explicit git/production status.
Use current evidence, not pass counts copied from an earlier patch.

Example: `Use finish-issue for #48 against 2972e176 including the working tree;
fix and verify within the approved QA scope; no production writes, commit or push.`
