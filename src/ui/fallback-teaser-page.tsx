"use client";

import { useLogger } from "next-axiom";
import { useRouter } from "next/navigation";

import { useEffect, useState } from "react";

import { Button } from "./internal/button";

import { usePage } from "../hooks/use-page";

const fallbackContent = {
  title: "Small steps, big wins",
  description:
    "This page didn’t load as expected — no worries, it happens. Hit try again and we’ll get you back on track.",
};

type FallbackTeaserPageProps = {
  currentPageId?: number | null;
  reason: "missing_html" | "missing_page";
};

export function FallbackTeaserPage({
  currentPageId,
  reason,
}: FallbackTeaserPageProps) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);
  const logger = useLogger().with({
    fallback_reason: reason,
    fallback_page_id: currentPageId,
  });

  useEffect(() => {
    const payload = {
      fallback_reason: reason,
      fallback_page_id: currentPageId,
    };

    logger.warn("Page builder fallback teaser rendered", payload);
  }, [currentPageId, logger, reason]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background:
          "linear-gradient(180deg, rgba(250, 246, 239, 1) 0%, rgba(255, 255, 255, 1) 48%)",
      }}
    >
      <div className="fadeIn flex flex-1 flex-col items-center justify-center px-4 md:px-6">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold text-[#2d2219] md:text-3xl">
            {fallbackContent.title}
          </h1>

          <p className="text-base leading-7 text-[#6c5d4f] md:text-lg">
            {fallbackContent.description}
          </p>
        </div>
      </div>

      <div className="sticky right-0 bottom-0 left-0 flex flex-col items-center gap-3 px-6 pb-6">
        <Button
          type="button"
          size="lg"
          disabled={isRetrying}
          className="min-w-[320px] rounded-full bg-[#2d2219] text-white hover:bg-[#46352a]"
          onClick={() => {
            const payload = {
              fallback_reason: reason,
              fallback_page_id: currentPageId,
            };

            logger.info("Page builder fallback teaser retry clicked", payload);
            setIsRetrying(true);
            router.refresh();
          }}
        >
          {isRetrying ? "Loading..." : "Try again"}
        </Button>
      </div>
    </div>
  );
}

export function FallbackTeaserPageWithNavigation() {
  const page = usePage();

  return (
    <FallbackTeaserPage
      currentPageId={page.id}
      reason="missing_html"
    />
  );
}
