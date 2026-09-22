/**
 * The phone's default opener: `Linking`, registered by the native entry, and
 * only off the web.
 */
const LINKS = Symbol.for("@job-escape/page-builder/links");
const slot = () => (globalThis as Record<symbol, { fallback?: unknown } | undefined>)[LINKS];

afterEach(() => {
  jest.resetModules();
  if (slot()) slot()!.fallback = undefined;
});

function load(os: string, openURL: jest.Mock) {
  jest.doMock("react-native", () => ({ Platform: { OS: os }, Linking: { openURL } }));
  jest.isolateModules(() => {
    require("./link");
  });
  return require("../link") as typeof import("../link");
}

it("hands a link to Linking on a phone", () => {
  const openURL = jest.fn().mockResolvedValue(undefined);
  const { openLink } = load("ios", openURL);
  openLink("https://x.example/?g={goal}", "sheet", () => "a b");
  expect(openURL).toHaveBeenCalledWith("https://x.example/?g=a%20b");
});

it("leaves the browser's own default in place on react-native-web", () => {
  load("web", jest.fn());
  expect(slot()?.fallback).toBeUndefined();
});
