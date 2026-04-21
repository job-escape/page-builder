import { BuilderPage } from "../types";

const getVisitedCandidate = <Page extends BuilderPage>(
  candidates: Page[],
  visitedIds: number[],
) => {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return [...visitedIds].reverse().find((pageId) => candidatesById.has(pageId));
};

export const normalizePageHistory = (pageIds: unknown, currentPageId?: number): number[] => {
  const normalizedPageIds = Array.isArray(pageIds)
    ? pageIds.filter((pageId): pageId is number => Number.isInteger(pageId))
    : [];

  if (currentPageId !== undefined && Number.isInteger(currentPageId)) {
    normalizedPageIds.push(currentPageId);
  }

  return normalizedPageIds.filter(
    (pageId, index) => normalizedPageIds.lastIndexOf(pageId) === index,
  );
};

export const pagePointsToPage = (page: BuilderPage, targetPageId: number) => {
  if (page.next_node_id === targetPageId) {
    return true;
  }

  return Boolean(page.condition?.condition.some((branch) => branch.nodeId === targetPageId));
};

export const findPagePointingToPage = <Page extends BuilderPage>({
  pages,
  targetPageId,
  visitedIds,
}: {
  pages: Array<Page | undefined>;
  targetPageId: number;
  visitedIds: number[];
}): Page | null => {
  const candidates = pages.filter(
    (page): page is Page => page !== undefined && pagePointsToPage(page, targetPageId),
  );

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const visitedCandidateId = getVisitedCandidate(candidates, visitedIds);
  return candidates.find((candidate) => candidate.id === visitedCandidateId) ?? candidates[0];
};

export const findPreviousOrderFallbackPage = <Page extends BuilderPage>({
  pages,
  visitedIds,
}: {
  pages: Page[];
  visitedIds: number[];
}): Page | null => {
  if (pages.length === 0) {
    return null;
  }

  const visitedCandidateId = getVisitedCandidate(pages, visitedIds);
  return pages.find((page) => page.id === visitedCandidateId) ?? pages[0];
};

export const resolvePreviousPage = async <Page extends BuilderPage>({
  currentPage,
  fetchPage,
  fetchPagesByOrder,
  lang,
  pageHistory,
  pages,
}: {
  currentPage: Page;
  fetchPage: ({ id, lang }: { id: number; lang?: string }) => Promise<Page>;
  fetchPagesByOrder?: (params: { order: number; lang?: string }) => Promise<Page[]>;
  lang?: string;
  pageHistory: number[];
  pages: Record<number, Page | undefined>;
}): Promise<Page | null> => {
  const previousPageFromLoadedPages = findPagePointingToPage({
    pages: Object.values(pages),
    targetPageId: currentPage.id,
    visitedIds: pageHistory,
  });

  if (previousPageFromLoadedPages) {
    return previousPageFromLoadedPages;
  }

  const previousOrder = currentPage.order - 1;

  if (fetchPagesByOrder && previousOrder >= 0) {
    const previousOrderPages = await fetchPagesByOrder({ order: previousOrder, lang });

    return (
      findPagePointingToPage({
        pages: previousOrderPages,
        targetPageId: currentPage.id,
        visitedIds: pageHistory,
      }) ??
      findPreviousOrderFallbackPage({
        pages: previousOrderPages,
        visitedIds: pageHistory,
      })
    );
  }

  if (pageHistory.length <= 1) {
    return null;
  }

  const previousPageId = pageHistory[pageHistory.length - 2];
  return pages[previousPageId] ?? fetchPage({ id: previousPageId, lang });
};
