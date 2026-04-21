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
  const mapped = OPERATOR_MAP[symbol];
  if (!mapped) {
    throw new Error(
      `Unknown operator: "${symbol}". Valid symbols: ${Object.keys(OPERATOR_MAP).join(", ")}`,
    );
  }
  return mapped;
}
