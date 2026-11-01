import { parseResolvableText, serializeTemplate } from "./components/expression-template.ts";
import { type ExprValue, type SecretValue, isExprValue } from "./types.ts";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
/** The comparisons the condition builder offers, in menu order, with their labels. */
export const CONDITION_OPERATORS = [
  ["===", "equals"],
  ["!==", "does not equal"],
  [">", "greater than"],
  [">=", "at least"],
  ["<", "less than"],
  ["<=", "at most"],
] as const;
const operators = new Set<string>(CONDITION_OPERATORS.map(([op]) => op));
const operatorLabels: Record<string, string> = {
  ...Object.fromEntries(CONDITION_OPERATORS),
  "==": "equals",
  "!=": "does not equal",
  in: "is in",
};

/** A comparison operator as the builder names it (`===` → "equals"); unknown ones as written. */
export function conditionOperatorLabel(op: string): string {
  return operatorLabels[op] ?? op;
}

/** Decode only two-operand comparisons; all other conditions keep the full editor. */
export function readComparison(value: unknown) {
  if (!object(value) || Object.keys(value).length !== 1 || !object(value.$expr)) return;
  const entries = Object.entries(value.$expr);
  if (entries.length !== 1) return;
  const [operator, args] = entries[0];
  if (!operators.has(operator) || !Array.isArray(args) || args.length !== 2) return;
  return { left: args[0] as unknown, operator, right: args[1] as unknown };
}

/** Typed scalar input without a separate type picker. Quotes preserve numeric-looking text. */
export function conditionOperandValue(value: string | ExprValue | SecretValue): unknown {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed === null || ["string", "number", "boolean"].includes(typeof parsed)) return parsed;
    } catch {
      /* Ordinary text is already a literal value. */
    }
  }
  const parts =
    typeof value === "string"
      ? parseResolvableText(value)
      : isExprValue(value)
        ? value.parts
        : null;
  if (parts) {
    const operands = parts.map((part) => {
      if (part.kind === "expr") return part.expr;
      if (part.kind === "var") return { var: part.ref };
      if (part.kind === "secret") return { var: `secrets.${part.ref}` };
      return part.value ?? "";
    });
    return operands.length === 1 ? operands[0] : { cat: operands };
  }

  return value;
}

export function conditionOperandText(value: unknown): string {
  if (typeof value === "string") {
    // Escape strings that would otherwise be interpreted as a typed value or a reference.
    return conditionOperandValue(value) === value ? value : JSON.stringify(value);
  }
  if (object(value)) {
    if (Object.keys(value).length === 1 && typeof value.var === "string") {
      return serializeTemplate([{ kind: "var", ref: value.var }]);
    }
    return serializeTemplate([{ kind: "expr", expr: value }]);
  }
  return JSON.stringify(value) ?? "";
}
