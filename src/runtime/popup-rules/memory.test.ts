/**
 * What the popup rules remember, over whatever storage the host hands them.
 */
import { createPopupMemory, memoryStore, type PopupStore } from "./memory";
import type { PopupRule } from "./types";

const rule = (cap: PopupRule["cap"]): PopupRule => ({
  id: "r",
  name: "r",
  designId: 1,
  on: [],
  when: { all: [] },
  cap,
  show: { target: "t", as: "overlay" },
  manifestUrl: "",
});

describe("popup memory", () => {
  it("remembers the events heard this session, the latest last", () => {
    const memory = createPopupMemory({ session: memoryStore() });
    memory.rememberEvent({ name: "a", props: {}, at: 1 });
    memory.rememberEvent({ name: "b", props: {}, at: 2 });
    expect(memory.heardEvents().map((event) => event.name)).toEqual(["a", "b"]);
  });

  it("caps a rule per session", () => {
    const memory = createPopupMemory({ session: memoryStore(), persistent: memoryStore() });
    const once = rule({ times: 1, per: "session" });
    expect(memory.canFire(once)).toBe(true);
    memory.recordFired(once);
    expect(memory.canFire(once)).toBe(false);
  });

  it("caps a rule per day, and lets it fire again the next day", () => {
    let day = new Date("2026-09-22T10:00:00Z");
    const persistent = memoryStore();
    const memory = createPopupMemory({ session: memoryStore(), persistent, now: () => day });
    const daily = rule({ times: 1, per: "day" });
    memory.recordFired(daily);
    expect(memory.canFire(daily)).toBe(false);
    day = new Date("2026-09-23T10:00:00Z");
    expect(memory.canFire(daily)).toBe(true);
  });

  it("keeps an 'ever' cap in the persistent store, past a new session", () => {
    const persistent = memoryStore();
    const ever = rule({ times: 1, per: "ever" });
    createPopupMemory({ session: memoryStore(), persistent }).recordFired(ever);
    const nextSession = createPopupMemory({ session: memoryStore(), persistent });
    expect(nextSession.canFire(ever)).toBe(false);
  });

  it("carries on when the storage throws", () => {
    const broken: PopupStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const memory = createPopupMemory({ session: broken, persistent: broken });
    expect(() => memory.rememberEvent({ name: "a", props: {}, at: 1 })).not.toThrow();
    expect(memory.heardEvents()).toEqual([]);
    expect(memory.canFire(rule({ times: 1, per: "ever" }))).toBe(true);
  });
});
