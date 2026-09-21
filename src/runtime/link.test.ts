/**
 * The Open link step — what address it builds, who opens it, and that it never
 * holds the funnel up.
 *
 * It published and did nothing for a release cycle: the editor wrote `link`
 * steps and this runtime had no case for them, so "Add to portfolio" on a
 * dialog was a button that ignored the tap. These are the rules it now keeps.
 */
import { run, type ActionContext } from "./interpret";
import { configureLinks, linkAddress, openLink } from "./link";

const context = (values: Record<string, unknown> = {}): ActionContext =>
  ({
    state: {
      get: (name: string) => values[name] ?? null,
      set: () => undefined,
      select: () => undefined,
    },
    nav: { show: () => undefined, close: () => undefined },
    req: (async () => ({})) as never,
  }) as unknown as ActionContext;

afterEach(() => configureLinks({ open: undefined, session: undefined }));

describe("the address", () => {
  it("fills the session's tokens from the host, read when it is asked", () => {
    let token = "first";
    configureLinks({ session: () => ({ accessToken: token, refreshToken: "renew" }) });
    const template = "https://portfolio.example/builder?access_token={accessToken}&refresh_token={refreshToken}";

    expect(linkAddress(template, () => null)).toBe(
      "https://portfolio.example/builder?access_token=first&refresh_token=renew",
    );
    token = "rotated";
    expect(linkAddress(template, () => null)).toContain("access_token=rotated");
  });

  it("fills a variable the funnel holds, encoded for an address", () => {
    const read = (name: string) => (name === "goal" ? "earn & learn" : null);
    expect(linkAddress("https://app.example/welcome?goal={goal}", read)).toBe(
      "https://app.example/welcome?goal=earn%20%26%20learn",
    );
  });

  it("leaves what nothing fills as it was written", () => {
    expect(linkAddress("https://x.example/?t={accessToken}&g={goal}", () => null)).toBe(
      "https://x.example/?t={accessToken}&g={goal}",
    );
  });

  it("never reads a token from the funnel's own variables", () => {
    // A design cannot declare one; a variable that happened to share the name
    // must not stand in for the session.
    const read = (name: string) => (name === "accessToken" ? "from-a-variable" : null);
    expect(linkAddress("https://x.example/?t={accessToken}", read)).toBe(
      "https://x.example/?t={accessToken}",
    );
  });
});

describe("opening it", () => {
  it("hands the host's opener the address and how far away it should feel", () => {
    const opened: [string, string][] = [];
    configureLinks({ open: (url, as) => opened.push([url, as]) });

    openLink("https://x.example/a", "sheet", () => null);
    openLink("https://x.example/b", undefined, () => null);

    expect(opened).toEqual([
      ["https://x.example/a", "sheet"],
      ["https://x.example/b", "tab"],
    ]);
  });

  it("opens a new tab on the web when the host has not said otherwise", () => {
    const tab = { opener: {} as unknown };
    const open = jest.spyOn(window, "open").mockReturnValue(tab as Window);

    openLink("https://x.example/", "tab", () => null);

    expect(open).toHaveBeenCalledWith("https://x.example/", "_blank");
    expect(tab.opener).toBeNull();
    open.mockRestore();
  });

  it("refuses an address that is code rather than a place", () => {
    const opened: string[] = [];
    configureLinks({ open: (url) => opened.push(url) });
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);

    openLink("javascript:alert(1)", "tab", () => null);

    expect(opened).toEqual([]);
    expect(logged).toHaveBeenCalledWith("pb.link.refused", expect.anything());
    logged.mockRestore();
  });
});

describe("a link step", () => {
  it("opens from a tree and lets what follows it run", async () => {
    const opened: string[] = [];
    configureLinks({
      open: (url) => opened.push(url),
      session: () => ({ accessToken: "abc" }),
    });
    const closed: string[] = [];
    const ctx = context({ goal: "design" });
    ctx.nav.close = () => closed.push("closed");

    const finished = await run(
      [
        { type: "link", url: "https://x.example/?t={accessToken}&g={goal}", as: "sheet" },
        { type: "close" },
      ],
      ctx,
    );

    expect(finished).toBe(true);
    expect(opened).toEqual(["https://x.example/?t=abc&g=design"]);
    expect(closed).toEqual(["closed"]);
  });
});
