"use client";

import { ClassNames } from "@emotion/react";
import { DOMNode, Element, Text, domToReact } from "html-react-parser";

import dynamic from "next/dynamic";

import { ReactNode } from "react";

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
  // so the carousel doesn't pop in. The carousel itself isn't rendered during
  // pre-render — it would init in a hidden, zero-width container.
  usePreloadChunk(loadSwiperView);
  const attribs = domNode?.attribs ?? {};
  const styledCss = useStyledNode(attribs);
  if (preload) return null;
  const slideNodes = domNode.children.filter(isSlideNode);
  const slides = slideNodes.map((child) => domToReact([child], config) as ReactNode);
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
