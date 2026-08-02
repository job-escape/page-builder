const OPERATOR_MAP: Record<string, string> = {
  "=": "equal",
  "==": "equal",
  "===": "equal",
  "!=": "notEqual",
  "!==": "notEqual",
  "<>": "notEqual",
  "<": "lessThan",
  "<=": "lessThanInclusive",
  ">": "greaterThan",
  ">=": "greaterThanInclusive",
  in: "in",
  "!in": "notIn",
  notIn: "notIn",
  contains: "contains",
  "!contains": "doesNotContain",
  doesNotContain: "doesNotContain",
};

export function mapOperator(symbol: string): string {
  // Own-property only: a plain object literal inherits `toString`, `valueOf`
  // and friends, so a bare lookup answers those names with a function. That is
  // truthy, so it passes the guard below and reaches the rules engine as an
  // operator, where it fails in a way that looks nothing like "bad operator".
  const mapped = Object.prototype.hasOwnProperty.call(OPERATOR_MAP, symbol)
    ? OPERATOR_MAP[symbol]
    : undefined;
  if (!mapped) {
    throw new Error(
      `Unknown operator: "${symbol}". Valid symbols: ${Object.keys(OPERATOR_MAP).join(", ")}`,
    );
  }
  return mapped;
}
