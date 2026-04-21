"use client";

import { ClassNames } from "@emotion/react";
import { DOMNode, Element, Text, domToReact } from "html-react-parser";

import dynamic from "next/dynamic";

import { ReactNode } from "react";

import { useStyledNode } from "../../hooks/use-styled-node";
import { ComponentRegistryProps } from "../../types";

const SwiperView = dynamic(() => import("./swiper-view"), { ssr: false });

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
  const attribs = domNode?.attribs ?? {};
  const styledCss = useStyledNode(attribs);
  const slideNodes = domNode.children.filter(isSlideNode);
  const slides = slideNodes.map((child) => domToReact([child], config) as ReactNode);
  const autoplay = attribs['swiper-autoplay'] === 'true'
  const loop = attribs['swiper-loop'] === 'true'
  return (
    <ClassNames>
      {({ css }) => (
        <SwiperView
          id={attribs["data-id"] ?? ""}
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
