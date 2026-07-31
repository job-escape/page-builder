import { createStore } from "effector";

import createBuilderModel from "../model/store";
import { BuilderPage } from "../types";

import Builder from "./builder";

/**
 * A store owned by the consumer, not by this package. The sid is what the
 * hydration values are keyed by, so it stands in for anything an app seeds
 * server-side — subscriptions, feature flags, geo.
 */
const $hostStore = createStore<string | null>(null, { sid: "host_store" });

const model = createBuilderModel<BuilderPage>({
  fetchPage: () => Promise.reject(new Error("not called in this test")),
});

const PAGE: BuilderPage = {
  id: 1,
  design_url: "",
  mdx_url: "",
  order: 0,
  tree_order: 0,
  pageId: 1,
};

const renderBuilder = (values?: Record<string, unknown>) =>
  Builder({
    model,
    initialPageId: PAGE.id,
    initialPages: { [PAGE.id]: PAGE },
    initialHtml: "<div />",
    answers: {},
    values,
    children: null,
  });

/** The hydration values `Builder` hands to its Effector provider. */
const valuesOf = async (
  element: Awaited<ReturnType<typeof renderBuilder>>,
): Promise<Record<string, unknown>> =>
  (element as { props: { values: Record<string, unknown> } }).props.values;

describe("Builder", () => {
  it("seeds the scope with values the host owns", async () => {
    // Without this, a host that seeds its own stores has to wrap Builder in a
    // second EffectorNext. On the client both providers merge into one shared
    // scope, but on the server each forks its own — so the inner provider wins
    // and the host's values never reach the render. The page comes out of SSR
    // missing everything derived from them, and hydration then throws that
    // subtree away and rebuilds it.
    const element = await renderBuilder({ [$hostStore.sid!]: "seeded" });

    expect(await valuesOf(element)).toMatchObject({ host_store: "seeded" });
  });

  it("still serializes its own stores alongside the host's", async () => {
    const element = await renderBuilder({ [$hostStore.sid!]: "seeded" });
    const values = await valuesOf(element);

    // One scope, both sets of values — that is the whole point.
    expect(values).toMatchObject({ host_store: "seeded", currentPageId: 1 });
  });

  it("works unchanged when the host seeds nothing", async () => {
    const values = await valuesOf(await renderBuilder());

    expect(values).toMatchObject({ currentPageId: 1 });
    expect(values).not.toHaveProperty("host_store");
  });
});
