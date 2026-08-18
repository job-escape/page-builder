import {
  createMetaPixelRuntime,
  loadMetaPixel,
  resetMetaPixelConfig,
  resolveMetaPixelIds,
} from "./meta-pixel";

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[] };
const win = () => window as unknown as { fbq?: Fbq; _fbq?: Fbq };

const scripts = () =>
  Array.from(document.querySelectorAll("script")).filter((element) =>
    element.src.includes("connect.facebook.net"),
  );

beforeEach(() => {
  delete win().fbq;
  delete win()._fbq;
  // The initialised set is module state, so it outlives a test otherwise and
  // the next one's `init` call is skipped as a duplicate.
  resetMetaPixelConfig();
  document.head.innerHTML = "";
  document.head.append(document.createElement("script"));
});

describe("resolveMetaPixelIds", () => {
  it("reads the list a flag holds", () => {
    expect(resolveMetaPixelIds(["553981293387641"])).toEqual(["553981293387641"]);
  });

  it("reads one comma-separated string, which is how people type them", () => {
    expect(resolveMetaPixelIds("111, 222")).toEqual(["111", "222"]);
  });

  it("drops a duplicate", () => {
    // Initialising the same pixel twice makes every event it reports arrive
    // twice with it.
    expect(resolveMetaPixelIds(["111", "111", "222"])).toEqual(["111", "222"]);
  });

  it("resolves anything else to no pixels, rather than throwing", () => {
    // Authored by a human in a flag UI, and read during render.
    for (const value of [undefined, null, "", [], {}, 42, [{ id: 1 }]]) {
      expect(resolveMetaPixelIds(value)).toEqual([]);
    }
  });
});

describe("loadMetaPixel", () => {
  it("installs a stub that is usable immediately, then loads fbevents", () => {
    // The stub queues calls itself until fbevents.js lands. Injecting the
    // snippet as a script tag instead leaves a window where fbq is undefined,
    // which is what makes hosts poll for it.
    const fbq = loadMetaPixel()!;

    expect(typeof fbq).toBe("function");
    expect(win().fbq).toBe(fbq);
    expect(scripts()).toHaveLength(1);
  });

  it("adopts an fbq someone else installed", () => {
    // A host whose tag manager injects the snippet must keep working, and a
    // second snippet would double every event.
    const existing = (() => {}) as Fbq;
    win().fbq = existing;

    expect(loadMetaPixel()).toBe(existing);
    expect(scripts()).toHaveLength(0);
  });
});

describe("createMetaPixelRuntime", () => {
  it("initialises every id, then reports the arrival once", () => {
    const fbq = jest.fn() as unknown as Fbq;
    win().fbq = fbq;

    const runtime = createMetaPixelRuntime();
    expect(runtime.configure(["111", "222"])).toBe(true);

    expect(fbq).toHaveBeenCalledWith("init", "111");
    expect(fbq).toHaveBeenCalledWith("init", "222");
    // Once per pass, not once per pixel: it reaches every pixel initialised.
    expect(
      (fbq as unknown as jest.Mock).mock.calls.filter(
        (c) => c[0] === "track" && c[1] === "PageView",
      ),
    ).toHaveLength(1);
  });

  it("initialises a pixel exactly once, however often it is configured", () => {
    const fbq = jest.fn() as unknown as Fbq;
    win().fbq = fbq;

    const runtime = createMetaPixelRuntime();
    runtime.configure(["111"]);
    expect(runtime.configure(["111"])).toBe(false);

    expect(
      (fbq as unknown as jest.Mock).mock.calls.filter((c) => c[0] === "init"),
    ).toHaveLength(1);
  });

  it("takes an id added to the flag later without re-initialising the first", () => {
    const fbq = jest.fn() as unknown as Fbq;
    win().fbq = fbq;

    const runtime = createMetaPixelRuntime();
    runtime.configure(["111"]);
    expect(runtime.configure(["111", "222"])).toBe(true);

    expect(
      (fbq as unknown as jest.Mock).mock.calls.filter((c) => c[0] === "init"),
    ).toEqual([
      ["init", "111"],
      ["init", "222"],
    ]);
  });

  it("does nothing for an empty list, so the caller can try again", () => {
    // Both "the flag has not resolved yet" and a flag that resolved to nothing
    // land here: either way no pixel is initialised.
    const runtime = createMetaPixelRuntime();

    expect(runtime.configure([])).toBe(false);
    expect(win().fbq).toBeUndefined();
  });

  it("holds events fired before the ids resolved, then sends them", () => {
    const fbq = jest.fn() as unknown as Fbq;
    win().fbq = fbq;

    const runtime = createMetaPixelRuntime();
    runtime.track({ eventType: "trackCustom", eventName: "selling_page_view" });
    expect(fbq).not.toHaveBeenCalledWith("trackCustom", expect.anything());

    runtime.configure(["111"]);

    expect(fbq).toHaveBeenCalledWith("trackCustom", "selling_page_view");
  });

  it("passes the event id as the fourth argument, which is where fbq reads it", () => {
    // An event carrying an id but no props still has to pass something for the
    // third — without it the id lands in the props slot and is not a dedup key.
    const fbq = jest.fn() as unknown as Fbq;
    win().fbq = fbq;

    const runtime = createMetaPixelRuntime();
    runtime.configure(["111"]);
    runtime.track({
      eventType: "track",
      eventName: "Lead",
      eventExtra: { eventID: "att-9" },
    });

    expect(fbq).toHaveBeenCalledWith("track", "Lead", {}, { eventID: "att-9" });
  });

  it("carries a purchase's own props through", () => {
    const fbq = jest.fn() as unknown as Fbq;
    win().fbq = fbq;

    const runtime = createMetaPixelRuntime();
    runtime.configure(["111"]);
    runtime.track({
      eventType: "track",
      eventName: "Purchase",
      eventProps: { currency: "USD", value: 66.67 },
      eventExtra: { eventID: "att-9" },
    });

    expect(fbq).toHaveBeenCalledWith(
      "track",
      "Purchase",
      { currency: "USD", value: 66.67 },
      { eventID: "att-9" },
    );
  });

  it("survives a pixel that throws", () => {
    win().fbq = (() => {
      throw new Error("blocked");
    }) as unknown as Fbq;

    const runtime = createMetaPixelRuntime();

    expect(() => runtime.configure(["111"])).not.toThrow();
    expect(() =>
      runtime.track({ eventType: "trackCustom", eventName: "x" }),
    ).not.toThrow();
  });
});
