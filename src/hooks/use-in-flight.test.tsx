import { act } from "react";
import { createRoot } from "react-dom/client";

import { IN_FLIGHT_BUSY_DELAY_MS, useInFlight } from "./use-in-flight";

// This line has no @testing-library/react; a minimal renderHook is enough here.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renderHook = <T,>(hook: () => T) => {
  const result = { current: undefined as unknown as T };
  const Probe = () => {
    result.current = hook();
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  return { result };
};

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("useInFlight", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("ignores a second run while the first is still going — the double purchase", () => {
    const { result } = renderHook(() => useInFlight());
    const pending = deferred();
    const task = jest.fn(() => pending.promise);

    // Both taps land before any render — the case a `disabled` state missed.
    act(() => {
      expect(result.current.run(task)).toBe(true);
      expect(result.current.run(task)).toBe(false);
    });

    expect(task).toHaveBeenCalledTimes(1);
  });

  it("calls the task synchronously, so it keeps the user gesture", () => {
    const { result } = renderHook(() => useInFlight());
    let called = false;

    result.current.run(() => {
      called = true;
    });

    expect(called).toBe(true);
  });

  it("takes a new run once the first has finished", async () => {
    const { result } = renderHook(() => useInFlight());
    const pending = deferred();
    const task = jest.fn(() => pending.promise);

    act(() => {
      result.current.run(task);
    });
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    act(() => {
      expect(result.current.run(task)).toBe(true);
    });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("takes a new run after the first failed, so a decline can be retried", async () => {
    const { result } = renderHook(() => useInFlight());
    const pending = deferred();

    act(() => {
      result.current.run(() => pending.promise);
    });
    await act(async () => {
      pending.reject(new Error("network"));
      await pending.promise.catch(() => undefined);
    });

    const retry = jest.fn();
    act(() => {
      expect(result.current.run(retry)).toBe(true);
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("takes a new run after the task threw synchronously", () => {
    const { result } = renderHook(() => useInFlight());

    expect(() =>
      result.current.run(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    const retry = jest.fn();
    expect(result.current.run(retry)).toBe(true);
  });

  it("is busy only once a run outlasts the delay, and not after it ends", async () => {
    const { result } = renderHook(() => useInFlight());
    const pending = deferred();

    act(() => {
      result.current.run(() => pending.promise);
    });
    expect(result.current.busy).toBe(false);

    act(() => {
      jest.advanceTimersByTime(IN_FLIGHT_BUSY_DELAY_MS - 1);
    });
    expect(result.current.busy).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(result.current.busy).toBe(false);
  });

  it("never shows busy for a run that ends before the delay", async () => {
    const { result } = renderHook(() => useInFlight());

    await act(async () => {
      result.current.run(() => Promise.resolve());
    });
    act(() => {
      jest.advanceTimersByTime(IN_FLIGHT_BUSY_DELAY_MS * 2);
    });

    expect(result.current.busy).toBe(false);
  });
});
