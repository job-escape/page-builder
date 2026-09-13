/**
 * `$device`: the rule that decides it, and the store that holds it.
 *
 * The property that matters most is the negative one — the device is never
 * stored. A visitor who opened a funnel on a laptop and comes back on a phone
 * must get the phone layout, not the one a cookie remembers.
 */
import { deviceForWidth, deviceFromRequest, DESKTOP_MIN_WIDTH } from "./device";
import { cookieName } from "./persistence";
import { createFunnelStore } from "./store";
import type { VariableTable } from "./types";

const table: VariableTable = {
  goal: { name: "goal", type: "string" },
  // What the console's contexts compiler used to declare. An artifact carrying
  // it must still read the runtime's answer.
  $device: { name: "$device", type: "string", default: "" },
};

function clearCookies() {
  document.cookie.split(";").forEach((entry) => {
    const name = entry.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
}

beforeEach(clearCookies);

describe("the breakpoint", () => {
  it("is desktop from 1024 wide, and mobile below it", () => {
    expect(DESKTOP_MIN_WIDTH).toBe(1024);
    expect(deviceForWidth(1023)).toBe("mobile");
    expect(deviceForWidth(1024)).toBe("desktop");
    expect(deviceForWidth(393)).toBe("mobile");
  });
});

describe("the server's guess", () => {
  it("believes the browser's own hint first", () => {
    expect(deviceFromRequest({ chUaMobile: "?1", userAgent: "Mozilla/5.0 (Windows NT 10.0)" })).toBe("mobile");
    expect(deviceFromRequest({ chUaMobile: "?0", userAgent: "Mozilla/5.0 (iPhone)" })).toBe("desktop");
  });

  it("reads a phone out of the user agent", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const android =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    expect(deviceFromRequest({ userAgent: iphone })).toBe("mobile");
    expect(deviceFromRequest({ userAgent: android })).toBe("mobile");
  });

  it("calls any other browser desktop, and nothing at all mobile", () => {
    const mac =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(deviceFromRequest({ userAgent: mac })).toBe("desktop");
    expect(deviceFromRequest({})).toBe("mobile");
  });
});

describe("the store holds the device apart from the answers", () => {
  it("starts on mobile, or on what the host said", () => {
    expect(createFunnelStore({ table }).get("$device")).toBe("mobile");
    expect(createFunnelStore({ table, device: "desktop" }).get("$device")).toBe("desktop");
  });

  it("wins over a declared `$device` default", () => {
    const s = createFunnelStore({ table, device: "desktop" });
    expect(s.get("$device")).toBe("desktop");
    expect(s.isSet("$device")).toBe(true);
  });

  it("answers a condition without being declared at all", () => {
    const unknown: string[] = [];
    const s = createFunnelStore({ table: { goal: table.goal }, onUnknown: (name) => unknown.push(name) });
    expect(s.get("$device")).toBe("mobile");
    expect(unknown).toEqual([]);
  });

  it("re-renders on a change, with a new snapshot, and reports nothing", () => {
    const changes: string[] = [];
    const s = createFunnelStore({ table, onChange: (name) => changes.push(name) });
    const before = s.snapshot();
    let notified = 0;
    s.subscribe(() => {
      notified += 1;
    });

    s.setDevice("desktop");
    expect(s.get("$device")).toBe("desktop");
    expect(s.snapshot()).not.toBe(before);
    expect(notified).toBe(1);
    expect(changes).toEqual([]);

    // The same device again is not a change.
    s.setDevice("desktop");
    expect(notified).toBe(1);
  });

  it("is never written to the cookie, and never restored from it", () => {
    const persist = { funnelId: 88, version: "v1" };
    const s = createFunnelStore({ table, persist, device: "desktop" });
    s.select("goal", "build_muscle");
    s.setDevice("mobile");
    s.setDevice("desktop");
    expect(document.cookie).toContain(cookieName(88));
    expect(decodeURIComponent(document.cookie)).not.toContain("desktop");

    const returning = createFunnelStore({ table, persist });
    expect(returning.get("goal")).toBe("build_muscle");
    expect(returning.get("$device")).toBe("mobile");
  });

  it("keeps the device across a reset, which is about answers", () => {
    const s = createFunnelStore({ table, device: "desktop" });
    s.select("goal", "x");
    s.reset();
    expect(s.get("$device")).toBe("desktop");
  });
});
