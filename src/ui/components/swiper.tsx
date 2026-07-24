"use client";

import { ClassNames } from "@emotion/react";
import { DOMNode, Element, Text, domToReact } from "html-react-parser";

import dynamic from "next/dynamic";

import { ReactNode, useMemo } from "react";

import { usePreloadChunk } from "../../hooks/use-preload-chunk";
import { useStyledNode } from "../../hooks/use-styled-node";
import { usePreload } from "../../providers/preload-context";
import { ComponentRegistryProps } from "../../types";

const loadSwiperView = () => import("./swiper-view");
const SwiperView = dynamic(loadSwiperView, { ssr: false });

const getBooleanAttr = (value: string | undefined, fallback = false) => {
  if (value === undefined) return fallback;

  return value === "" || value === "true" || value === "1";
};

const getNumberAttr = (value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isSlideNode = (node: unknown): node is DOMNode => {
  if (node instanceof Element) return true;
  if (node instanceof Text) return node.data.trim().length > 0;

  return false;
};

export default function SwiperRegistry({ domNode, config }: ComponentRegistryProps) {
  const preload = usePreload();
  // Warm the swiper chunk in the background (incl. during the hidden pre-render)
  // so it's ready when the carousel goes active.
  usePreloadChunk(loadSwiperView);
  const attribs = domNode?.attribs ?? {};
  const styledCss = useStyledNode(attribs);
  // Memoized so we don't re-parse the slide HTML into fresh React trees on every
  // render — which handed Swiper new children each pass and forced it to
  // re-process/restart. Stable now that `config` is stable (see parser.tsx).
  const slides = useMemo(
    () => domNode.children.filter(isSlideNode).map((child) => domToReact([child], config) as ReactNode),
    [domNode.children, config],
  );
  // During pre-render, still render the slide content (so its images/components
  // warm), but skip the swiper carousel itself — it would init in a hidden,
  // zero-width container. The swiper chunk is warmed via usePreloadChunk above.
  if (preload) return <>{slides}</>;
  const autoplay = attribs['swiper-autoplay'] === 'true'
  const loop = attribs['swiper-loop'] === 'true'
  return (
    <ClassNames>
      {({ css }) => (
        <SwiperView
          id={attribs["data-id"] ?? attribs.id ?? ""}
          className={css(styledCss)}
          autoplay={autoplay}
          loop={loop}
          centeredSlides={getBooleanAttr(attribs["centered-slides"])}
          spaceBetween={getNumberAttr(attribs["space-between"], 0)}
          slidesPerView={getNumberAttr(attribs["slides-per-view"], 1)}
          slides={slides}
        />
      )}
    </ClassNames>
  );
}
