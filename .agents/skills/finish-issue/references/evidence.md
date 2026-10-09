# Inspect current state and evidence

Run from the task-owned checkout, using explicit targets:

```powershell
node .agents/skills/finish-issue/scripts/inspect-state.cjs --repo saritrungj/suth-helpdesk-assets --issue 48 --pr 50 --branch codex/48-example --main-checkout D:/suth-helpdesk-assets --receipt <receipt-path>
```

The inspector uses only Git reads, `git ls-remote` and `gh pr/issue view`. It
does not fetch, update refs, write reports, alter business data or grant authority.
It needs Git, authenticated gh and network access; `--help` lists options.
After removing a worktree run it from the existing main checkout. Never switch a
checkout used by another session. Dirty/foreign targets and observation failures
block inspection. Confirm task ownership from the current session independently.

Its `checkpointPath` follows CONTRIBUTING's recovery location. Before removing a
worktree copy needed evidence there, rewrite receipt paths to the preserved files,
and verify the copies. Keep older records until the durable replacement is checked.

## Receipt

Create `receipt.json` beside the durable checkpoint once evidence is available.
Fields below record facts, not approval. Relative report paths resolve beside the
receipt; use the actual full candidate SHA. Obtain pass/fail/skip counts from runner
reports, never a manually added total. This example's placeholders must be replaced.

```json
{
  "issue": 48,
  "pr": 50,
  "candidate": "<full-reviewed-SHA>",
  "reviewCandidateReport": "review-candidate.json",
  "reviewRounds": 1,
  "checks": [
    {
      "name": "Affected behavior",
      "command": "<exact-command>",
      "format": "playwright",
      "report": "checks.json",
      "candidate": "<full-reviewed-SHA>"
    }
  ],
  "reviews": [
    { "axis": "standards", "candidate": "<full-reviewed-SHA>", "verdict": "pass", "report": "standards.md" },
    { "axis": "spec", "candidate": "<full-reviewed-SHA>", "verdict": "pass", "report": "spec.md" },
    { "axis": "security", "candidate": "<full-reviewed-SHA>", "verdict": "pass", "report": "security.md" }
  ]
}
```

`reviewCandidateReport` points to the JSON captured by the bound playbook's
`scripts/review-candidate.mjs`, not a hand-written substitute. Preserve that file
alongside reports. The inspector returns its frozen base/mergeBase/candidate/diff
identity and the PR's head/merge SHA so the original reviewed diff remains visible.

Checks support Playwright JSON (using the repo's coverage checker plus failure,
flaky and runner-error checks) and node:test TAP (`format: "tap"`). Unsupported
runners need direct manual verification; the inspector cannot certify their output.
List every required supported check; match this list against the acceptance matrix
and verification plan. A receipt can omit a requirement, so it cannot certify
coverage or human acceptance. Review metadata and nonempty artifacts still need
independent content review; their presence alone cannot authenticate a verdict.

## Routing hints

| Phase | Remaining work |
|---|---|
| `blocked` | Resolve mismatch, dirty/foreign work, unavailable observations or exhausted blocking review; preserve recovery evidence |
| `verify-review` | Current unmerged candidate needs evidence or independent review |
| `handoff` / `await-merge` | Locally evidenced candidate / matching published candidate; apply current authorization and human gates |
| `post-merge` | Inspect Issue state or missing/stale evidence; continue verification without reopening implementation |
| `update-main` | Inspect/fetch and fast-forward the existing main checkout under CONTRIBUTING; investigate divergence |
| `preserve-evidence` | Preserve checkpoint, receipt and required reports under the recovery directory |
| `cleanup-preflight` | Refs and listed reports passed mechanical checks; ownership/attachment, full required-check coverage, human gates and artifact/completion-record audits remain mandatory before authorized cleanup |
| `final-audit` | Exact local/remote feature refs are absent; still check worktree attachment, artifacts, tracking refs, checkpoint and durable completion record |

Only `blocked` or an observation error sets CLI exit status 1. Status 0 means
inspection ran, not completion. `grantsAuthority` is always false. No phase says
DONE: acceptance, authority, all required checks and final lifecycle audit remain
the agent's responsibility. The helper's branch comparison protects commits added
after merge, and ancestry uses the PR merge commit so squash merges are supported.

## Regression and forward checks

Run `npm run test:finish-issue`. Tests use temporary Git repositories and local
bare remotes, real worktrees/reports, and mocked GitHub observations. They cannot
prove live GitHub permissions, Codex archive behavior, or actual model compliance.
For a substantive skill change also run an independent read-only forward test with
synthetic raw snapshots and realistic requests, recording proposed actions without
executing publication or cleanup. Keep evaluation traces ignored. A comparison of
old/new decisions is evidence for those scenarios, not a general success rate.
