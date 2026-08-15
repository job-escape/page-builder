/**
 * Write-through persistence, exercised against a real `document.cookie`.
 *
 * jsdom gives a working cookie jar, so these cover the property that matters:
 * a visitor who refreshes mid-funnel finds their answers still there, and one
 * who returns after a republish does not.
 */
import { cookieName } from "./persistence";
import { createFunnelStore } from "./store";
import type { VariableTable } from "./types";

const table: VariableTable = {
  goal:      { name: "goal",      type: "string" },
  equipment: { name: "equipment", type: "list<string>", max: 3 },
  email:     { name: "email",     type: "string", sensitive: true },
};

const persist = { funnelId: 1234, version: "v7" };

const build = (version = "v7") =>
  createFunnelStore({ table, persist: { ...persist, version } });

function clearCookies() {
  document.cookie.split(";").forEach((entry) => {
    const name = entry.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
}

beforeEach(clearCookies);

describe("write-through", () => {
  it("persists on every change, not on some later flush", () => {
    const s = build();
    s.select("goal", "build_muscle");
    // Read the raw jar rather than the store: the point is that it is already
    // there, with no navigation or unload needed.
    expect(document.cookie).toContain(cookieName(1234));
    expect(decodeURIComponent(document.cookie)).toContain("build_muscle");
  });

  it("a fresh store restores what the previous one wrote", () => {
    const first = build();
    first.select("goal", "build_muscle");
    first.select("equipment", "bands");
    first.select("equipment", "mat");

    const second = build();
    expect(second.get("goal")).toBe("build_muscle");
    expect(second.get("equipment")).toEqual(["bands", "mat"]);
  });

  it("a removal is persisted too, not just additions", () => {
    const first = build();
    first.select("equipment", "bands");
    first.select("equipment", "mat");
    first.select("equipment", "bands");

    expect(build().get("equipment")).toEqual(["mat"]);
  });
});

describe("what must not persist", () => {
  it("never writes a sensitive variable to the cookie", () => {
    const s = build();
    s.set("email", "ana@example.com");
    expect(decodeURIComponent(document.cookie)).not.toContain("ana@example.com");
  });

  it("does not restore request status — a pending spinner must not survive", () => {
    const first = build();
    first.setStatus("lead", "pending");
    expect(build().status("lead")).toBe("idle");
  });
});

describe("version keying", () => {
  it("does not restore answers captured under a different funnel version", () => {
    const old = build("v7");
    old.select("goal", "build_muscle");

    const republished = build("v8");
    expect(republished.get("goal")).toBeNull();
  });
});

describe("reset", () => {
  it("clears the cookie as well as the values", () => {
    const s = build();
    s.select("goal", "build_muscle");
    s.reset();

    expect(build().get("goal")).toBeNull();
  });
});

describe("without persistence", () => {
  it("writes nothing — preview must not leave answers behind", () => {
    const s = createFunnelStore({ table });
    s.select("goal", "build_muscle");
    expect(document.cookie).not.toContain(cookieName(1234));
  });
});
