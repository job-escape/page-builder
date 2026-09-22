/**
 * The queue a host runs its popups through — what opens, in what order, and
 * that an event heard before the rules arrive still opens its popup.
 */
import { createPopupRules } from "./controller";
import { createPopupMemory, memoryStore } from "./memory";
import type { PopupRule } from "./types";

const rule = (id: string, over: Partial<PopupRule> = {}): PopupRule => ({
  id,
  name: id,
  designId: 7,
  on: [],
  when: { all: [] },
  cap: null,
  show: { target: "dialog", as: "overlay" },
  manifestUrl: "https://cdn.example/manifest.json",
  ...over,
});

/** `name.path == value`, as console's "Appears when" field writes it. */
const eq = (name: string, path: string, value: unknown) => ({
  op: "cmp",
  cmp: "eq",
  left: { var: name, path },
  right: { lit: value },
});

/** A rule that opens on one named event. */
const onEvent = (id: string, event: string): PopupRule =>
  rule(id, { if: eq("event", "name", event) as never });

function setup(rules: PopupRule[] | null) {
  let answer: (value: PopupRule[] | null) => void = () => undefined;
  const loaded = new Promise<PopupRule[] | null>((resolve) => (answer = resolve));
  const memory = createPopupMemory({ session: memoryStore(), persistent: memoryStore() });
  const popups = createPopupRules({ load: () => loaded, memory });
  return { popups, memory, arrive: () => answer(rules) };
}

describe("the queue", () => {
  it("opens a rule that needs no event as soon as the rules arrive", async () => {
    const { popups, arrive } = setup([rule("always", { if: null })]);
    const started = popups.start({});
    arrive();
    await started;
    expect(popups.open()?.id).toBe("always");
  });

  it("opens a rule on the event it names", async () => {
    const { popups, arrive } = setup([onEvent("welcome", "pr_webapp_homepage_view")]);
    const started = popups.start({});
    arrive();
    await started;
    expect(popups.open()).toBeNull();
    popups.heard({ name: "pr_webapp_homepage_view", facts: {} });
    expect(popups.open()?.id).toBe("welcome");
  });

  it("shows one at a time and opens the next when the first closes", async () => {
    const { popups, arrive } = setup([onEvent("a", "x"), onEvent("b", "x")]);
    const started = popups.start({});
    arrive();
    await started;
    popups.heard({ name: "x", facts: {} });
    expect(popups.open()?.id).toBe("a");
    popups.closed();
    expect(popups.open()?.id).toBe("b");
    popups.closed();
    expect(popups.open()).toBeNull();
  });

  it("does not queue a rule twice while it waits", async () => {
    const { popups, arrive } = setup([onEvent("a", "x")]);
    const started = popups.start({});
    arrive();
    await started;
    popups.heard({ name: "x", facts: {} });
    popups.heard({ name: "x", facts: {} });
    popups.closed();
    expect(popups.open()).toBeNull();
  });

  it("tells a subscriber when the open popup changes", async () => {
    const { popups, arrive } = setup([onEvent("a", "x")]);
    const changed = jest.fn();
    popups.subscribe(changed);
    const started = popups.start({});
    arrive();
    await started;
    popups.heard({ name: "x", facts: {} });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("stops opening a rule once its cap is spent", async () => {
    const capped = rule("once", {
      if: eq("event", "name", "x") as never,
      cap: { times: 1, per: "session" },
    });
    const { popups, arrive } = setup([capped]);
    const started = popups.start({});
    arrive();
    await started;
    popups.heard({ name: "x", facts: {} });
    popups.shown(popups.open()!);
    popups.closed();
    popups.heard({ name: "x", facts: {} });
    expect(popups.open()).toBeNull();
  });
});

describe("an event heard before the rules arrive", () => {
  it("still opens the popup it names, once they do", async () => {
    const { popups, arrive } = setup([onEvent("welcome", "pr_webapp_homepage_view")]);
    const started = popups.start({});
    // The page's view fires as it mounts — before the fetch has answered.
    popups.heard({ name: "pr_webapp_homepage_view", facts: {} });
    expect(popups.open()).toBeNull();
    arrive();
    await started;
    expect(popups.open()?.id).toBe("welcome");
  });

  it("is asked with the facts of its own moment", async () => {
    const byCountry = rule("kz", {
      if: { op: "and", of: [eq("event", "name", "x"), eq("user", "country", "KZ")] } as never,
    });
    const { popups, arrive } = setup([byCountry]);
    const started = popups.start({ country: "US" });
    popups.heard({ name: "x", facts: { country: "KZ" } });
    arrive();
    await started;
    expect(popups.open()?.id).toBe("kz");
  });

  it("opens nothing when the rules could not be had", async () => {
    const { popups, arrive } = setup(null);
    const started = popups.start({});
    popups.heard({ name: "x", facts: {} });
    arrive();
    await started;
    expect(popups.open()).toBeNull();
  });
});

describe("reloading the rules", () => {
  it("keeps the rules it had when a reload fails", async () => {
    let answer: PopupRule[] | null = [onEvent("a", "x")];
    const memory = createPopupMemory({ session: memoryStore(), persistent: memoryStore() });
    const popups = createPopupRules({ load: async () => answer, memory });
    await popups.start({});
    answer = null;
    await popups.reload();
    popups.heard({ name: "x", facts: {} });
    expect(popups.open()?.id).toBe("a");
  });

  it("uses the new rules when a reload succeeds", async () => {
    let answer: PopupRule[] | null = [onEvent("a", "x")];
    const memory = createPopupMemory({ session: memoryStore(), persistent: memoryStore() });
    const popups = createPopupRules({ load: async () => answer, memory });
    await popups.start({});
    answer = [onEvent("b", "y")];
    await popups.reload();
    popups.heard({ name: "x", facts: {} });
    expect(popups.open()).toBeNull();
    popups.heard({ name: "y", facts: {} });
    expect(popups.open()?.id).toBe("b");
  });
});

it("clears the rules when a reload answers that there are none", async () => {
  let answer: PopupRule[] | null = [onEvent("a", "x")];
  const memory = createPopupMemory({ session: memoryStore(), persistent: memoryStore() });
  const popups = createPopupRules({ load: async () => answer, memory });
  await popups.start({});
  answer = [];
  await popups.reload();
  popups.heard({ name: "x", facts: {} });
  expect(popups.open()).toBeNull();
});
