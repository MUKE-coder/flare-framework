import { describe, expect, it } from "vitest";
import { resourcesWithoutPolicy, warnAboutOpenResources } from "../src/commands/deploy.js";

const resource = (name: string) => ({ resource: { name } });
const policy = (name: string) => ({ policy: { resource: name } });

describe("resourcesWithoutPolicy (#17)", () => {
  it("names the resources nothing covers", () => {
    const found = resourcesWithoutPolicy(
      [resource("Invoice"), resource("Payment"), resource("Contact"), resource("Expense")],
      [policy("Contact")],
    );
    expect(found).toEqual(["Expense", "Invoice", "Payment"]);
  });

  it("is empty when every resource has one", () => {
    expect(resourcesWithoutPolicy([resource("Contact"), resource("Deal")], [policy("Contact"), policy("Deal")])).toEqual([]);
  });

  it("is empty for an app with no resources yet", () => {
    expect(resourcesWithoutPolicy([], [])).toEqual([]);
  });

  it("ignores a policy for a resource that no longer exists", () => {
    // Deleting a resource and leaving its policy behind should not hide a real gap.
    expect(resourcesWithoutPolicy([resource("Invoice")], [policy("Ghost")])).toEqual(["Invoice"]);
  });
});

describe("warnAboutOpenResources (#17)", () => {
  /** An app directory that does not exist: loadResources returns [] rather than throwing. */
  const nowhere = "D:/does/not/exist/flare-app";

  it("says nothing when there is nothing to say", async () => {
    const lines: string[] = [];
    const open = await warnAboutOpenResources(nowhere, { log: (m) => lines.push(m) });
    expect(open).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("stays quiet with --allow-open, without even looking", async () => {
    const lines: string[] = [];
    expect(await warnAboutOpenResources(nowhere, { log: (m) => lines.push(m), allowOpen: true })).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("never throws, whatever the app is in", async () => {
    // The deploy a moment later will report a broken descriptor far better than this
    // check could, and a warning must not be the thing that stops a deploy.
    await expect(warnAboutOpenResources("", { log: () => {} })).resolves.toEqual([]);
  });
});
