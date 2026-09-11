/**
 * The request helper's configuration, as more than one copy of it sees it.
 *
 * Each package entry bundles its own copy of `request.ts`, and a host
 * configures through one entry while `<Funnel>` sends through another. A
 * second module registry is exactly that second copy.
 */
import { configureRequests } from "./request";

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
