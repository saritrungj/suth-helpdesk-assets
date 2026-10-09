// Read-only observations and routing hints. This does not approve work or execute cleanup.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { assertRequiredCoverage } = require("../../../../scripts/playwright-report.cjs");

const isSha = (value) => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const inside = (parent, file) => {
  const relative = path.relative(parent, file);
  return relative !== "" && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
};

function readArtifact(file) {
  const actual = fs.realpathSync(file);
  if (!fs.statSync(actual).isFile()) throw new Error("Evidence is not a file.");
  const content = fs.readFileSync(actual, "utf8");
  if (!content.trim()) throw new Error("Evidence file is empty.");
  return { path: actual, content };
}

function parseJson(content, label) {
  try { return JSON.parse(content); }
  catch { throw new Error(`${label} is not valid JSON.`); }
}

function checkReceipt(receiptPath, target, candidate) {
  const reasons = [];
  const checks = [];
  const evidencePaths = [];
  if (!receiptPath || !fs.existsSync(receiptPath)) return { reasons: ["RECEIPT_MISSING"], checks, evidencePaths };
  const artifact = readArtifact(receiptPath);
  const receipt = parseJson(artifact.content, "Receipt");
  evidencePaths.push(artifact.path);
  if (receipt.issue !== target.issue || receipt.pr !== target.pr) throw new Error("Receipt identifies a different issue or PR.");
  if (!isSha(receipt.candidate) || !Array.isArray(receipt.checks) || !Array.isArray(receipt.reviews) || !Number.isInteger(receipt.reviewRounds) || receipt.reviewRounds < 1) {
    throw new Error("Invalid receipt structure.");
  }
  if (receipt.candidate !== candidate) reasons.push("CANDIDATE_CHANGED");
  if (typeof receipt.reviewCandidateReport !== "string" || !receipt.reviewCandidateReport) throw new Error("Receipt review-candidate capture missing.");
  const captured = readArtifact(path.resolve(path.dirname(artifact.path), receipt.reviewCandidateReport));
  const identity = parseJson(captured.content, "Review-candidate capture");
  if (!isSha(identity.base) || !isSha(identity.mergeBase) || identity.candidate !== receipt.candidate || !Array.isArray(identity.changedFiles) || !identity.changedFiles.length || !identity.changedFiles.every((file) => typeof file === "string" && file.length > 0) || identity.diffCommand !== `git diff --ignore-submodules=none ${identity.mergeBase} ${identity.candidate} --`) throw new Error("Invalid receipt review-candidate capture.");
  const reviewIdentity = { base: identity.base, mergeBase: identity.mergeBase, candidate: identity.candidate, changedFiles: identity.changedFiles, diffCommand: identity.diffCommand };
  evidencePaths.push(captured.path);
  if (receipt.reviewRounds > 2) reasons.push("REVIEW_LIMIT_EXCEEDED");
  if (!receipt.checks.length) reasons.push("CHECKS_MISSING");
  const filePath = (file) => {
    if (typeof file !== "string" || !file) throw new Error("Receipt artifact path missing.");
    return path.resolve(path.dirname(artifact.path), file);
  };
  for (const check of receipt.checks) {
    const result = { name: check?.name, passed: false };
    try {
      if (!check || typeof check.name !== "string" || typeof check.command !== "string" || !check.command.trim() || check.candidate !== candidate) throw new Error("Check identity missing or stale.");
      const report = readArtifact(filePath(check.report));
      evidencePaths.push(report.path);
      if (check.format === "playwright") {
        const json = parseJson(report.content, "Playwright report");
        const stats = json.stats;
        if (!stats || !["expected", "unexpected", "flaky", "skipped"].every((key) => Number.isInteger(stats[key]) && stats[key] >= 0) || !Array.isArray(json.errors)) throw new Error("Invalid Playwright report.");
        result.counts = { passed: stats.expected, failed: stats.unexpected, flaky: stats.flaky, skipped: stats.skipped };
        assertRequiredCoverage(json, check.name);
        if (stats.unexpected || stats.flaky || json.errors.length) throw new Error("Failed, flaky or runner-error cases remain.");
      } else if (check.format === "tap") {
        const count = (name) => {
          const matches = [...report.content.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`, "gm"))];
          if (matches.length !== 1) throw new Error("Missing or ambiguous TAP summary.");
          return Number(matches[0][1]);
        };
        const total = count("tests");
        result.counts = { passed: count("pass"), failed: count("fail"), skipped: count("skipped"), cancelled: count("cancelled"), todo: count("todo") };
        if (total < 1 || Object.values(result.counts).reduce((sum, value) => sum + value, 0) !== total || result.counts.passed !== total) throw new Error("TAP checks did not all pass.");
      } else {
        throw new Error("Unsupported report format; use manual verification for this runner.");
      }
      result.passed = true;
    } catch (error) {
      result.error = error.message;
      reasons.push("CHECK_NOT_PASSED");
    }
    checks.push(result);
  }
  for (const axis of ["standards", "spec", "security"]) {
    const matching = receipt.reviews.filter((review) => review?.axis === axis);
    try {
      if (matching.length !== 1 || matching[0].candidate !== candidate || matching[0].verdict !== "pass") throw new Error("Review missing, stale, ambiguous or blocking.");
      evidencePaths.push(readArtifact(filePath(matching[0].report)).path);
    } catch {
      reasons.push(`REVIEW_${axis.toUpperCase()}_NOT_PASSED`);
    }
  }
  const reviewIncomplete = reasons.some((reason) => reason.startsWith("REVIEW_") || reason === "CANDIDATE_CHANGED");
  return { reasons, checks, evidencePaths, reviewIdentity, exhausted: receipt.reviewRounds >= 2 && reviewIncomplete };
}

function inspectState({ cwd = process.cwd(), mainCheckout, repository, issue, pr, branch, receiptPath, run = execFileSync }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !Number.isSafeInteger(issue) || issue < 1 || !Number.isSafeInteger(pr) || pr < 1 || typeof branch !== "string" || branch === "main") throw new Error("Explicit repository, positive issue/PR numbers and feature branch required.");
  if (!mainCheckout) throw new Error("Explicit main checkout required.");
  const invoke = (program, args, at = cwd) => {
    try { return String(run(program, args, { cwd: at, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim(); }
    catch (error) { throw new Error(`${program} ${args[0]} observation failed (exit ${error.status ?? "unknown"}); no absence or success inferred.`); }
  };
  const git = (...args) => invoke("git", args);
  git("check-ref-format", `refs/heads/${branch}`);
  const commonDirectory = fs.realpathSync(git("rev-parse", "--path-format=absolute", "--git-common-dir"));
  const mainCommon = fs.realpathSync(invoke("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], mainCheckout));
  if (commonDirectory !== mainCommon || invoke("git", ["branch", "--show-current"], mainCheckout) !== "main") throw new Error("Main checkout belongs to another repository or branch.");
  const remoteUrl = git("remote", "get-url", "origin");
  const remoteRepository = remoteUrl.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1];
  if (remoteRepository?.toLowerCase() !== repository.toLowerCase()) throw new Error("Origin does not match the explicit GitHub repository.");
  const prState = parseJson(invoke("gh", ["pr", "view", String(pr), "--repo", repository, "--json", "state,headRefName,headRefOid,baseRefName,mergeCommit,closingIssuesReferences"]), "PR observation");
  const issueState = parseJson(invoke("gh", ["issue", "view", String(issue), "--repo", repository, "--json", "state"]), "Issue observation");
  if (!["OPEN", "CLOSED", "MERGED"].includes(prState.state) || !["OPEN", "CLOSED"].includes(issueState.state) || !isSha(prState.headRefOid) || !Array.isArray(prState.closingIssuesReferences)) throw new Error("Incomplete GitHub observations.");
  const checkpointPath = path.join(commonDirectory, "finish-issue", String(issue), encodeURIComponent(branch), "checkpoint.md");
  const recoveryDirectory = path.dirname(checkpointPath);
  const localRef = (ref) => {
    const rows = git("for-each-ref", "--format=%(refname) %(objectname)", ref).split("\n");
    return rows.find((row) => row.startsWith(`${ref} `))?.slice(ref.length + 1) || null;
  };
  const remoteRefs = new Map(git("ls-remote", "--heads", "origin", "refs/heads/main", `refs/heads/${branch}`).split("\n").filter(Boolean).map((line) => {
    const [sha, ref] = line.split(/\s+/);
    if (!isSha(sha) || !ref) throw new Error("Invalid remote ref observation.");
    return [ref, sha];
  }));
  const remoteMain = remoteRefs.get("refs/heads/main");
  if (!remoteMain) throw new Error("Remote main missing; cleanup cannot be assessed.");
  const currentBranch = git("branch", "--show-current");
  const head = git("rev-parse", "HEAD");
  const localBranch = localRef(`refs/heads/${branch}`);
  const remoteBranch = remoteRefs.get(`refs/heads/${branch}`) || null;
  const mainHead = invoke("git", ["rev-parse", "HEAD"], mainCheckout);
  const status = git("status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none");
  const mainStatus = invoke("git", ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"], mainCheckout);
  const targetWorktrees = git("worktree", "list", "--porcelain", "-z").split("\0\0").filter(Boolean).map((record) => record.split("\0")).filter((fields) => fields.includes(`branch refs/heads/${branch}`)).map((fields) => fields.find((field) => field.startsWith("worktree "))?.slice(9));
  if (targetWorktrees.some((directory) => !directory)) throw new Error("Incomplete worktree observation.");
  const targetDirty = targetWorktrees.some((directory) => invoke("git", ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"], directory));
  const pendingChecks = ["task ownership and exact attachment identity", "required-check coverage against acceptance matrix", "human gates and current authorization", "generated-artifact and durable completion-record audit"];
  const result = { grantsAuthority: false, repository, issue, pr, branch, currentBranch, head, localBranch, remoteBranch, mainHead, remoteMain, targetWorktrees, checkpointPath, prState: prState.state, issueState: issueState.state, prHead: prState.headRefOid || null, prMergeCommit: prState.mergeCommit?.oid || null, reviewIdentity: null, phase: "blocked", reasons: [], checks: [], pendingChecks };
  const issueUrl = `https://github.com/${repository}/issues/${issue}`.toLowerCase();
  if (prState.headRefName !== branch || prState.baseRefName !== "main" || !prState.closingIssuesReferences.some((item) => item.number === issue && item.url?.toLowerCase() === issueUrl)) result.reasons.push("TARGET_MISMATCH");
  if (status || mainStatus || targetDirty) result.reasons.push("DIRTY_WORKTREE");
  if (currentBranch !== branch && !(prState.state === "MERGED" && currentBranch === "main")) result.reasons.push("FOREIGN_WORKTREE");
  if (prState.state === "CLOSED") result.reasons.push("PR_CLOSED_UNMERGED");
  if (result.reasons.length) return result;
  const candidate = prState.state === "MERGED" ? prState.headRefOid : head;
  const evidence = checkReceipt(receiptPath, { issue, pr }, candidate);
  result.reasons.push(...evidence.reasons);
  result.checks = evidence.checks;
  result.reviewIdentity = evidence.reviewIdentity || null;
  if (prState.state === "OPEN") {
    result.phase = evidence.exhausted ? "blocked" : evidence.reasons.length ? "verify-review" : remoteBranch === candidate && prState.headRefOid === candidate ? "await-merge" : "handoff";
    return result;
  }
  if (!isSha(prState.mergeCommit?.oid)) throw new Error("Merged PR has no valid merge commit.");
  if ([localBranch, remoteBranch].some((sha) => sha && sha !== prState.headRefOid)) {
    result.reasons.push("BRANCH_CHANGED_AFTER_MERGE");
    return result;
  }
  try {
    run("git", ["merge-base", "--is-ancestor", prState.mergeCommit.oid, "HEAD"], { cwd: mainCheckout, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    result.mergeOnMain = true;
  } catch (error) {
    if (![1, 128].includes(error.status)) throw new Error("Merge ancestry observation failed.");
    result.mergeOnMain = error.status === 1 ? false : null;
  }
  if (issueState.state !== "CLOSED") result.phase = "post-merge";
  else if (!result.mergeOnMain || mainHead !== remoteMain) result.phase = "update-main";
  else if (evidence.reasons.length) result.phase = "post-merge";
  else if (!localBranch && !remoteBranch) result.phase = "final-audit";
  else {
    let checkpointPresent = false;
    try { checkpointPresent = inside(recoveryDirectory, readArtifact(checkpointPath).path); } catch { /* Missing checkpoint needs preservation. */ }
    const evidenceDurable = evidence.evidencePaths.every((file) => inside(recoveryDirectory, file));
    result.phase = checkpointPresent && evidenceDurable ? "cleanup-preflight" : "preserve-evidence";
  }
  return result;
}

module.exports = { inspectState };

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "--help") {
      console.log("Read-only: node inspect-state.cjs --repo owner/repo --issue N --pr N --branch exact-branch --main-checkout path [--receipt path]\nOutputs observations and routing hints, never approval or cleanup. Requires git, authenticated gh and network access.");
    } else {
      const values = {};
      const allowed = ["--repo", "--issue", "--pr", "--branch", "--main-checkout", "--receipt"];
      for (let index = 0; index < args.length; index += 2) {
        if (!allowed.includes(args[index]) || !args[index + 1] || values[args[index]] !== undefined) throw new Error("Invalid, duplicate or incomplete option; use --help.");
        values[args[index]] = args[index + 1];
      }
      const result = inspectState({ repository: values["--repo"], issue: Number(values["--issue"]), pr: Number(values["--pr"]), branch: values["--branch"], mainCheckout: values["--main-checkout"], receiptPath: values["--receipt"] });
      console.log(JSON.stringify(result, null, 2));
      if (result.phase === "blocked") process.exitCode = 1;
    }
  } catch (error) {
    console.log(JSON.stringify({ grantsAuthority: false, phase: "blocked", reasons: ["OBSERVATION_FAILED"], error: error.message }, null, 2));
    process.exitCode = 1;
  }
}
