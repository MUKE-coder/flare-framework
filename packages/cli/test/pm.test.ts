import { describe, expect, it } from "vitest";
import { childEnv, detectPackageManager } from "../src/utils/pm.js";

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
