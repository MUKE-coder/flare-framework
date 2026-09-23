import { describe, expect, it } from "vitest";
import { defineResource, field } from "../src/resource/index.js";

describe("resource hooks and computed fields", () => {
  it("keeps hooks and computed values on the descriptor", () => {
    const order = defineResource({
      name: "Order",
      fields: { reference: field.string(), quantity: field.int(), price: field.float() },
      computed: {
        total: (record) => Number(record.quantity) * Number(record.price),
      },
      hooks: {
        beforeCreate: (input) => ({ ...input, reference: String(input.reference).toUpperCase() }),
      },
    });

    expect(order.computed.total?.({ quantity: 3, price: 2.5 })).toBe(7.5);
    expect(order.hooks.beforeCreate).toBeTypeOf("function");
    // A resource that declares neither still answers, so callers needn't check.
    const plain = defineResource({ name: "Tag", fields: { name: field.string() } });
    expect(plain.hooks).toEqual({});
    expect(plain.computed).toEqual({});
  });

  it("computes from the record it's given", () => {
    const person = defineResource({
      name: "Person",
      fields: { firstName: field.string(), lastName: field.string() },
      computed: { fullName: (record) => `${record.firstName} ${record.lastName}`.trim() },
    });
    expect(person.computed.fullName?.({ firstName: "Ada", lastName: "Lovelace" })).toBe("Ada Lovelace");
  });
});
