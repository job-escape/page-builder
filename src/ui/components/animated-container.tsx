"use client";

/** @jsxImportSource @emotion/react */
import { motion } from "framer-motion";
import { DOMNode, domToReact } from "html-react-parser";

import { useStyledNode } from "../../hooks/use-styled-node";
import { ComponentRegistryProps } from "../../types";

type AnimationProps = {
  duration: number;
  delay: number;
  ease: string;
  easeBezier: string;
  initialOpacity: number;
  initialX: number;
  initialY: number;
  initialScale: number;
  initialRotate: number;
  animateOpacity: number;
  animateX: number;
  animateY: number;
  animateScale: number;
  animateRotate: number;
  exitOpacity: number;
  exitX: number;
  exitY: number;
  exitScale: number;
  exitRotate: number;
};

const DEFAULT_ANIMATION_PROPS: AnimationProps = {
  duration: 350,
  delay: 0,
  ease: "easeOut",
  easeBezier: "",
  initialOpacity: 1,
  initialX: 0,
  initialY: 0,
  initialScale: 1,
  initialRotate: 0,
  animateOpacity: 1,
  animateX: 0,
  animateY: 0,
  animateScale: 1,
  animateRotate: 0,
  exitOpacity: 1,
  exitX: 0,
  exitY: 0,
  exitScale: 1,
  exitRotate: 0,
};

const parseAnimationProps = (raw: string | undefined) => {
  if (!raw) {
    return DEFAULT_ANIMATION_PROPS;
  }

  try {
    return {
      ...DEFAULT_ANIMATION_PROPS,
      ...(JSON.parse(raw) as Partial<AnimationProps>),
    };
  } catch {
    return DEFAULT_ANIMATION_PROPS;
  }
};

const parseBezier = (value: string) => {
  const points = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => !Number.isNaN(item));

  if (points.length === 4) {
    return [points[0], points[1], points[2], points[3]] as [number, number, number, number];
  }

  return null;
};

export default function AnimatedContainerRegistry({ domNode, config }: ComponentRegistryProps) {
  const attribs = domNode?.attribs ?? {};
  const styledCss = useStyledNode(attribs);
  const animation = parseAnimationProps(attribs["data-animation"]);
  const bezierEase = parseBezier(animation.easeBezier);

  return (
    // eslint-disable-next-line react/no-unknown-property
    <motion.div
      css={styledCss}
      initial={{
        opacity: animation.initialOpacity,
        x: animation.initialX,
        y: animation.initialY,
        scale: animation.initialScale,
        rotate: animation.initialRotate,
      }}
      animate={{
        opacity: animation.animateOpacity,
        x: animation.animateX,
        y: animation.animateY,
        scale: animation.animateScale,
        rotate: animation.animateRotate,
      }}
      exit={{
        opacity: animation.exitOpacity,
        x: animation.exitX,
        y: animation.exitY,
        scale: animation.exitScale,
        rotate: animation.exitRotate,
      }}
      transition={{
        duration: animation.duration / 1000,
        delay: animation.delay / 1000,
        ease: bezierEase || animation.ease,
      }}
    >
      {domToReact(domNode.children as DOMNode[], config)}
    </motion.div>
  );
}
