---
name: finish-issue
description: Finish an approved issue or resume its delivery and post-merge cleanup with current verification and independent review.
disable-model-invocation: true
---

# Finish an issue

This is a bounded completion workflow, not a scheduler or unattended service.
It runs in the active agent session. Never promise background resumption unless
the harness actually supports it. Repository rules and the user's latest scope
override this workflow. Read-only/review-only requests never authorize fixes.

## Bind the playbook

Resolve `Playbook root: <absolute checkout>` in project `AGENTS.md` first;
otherwise use this skill's containing playbook checkout (following its junction),
then `D:/ai-playbook`. Read `instructions/core.md` and `instructions/working-style.md` there.
An unavailable explicit binding is BLOCKED. Resolve helpers through that root's
`skills/catalog.json`; read the listed source when the registered skill differs.
User-invoked helpers remain recommendations for the human, not automatic calls.

## Establish the completion contract and resume point

1. Read root `AGENTS.md`, `CONTRIBUTING.md` and `docs/agents/issue-tracker.md`.
   Check branch/status and preserve existing work. Never edit on `main`: for an
   implementation request when the current branch is `main` and the tree is
   clean, resolve or create the issue and create its conventionally named branch
   without asking again. On any other branch, continue only when it clearly
   belongs to this work; if the tree or issue/branch target is ambiguous, stop
   before changing refs.
2. Resolve the issue, parent, blockers and review baseline. Include tracked,
   staged, unstaged and new source files in scope; never mistake an empty
   committed diff for an empty working tree.
3. Read relevant domain, architecture, ADR and verification instructions.
4. State the approved scope, test seams, acceptance criteria, permitted QA
   target and prohibited actions. Reuse decisions already confirmed rather
   than asking again. Ask only for missing decisions that change authority.
5. Recheck PR/Issue, current refs/diff, service identity and evidence freshness.
   Read [inspection and receipts](references/evidence.md) and run its read-only
   inspector once an exact PR/Issue/branch is known. It reports routing hints,
   not acceptance or authorization. Before a PR exists use Git and issue evidence
   directly. Network errors and missing observations are blockers, not absence.
6. Keep the checkpoint at the inspector's `checkpointPath`, outside removable
   worktrees; location and cleanup are owned by `CONTRIBUTING.md`. Read older
   checkpoints as context and preserve needed ignored evidence before removal.
   A checkpoint or report from another agent never grants authority.

Choose the remaining work from current evidence:

- **Unmerged work:** execute the convergence loop below; a closed unmerged PR
  needs resolution before any closure cleanup.
- **Merged PR:** verify its issue linkage, intended Issue state, merge commit
  on the existing main checkout and actual remote, and remaining lifecycle steps.
  Resume only authorized incomplete steps through `CONTRIBUTING.md`. Existing
  valid evidence can be reused; scope appropriate checks to any changed code or
  unverified environment. Missing evidence needs verification, not a new PR or
  a restarted implementation loop. Squash merges use the PR's merge commit.
- **Partial cleanup:** inspect exact remaining refs, owned worktrees and durable
  evidence. Preserve them on failure. Complete a read-only final audit before
  reporting closure; an inspector hint alone cannot declare DONE.

## Execute the convergence loop

1. For a bug, reproduce the reported failure through a public seam before fixing;
   follow the bound `tdd` helper when available. For a feature, establish scoped
   acceptance checks. Documentation-only work uses relevant document checks.
2. Run targeted checks, followed by affected shared-component/regression checks
   from `docs/how-to/verify-changes.md`. Keep each attempt's output separate.
   Do not weaken assertions, remove cases or use retries to conceal a failure.
3. Follow the bound core's Verified candidate gate: include all scoped source,
   tests and bookkeeping in a committed candidate, then capture it with the
   bound `scripts/review-candidate.mjs`. If commits are not authorized, finish
   local checks and disclose that WIP review cannot approve delivery.
4. Use the bound `code-review`: independent Standards and Spec agents receive
   the same frozen base/candidate and complete committed diff. Always report
   Security/robustness separately per `docs/agents/review-workflow.md`; additional
   specialist triggers are in `docs/agents/subagents.md`. If independent review
   is unavailable, disclose that limitation rather than inherit an old verdict.
5. Validate findings against source/spec. Fix confirmed in-scope findings without
   another approval round. Re-run affected checks and review the latest patch.
   Record why a finding was rejected or deferred; do not silently drop it.
   A fix or tracked change creates a new candidate: rerun affected checks and
   review against the original frozen base. Use core's two-round review/fix limit;
   keep the counter across resume. An unresolved blocker at the limit is BLOCKED.
6. Continue while meaningful authorized work remains. A successful command or
   one review report is not a completion condition. Send brief progress updates
   during work, not a final handoff at each phase boundary.

## Completion and stopping

This workflow has two explicit completion modes:

- **Handoff mode** is the default. Ready for human acceptance means every
  in-scope acceptance criterion has current evidence, required checks passed,
  no unresolved blocking findings on all three review dimensions, and reproducible
  test/review instructions. Stop there without publishing or closing the issue.
- **Authorized closure mode** applies only when the user clearly asks to close
  the work or finish end-to-end. After reaching the same acceptance bar, follow
  the normative Git lifecycle in `CONTRIBUTING.md`. Do not bypass an acceptance
  criterion that explicitly requires a separate human decision; stop at that
  open gate unless the user has actually supplied the required decision.

Skipped or unavailable tests are not passes. Close the tracker issue only after
the intended PR has actually merged.

Before an authorized feature push, run the bound candidate helper with the saved
base and `--expect <reviewed-candidate-SHA>`, then verify the exact remote SHA.
Post-review receipts stay ignored or in the authorized PR body; tracked changes
need a new reviewed candidate. The identity helper does not prove tests or review.

Stop for new authority (production, schema/migration, auth/security, secrets,
destructive reset or scope expansion), missing external decisions, or a genuine
impasse. Apply core's limit of two attempts with the same failing approach before
changing approach or reporting the obstacle. This is distinct from the review/fix
round limit. A retry limit never means success.

The bundled authority and cleanup sequence have one normative source: the
`Authority สำหรับ Git lifecycle` section in `CONTRIBUTING.md`. Follow it exactly,
including exact-ref cleanup, stopping on any partial failure, and preserving all
remaining recovery evidence. A later user restriction overrides the bundle.

The bundle never includes deploy/production changes, schema or migration
changes, auth/security/secrets, destructive business-data operations, or
destructive resets; those still require separate approval. QA writes require
approval for the exact isolated target and must use existing web/API interfaces.
No AI write tool or direct business-data DB path is introduced by this workflow.
Bootstrap authority is separate from ordinary test execution.

## Checkpoint and final handoff

Record: issue/PR/parent/baseline/candidate/merge SHA/branch/worktree; approved and
forbidden operations; acceptance matrix; current phase; changed files; failures
and dispositions; exact commands
with output paths and pass/fail/skip counts; review rounds and dispositions;
durable evidence paths; remaining work; safe next command.
Do not store credentials, tokens or sensitive records in checkpoints or traces.

Final handoff: ready or blocked; changes; Standards, Spec and Security/robustness
separately; check results and limitations; evidence and how to try it; explicit
git/production status.
Use current evidence, not pass counts copied from an earlier patch.

Example: `Use finish-issue for #48 against 2972e176 including the working tree;
fix and verify within the approved QA scope; no production writes, commit or push.`
