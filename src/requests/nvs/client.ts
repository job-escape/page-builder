/**
 * The NVS payments platform, over Connect-RPC JSON — one wrapper for every call.
 *
 * Ported from `sart-funnel`'s `shared/api/server/nvs-client.ts`, which is the
 * newer of the two copies (funnel's still blind-retries a 429). The rules are
 * the platform's contract and are kept exactly:
 *
 * - always `POST`, JSON body, `Authorization: Bearer <key>` and `X-Project-Id`;
 * - **one request per call, never retried.** A failure is logged and thrown at
 *   once; whoever made the call decides what to do next. A retry here sent the
 *   same write to the platform up to three times behind the caller's back;
 * - the error envelope becomes an `NvsApiError`, carrying the platform's
 *   `reason` / `category` enum when it sends one.
 *
 * What changed is only where the configuration and the logger come from: the
 * host passes them in, so the package reads no environment of its own.
 */
import { silentLog, type Log } from "../contract";

export type NvsConfig = {
  /** `NVS_API_BASE_URL` — the hub, without a trailing slash. */
  baseUrl: string;
  /** `NVS_API_KEY`. */
  apiKey: string;
  /** `NVS_PROJECT_ID`. */
  projectId: string;
  log?: Log;
  /** Injected in tests. */
  fetch?: typeof fetch;
  /**
   * How the host's `fetch` caches the product catalogue (`ListProducts`).
   *
   * A Next.js host hands it the framework's own:
   *
   *     catalogCache: { next: { revalidate: 3600, tags: ["subscriptions"] } }
   *
   * and the catalogue then lives in the framework's data cache rather than in
   * this process: shared by every server instance, kept across a deploy, and
   * thrown away on demand with `revalidateTag("subscriptions", …)`. Absent, the
   * catalogue is kept in this process's memory for an hour, as it always was
   * (see `createCatalog`) — the right thing for a host with no such cache.
   *
   * Only the catalogue is ever cached. Every other call — a user, a payment
   * session — is a write, and goes out `no-store`.
   */
  catalogCache?: NvsFetchCache;
};

/**
 * `fetch` options that say how a response is cached. Spread into the call as
 * they are, so a host's framework reads its own keys: `cache`, and Next.js's
 * `next: { revalidate, tags }`.
 */
export type NvsFetchCache = {
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
};

export type KnownNvsErrorCode =
  | "unauthenticated"
  | "permission_denied"
  | "invalid_argument"
  | "failed_precondition"
  | "not_found"
  | "resource_exhausted"
  | "internal"
  | "unavailable";

export interface NvsErrorDetail {
  type?: string;
  value?: string;
  debug?: { reason?: string; category?: string };
}

export interface NvsErrorEnvelope {
  code: KnownNvsErrorCode | (string & NonNullable<unknown>);
  message: string;
  details?: NvsErrorDetail[];
}

export const PAYMENT_ERROR_DETAIL_TYPE = "payments.v1.ErrorDetail";

/** Connect sends the bare proto type name; a google.rpc encoder prefixes it. */
const paymentErrorDetail = (details?: NvsErrorDetail[]) =>
  details?.find((detail) => detail.type?.endsWith(PAYMENT_ERROR_DETAIL_TYPE))?.debug;

export class NvsApiError extends Error {
  readonly code: string;

  readonly httpStatus: number;

  /** Stable enum for *why* the platform refused; absent on legacy paths. */
  readonly reason?: string;

  /** The reason's family — what to do when the reason itself is unknown. */
  readonly category?: string;

  constructor(envelope: NvsErrorEnvelope, httpStatus: number) {
    super(envelope.message);
    this.name = "NvsApiError";
    this.code = envelope.code;
    this.httpStatus = httpStatus;
    const detail = paymentErrorDetail(envelope.details);
    this.reason = detail?.reason;
    this.category = detail?.category;
  }
}

function headerNumber(response: Response, name: string): number | undefined {
  const raw = response.headers.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Credentials inside platform payloads — never written to a log. Both spellings. */
const NVS_SECRET_KEYS = new Set([
  "initPayload",
  "init_payload",
  "clientToken",
  "client_token",
  "tokens",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
]);

/** A payload's shape for a log line: keys kept, secrets and personal values redacted. */
function describe(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 5).map(describe);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      NVS_SECRET_KEYS.has(key) || /email/i.test(key) ? "[redacted]" : describe(entry),
    ]),
  );
}

export type NvsRpc = <TResponse>(
  procedure: string,
  body: Record<string, unknown>,
  /** How this one call may be cached — absent, it is not. See `NvsConfig.catalogCache`. */
  caching?: NvsFetchCache,
) => Promise<TResponse>;

export function createNvsClient(config: NvsConfig): NvsRpc {
  const log = config.log ?? silentLog;
  const doFetch = config.fetch ?? fetch;

  return async function nvsRpc<TResponse>(
    procedure: string,
    body: Record<string, unknown>,
    caching?: NvsFetchCache,
  ): Promise<TResponse> {
    const url = `${config.baseUrl}${procedure}`;
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await doFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "X-Project-Id": config.projectId,
        },
        body: JSON.stringify(body),
        // Never cached, unless the caller says how: a framework's fetch would
        // otherwise be free to answer a write from a response it kept.
        ...(caching ?? { cache: "no-store" as const }),
      } as RequestInit);
    } catch (error) {
      log.error("nvs_rpc_network_error", {
        procedure,
        request: describe(body),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    if (response.ok) {
      const data = (await response.json()) as TResponse;
      log.info("nvs_rpc", {
        procedure,
        status: response.status,
        request: describe(body),
        response: describe(data),
        durationMs: Date.now() - startedAt,
      });
      return data;
    }

    let envelope: NvsErrorEnvelope;
    try {
      envelope = (await response.json()) as NvsErrorEnvelope;
    } catch {
      envelope = { code: "internal", message: `HTTP ${response.status}` };
    }

    const rateLimited = envelope.code === "resource_exhausted";
    const detail = paymentErrorDetail(envelope.details);
    log.error("nvs_rpc_error", {
      procedure,
      status: response.status,
      code: envelope.code,
      message: envelope.message,
      request: describe(body),
      response: describe(envelope),
      reason: detail?.reason,
      category: detail?.category,
      durationMs: Date.now() - startedAt,
      ...(rateLimited
        ? {
            retryAfter: response.headers.get("retry-after") ?? undefined,
            rateLimitPerMinute: headerNumber(response, "x-ratelimit-limit"),
            rateLimitRemaining: headerNumber(response, "x-ratelimit-remaining"),
            rateLimitResetAt: headerNumber(response, "x-ratelimit-reset"),
          }
        : {}),
    });

    throw new NvsApiError(envelope, response.status);
  };
}
