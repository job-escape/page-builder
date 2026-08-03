import { BuilderPage, Condition } from "../types";

import {
  findPagePointingToPage,
  findPreviousOrderFallbackPage,
  normalizePageHistory,
  pagePointsToPage,
  resolvePreviousPage,
} from "./previous-page";

const condition = (...nodeIds: Array<number | null>): Condition => ({
  id: 1,
  condition: nodeIds.map((nodeId) => ({ rules: { all: [] }, nodeId })),
});

const page = (overrides: Partial<BuilderPage> & { id: number }): BuilderPage => ({
  design_url: "https://cdn.test/design.json",
  mdx_url: "https://cdn.test/page.mdx",
  order: 0,
  tree_order: 0,
  pageId: overrides.id * 10,
  ...overrides,
});

/*
 * Reverse navigation. The engine has no back-pointers — a page records where it
 * goes next, never where it came from — so "previous" is reconstructed by
 * searching for whatever page points at this one. That reconstruction is what
 * the browser back button and every Back control in a funnel run through, and
 * getting it wrong strands the user: sent to a page they never saw, or to the
 * wrong arm of a branch they already answered.
 *
 * The ordering rule is the subtle part. When several pages point at the current
 * one — which is normal, since branches converge — the history decides, most
 * recently visited first. Anything else walks the user back into a branch they
 * did not take.
 */
describe("normalizePageHistory", () => {
  it("appends the current page to the history", () => {
    expect(normalizePageHistory([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it("keeps only the last occurrence of a repeated page", () => {
    // A loop back to an earlier page makes that page the recent one; leaving the
    // first occurrence in place would walk back to where it was first seen.
    expect(normalizePageHistory([1, 2, 1, 3])).toEqual([2, 1, 3]);
  });

  it("moves a page to the end when it is re-entered as the current one", () => {
    expect(normalizePageHistory([1, 2, 3], 2)).toEqual([1, 3, 2]);
  });

  it("survives a history that is not an array", () => {
    // It arrives from storage, so it can be anything at all.
    expect(normalizePageHistory(undefined, 5)).toEqual([5]);
    expect(normalizePageHistory(null)).toEqual([]);
    expect(normalizePageHistory("1,2,3")).toEqual([]);
  });

  it("drops entries that are not whole numbers", () => {
    expect(normalizePageHistory([1, "2", 3.5, null, NaN, 4])).toEqual([1, 4]);
  });

  it("ignores a current page that is not a whole number", () => {
    expect(normalizePageHistory([1], undefined)).toEqual([1]);
    expect(normalizePageHistory([1], NaN)).toEqual([1]);
  });

  it("returns an empty history rather than throwing on nothing at all", () => {
    expect(normalizePageHistory([])).toEqual([]);
  });
});

describe("pagePointsToPage", () => {
  it("matches on the direct next pointer", () => {
    expect(pagePointsToPage(page({ id: 1, next_node_id: 2 }), 2)).toBe(true);
    expect(pagePointsToPage(page({ id: 1, next_node_id: 3 }), 2)).toBe(false);
  });

  it("matches a page that reaches the target through a condition branch", () => {
    const branching = page({ id: 1, condition: condition(7, 2) });

    expect(pagePointsToPage(branching, 2)).toBe(true);
    expect(pagePointsToPage(branching, 9)).toBe(false);
  });

  it("matches a branch even when the direct pointer goes elsewhere", () => {
    const branching = page({ id: 1, next_node_id: 99, condition: condition(2) });

    expect(pagePointsToPage(branching, 2)).toBe(true);
  });

  it("does not match a page with neither pointer nor condition", () => {
    expect(pagePointsToPage(page({ id: 1 }), 2)).toBe(false);
  });

  it("does not treat a null branch target as a match", () => {
    expect(pagePointsToPage(page({ id: 1, condition: condition(null) }), 2)).toBe(false);
  });
});

describe("findPagePointingToPage", () => {
  it("finds the single page that points at the target", () => {
    const pages = [page({ id: 1, next_node_id: 2 }), page({ id: 3 })];

    expect(findPagePointingToPage({ pages, targetPageId: 2, visitedIds: [] })?.id).toBe(1);
  });

  it("returns null when nothing points at the target", () => {
    expect(
      findPagePointingToPage({ pages: [page({ id: 3 })], targetPageId: 2, visitedIds: [] }),
    ).toBeNull();
  });

  it("prefers the most recently visited page when several point at the target", () => {
    // Two branches converge. The user came through 5, so Back belongs there.
    const pages = [page({ id: 1, next_node_id: 9 }), page({ id: 5, next_node_id: 9 })];

    expect(findPagePointingToPage({ pages, targetPageId: 9, visitedIds: [1, 5] })?.id).toBe(5);
    expect(findPagePointingToPage({ pages, targetPageId: 9, visitedIds: [5, 1] })?.id).toBe(1);
  });

  it("falls back to the first candidate when none was visited", () => {
    // Deep-linked into the middle of a funnel: there is no history to consult,
    // and a wrong-but-adjacent page beats refusing to go back at all.
    const pages = [page({ id: 1, next_node_id: 9 }), page({ id: 5, next_node_id: 9 })];

    expect(findPagePointingToPage({ pages, targetPageId: 9, visitedIds: [77] })?.id).toBe(1);
  });

  it("skips holes in the page map", () => {
    // `pages` is a sparse record of what has loaded, so undefined is expected.
    const pages = [undefined, page({ id: 4, next_node_id: 9 }), undefined];

    expect(findPagePointingToPage({ pages, targetPageId: 9, visitedIds: [] })?.id).toBe(4);
  });
});

describe("findPreviousOrderFallbackPage", () => {
  it("returns the most recently visited of the candidates", () => {
    const pages = [page({ id: 1 }), page({ id: 2 }), page({ id: 3 })];

    expect(findPreviousOrderFallbackPage({ pages, visitedIds: [3, 2] })?.id).toBe(2);
  });

  it("returns the first page when none was visited", () => {
    const pages = [page({ id: 1 }), page({ id: 2 })];

    expect(findPreviousOrderFallbackPage({ pages, visitedIds: [] })?.id).toBe(1);
  });

  it("returns null for an empty candidate list", () => {
    expect(findPreviousOrderFallbackPage({ pages: [], visitedIds: [1] })).toBeNull();
  });
});

describe("resolvePreviousPage", () => {
  const fetchPage = jest.fn(async ({ id }: { id: number }) => page({ id }));

  beforeEach(() => {
    fetchPage.mockClear();
  });

  it("uses an already-loaded page without fetching anything", () => {
    const pages = { 1: page({ id: 1, next_node_id: 2 }), 2: page({ id: 2, order: 1 }) };

    return resolvePreviousPage({
      currentPage: pages[2],
      fetchPage,
      pageHistory: [1, 2],
      pages,
    }).then((previous) => {
      expect(previous?.id).toBe(1);
      expect(fetchPage).not.toHaveBeenCalled();
    });
  });

  it("asks for the previous order when no loaded page points here", async () => {
    const current = page({ id: 9, order: 3 });
    const fetchPagesByOrder = jest.fn(async () => [page({ id: 4, next_node_id: 9, order: 2 })]);

    const previous = await resolvePreviousPage({
      currentPage: current,
      fetchPage,
      fetchPagesByOrder,
      lang: "es",
      pageHistory: [9],
      pages: { 9: current },
    });

    expect(previous?.id).toBe(4);
    expect(fetchPagesByOrder).toHaveBeenCalledWith({ order: 2, lang: "es" });
  });

  it("falls back to any page of the previous order when none points here", async () => {
    // A branch whose target was rewritten after the user passed through: the
    // pointer is gone, but the adjacent page is still a better Back than none.
    const current = page({ id: 9, order: 3 });
    const fetchPagesByOrder = jest.fn(async () => [
      page({ id: 4, order: 2 }),
      page({ id: 5, order: 2 }),
    ]);

    const previous = await resolvePreviousPage({
      currentPage: current,
      fetchPage,
      fetchPagesByOrder,
      pageHistory: [5, 9],
      pages: { 9: current },
    });

    expect(previous?.id).toBe(5);
  });

  it("does not ask for a negative order", async () => {
    const current = page({ id: 1, order: 0 });
    const fetchPagesByOrder = jest.fn(async () => []);

    await resolvePreviousPage({
      currentPage: current,
      fetchPage,
      fetchPagesByOrder,
      pageHistory: [1],
      pages: { 1: current },
    });

    expect(fetchPagesByOrder).not.toHaveBeenCalled();
  });

  it("walks the history back when there is no order lookup", async () => {
    const current = page({ id: 9, order: 3 });

    const previous = await resolvePreviousPage({
      currentPage: current,
      fetchPage,
      pageHistory: [4, 9],
      pages: { 9: current },
    });

    expect(fetchPage).toHaveBeenCalledWith({ id: 4, lang: undefined });
    expect(previous?.id).toBe(4);
  });

  it("returns null on the first page of a run", async () => {
    // Nothing before it, so Back must be inert rather than guessing.
    const current = page({ id: 1, order: 0 });

    expect(
      await resolvePreviousPage({
        currentPage: current,
        fetchPage,
        pageHistory: [1],
        pages: { 1: current },
      }),
    ).toBeNull();
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("prefers a loaded page over the fetch", async () => {
    const current = page({ id: 9, order: 3 });
    const earlier = page({ id: 4, order: 2 });

    const previous = await resolvePreviousPage({
      currentPage: current,
      fetchPage,
      pageHistory: [4, 9],
      pages: { 4: earlier, 9: current },
    });

    expect(previous).toBe(earlier);
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
