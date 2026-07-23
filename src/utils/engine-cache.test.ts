import { jest } from "@jest/globals";

import { Condition } from "../types";

// json-rules-engine transitively imports an ESM-only dep (jsonpath-plus) that
// ts-jest can't transform, so stub it. We only assert how many Engines get built.
const engineCtor = jest.fn();
jest.mock("json-rules-engine", () => ({
  Engine: class {
    constructor(...args: unknown[]) {
      engineCtor(...args);
    }

    addOperator() {}

    addRule() {}

    run() {
      return Promise.resolve({ events: [] });
    }
  },
  Rule: class {
    constructor(config: unknown) {
      Object.assign(this, config);
    }
  },
}));

// eslint-disable-next-line import/first
import { getEngine } from "./run-condition";

const conds = (fact: string, nodeId: number): Condition["condition"] =>
  [
    {
      nodeId,
      rules: { all: [{ fact, operator: "=", value: "yes", data_type: "answer" }] },
      isDefault: false,
    },
  ] as unknown as Condition["condition"];

beforeEach(() => engineCtor.mockClear());

it("builds one engine per rule-set and reuses it (no rebuild per evaluation)", async () => {
  const ruleSet = conds("cacheA", 5);

  // Same content, different object identity — as ConditionRegistry / useActiveState
  // produce on every re-render.
  const first = getEngine(ruleSet);
  const again = getEngine(JSON.parse(JSON.stringify(ruleSet)) as Condition["condition"]);

  expect(first).toBe(again); // same cached promise
  await first;

  // Before caching, each getEngine call did `new Engine` + addRule — so N calls =
  // N engines. Now it's built once and shared.
  expect(engineCtor).toHaveBeenCalledTimes(1);

  // Re-evaluating many times (the loader-tick storm) must not build more engines.
  for (let i = 0; i < 20; i += 1) await getEngine(ruleSet);
  expect(engineCtor).toHaveBeenCalledTimes(1);
});

it("builds a separate engine for a genuinely different rule-set", async () => {
  await getEngine(conds("cacheB", 5));
  await getEngine(conds("cacheC", 9));
  expect(engineCtor).toHaveBeenCalledTimes(2);
});
