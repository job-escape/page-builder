/**
 * The request helper's configuration, as more than one copy of it sees it.
 *
 * Each package entry bundles its own copy of `request.ts`, and a host
 * configures through one entry while `<Funnel>` sends through another. A
 * second module registry is exactly that second copy.
 */
import { RequestFailed, configureRequests, request } from "./request";

type RequestModule = typeof import("./request");

const answered = () =>
  jest.fn(async () => ({ ok: true, status: 200, text: async () => '{"leadId": 7}' }));

afterEach(() => {
  jest.restoreAllMocks();
});

it("sends through a second copy of the module to the endpoint the first was given", async () => {
  configureRequests({ endpoint: "https://funnel.test/api/funnel/request", context: { design: "132" } });

  let other: RequestModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a second registry is the point
    other = require("./request") as RequestModule;
  });

  const fetchMock = answered();
  global.fetch = fetchMock as unknown as typeof fetch;

  await expect(other!.request("api:1", { email: "a@b.co" })).resolves.toEqual({ leadId: 7 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://funnel.test/api/funnel/request");
  expect(JSON.parse(String(init.body))).toEqual({
    action: "api:1",
    payload: { email: "a@b.co" },
    context: { design: "132" },
  });
});

it("sends the page's own context as JSON, and words a refusal from its message", async () => {
  configureRequests({
    endpoint: "https://funnel.test/api/funnel/request",
    context: { design: "132", page: { pixel_ids: ["px1"], is_3ds: true } },
  });
  const refusal = { error: "already_owned", message: "You are already subscribed to this plan.", action: "continue" };
  const fetchMock = jest.fn(async () => ({ ok: false, status: 400, text: async () => JSON.stringify(refusal) }));
  global.fetch = fetchMock as unknown as typeof fetch;

  const failure = await request("payments.create_session", {}).catch((error: unknown) => error);
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init.body)).context).toEqual({ design: "132", page: { pixel_ids: ["px1"], is_3ds: true } });
  expect(failure).toBeInstanceOf(RequestFailed);
  expect(failure).toMatchObject({ status: 400, message: refusal.message, body: refusal });
});

it("still words a refusal from error when a route sends no message", async () => {
  configureRequests({ endpoint: "https://funnel.test/api/funnel/request" });
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 502,
    text: async () => '{"error": "We could not save that. Please try again."}',
  })) as unknown as typeof fetch;
  await expect(request("api:1")).rejects.toMatchObject({ message: "We could not save that. Please try again." });
});
