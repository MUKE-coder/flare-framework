/**
 * Refresh src/data/contributors.json from GitHub.
 *
 * Run it, don't fetch at build time. A build that calls the GitHub API is a build that
 * fails when the rate limit is hit or the network is down, and it makes the output of
 * two builds of the same commit differ. This writes a file that is committed and
 * reviewed like any other.
 *
 *   pnpm run contributors
 *
 * Reads GITHUB_TOKEN if it is set (60 requests an hour without one, which is plenty).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = "MUKE-coder/flare-framework";
const OUT = fileURLToPath(new URL("../src/data/contributors.json", import.meta.url));

const headers = {
  accept: "application/vnd.github+json",
  "user-agent": "flare-docs-contributors",
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function get(path) {
  const response = await fetch(`https://api.github.com/${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub said ${response.status} for ${path}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

const contributors = await get(`repos/${REPO}/contributors?per_page=100`);

// `anonymous` entries have no account to link to, and bots are not people.
const people = contributors.filter((entry) => entry.type === "User" && !entry.login.endsWith("[bot]"));

const rows = await Promise.all(
  people.map(async (entry) => {
    // The contributors endpoint has no name, so ask the profile for one. It is a few
    // extra requests, run by hand, and a name reads better than a login.
    let name = null;
    try {
      ({ name } = await get(`users/${entry.login}`));
    } catch {
      // Rate limited or a deleted profile: the login is enough.
    }
    return {
      login: entry.login,
      name: name && name !== entry.login ? name : null,
      commits: entry.contributions,
      avatar: entry.avatar_url,
      url: entry.html_url,
    };
  }),
);

rows.sort((a, b) => b.commits - a.commits || a.login.localeCompare(b.login));

writeFileSync(
  OUT,
  `${JSON.stringify({ repo: REPO, fetchedAt: new Date().toISOString().slice(0, 10), contributors: rows }, null, 2)}\n`,
);
console.log(`Wrote ${rows.length} contributor(s) to src/data/contributors.json`);
