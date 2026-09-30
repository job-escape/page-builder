import { useCallback, useEffect, useRef, useState } from "react";

/** How long a run may take before it is shown as busy — below this a spinner only flickers. */
export const IN_FLIGHT_BUSY_DELAY_MS = 250;

/**
 * One run at a time for a control whose action is async.
 *
 * A button used to guard itself with its `disabled` state only, which the
 * content sets from inside the action (`button-pending`) — so it closed only
 * after whatever ran before that step had finished. On an upsell that was a
 * whole request (`PUT /parameters/upsell_action/`), and a second tap in that
 * window started a second purchase: one charged, the other was refused, and
 * the buyer saw a decline modal before the success one.
 *
 * The guard is a ref, so it closes synchronously on the first tap — no render
 * has to land before the second one is refused. `task` is also called
 * synchronously, so anything in it that needs the user gesture (opening a
 * window, unmuting a video, a wallet sheet) still has it.
 *
 * `busy` turns on only once a run has lasted `delayMs`, for the spinner.
 */
export function useInFlight(delayMs: number = IN_FLIGHT_BUSY_DELAY_MS) {
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    (task: () => unknown): boolean => {
      if (inFlight.current) return false;
      inFlight.current = true;

      const timer = setTimeout(() => {
        if (mounted.current) setBusy(true);
      }, delayMs);

      const release = () => {
        clearTimeout(timer);
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      };

      let result: unknown;
      try {
        result = task();
      } catch (error) {
        release();
        throw error;
      }
      void Promise.resolve(result).then(release, release);
      return true;
    },
    [delayMs],
  );

  return { run, busy };
}
