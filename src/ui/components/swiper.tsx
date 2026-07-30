"use client";

import { ClassNames } from "@emotion/react";
import { DOMNode, Element, Text, domToReact } from "html-react-parser";

import { Fragment, ReactNode, useMemo } from "react";

import { useStyledNode } from "../../hooks/use-styled-node";
import { usePreload } from "../../providers/preload-context";
import { ComponentRegistryProps } from "../../types";

// Statically imported (in the main bundle) instead of a `dynamic(ssr:false)`
// chunk. The lazy chunk was warmed via usePreloadChunk during the hidden
// pre-render of the loader page — a heavy on-demand fetch competing for
// connections while that page's HTML + dialogs loaded. In-bundle, the carousel
// code is already present, so nothing is fetched on navigation. SwiperView is a
// "use client" component; Swiper only touches the DOM inside effects, so SSR is
// safe.
import SwiperView from "./swiper-view";

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
  const attribs = domNode?.attribs ?? {};
  const styledCss = useStyledNode(attribs);
  // Memoized so we don't re-parse the slide HTML into fresh React trees on every
  // render — which handed Swiper new children each pass and forced it to
  // re-process/restart. Stable now that `config` is stable (see parser.tsx).
  // Keyed here rather than only in SwiperView: on a pre-rendered page this
  // array is returned bare (`<>{slides}</>`), so whatever renders it — an
  // animated container, say — receives an unkeyed list and React warns. The
  // authored slide order is what identifies a slide; nothing reorders them.
  const slides = useMemo(
    () =>
      domNode.children
        .filter(isSlideNode)
        .map((child, index) => (
          <Fragment key={index}>{domToReact([child], config) as ReactNode}</Fragment>
        )),
    [domNode.children, config],
  );
  // During pre-render, still render the slide content (so its images/components
  // warm), but skip the swiper carousel itself — it would init in a hidden,
  // zero-width container.
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
