import { getInternalFaroFromGlobalObject, LogLevel } from "@grafana/faro-web-sdk";

// Accept any object (incl. concrete interfaces like RequestTiming), matching the
// permissive shape next-axiom's logger accepted.
type LogData = Record<string, unknown> | object;

export interface Logger {
  info: (message: string, data?: LogData) => void;
  warn: (message: string, data?: LogData) => void;
  error: (message: string, data?: LogData) => void;
  with: (context: LogData) => Logger;
}

// Faro log context must be a flat Record<string, string> to stay queryable in
// Grafana; non-string values are JSON-stringified.
function toContext(base: LogData, data?: LogData): Record<string, string> {
  const context: Record<string, string> = {};
  Object.entries({ ...base, ...data }).forEach(([key, value]) => {
    context[key] = typeof value === "string" ? value : JSON.stringify(value);
  });
  return context;
}

/**
 * Faro-backed logger — a drop-in replacement for next-axiom's `useLogger()`.
 *
 * The host app (the funnel) initialises Grafana Faro; we read that instance from
 * the global object at log time (`getInternalFaroFromGlobalObject`), which works
 * across bundles. A no-op until the host has initialised Faro, so nothing is
 * shipped when the SDK isn't configured.
 */
export function createLogger(base: LogData = {}): Logger {
  const push = (level: LogLevel, message: string, data?: LogData) => {
    const faro = getInternalFaroFromGlobalObject();
    faro?.api?.pushLog([message], { level, context: toContext(base, data) });
  };

  return {
    info: (message, data) => push(LogLevel.INFO, message, data),
    warn: (message, data) => push(LogLevel.WARN, message, data),
    error: (message, data) => push(LogLevel.ERROR, message, data),
    with: (context) => createLogger({ ...base, ...context }),
  };
}

/** Drop-in for `next-axiom`'s `useLogger()`. Not a real hook — safe to call anywhere. */
export function useLogger(): Logger {
  return createLogger();
}
