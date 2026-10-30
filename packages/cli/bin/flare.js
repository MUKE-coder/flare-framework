#!/usr/bin/env node
// Clack draws its boxes with ASCII unless it recognises the terminal by an environment
// variable, which leaves Git Bash and plain PowerShell with "T", "|" and "o" although
// both render box characters fine. Say so before anything loads and reads it.
if (process.platform === "win32" && !process.env.WT_SESSION && !process.env.TERM) {
  const [major] = (process.env.OS_RELEASE ?? (await import("node:os")).release()).split(".");
  if (Number(major) >= 10) process.env.TERM = "xterm-256color";
}

await import("../dist/index.js");
