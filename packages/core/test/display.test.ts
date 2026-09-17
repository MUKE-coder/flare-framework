import { describe, expect, it } from "vitest";
import { field } from "../src/resource/fields.js";
import { formatValue, optionLabel, statusTone } from "../src/resource/display.js";

const def = <T,>(f: T) => ({ ...f, label: "x" }) as never;

describe("statusTone", () => {
  it.each([
    ["paid", "success"],
    ["Fulfilled", "success"],
    ["cancelled", "danger"],
    ["canceled", "danger"],
    ["pending", "warning"],
    ["on_hold", "warning"],
    ["lead", "neutral"],
    [42, "neutral"],
  ])("%s → %s", (value, tone) => {
    expect(statusTone(value)).toBe(tone);
  });
});

describe("formatValue", () => {
  it("formats each kind for display", () => {
    expect(formatValue(def(field.boolean()), true)).toBe("Yes");
    expect(formatValue(def(field.int()), 12345)).toBe("12,345");
    expect(formatValue(def(field.float()), 1234.567)).toBe("1,234.57");
    expect(formatValue(def(field.date()), "2026-01-05")).toBe("Jan 5, 2026");
    expect(formatValue(def(field.datetime()), "2026-01-05T14:30:00Z")).toBe("Jan 5, 2026, 2:30 PM");
    expect(formatValue({ kind: "timestamp" }, 1767623400000)).toBe("Jan 5, 2026, 2:30 PM");
    expect(formatValue(def(field.enum(["on_hold", "paid"])), "on_hold")).toBe("On hold");
    expect(formatValue(def(field.file(["pdf"])), "uploads/2026/01/3f1c2b7a-1111-2222-3333-444455556666-report.pdf")).toBe("report.pdf");
    expect(formatValue(def(field.string()), "Ada")).toBe("Ada");
  });

  it("shows an em dash for empty values", () => {
    for (const value of [null, undefined, ""]) expect(formatValue(def(field.string()), value)).toBe("—");
  });

  it("uses optionLabels when the descriptor provides them", () => {
    expect(optionLabel(def(field.enum(["b2b", "b2c"], { optionLabels: { b2b: "Business" } })), "b2b")).toBe("Business");
  });
});
