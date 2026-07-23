import { createLogger } from "./logger";

// Temporary diagnostics for the "stuck before the loader" dead click. The normal
// nav diagnostics key off a $currentPageId change (nav_start), but this failure
// happens BEFORE navigation — `next()` awaits `runCondition` and, if that hangs,
// `nextPage` is never called, so nothing downstream ever logs. These logs sit
// directly on the navigation path so the hang is visible in the console AND in
// Grafana (service `nav-diag`). Remove once the cause is confirmed.
const faroLog = createLogger({ service: "nav-diag" });

export const navDiag = (event: string, data?: Record<string, unknown>) => {
  try {
    // eslint-disable-next-line no-console
    console.log(`[nav-diag] ${event}`, data ? JSON.stringify(data) : "");
  } catch {
    /* console may be unavailable */
  }
  faroLog.info(`[nav-diag] ${event}`, data ?? {});
};
