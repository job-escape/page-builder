import {
  createXPixelRuntime,
  loadXPixel,
  pickXParams,
  resetXPixelConfig,
  resolveXPixelConfig,
  xConversionId,
} from "./x-pixel";

type Twq = ((...args: unknown[]) => void) & {
  queue?: unknown[];
  exe?: (...args: unknown[]) => void;
};
const win = () => window as unknown as { twq?: Twq };

const scripts = () =>
  Array.from(document.querySelectorAll("script")).filter((element) =>
    element.src.includes("ads-twitter.com"),
  );

/** The shape the funnels' `x-pixel` feature actually holds. */
const CONFIG = {
  id: "reh74",
  purchase: "tw-reh74-reh75",
  initiate_checkout: "tw-reh74-reh9e",
  selling_page: "tw-reh74-reh9f",
  lead: "tw-reh74-reh9g",
};

beforeEach(() => {
  delete win().twq;
  // The configured-pixel set is module state, so it outlives a test otherwise
  // and the next one's `config` call is skipped as a duplicate.
  resetXPixelConfig();
  document.head.innerHTML = "";
  document.head.append(document.createElement("script"));
});

describe("resolveXPixelConfig", () => {
  it("reads a configuration of conversions", () => {
    expect(resolveXPixelConfig(CONFIG)).toEqual({
      pixelId: "reh74",
      events: {
        purchase: "tw-reh74-reh75",
        initiate_checkout: "tw-reh74-reh9e",
        selling_page: "tw-reh74-reh9f",
        lead: "tw-reh74-reh9g",
      },
    });
  });

  it("does not mistake the pixel for a conversion", () => {
    expect(resolveXPixelConfig(CONFIG).events).not.toHaveProperty("id");
  });

  it("finds the pixel inside a conversion when none is stated", () => {
    const { id, ...withoutId } = CONFIG;
    void id;

    expect(resolveXPixelConfig(withoutId).pixelId).toBe("reh74");
  });

  it("reads a single id as one conversion for everything", () => {
    expect(resolveXPixelConfig(["tw-reh74-reh9g"])).toEqual({
      pixelId: "reh74",
      events: {},
      fallbackEventId: "tw-reh74-reh9g",
    });
    expect(resolveXPixelConfig("tw-reh74-reh9g").fallbackEventId).toBe(
      "tw-reh74-reh9g",
    );
  });

  it("reads a bare pixel id as a pixel with no conversion", () => {
    expect(resolveXPixelConfig("rcvll")).toEqual({
      pixelId: "rcvll",
      events: {},
    });
  });

  it("resolves anything else to no pixel, rather than throwing", () => {
    // This runs during render: a throw here takes hydration down and blanks the
    // funnel, and the value is authored by a human in a feature-flag UI.
    for (const value of [undefined, null, "", "   ", [], {}, 42, [{ id: 1 }]]) {
      expect(resolveXPixelConfig(value).pixelId).toBeUndefined();
    }
  });
});

describe("xConversionId", () => {
  const resolved = resolveXPixelConfig(CONFIG);

  it("gives each event its own conversion", () => {
    expect(xConversionId(resolved, "purchase")).toBe("tw-reh74-reh75");
    expect(xConversionId(resolved, "initiate_checkout")).toBe("tw-reh74-reh9e");
  });

  it("maps an authored event name onto the key the configuration uses", () => {
    // Named independently: the constructor fires `selling_page_view` and
    // `email`, the ad account calls them `selling_page` and `lead`.
    expect(xConversionId(resolved, "selling_page_view")).toBe("tw-reh74-reh9f");
    expect(xConversionId(resolved, "email")).toBe("tw-reh74-reh9g");
  });

  it("prefers a key named exactly as the event", () => {
    // So adding a conversion is enough to switch an event on; the alias table
    // does not have to grow for every new one.
    const withPaywall = resolveXPixelConfig({
      ...CONFIG,
      paywall_view: "tw-reh74-new01",
    });

    expect(xConversionId(withPaywall, "paywall_view")).toBe("tw-reh74-new01");
  });

  it("has no conversion for an event the configuration does not name", () => {
    expect(xConversionId(resolved, "paywall_view")).toBeUndefined();
    expect(xConversionId(resolved, "something_authored")).toBeUndefined();
  });

  it("passes a conversion authored verbatim straight through", () => {
    expect(xConversionId(resolved, "tw-other-abc12")).toBe("tw-other-abc12");
  });

  it("falls back to the single-conversion configuration", () => {
    const single = resolveXPixelConfig("tw-reh74-reh9g");

    expect(xConversionId(single, "purchase")).toBe("tw-reh74-reh9g");
    expect(xConversionId(single, "paywall_view")).toBe("tw-reh74-reh9g");
  });
});

describe("pickXParams", () => {
  it("keeps what X reads and drops the funnel's own context", () => {
    expect(
      pickXParams({
        value: 66.67,
        currency: "USD",
        conversion_id: "att-1",
        contents: [{ content_id: "p-1" }],
        quiz_page_id: 3833,
        subscription: "4Week",
        i: 4,
      }),
    ).toEqual({
      value: 66.67,
      currency: "USD",
      conversion_id: "att-1",
      contents: [{ content_id: "p-1" }],
    });
  });

  it("drops a supported key with no value", () => {
    expect(pickXParams({ value: 1, contents: undefined })).toEqual({ value: 1 });
  });

  it("has nothing to send when given nothing", () => {
    expect(pickXParams()).toEqual({});
  });
});

describe("loadXPixel", () => {
  it("injects X's snippet and configures the pixel", () => {
    const twq = loadXPixel("reh74")!;

    expect(scripts()).toHaveLength(1);
    expect(twq.queue).toContainEqual(["config", "reh74"]);
  });

  it("configures a pixel exactly once, however often it is asked", () => {
    // Configuring one twice double-counts every conversion after it.
    const twq = loadXPixel("reh74")!;
    loadXPixel("reh74");
    loadXPixel("reh74");

    expect(
      twq.queue?.filter((call) => Array.isArray(call) && call[0] === "config"),
    ).toHaveLength(1);
  });

  it("forwards the receiver uwt.js calls its queue with", () => {
    // uwt.js installs `exe` and invokes it with the queue object as `this`.
    // Spreading the arguments drops that receiver, and the first event after the
    // script lands throws inside X's own code.
    const twq = loadXPixel("reh74")!;
    const receivers: unknown[] = [];
    twq.exe = function exe(this: unknown) {
      receivers.push(this);
    };

    twq("event", "tw-reh74-reh75", {});

    expect(receivers).toEqual([twq]);
  });

  it("does nothing without an id", () => {
    expect(loadXPixel("  ")).toBeUndefined();
    expect(win().twq).toBeUndefined();
  });
});

describe("createXPixelRuntime", () => {
  it("reports each event under its own conversion", () => {
    const twq = jest.fn() as unknown as Twq;
    win().twq = twq;

    const runtime = createXPixelRuntime();
    runtime.configure(CONFIG);
    runtime.track("purchase", { value: 66.67, currency: "USD" });
    runtime.track("email");

    expect(twq).toHaveBeenCalledWith("event", "tw-reh74-reh75", {
      value: 66.67,
      currency: "USD",
    });
    expect(twq).toHaveBeenCalledWith("event", "tw-reh74-reh9g", {});
  });

  it("sends X only the parameters it reads", () => {
    const twq = jest.fn() as unknown as Twq;
    win().twq = twq;

    const runtime = createXPixelRuntime();
    runtime.configure(CONFIG);
    // What the engine merges for an adapter: the funnel's whole context.
    runtime.track("purchase", {
      value: 1,
      quiz_page_id: 3833,
      subscription: "4Week",
    });

    expect(twq).toHaveBeenCalledWith("event", "tw-reh74-reh75", { value: 1 });
  });

  it("holds events fired before the configuration arrived", () => {
    // A host reading its pixel from a feature flag answers a beat after the
    // page does, and a selling-page view fires on arrival.
    const twq = jest.fn() as unknown as Twq;
    win().twq = twq;

    const runtime = createXPixelRuntime();
    runtime.track("selling_page_view", { value: 1 });
    expect(twq).not.toHaveBeenCalled();

    runtime.configure(CONFIG);

    expect(twq).toHaveBeenCalledWith("event", "tw-reh74-reh9f", { value: 1 });
  });

  it("does not configure a pixel it has no conversion for", () => {
    // A bare pixel id is what an environment variable holds. Configuring it
    // activates the tag on that ad account — it appears in X's Pixel Helper and
    // counts as a visit — while no event can ever be fired under it.
    const runtime = createXPixelRuntime();

    expect(runtime.configure("rcvll")).toBe(false);
    expect(win().twq).toBeUndefined();
    expect(scripts()).toHaveLength(0);
  });

  it("still takes the real configuration after refusing a bare pixel", () => {
    const runtime = createXPixelRuntime();
    runtime.configure("rcvll");

    expect(runtime.configure(CONFIG)).toBe(true);
    expect(scripts()).toHaveLength(1);
  });

  it("configures once for the same pixel, so a re-render cannot double it", () => {
    const runtime = createXPixelRuntime();

    expect(runtime.configure(CONFIG)).toBe(true);
    expect(runtime.configure(CONFIG)).toBe(false);
  });

  it("reports nothing for an event the configuration does not name", () => {
    const twq = jest.fn() as unknown as Twq;
    win().twq = twq;

    const runtime = createXPixelRuntime();
    runtime.configure(CONFIG);
    runtime.track("paywall_view", { value: 1 });

    // `configure` legitimately calls twq("config", …); what must not happen is
    // an event going out under a conversion the configuration never named.
    expect(twq).not.toHaveBeenCalledWith(
      "event",
      expect.anything(),
      expect.anything(),
    );
  });

  it("survives a pixel that throws", () => {
    win().twq = (() => {
      throw new Error("blocked");
    }) as unknown as Twq;

    const runtime = createXPixelRuntime();
    runtime.configure(CONFIG);

    expect(() => runtime.track("purchase")).not.toThrow();
  });
});
