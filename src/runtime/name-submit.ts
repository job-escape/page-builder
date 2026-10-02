/**
 * The name step's wire: what `name.submit` is sent and what it answers — as
 * schemas the step parses with, the way the email step's are (`email-submit`).
 *
 * The host's handler (`requests/name-submit`) answers with the same shapes,
 * declared again on its side: `src/runtime` and the rest of the package may
 * not import each other (`isolation.test`).
 */
import { z } from "zod";

/** The name the step asks for, and a host's route answers to. */
export const NAME_SUBMIT_ACTION = "name.submit";

/** A name as typed: spaces around it dropped, and something left. */
export const PersonName = z.string().trim().min(1).max(200);

/** What the step sends: the name, and whose it is. */
export const NameSubmitPayload = z.object({
  name: PersonName,
  /** The account the email step found or made — the system variable `userId`. */
  userId: z.string().min(1).optional(),
});
export type NameSubmitPayload = z.infer<typeof NameSubmitPayload>;

/**
 * What the handler answers. `saved` is false when there was no account to put
 * the name on — the visitor has not been through the email step — and `reason`
 * says so. An answer may carry other fields beside these; they are let through.
 */
export const NameSubmitResponse = z.looseObject({
  saved: z.boolean(),
  reason: z.string().optional(),
});
export type NameSubmitResponse = z.infer<typeof NameSubmitResponse>;
