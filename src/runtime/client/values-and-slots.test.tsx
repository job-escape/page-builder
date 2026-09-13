/**
 * Schema 1.3 on the visitor's side: a catalogue a request returned, drawn as
 * cards, one picked, and a host component told which one — then reporting back
 * into the design's own steps.
 *
 * The failures this guards are the expensive kind: a card that shows another
 * plan's price, a tap that selects the wrong plan, a checkout paid for the plan
 * the design did not mean, or a payment event that carries nothing.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import type { SourceFunnel } from "../compiler/source";
import { compileToTree } from "../compiler/tree";
import { pathGet } from "../data";
import { call } from "../functions";
import { run } from "../interpret";
import { serialize } from "../persistence";
import { createFunnelStore } from "../store";
import { configureTracking } from "../track";
import type { VariableTable } from "../types";
import { Funnel } from "./funnel";
import { screensFromTree } from "./tree-screen";

const PLANS = [
  { id: 2, code: "1Week", name: "1-week plan", price_amount: 6.93, currency: "USD" },
  { id: 3, code: "4Week", name: "4-week plan", price_amount: 15.19, currency: "USD" },
];

function paywall(): SourceFunnel {
  return {
    id: 21,
    version: "v1",
    entry: "paywall",
    variables: [
      { name: "plans", type: "list<object>", screen: "paywall" },
      { name: "selected", type: "object", screen: "paywall" },
      { name: "paid_with", type: "string" },
    ],
    screens: [
      {
        id: "paywall",
        frames: [
          { id: "root", parent: null, kind: "frame", pos: "a0", props: { testId: "root" } },
          {
            id: "cards",
            parent: "root",
            kind: "frame",
            pos: "a1",
            props: { testId: "cards" },
            repeat: { list: { var: "plans" } },
          },
          {
            id: "card",
            parent: "cards",
            kind: "frame",
            pos: "a0",
            props: { testId: "card" },
            bindings: {
              ariaLabel: { value: { var: "$item", path: "code" } },
              fill: {
                cases: [
                  {
                    when: {
                      op: "cmp",
                      cmp: "eq",
                      left: { var: "$item", path: "id" },
                      right: { var: "selected", path: "id" },
                    },
                    value: "#2563eb",
                  },
                ],
                default: "#ffffff",
              },
            },
            interactions: [
              { on: { event: "click" }, do: [{ type: "set", variable: "selected", from: { var: "$item" } }] },
            ],
          },
          {
            id: "card-title",
            parent: "card",
            kind: "text",
            pos: "a0",
            textKey: "card.title",
            params: {
              name: { var: "$item", path: "name" },
              price: { fn: "money", args: [{ var: "$item", path: "price_amount" }, { var: "$item", path: "currency" }] },
            },
          },
          {
            id: "chosen",
            parent: "root",
            kind: "text",
            pos: "a2",
            textKey: "chosen",
            props: { testId: "chosen" },
            params: { name: { var: "selected", path: "name" } },
          },
          {
            id: "checkout",
            parent: "root",
            kind: "slot",
            slot: "checkout",
            pos: "a3",
            bindings: { plan: { value: { var: "selected" } } },
            interactions: [
              {
                on: { event: "success" },
                do: [
                  { type: "set", variable: "paid_with", from: { var: "$payment", path: "payment_method" } },
                  {
                    type: "analytics",
                    event: "pr_funnel_subscribe_front",
                    properties: {
                      subscription: { var: "selected", path: "code" },
                      subscription_id: { var: "selected", path: "id" },
                      amount: { var: "selected", path: "price_amount" },
                      currency: { var: "selected", path: "currency" },
                      payment_method: { var: "$payment", path: "payment_method" },
                    },
                  },
                ],
              },
            ],
          },
          {
            id: "paid",
            parent: "root",
            kind: "text",
            pos: "a4",
            textKey: "paid",
            props: { testId: "paid" },
            params: { method: { var: "paid_with" } },
          },
        ],
      },
    ],
    locales: { en: { "card.title": "{name} — {price}", chosen: "Chosen: {name}", paid: "Paid with {method}" } },
  };
}

function FakeCheckout(props: { plan?: { code?: string }; trigger: (name: string, values?: object) => Promise<boolean> }) {
  return (
    <button
      type="button"
      data-testid="pay"
      onClick={() => void props.trigger("success", { payment_method: "applepay" })}
    >
      Pay for {props.plan?.code ?? "nothing"}
    </button>
  );
}

function mount(funnel: SourceFunnel, plans = PLANS) {
  const compiled = compileToTree(funnel);
  const manifest = {
    ...compiled.manifest,
    variables: compiled.manifest.variables.map((decl) =>
      decl.name === "plans" ? { ...decl, default: plans } : decl,
    ),
  };
  return render(
    <Funnel
      manifest={manifest}
      screens={screensFromTree(compiled)}
      locale={funnel.locales?.en ?? {}}
      components={{ checkout: FakeCheckout as never }}
    />,
  );
}

describe("a catalogue drawn as cards", () => {
  it("draws the repeated template once per plan, each with its own words and price", () => {
    const view = mount(paywall());
    const cards = within(view.container).getAllByTestId("card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("1-week plan — $6.93");
    expect(cards[1]).toHaveTextContent("4-week plan — $15.19");
    expect(cards[1]).toHaveAttribute("aria-label", "4Week");
  });

  it("draws an empty container while the list has not arrived", () => {
    const view = mount(paywall(), []);
    expect(within(view.container).queryAllByTestId("card")).toHaveLength(0);
    expect(within(view.container).getByTestId("cards")).toBeInTheDocument();
  });

  it("selects the plan a card draws, and only that card shows as selected", () => {
    const view = mount(paywall());
    const cards = () => within(view.container).getAllByTestId("card");
    fireEvent.click(cards()[1]);
    expect(screen.getByTestId("chosen")).toHaveTextContent("Chosen: 4-week plan");
    expect(cards()[1]).toHaveStyle({ background: "#2563eb" });
    expect(cards()[0]).not.toHaveStyle({ background: "#2563eb" });
  });
});

describe("a slot the host fills", () => {
  it("hands the component the bound plan, and runs the design's steps on its report", async () => {
    const sent: Array<[string, Record<string, unknown>]> = [];
    configureTracking({ analytics: (event, properties) => sent.push([event, properties]) });
    const view = mount(paywall());

    fireEvent.click(within(view.container).getAllByTestId("card")[1]);
    const pay = screen.getByTestId("pay");
    expect(pay).toHaveTextContent("Pay for 4Week");

    await act(async () => {
      fireEvent.click(pay);
    });
    expect(screen.getByTestId("paid")).toHaveTextContent("Paid with applepay");
    expect(sent).toEqual([
      [
        "pr_funnel_subscribe_front",
        { subscription: "4Week", subscription_id: 3, amount: 15.19, currency: "USD", payment_method: "applepay" },
      ],
    ]);
    configureTracking({ analytics: undefined });
  });

  it("draws nothing when the host has no such component", () => {
    const compiled = compileToTree(paywall());
    const view = render(
      <Funnel manifest={compiled.manifest} screens={screensFromTree(compiled)} locale={{}} />,
    );
    expect(within(view.container).queryByTestId("pay")).toBeNull();
  });
});

describe("a request's answer as data", () => {
  const table: VariableTable = {
    email: { name: "email", type: "string" },
    plans: { name: "plans", type: "list<object>" },
    first: { name: "first", type: "object" },
    userId: { name: "userId", type: "string" },
  };

  it("sends values, writes paths of the response, and reports its status", async () => {
    const store = createFunnelStore({ table });
    store.set("email", "a@b.co");
    const seen: Array<[string, unknown]> = [];
    const statuses: string[] = [];
    const state = {
      ...store,
      setStatus: (id: string, status: "idle" | "pending" | "success" | "error", error?: string) => {
        statuses.push(status);
        store.setStatus(id, status, error);
      },
    };
    await run(
      [
        {
          type: "submit",
          action: "plans.list",
          id: "catalogue",
          fields: { email: "email" },
          values: { currency: { lit: "USD" } },
          into: { plans: "plans", first: "plans[0]", userId: "user.id" },
        },
      ],
      {
        state,
        nav: { show: () => {}, close: () => {} },
        req: (async (action: string, payload: unknown) => {
          seen.push([action, payload]);
          return { plans: PLANS, user: { id: "u-1" } };
        }) as never,
      },
    );
    expect(seen).toEqual([["plans.list", { email: "a@b.co", currency: "USD" }]]);
    expect(store.get("plans")).toEqual(PLANS);
    expect(store.get("first")).toEqual(PLANS[0]);
    expect(store.get("userId")).toBe("u-1");
    expect(statuses).toEqual(["pending", "success"]);
    expect(store.get("$req.catalogue.status")).toBe("success");
  });

  it("never puts a request's data in the cookie", () => {
    const stored = JSON.parse(serialize(table, { email: "x", plans: PLANS as never, first: PLANS[0] as never }, "v1"));
    expect(Object.keys(stored.a)).toEqual(["email"]);
  });
});

describe("paths and the functions a card needs", () => {
  it("reads keys, indexes and nothing past a gap", () => {
    const value = { data: { plans: PLANS } };
    expect(pathGet(value, "data.plans[1].code")).toBe("4Week");
    expect(pathGet(value, "data.plans.0.id")).toBe(2);
    expect(pathGet(value, "data.missing.code")).toBeNull();
    expect(pathGet(value, "")).toBe(value);
  });

  it("formats money, divides for a per-day price, rounds, and finds a plan by id", () => {
    expect(call("money", [15.19, "USD"])).toBe("$15.19");
    // Intl separates the symbol with a non-breaking space; compare the words.
    expect(String(call("money", [15.19, "EUR", "de-DE"])).replace(/\s/g, " ")).toBe("15,19 €");
    expect(call("round", [call("divide", [15.19, 28]), 2])).toBe(0.54);
    expect(call("divide", [1, 0])).toBeNull();
    expect(call("find", [PLANS, "id", "3"])).toEqual(PLANS[1]);
    expect(call("first", [PLANS])).toEqual(PLANS[0]);
    expect(call("concat", ["$", 5, "/day"])).toBe("$5/day");
  });
});
