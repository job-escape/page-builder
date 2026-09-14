/**
 * Time — schema 1.5: the loader's arithmetic, a countdown that remembers, and
 * the steps that move a value or wait for a request.
 *
 * The properties worth holding are the ones a visitor would catch: a countdown
 * that starts over on reload, a loader that stops short of 100, a request sent
 * "without waiting" that nonetheless runs its follow-up on a screen already
 * left, and a frame of animation written into the answers cookie.
 */
import { call } from "./functions";
import { run, valueOf, type ActionContext } from "./interpret";
import { ease, playFrames } from "./motion";
import { createFunnelStore } from "./store";
import { createTimerBook, type TimerRecord } from "./timers";
import type { SourceAction, SourceFunnel, SourceScreen } from "./compiler/source";
import { compileToTree } from "./compiler/tree";

describe("the loader's functions", () => {
  it("adds, subtracts and clamps, reading numeric text", () => {
    expect(call("add", [40, "2"])).toBe(42);
    expect(call("subtract", [10, 3])).toBe(7);
    expect(call("clamp", [140, 0, 100])).toBe(100);
    expect(call("clamp", [-3, 0, 100])).toBe(0);
    expect(call("min", [3, 9, 1])).toBe(1);
    expect(call("max", [3, 9, 1])).toBe(9);
    expect(call("add", ["x", 1])).toBeNull();
  });

  it("formats a number as a loader and a timer read it", () => {
    expect(call("format", [41.6, "percent"])).toBe("42%");
    expect(call("format", [7, "pad2"])).toBe("07");
    expect(call("format", [599, "mm:ss"])).toBe("09:59");
    expect(call("format", [3725, "hh:mm:ss"])).toBe("01:02:05");
    expect(call("format", [59.9, "mm:ss"])).toBe("00:59");
    expect(call("format", [-4, "mm:ss"])).toBe("00:00");
    expect(call("format", [12.4, "int"])).toBe("12");
  });
});

describe("easing", () => {
  it("starts at 0, ends at 1, and bends the way the CSS curves do", () => {
    expect(ease("ease-out", 0)).toBeCloseTo(0);
    expect(ease("ease-out", 1)).toBeCloseTo(1);
    expect(ease("linear", 0.3)).toBeCloseTo(0.3);
    // An ease-out is ahead of linear through the first half.
    expect(ease("ease-out", 0.3)).toBeGreaterThan(0.3);
    expect(ease("ease-in", 0.3)).toBeLessThan(0.3);
  });
});

describe("a timer book", () => {
  const clockAt = (start: number) => {
    let now = start;
    return { clock: () => now, advance: (ms: number) => (now += ms) };
  };

  it("counts a countdown down in whole seconds, rounding up until the last one is gone", () => {
    const { clock, advance } = clockAt(1_000_000);
    const book = createTimerBook({ clock });
    book.start("offer", { mode: "countdown", seconds: 600 });
    expect(book.read("offer")).toBe(600);
    advance(1500);
    expect(book.read("offer")).toBe(599);
    advance(600_000);
    expect(book.read("offer")).toBe(0);
    expect(book.running()).toBe(false);
  });

  it("keeps the deadline it has when it is started again — the offer expires once", () => {
    const { clock, advance } = clockAt(0);
    const book = createTimerBook({ clock });
    book.start("offer", { seconds: 600 });
    advance(120_000);
    book.start("offer", { seconds: 600 });
    expect(book.read("offer")).toBe(480);
    book.start("offer", { seconds: 600, restart: true });
    expect(book.read("offer")).toBe(600);
  });

  it("survives a remount through its storage, and ignores anything that is not a timer", () => {
    const { clock, advance } = clockAt(50_000);
    let saved: Record<string, TimerRecord> | null = null;
    const storage = {
      read: () => saved,
      write: (records: Record<string, TimerRecord>) => {
        saved = JSON.parse(JSON.stringify(records));
      },
    };
    createTimerBook({ clock, storage }).start("offer", { seconds: 60 });
    advance(20_000);
    saved = { ...(saved as unknown as Record<string, TimerRecord>), junk: { mode: "nope" } as never };
    const again = createTimerBook({ clock, storage });
    expect(again.read("offer")).toBe(40);
    expect(again.read("junk")).toBeNull();
  });

  it("waits for asynchronous storage before deciding whether a timer exists", async () => {
    const { clock } = clockAt(10_000);
    const stored: Record<string, TimerRecord> = { offer: { mode: "countdown", start: 0, deadline: 70_000 } };
    const book = createTimerBook({ clock, storage: { read: async () => stored, write: () => undefined } });
    expect(book.read("offer")).toBeNull();
    await book.ready;
    expect(book.read("offer")).toBe(60);
  });

  it("counts up for an elapsed timer and is read as a value", () => {
    const { clock, advance } = clockAt(0);
    const book = createTimerBook({ clock });
    book.start("spent", { mode: "elapsed" });
    advance(65_400);
    expect(valueOf({ timer: "spent" }, { timer: book.read } as never)).toBe(65);
    expect(valueOf({ fn: "format", args: [{ timer: "spent" }, { lit: "mm:ss" }] }, { timer: book.read } as never)).toBe(
      "01:05",
    );
  });
});

describe("playFrames", () => {
  it("ends on exactly 1, and a stop answers false without another frame", async () => {
    const seen: number[] = [];
    const played = playFrames(40, (progress) => seen.push(progress));
    await expect(played.done).resolves.toBe(true);
    expect(seen[seen.length - 1]).toBe(1);

    const stopped: number[] = [];
    const cut = playFrames(10_000, (progress) => stopped.push(progress));
    cut.stop();
    await expect(cut.done).resolves.toBe(false);
  });
});

/** A real store, and a context over it — the host half faked, the store not. */
function storeContext(options: { alive?: boolean; timers?: ReturnType<typeof createTimerBook> } = {}) {
  const onChange = jest.fn();
  const store = createFunnelStore({
    table: {
      progress: { name: "progress", type: "number" },
      done: { name: "done", type: "string" },
      next: { name: "next", type: "string" },
    },
    onChange,
    timers: options.timers,
  });
  const ctx = {
    state: store,
    nav: {
      show: jest.fn(),
      close: jest.fn(),
      wait: jest.fn(async (seconds: number) => {
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        return options.alive !== false;
      }),
      alive: () => () => options.alive !== false,
    },
    req: jest.fn(),
  } as unknown as ActionContext;
  return { store, ctx, onChange };
}

describe("an animate step", () => {
  it("arrives on exactly its target, and reports one value rather than every frame", async () => {
    const { store, ctx, onChange } = storeContext();
    const seen: unknown[] = [];
    store.subscribe(() => seen.push(store.get("progress")));
    await expect(
      run([{ type: "animate", variable: "progress", to: { lit: 100 }, ms: 60, easing: "linear" }], ctx),
    ).resolves.toBe(true);
    expect(store.get("progress")).toBe(100);
    expect(seen.length).toBeGreaterThan(1);
    expect(onChange.mock.calls.filter(([name]) => name === "progress")).toEqual([["progress", 100]]);
  });

  it("stops where it is, and runs nothing after it, when its screen goes", async () => {
    const { store, ctx } = storeContext();
    (ctx.nav as { frames?: unknown }).frames = async () => false;
    await expect(
      run(
        [
          { type: "animate", variable: "progress", to: { lit: 100 }, ms: 1000 },
          { type: "set", variable: "done", value: "yes" },
        ],
        ctx,
      ),
    ).resolves.toBe(false);
    expect(store.get("done")).toBeNull();
  });

  it("goes straight on with `wait: false`, so two things can move together", async () => {
    const { store, ctx } = storeContext();
    await run(
      [
        { type: "animate", variable: "progress", to: { lit: 100 }, ms: 80, wait: false },
        { type: "set", variable: "done", value: "started" },
      ],
      ctx,
    );
    expect(store.get("done")).toBe("started");
    expect(store.get("progress")).not.toBe(100);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(store.get("progress")).toBe(100);
  });
});

describe("a request sent without waiting", () => {
  it("lets the next step run at once, and waitFor joins it again", async () => {
    const { store, ctx } = storeContext();
    let answer: (value: unknown) => void = () => undefined;
    (ctx.req as jest.Mock).mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const steps: SourceAction[] = [
      { type: "submit", action: "plans.build", id: "plan", wait: false, onSuccess: [{ type: "set", variable: "next", value: "ran" }] },
      { type: "set", variable: "done", value: "loader started" },
      { type: "waitFor", request: "plan" },
      { type: "set", variable: "done", value: "plan ready" },
    ];
    const flow = run(steps, ctx);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.get("done")).toBe("loader started");
    expect(store.status("plan")).toBe("pending");
    answer({});
    await expect(flow).resolves.toBe(true);
    expect(store.get("done")).toBe("plan ready");
    expect(store.get("next")).toBe("ran");
  });

  it("does not run its follow-up for a visitor who has left the screen", async () => {
    const { store, ctx } = storeContext({ alive: false });
    (ctx.req as jest.Mock).mockResolvedValue({});
    await run(
      [{ type: "submit", action: "plans.build", wait: false, onSuccess: [{ type: "set", variable: "next", value: "ran" }] }],
      ctx,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.status("plans.build")).toBe("success");
    expect(store.get("next")).toBeNull();
  });
});

describe("a timer step", () => {
  it("starts the timer, never blocks, and runs onEnd when a countdown ends on its screen", async () => {
    const timers = createTimerBook();
    const { store, ctx } = storeContext({ timers });
    await run(
      [
        { type: "timer", id: "offer", seconds: 0.05, onEnd: [{ type: "set", variable: "done", value: "expired" }] },
        { type: "set", variable: "next", value: "went on" },
      ],
      ctx,
    );
    expect(store.get("next")).toBe("went on");
    expect(store.timer("offer")).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(store.get("done")).toBe("expired");
    expect(store.timer("offer")).toBe(0);
  });
});

describe("the manifest, for the new steps", () => {
  const screen = (actions: SourceAction[]): SourceScreen => ({
    id: "s_loader",
    frames: [{ id: "s_loader", parent: null, kind: "frame", pos: "a0", interactions: [{ on: { event: "load" }, do: actions }] }],
  });
  const funnel = (screens: SourceScreen[]): SourceFunnel => ({
    id: 1,
    version: "v1",
    entry: screens[0].id,
    variables: [{ name: "progress", type: "number" }],
    screens,
  });

  it("stamps schema 1.5, and a countdown's onEnd target is reachable", () => {
    const { manifest } = compileToTree(
      funnel([
        screen([{ type: "timer", id: "offer", seconds: 600, onEnd: [{ type: "show", target: "s_expired" }] }]),
        { id: "s_expired", frames: [] },
      ]),
    );
    expect(manifest.schema).toBe("1.5");
    expect(manifest.screens.find((entry) => entry.id === "s_loader")?.next).toEqual(["s_expired"]);
  });
});
