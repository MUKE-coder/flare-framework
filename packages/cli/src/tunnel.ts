import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";

/**
 * Cloudflare Quick Tunnels (https://try.cloudflare.com): a public HTTPS URL on
 * *.trycloudflare.com for a local server. No Cloudflare account, DNS records or
 * open ports. Flare uses `cloudflared` from PATH, or downloads Cloudflare's
 * official release once into ~/.flare/bin.
 */

const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
/** The address a dev server prints once it's listening, e.g. "Local: http://localhost:3000/". */
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):\d+/;

export function parseTunnelUrl(output: string): string | null {
  return TUNNEL_URL.exec(output)?.[0] ?? null;
}

export function parseLocalUrl(output: string): string | null {
  // Strip ANSI colours (vite prints the port in bold) before matching.
  const match = LOCAL_URL.exec(output.replace(/\x1b\[[0-9;]*m/g, ""));
  return match ? match[0].replace("0.0.0.0", "localhost") : null;
}

/** "3000", ":3000" or a full URL → the local URL to expose. */
export function toLocalUrl(target: string | undefined): string {
  if (!target) return "http://localhost:3000";
  if (/^\d+$/.test(target.replace(/^:/, ""))) return `http://localhost:${target.replace(/^:/, "")}`;
  if (/^https?:\/\//.test(target)) return target;
  throw new Error(`"${target}" isn't a port or URL. Try: flare tunnel 3000`);
}

/** The cloudflared release asset for this platform, from Cloudflare's GitHub releases. */
export function releaseAsset(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string {
  const cpu = { x64: "amd64", arm64: "arm64", ia32: "386", arm: "arm" }[arch];
  if (platform === "win32" && (cpu === "amd64" || cpu === "386")) return `cloudflared-windows-${cpu}.exe`;
  if (platform === "linux" && cpu) return `cloudflared-linux-${cpu}`;
  if (platform === "darwin" && (cpu === "amd64" || cpu === "arm64")) return `cloudflared-darwin-${cpu}.tgz`;
  throw new Error(`No cloudflared build for ${platform}/${arch}. Install it yourself: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`);
}

const binName = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
const cacheDir = () => join(homedir(), ".flare", "bin");

function onPath(): string | null {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["cloudflared"], { encoding: "utf8" });
  return probe.status === 0 ? (probe.stdout.split(/\r?\n/)[0]?.trim() ?? null) : null;
}

async function download(log: (message: string) => void): Promise<string> {
  const asset = releaseAsset();
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  const target = join(dir, binName);
  log(pc.dim(`Downloading cloudflared (one time) into ${dir}…`));
  const response = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`);
  if (!response.ok) throw new Error(`Downloading cloudflared failed: HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const partial = `${target}.download`;
  if (asset.endsWith(".tgz")) {
    writeFileSync(`${partial}.tgz`, bytes);
    const untar = spawnSync("tar", ["-xzf", `${partial}.tgz`, "-C", dir], { encoding: "utf8" });
    rmSync(`${partial}.tgz`, { force: true });
    if (untar.status !== 0) throw new Error(`Unpacking cloudflared failed: ${untar.stderr}`);
  } else {
    writeFileSync(partial, bytes);
    renameSync(partial, target);
  }
  if (process.platform !== "win32") chmodSync(target, 0o755);
  return target;
}

/** Path to a cloudflared binary, downloading it the first time if needed. */
export async function ensureCloudflared(log: (message: string) => void = console.log): Promise<string> {
  const found = onPath();
  if (found) return found;
  const cached = join(cacheDir(), binName);
  if (existsSync(cached)) return cached;
  return download(log);
}

export interface Tunnel {
  url: string;
  process: ChildProcess;
  close(): void;
}

/** Start a quick tunnel to `localUrl` and resolve once Cloudflare has assigned its public URL. */
export async function openTunnel(localUrl: string, options: { log?: (message: string) => void; timeoutMs?: number } = {}): Promise<Tunnel> {
  const bin = await ensureCloudflared(options.log);
  // Quick tunnels ignore any ~/.cloudflared config; --no-autoupdate keeps a PATH install untouched.
  const child = spawn(bin, ["tunnel", "--no-autoupdate", "--url", localUrl], { stdio: ["ignore", "pipe", "pipe"] });
  const close = () => {
    if (child.exitCode === null) child.kill();
  };
  process.once("exit", close);

  const url = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      close();
      reject(new Error(`cloudflared didn't report a tunnel URL within ${(options.timeoutMs ?? 30_000) / 1000}s:\n${output.slice(-2000)}`));
    }, options.timeoutMs ?? 30_000);
    const scan = (chunk: Buffer) => {
      output += chunk.toString();
      const found = parseTunnelUrl(output);
      if (found) {
        clearTimeout(timer);
        resolve(found);
      }
    };
    child.stdout?.on("data", scan);
    child.stderr?.on("data", scan);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`cloudflared exited (code ${code}) before the tunnel was ready:\n${output.slice(-2000)}`));
    });
  });
  // Keep draining output so cloudflared never blocks on a full pipe.
  child.stdout?.resume();
  child.stderr?.resume();
  return { url, process: child, close };
}

export function tunnelBanner(publicUrl: string, localUrl: string): string {
  const line = "─".repeat(Math.max(publicUrl.length, localUrl.length) + 14);
  return [
    "",
    pc.cyan(line),
    `  ${pc.bold("Public URL")}  ${pc.green(pc.bold(publicUrl))}`,
    `  ${pc.dim("Forwarding")}  ${pc.dim(localUrl)}`,
    pc.cyan(line),
    pc.dim("  Anyone with this link can reach your local server. Stop with Ctrl+C."),
    "",
  ].join("\n");
}
