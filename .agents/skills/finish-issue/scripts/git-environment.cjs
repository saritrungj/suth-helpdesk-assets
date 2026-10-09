const { execFileSync } = require("node:child_process");

// Git hooks export repository-local variables. CWD alone cannot select a foreign
// repository/worktree while those variables are inherited (see git-githooks).
function gitEnvironment(cwd) {
  const localNames = new Set(execFileSync("git", ["rev-parse", "--local-env-vars"], {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim().split(/\r?\n/).map((name) => name.toUpperCase()));
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !localNames.has(name.toUpperCase())));
}

module.exports = { gitEnvironment };
