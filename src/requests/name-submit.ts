/**
 * `name.submit` — what the design's name step (`name_submit`) asks for: the
 * visitor's name, saved to their account on the payments platform.
 *
 * The email step's twin (`email-submit`): its own action with its own route,
 * always answered by the platform — `UpdateUserProfile {user_id, name}`. The
 * account is the one the email step found or made, sent as `userId`; one that
 * is not the platform's is the same as none, and the answer says the name was
 * not saved rather than failing — a name is never worth losing the visitor.
 *
 * Server-only: the platform key never leaves the host.
 */
import { z } from "zod";

import { ActionError, silentLog, type ActionHandlers, type Log } from "./contract";
import { createNvsClient, type NvsConfig } from "./nvs/client";
import { isPlatformUserId } from "./nvs/actions";
import { toActionError } from "./nvs/errors";

export const NAME_SUBMIT_ACTION = "name.submit";

/*
  This end of the step's wire — `runtime/name-submit` holds the same shapes,
  written again because `src/runtime` and the rest of the package may not
  import each other (`runtime/isolation.test`). Change one and change the other.
*/

/** What the step sends — and nothing beside it. */
const NameSubmitPayload = z.strictObject({
  name: z.string().trim().min(1).max(200),
  userId: z.string().min(1).optional(),
});

/** What this answers — `NameSubmitResponse` in `runtime/name-submit`. */
export type NameSubmitResponse = { saved: true } | { saved: false; reason: "no_user" };

/** The name saved for a `{ name, userId }` body — or an `ActionError` saying why not. */
function nameSubmit(config: NvsConfig, log: Log): (payload: unknown) => Promise<NameSubmitResponse> {
  const rpc = createNvsClient({ ...config, log });

  return async (payload) => {
    const checked = NameSubmitPayload.safeParse(payload);
    if (!checked.success) {
      throw new ActionError(400, { error: "invalid_argument", message: "A name is required." });
    }
    const { name, userId } = checked.data;
    if (!isPlatformUserId(userId)) {
      log.warn("name_submit_no_user", { claimedUserId: userId ?? null });
      return { saved: false, reason: "no_user" };
    }
    try {
      await rpc<Record<string, never>>("/auth.v1.ServiceAccountService/UpdateUserProfile", {
        user_id: userId,
        name,
      });
      log.info("name_submitted", { userId });
      return { saved: true };
    } catch (error) {
      return toActionError(error);
    }
  };
}

/** Handlers answering `name.submit` on a host's shared request route. */
export function nameSubmitHandlers(config: NvsConfig, log: Log = config.log ?? silentLog): ActionHandlers {
  const answer = nameSubmit(config, log);
  return { [NAME_SUBMIT_ACTION]: (payload) => answer(payload) };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * The name step's own route: a `POST` whose body is `{ "name": "…", "userId": "…" }`
 * and nothing else, answered with `NameSubmitResponse` — or a refusal's
 * `{ error, message }` under its status.
 *
 *     // app/api/user/name/route.ts
 *     export const POST = createNameSubmitRoute(nvsConfig, logger);
 *
 * The page sends there once told where it is:
 * `configureRequests({ routes: { "name.submit": "/api/user/name" } })`.
 */
export function createNameSubmitRoute(
  config: NvsConfig,
  log: Log = config.log ?? silentLog,
): (request: Request) => Promise<Response> {
  const answer = nameSubmit(config, log);

  return async (request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    try {
      return json(await answer(body));
    } catch (error) {
      if (error instanceof ActionError) {
        log.warn("name_submit_refused", { status: error.status, error: error.body.error });
        return json(error.body, error.status);
      }
      log.error("name_submit_failed", { error: error instanceof Error ? error.message : String(error) });
      return json({ error: "internal", message: "Something went wrong. Please try again." }, 500);
    }
  };
}
