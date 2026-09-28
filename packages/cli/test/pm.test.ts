import { describe, expect, it } from "vitest";
import { childEnv, choosePackageManager, detectPackageManager, isInstalled } from "../src/utils/pm.js";

describe("package manager helpers", () => {
  it("detects the invoking package manager", () => {
    expect(detectPackageManager("npm/11.17.0 node/v26.4.0 win32 x64")).toBe("npm");
    expect(detectPackageManager("pnpm/11.9.0 npm/? node/v26.4.0")).toBe("pnpm");
    expect(detectPackageManager("")).toBe("pnpm");
  });

  it("drops settings npm exec exports, which break a nested npm install", () => {
    const env = childEnv({ npm_config_allow_scripts: "x", NPM_CONFIG_YES: "true", npm_config_registry: "http://r/", PATH: "/bin" });
    expect(env).toEqual({ npm_config_registry: "http://r/", PATH: "/bin" });
  });
});

describe("choosePackageManager", () => {
  const withAgent = (agent: string, run: () => void) => {
    const before = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = agent;
    try {
      run();
    } finally {
      if (before === undefined) delete process.env.npm_config_user_agent;
      else process.env.npm_config_user_agent = before;
    }
  };

  it("prefers pnpm over the npm that started it, when pnpm is there", () => {
    // The documented command is `npm create flare-framework`, so this is the common
    // path, and the one where npm spends minutes on an install pnpm does in seconds.
    if (!isInstalled("pnpm")) return;
    withAgent("npm/11.17.0 node/v26.4.0 win32 x64", () => {
      expect(choosePackageManager()).toEqual({ packageManager: "pnpm", preferred: true });
    });
  });

  it("never overrides an explicit --pm", () => {
    withAgent("npm/11.17.0 node/v26.4.0 win32 x64", () => {
      expect(choosePackageManager("npm")).toEqual({ packageManager: "npm", preferred: false });
      expect(choosePackageManager("bun")).toEqual({ packageManager: "bun", preferred: false });
    });
  });

  it("doesn't claim a preference when pnpm is already the one in use", () => {
    withAgent("pnpm/11.9.0 npm/? node/v26.4.0", () => {
      expect(choosePackageManager()).toEqual({ packageManager: "pnpm", preferred: false });
    });
  });

  it("rejects a package manager it doesn't know", () => {
    expect(() => choosePackageManager("pip")).toThrow(/Unknown package manager/);
  });
});

describe("isInstalled", () => {
  it("says no to something that isn't there", () => {
    expect(isInstalled("definitely-not-a-package-manager" as never)).toBe(false);
  });
});
