const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");
const { inspectState } = require("./inspect-state.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "suth-finish-issue-"));
  t.after(() => {
    const target = fs.realpathSync(directory);
    assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(target).startsWith("suth-finish-issue-"));
    fs.rmSync(target, { recursive: true });
  });
  const cwd = path.join(directory, "worktree");
  const mainCheckout = path.join(directory, "main");
  const remote = path.join(directory, "remote.git");
  fs.mkdirSync(mainCheckout);
  const git = (at, ...args) => execFileSync("git", args, { cwd: at, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(directory, "init", "--bare", remote);
  git(mainCheckout, "init", "-b", "main");
  git(mainCheckout, "config", "user.name", "Fixture");
  git(mainCheckout, "config", "user.email", "fixture@example.invalid");
  git(mainCheckout, "config", "commit.gpgsign", "false");
  const hooks = path.join(directory, "empty-hooks");
  fs.mkdirSync(hooks);
  git(mainCheckout, "config", "core.hooksPath", hooks);
  fs.writeFileSync(path.join(mainCheckout, "source.txt"), "base\n");
  git(mainCheckout, "add", "source.txt");
  git(mainCheckout, "commit", "-m", "base");
  const base = git(mainCheckout, "rev-parse", "HEAD");
  git(mainCheckout, "remote", "add", "origin", remote);
  git(mainCheckout, "push", "origin", "main");
  git(mainCheckout, "worktree", "add", "-b", "codex/fixture", cwd);
  fs.writeFileSync(path.join(cwd, "source.txt"), "feature\n");
  git(cwd, "commit", "-am", "feature");
  const candidate = git(cwd, "rev-parse", "HEAD");
  git(cwd, "push", "origin", "codex/fixture");
  const pr = { state: "OPEN", headRefName: "codex/fixture", headRefOid: candidate, baseRefName: "main", mergeCommit: null, closingIssuesReferences: [{ number: 48, url: "https://github.com/example/assets/issues/48" }] };
  const issue = { state: "OPEN" };
  // Only GitHub observation is mocked. All Git state and report files are real.
  const run = (program, args, options) => {
    if (program === "gh") return JSON.stringify(args[0] === "pr" ? pr : issue);
    // Map the expected GitHub remote identity to this fixture's local bare remote.
    if (args[0] === "remote" && args[1] === "get-url") return "https://github.com/example/assets.git\n";
    return execFileSync(program, args, options);
  };
  const report = path.join(directory, "checks.json");
  fs.writeFileSync(report, JSON.stringify({ stats: { expected: 4, unexpected: 0, flaky: 0, skipped: 0 }, errors: [], suites: [] }));
  const reviewReport = path.join(directory, "review.md");
  fs.writeFileSync(reviewReport, "Independent fixture review artifact\n");
  const reviewCandidateReport = path.join(directory, "review-candidate.json");
  fs.writeFileSync(reviewCandidateReport, JSON.stringify({ base, mergeBase: base, candidate, changedFiles: ["source.txt"], diffCommand: `git diff --ignore-submodules=none ${base} ${candidate} --` }));
  let receiptPath = path.join(directory, "receipt.json");
  const receipt = { issue: 48, pr: 50, candidate, reviewCandidateReport, reviewRounds: 1, checks: [{ name: "fixture", command: "fixture command", format: "playwright", report, candidate }], reviews: ["standards", "spec", "security"].map((axis) => ({ axis, candidate, verdict: "pass", report: reviewReport })) };
  const inspect = (from = cwd, runner = run) => {
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));
    return inspectState({ cwd: from, mainCheckout, repository: "example/assets", issue: 48, pr: 50, branch: "codex/fixture", receiptPath, run: runner });
  };
  const merge = () => {
    git(mainCheckout, "merge", "--squash", "codex/fixture");
    git(mainCheckout, "commit", "-m", "squash merge");
    git(mainCheckout, "push", "origin", "main");
    pr.state = "MERGED";
    pr.mergeCommit = { oid: git(mainCheckout, "rev-parse", "HEAD") };
    issue.state = "CLOSED";
  };
  const preserve = () => {
    const checkpoint = inspect().checkpointPath;
    fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
    fs.writeFileSync(checkpoint, "Fixture checkpoint: issue 48, pr 50, codex/fixture\n");
    const durableReport = path.join(path.dirname(checkpoint), "checks.json");
    const durableReview = path.join(path.dirname(checkpoint), "review.md");
    fs.copyFileSync(report, durableReport);
    fs.copyFileSync(reviewReport, durableReview);
    const durableCandidateReport = path.join(path.dirname(checkpoint), "review-candidate.json");
    fs.copyFileSync(reviewCandidateReport, durableCandidateReport);
    receipt.reviewCandidateReport = durableCandidateReport;
    receipt.checks[0].report = durableReport;
    receipt.reviews.forEach((review) => { review.report = durableReview; });
    receiptPath = path.join(path.dirname(checkpoint), "receipt.json");
    inspect();
    return checkpoint;
  };
  return { directory, cwd, mainCheckout, candidate, git, pr, issue, receipt, report, inspect, merge, preserve, run, get receiptPath() { return receiptPath; } };
}

test("open published candidate with current checks/reviews waits for merge", (t) => {
  const f = fixture(t);
  const result = f.inspect();
  assert.equal(result.phase, "await-merge");
  assert.equal(result.grantsAuthority, false);
  assert.deepEqual(result.checks[0].counts, { passed: 4, failed: 0, flaky: 0, skipped: 0 });
  assert.equal(result.reviewIdentity.candidate, f.candidate);
  assert.ok(result.reviewIdentity.base);
});

test("changed candidate cannot inherit old verdict", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.cwd, "source.txt"), "changed candidate\n");
  f.git(f.cwd, "commit", "-am", "new candidate");
  const result = f.inspect();
  assert.equal(result.phase, "verify-review");
  assert.ok(result.reasons.includes("CANDIDATE_CHANGED"));
});

test("dirty target or main checkout preserves work", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.mainCheckout, "user-work.txt"), "keep me");
  assert.equal(f.inspect().phase, "blocked");
  assert.equal(fs.readFileSync(path.join(f.mainCheckout, "user-work.txt"), "utf8"), "keep me");
});

test("merged work routes to evidence preservation, never implementation", (t) => {
  const f = fixture(t);
  f.merge();
  const result = f.inspect();
  assert.equal(result.phase, "preserve-evidence");
  assert.equal(result.mergeOnMain, true);
  assert.equal(result.prMergeCommit, f.pr.mergeCommit.oid);
  assert.notEqual(f.git(f.mainCheckout, "rev-parse", "HEAD"), f.candidate);
  assert.ok(result.checkpointPath.startsWith(path.join(f.mainCheckout, ".git")));
});

test("durable checkpoint survives worktree removal and partial remote cleanup", (t) => {
  const f = fixture(t);
  f.merge();
  const checkpoint = f.preserve();
  assert.equal(f.inspect().phase, "cleanup-preflight");
  f.git(f.mainCheckout, "worktree", "remove", f.cwd);
  const observed = inspectState({ cwd: f.mainCheckout, mainCheckout: f.mainCheckout, repository: "example/assets", issue: 48, pr: 50, branch: "codex/fixture", receiptPath: f.receiptPath, run: (program, args, options) => {
    if (program === "gh") return JSON.stringify(args[0] === "pr" ? f.pr : f.issue);
    if (args[0] === "remote" && args[1] === "get-url") return "https://github.com/example/assets.git\n";
    return execFileSync(program, args, options);
  } });
  assert.equal(observed.phase, "cleanup-preflight");
  assert.equal(observed.remoteBranch, f.candidate);
  assert.equal(observed.localBranch, f.candidate);
  assert.ok(fs.existsSync(checkpoint));
});

test("skipped or failed checks remain visible and are not passes", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.report, JSON.stringify({ stats: { expected: 3, unexpected: 0, flaky: 0, skipped: 1 }, errors: [], suites: [] }));
  const result = f.inspect();
  assert.equal(result.phase, "verify-review");
  assert.equal(result.checks[0].counts.skipped, 1);
  assert.equal(result.checks[0].passed, false);
});

test("missing report does not become success", (t) => {
  const f = fixture(t);
  f.receipt.checks[0].report = path.join(f.directory, "missing.json");
  const result = f.inspect();
  assert.equal(result.phase, "verify-review");
  assert.equal(result.checks[0].passed, false);
});

test("round two with unresolved blocking review stops", (t) => {
  const f = fixture(t);
  f.receipt.reviewRounds = 2;
  f.receipt.reviews[0].verdict = "blocked";
  assert.equal(f.inspect().phase, "blocked");
});

test("wrong issue linkage is blocked before cleanup", (t) => {
  const f = fixture(t);
  f.merge();
  f.pr.closingIssuesReferences = [{ number: 99, url: "https://github.com/example/assets/issues/99" }];
  assert.equal(f.inspect().phase, "blocked");
});

test("closed unmerged PR does not enter cleanup", (t) => {
  const f = fixture(t);
  f.pr.state = "CLOSED";
  assert.equal(f.inspect().phase, "blocked");
});

test("new commits on target branch after merge are preserved", (t) => {
  const f = fixture(t);
  f.merge();
  f.preserve();
  fs.writeFileSync(path.join(f.cwd, "source.txt"), "new work\n");
  f.git(f.cwd, "commit", "-am", "new work");
  assert.equal(f.inspect().phase, "blocked");
});

test("merged issue still open routes to post-merge inspection", (t) => {
  const f = fixture(t);
  f.merge();
  f.issue.state = "OPEN";
  assert.equal(f.inspect().phase, "post-merge");
});

test("malformed receipt fails closed", (t) => {
  const f = fixture(t);
  f.receipt.checks = "not a check list";
  assert.throws(f.inspect, /receipt/i);
});

test("main-based resume also detects dirty feature worktree", (t) => {
  const f = fixture(t);
  f.merge();
  f.preserve();
  fs.writeFileSync(path.join(f.cwd, "unfinished.txt"), "keep existing work");
  assert.equal(f.inspect(f.mainCheckout).phase, "blocked");
});

test("remote observation failure never becomes branch absence", (t) => {
  const f = fixture(t);
  f.merge();
  const checkpoint = f.preserve();
  assert.throws(() => f.inspect(f.cwd, (program, args, options) => {
    if (program === "git" && args[0] === "ls-remote") throw Object.assign(new Error("fixture network failure"), { status: 128 });
    return f.run(program, args, options);
  }), /no absence or success inferred/);
  assert.ok(fs.existsSync(checkpoint));
  assert.equal(f.git(f.cwd, "rev-parse", "refs/heads/codex/fixture"), f.candidate);
});

test("remote deletion done but local ref remains resumes only remaining cleanup", (t) => {
  const f = fixture(t);
  f.merge();
  f.preserve();
  f.git(f.mainCheckout, "push", "origin", "--delete", "codex/fixture");
  const result = f.inspect();
  assert.equal(result.phase, "cleanup-preflight");
  assert.equal(result.remoteBranch, null);
  assert.equal(result.localBranch, f.candidate);
});

test("absent feature refs give final audit hint, never DONE", (t) => {
  const f = fixture(t);
  f.merge();
  const checkpoint = f.preserve();
  f.git(f.mainCheckout, "worktree", "remove", f.cwd);
  f.git(f.mainCheckout, "push", "origin", "--delete", "codex/fixture");
  f.git(f.mainCheckout, "branch", "-D", "codex/fixture");
  const result = f.inspect(f.mainCheckout);
  assert.equal(result.phase, "final-audit");
  assert.equal(result.grantsAuthority, false);
  assert.deepEqual(result.targetWorktrees, []);
  assert.ok(fs.existsSync(checkpoint));
});

test("receipt in an ignored worktree path is not durable", (t) => {
  const f = fixture(t);
  f.merge();
  const checkpoint = f.inspect().checkpointPath;
  fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
  fs.writeFileSync(checkpoint, "checkpoint copy exists but reports are still outside recovery directory\n");
  assert.equal(f.inspect().phase, "preserve-evidence");
});

test("TAP summary comes from the actual report, with skipped cases separate", (t) => {
  const f = fixture(t);
  f.receipt.checks[0].format = "tap";
  fs.writeFileSync(f.report, "TAP version 13\n# tests 3\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n");
  const result = f.inspect();
  assert.equal(result.phase, "verify-review");
  assert.equal(result.checks[0].counts.passed, 2);
  assert.equal(result.checks[0].counts.skipped, 1);
});

for (const field of ["unexpected", "flaky"]) {
  test(`Playwright ${field} cases block despite positive expected count`, (t) => {
    const f = fixture(t);
    const stats = { expected: 4, unexpected: 0, flaky: 0, skipped: 0 };
    stats[field] = 1;
    fs.writeFileSync(f.report, JSON.stringify({ stats, errors: [], suites: [] }));
    assert.equal(f.inspect().checks[0].passed, false);
  });
}

test("runner errors and malformed summary cannot pass", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.report, JSON.stringify({ stats: { expected: 4, unexpected: 0, flaky: 0, skipped: 0 }, errors: [{ message: "runner failed" }], suites: [] }));
  assert.equal(f.inspect().checks[0].passed, false);
  fs.writeFileSync(f.report, JSON.stringify({ stats: { expected: 4, skipped: 0 }, errors: [], suites: [] }));
  assert.equal(f.inspect().checks[0].passed, false);
});

test("review round limit exceeded blocks even when every verdict says pass", (t) => {
  const f = fixture(t);
  f.receipt.reviewRounds = 3;
  const result = f.inspect();
  assert.equal(result.phase, "blocked");
  assert.ok(result.reasons.includes("REVIEW_LIMIT_EXCEEDED"));
});

test("mechanical checks never certify ownership or complete required coverage", (t) => {
  const f = fixture(t);
  f.merge();
  f.preserve();
  const result = f.inspect();
  assert.equal(result.phase, "cleanup-preflight");
  assert.ok(result.pendingChecks.includes("task ownership and exact attachment identity"));
  assert.ok(result.pendingChecks.includes("required-check coverage against acceptance matrix"));
  assert.equal(result.grantsAuthority, false);
});

test("parse errors do not echo the contents of malformed report files", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.report, "SECRET_SENTINEL_NEVER_ECHO");
  const result = f.inspect();
  assert.equal(result.checks[0].passed, false);
  assert.ok(!JSON.stringify(result).includes("SECRET_SENTINEL_NEVER_ECHO"));
});
