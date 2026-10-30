/**
 * Fields that only apply sometimes.
 *
 * A billing cycle is required on a recurring project and meaningless on a one-off one.
 * The usual way that gets built is an effect in the admin form that hides the input, and
 * then the API happily accepts a cycle on a one-off project because nothing told it not
 * to. The rule ends up in two or three places that disagree the first time somebody
 * changes it.
 *
 * So the condition is declared on the field instead, once:
 *
 *   billingCycle: field.enum(["monthly", "annually"], {
 *     showWhen: { field: "kind", op: "eq", value: "recurring" },
 *   })
 *
 * and everything that needs it reads the same object: the validator makes it required
 * only when the condition holds, the store clears it when it doesn't, and the form shows
 * the input only while it applies.
 */
export interface FieldCondition {
  /** The field this one depends on. Must be a field of the same resource. */
  field: string;
  op: "eq" | "ne" | "in";
  /** A single value for eq/ne, a list for `in`. */
  value: string | string[];
}

/**
 * Whether a conditional field applies, given the record it sits in.
 *
 * Compared as text, because the controlling field is an enum, a boolean or a number
 * depending on who wrote the descriptor, and a form sends every one of them as a string.
 * `true` and `"true"` have to answer the same here or the form and the API disagree.
 *
 * A field with no condition always applies, which is what makes this safe to call on
 * every field without asking first.
 */
export function conditionHolds(condition: FieldCondition | undefined, values: Record<string, unknown>): boolean {
  if (!condition) return true;
  const actual = values[condition.field];
  const text = actual === null || actual === undefined ? "" : String(actual);
  switch (condition.op) {
    case "eq":
      return text === String(condition.value);
    case "ne":
      return text !== String(condition.value);
    case "in":
      return (Array.isArray(condition.value) ? condition.value : [condition.value]).some((option) => String(option) === text);
  }
}

/** "kind == recurring" — for an error message, a form hint or a generated comment. */
export function describeCondition(condition: FieldCondition): string {
  const values = Array.isArray(condition.value) ? condition.value : [condition.value];
  if (condition.op === "in") return `${condition.field} is one of ${values.join(", ")}`;
  return `${condition.field} ${condition.op === "eq" ? "is" : "is not"} ${values[0]}`;
}
