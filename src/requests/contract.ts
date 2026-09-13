/**
 * The named requests a published design can make, and how a host answers them.
 *
 * A design is a public file, so it never carries an address or a key: a
 * `submit` step names an action — `plans.list` — and the funnel's own server
 * resolves the name. Two hosts serve designs (`funnel` for JobEscape, `sart-funnel`
 * for SArt) against two different backends, and until this package each wrote
 * its own copy of every call; the copies had already drifted. So the names, the
 * payloads, the answers and the error bodies are defined once, here, and each
 * backend is an implementation of the same five actions.
 *
 * **The upstream requests are not this file's to change.** Each implementation
 * sends exactly what the host's existing code sent to the same backend; the
 * tests beside them pin the bodies.
 *
 * Server-only and framework-free: a `Request` in, a `Response` out, `fetch` for
 * everything else — so a Next route handler, an edge function or a test can
 * all call it.
 */

/** The actions a design can name, beside `api:<id>` project API calls. */
export const ACTION_NAMES = [
  "leads.create",
  "leads.update_name",
  "plans.list",
  "payments.create_session",
  "payments.confirm",
] as const;

export type ActionName = (typeof ACTION_NAMES)[number];

/** Anything a payload or an answer holds: JSON. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type Payload = Record<string, unknown>;

/**
 * What the runtime sends beside the payload — `configureRequests({ context })`
 * in the host — plus what only the server can know about the request.
 */
export type RequestContext = {
  /** The funnel's id as the host names it — the design id on `/t` and `/f`. */
  funnel?: string | number;
  /** The design the artifact was published from. */
  design?: string | number;
  /** The artifact's content version. */
  version?: string;
  /** The brand this visitor was assigned, when the design has variants. */
  variant?: string;
  /**
   * The project the design belongs to — its slug, as the publish stamped it on
   * the manifest (`jobescape`, `sart`). A host that serves more than one
   * project's funnels picks the backend by it (`createRequestRoute`'s
   * `actions` as a function).
   */
  project?: string;
  /**
   * Values the host's page knows and the design does not: pixel ids from
   * GrowthBook, paywall experiment flags, the device id. Forwarded verbatim by
   * the host's `configureRequests` context; an implementation reads only the
   * keys it documents.
   */
  page?: Record<string, unknown>;
  /** The incoming request — its headers (geo, user agent) and cookies. */
  request: Request;
  /**
   * Headers to add to the answer — a `Set-Cookie` when an action learned who the
   * visitor is and the page keeps that in a cookie. The route copies them on.
   */
  responseHeaders: Headers;
};

/**
 * One action's implementation. Resolves with the answer the design's `into`
 * maps from; rejects with an `ActionError` for anything a visitor should see a
 * specific status for, or with anything else for a 500.
 */
export type ActionHandler = (payload: Payload, context: RequestContext) => Promise<Record<string, unknown>>;

export type ActionHandlers = Partial<Record<ActionName, ActionHandler>> & Record<string, ActionHandler | undefined>;

/**
 * A refusal with a status and a body the browser can act on.
 *
 * `body.action` is the checkout's contract for what to do next (`continue`,
 * `blocked`, `new_session`, `card_error`, `unavailable`); it rides into the
 * design through `errorInto` and a condition on it.
 */
export class ActionError extends Error {
  readonly status: number;

  readonly body: Record<string, unknown>;

  constructor(status: number, body: { error: string; message?: string; [key: string]: unknown }) {
    super(body.message ?? body.error);
    this.name = "ActionError";
    this.status = status;
    this.body = body;
  }
}

/** A structured log line. Hosts pass their own logger; the default is silent. */
export type Log = {
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
};

export const silentLog: Log = { info: () => {}, warn: () => {}, error: () => {} };

/** The ISO country the edge placed this request in, or undefined — see `buyerCountry`. */
export function buyerCountry(request: Request): string | undefined {
  const country = request.headers.get("x-vercel-ip-country")?.trim().toUpperCase();
  if (!country || country === "XX" || !/^[A-Z]{2}$/.test(country)) return undefined;
  return country;
}

/** The visitor's IP as the edge saw it. */
export function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || undefined;
}

/** A cookie from the request, decoded, or undefined. */
export function cookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    if (part.slice(0, at).trim() !== name) continue;
    const raw = part.slice(at + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/** A string from a payload, trimmed, or undefined when absent or blank. */
export function text(payload: Payload, key: string): string | undefined {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** A number from a payload — numeric text counts — or undefined. */
export function number(payload: Payload, key: string): number | undefined {
  const value = payload[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
