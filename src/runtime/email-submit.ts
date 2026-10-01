/**
 * The email step's wire: what `email.submit` is sent, what it answers, and how
 * it refuses — written once, as schemas, and read by both ends.
 *
 * The design's step (`runtime/interpret`) and the host's handler
 * (`requests/email-submit`) are built into different entries and run on
 * different machines. Each used to know the other's JSON by reading its code;
 * now the handler's answer is typed by `EmailSubmitResponse` and the step
 * parses with it, so a field renamed on one side is a type error on that side
 * and a failed parse on the other — not a `userId` quietly left unset.
 *
 * Nothing but schemas: no server code, no runtime code, safe in either bundle.
 */
import { z } from "zod";

/** The name the step asks for, and a host's route answers to. */
export const EMAIL_SUBMIT_ACTION = "email.submit";

/** An address as typed: spaces around it dropped, then checked. */
export const EmailAddress = z.string().trim().pipe(z.email());

/** What the step sends. */
export const EmailSubmitPayload = z.object({ email: EmailAddress });
export type EmailSubmitPayload = z.infer<typeof EmailSubmitPayload>;

/** What the handler answers when the account was found or made. */
export const EmailSubmitResponse = z.object({
  /** The account's id on the payments platform — the system variable `userId`. */
  userId: z.string().min(1),
  /** True when this email had no account until now. */
  created: z.boolean(),
  /** int64 as a string; absent from platform builds that predate it. */
  analyticsId: z.string().min(1).optional(),
});
export type EmailSubmitResponse = z.infer<typeof EmailSubmitResponse>;

/** The body of a refusal — an `ActionError`'s, as the route sends it. */
export const EmailSubmitRefusal = z.object({
  /** The code a design branches on: `invalid_argument`, `unavailable`, … */
  error: z.string().min(1),
  message: z.string().optional(),
});
export type EmailSubmitRefusal = z.infer<typeof EmailSubmitRefusal>;

/**
 * A failed request as the step catches it — `RequestFailed`'s fields, read by
 * shape rather than `instanceof`, since each entry bundles its own copy of
 * that class. `body` is empty when nothing answered (a timeout, a dropped
 * connection), so it is a refusal or nothing.
 */
export const EmailSubmitFailure = z.object({
  status: z.number(),
  message: z.string(),
  body: EmailSubmitRefusal.optional().catch(undefined),
});
