import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORAGE,
  parseStorage,
  storageEnv,
  storageEnvExample,
  storageHint,
  storageProvidersFor,
  storageSetupSteps,
  storageVars,
  STORAGE_PROVIDERS,
  type StorageProviderName,
} from "../src/storage-providers.js";

const ALL = Object.keys(STORAGE_PROVIDERS) as StorageProviderName[];

describe("parseStorage", () => {
  it("defaults to the bucket the app is already bound to", () => {
    expect(parseStorage(undefined, "cloudflare")).toBe("r2");
    expect(parseStorage(undefined, "next")).toBe(DEFAULT_STORAGE);
  });

  it("takes a provider however it is typed", () => {
    expect(parseStorage("Cloudinary", "next")).toBe("cloudinary");
    expect(parseStorage("  uploadthing  ", "cloudflare")).toBe("uploadthing");
  });

  it("refuses a typo rather than falling back to the default", () => {
    // Falling back would be the dangerous reading: an app asked for Cloudinary would
    // silently get R2, and the mistake would surface as files in the wrong place.
    expect(() => parseStorage("cloudnary", "next")).toThrow(/Unknown --storage/);
    expect(() => parseStorage("s3", "next")).toThrow(/r2, disk, cloudinary, uploadthing/);
  });

  it("refuses disk on Cloudflare, and says why rather than listing the alternatives", () => {
    // "A Worker has no filesystem" answers the question; "one of: r2, cloudinary"
    // leaves you guessing what was wrong with the thing you asked for.
    expect(() => parseStorage("disk", "cloudflare")).toThrow(/no filesystem to write to/);
    expect(parseStorage("disk", "next")).toBe("disk");
  });
});

describe("storageProvidersFor", () => {
  it("offers disk on Next.js only", () => {
    expect(storageProvidersFor("next")).toContain("disk");
    expect(storageProvidersFor("cloudflare")).not.toContain("disk");
  });

  it("offers the two CDNs on both", () => {
    for (const stack of ["cloudflare", "next"] as const) {
      expect(storageProvidersFor(stack)).toContain("cloudinary");
      expect(storageProvidersFor(stack)).toContain("uploadthing");
    }
  });

  it("puts the default first, so the prompt opens on it", () => {
    expect(storageProvidersFor("next")[0]).toBe(DEFAULT_STORAGE);
  });
});

describe("storageVars", () => {
  it("asks for nothing on Cloudflare's bound bucket", () => {
    // The whole reason it is the default: there is no credential to go and find.
    expect(storageVars("r2", "cloudflare")).toEqual([]);
  });

  it("asks for four on Next.js, which has no bindings", () => {
    expect(storageVars("r2", "next").map((variable) => variable.name)).toEqual([
      "R2_ENDPOINT",
      "R2_BUCKET",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
    ]);
  });

  it("matches what the drivers actually read", () => {
    expect(storageVars("cloudinary", "next").map((variable) => variable.name)).toEqual([
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ]);
    expect(storageVars("uploadthing", "next").map((variable) => variable.name)).toEqual(["UPLOADTHING_TOKEN", "UPLOADTHING_APP_ID"]);
  });
});

describe("storageEnv", () => {
  it("writes exactly one driver line", () => {
    for (const name of ALL) {
      for (const stack of storageProvidersFor("next").includes(name) ? (["next"] as const) : (["cloudflare"] as const)) {
        const env = storageEnv(name, stack);
        expect([...env.matchAll(/^STORAGE_DRIVER=/gm)], `${name}/${stack}`).toHaveLength(1);
        expect(env).toContain(`STORAGE_DRIVER=${name}`);
      }
    }
  });

  it("says there is nothing to configure for the bound bucket", () => {
    const env = storageEnv("r2", "cloudflare");
    expect(env).toContain("nothing to configure");
    expect(env).not.toContain("R2_ACCESS_KEY_ID");
  });

  it("leaves credentials empty, with the console above them", () => {
    const env = storageEnv("cloudinary", "cloudflare");
    expect(env).toContain("CLOUDINARY_API_SECRET=");
    // An empty value fails loudly at the first upload. A placeholder that looks
    // configured fails later and more confusingly.
    expect(env).not.toMatch(/CLOUDINARY_API_SECRET=\S/);
    expect(env).toContain("console.cloudinary.com");
    expect(env).toContain("Settings → API Keys");
  });

  it("fills in local values when asked, and labels them as local", () => {
    const env = storageEnv("r2", "next", { local: true });
    expect(env).toContain("R2_ENDPOINT=http://127.0.0.1:9000");
    expect(env).toContain("Below: the local values. For production:");
  });

  it("leaves them empty when not", () => {
    expect(storageEnv("r2", "next")).toContain("R2_ENDPOINT=\n");
  });

  it("links the provider's own documentation page", () => {
    for (const name of ALL) {
      expect(STORAGE_PROVIDERS[name].docs, name).toBe(`https://flare-docs.codetotech.com/storage/${name}/`);
    }
  });
});

describe("storageEnvExample", () => {
  it("uses placeholders rather than values, and names the alternatives", () => {
    const example = storageEnvExample("r2", "next");
    expect(example).toContain("R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com");
    expect(example).toContain("Or switch driver: disk, cloudinary, uploadthing");
  });

  it("never carries a credential, even an example one", () => {
    for (const name of ALL) {
      const stack = name === "disk" ? "next" : "cloudflare";
      const example = storageEnvExample(name, stack);
      for (const variable of storageVars(name, stack)) {
        if (/SECRET|TOKEN|KEY$/.test(variable.name)) expect(example, `${name}.${variable.name}`).toContain(`${variable.name}=\n`);
      }
    }
  });
});

describe("storageSetupSteps", () => {
  it("says nothing for the default, which is the point of it being the default", () => {
    expect(storageSetupSteps("r2", "cloudflare")).toEqual([]);
    expect(storageSetupSteps("disk", "next")).not.toContain("Install its SDK: uploadthing");
  });

  it("names the package for the one provider that needs one", () => {
    expect(storageSetupSteps("uploadthing", "next")[0]).toBe("Install its SDK: uploadthing");
  });

  it("does not read as a to-do list when the local values already work", () => {
    // The default on Next.js: docker compose brings up MinIO and .env points at it, so
    // nothing has to be fetched before the first upload.
    const steps = storageSetupSteps("r2", "next", { local: true }).join("\n");
    expect(steps).toContain("Works locally as it is. When you deploy, replace");
    expect(steps).not.toMatch(/^Get /m);
  });

  it("does read as one when the values are genuinely missing", () => {
    expect(storageSetupSteps("cloudinary", "next", { local: true }).join("\n")).toMatch(/^Get /m);
  });

  it("names the variables and where they come from", () => {
    const steps = storageSetupSteps("cloudinary", "next").join("\n");
    expect(steps).toContain("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET");
    expect(steps).toContain("console.cloudinary.com");
  });

  it("warns that the CDNs serve public URLs", () => {
    for (const name of ["cloudinary", "uploadthing"] as const) {
      expect(storageSetupSteps(name, "next").join("\n"), name).toMatch(/do not expire/);
    }
  });
});

describe("storageHint", () => {
  it("differs per stack where the answer differs", () => {
    expect(storageHint("r2", "cloudflare")).toContain("bound bucket");
    expect(storageHint("r2", "next")).toContain("S3");
  });

  it("falls back to the one that is true on both", () => {
    expect(storageHint("cloudinary", "next")).toBe(storageHint("cloudinary", "cloudflare"));
  });

  it("has one for every provider the prompt can show", () => {
    for (const stack of ["cloudflare", "next"] as const) {
      for (const name of storageProvidersFor(stack)) expect(storageHint(name, stack), `${name}/${stack}`).not.toBe("");
    }
  });
});
