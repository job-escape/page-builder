"use client";

/** @jsxImportSource @emotion/react */
import { attributesToProps, DOMNode, domToReact } from "html-react-parser";
import { useEffect } from "react";

import { useInteraction } from "../../hooks/use-interaction";
import { usePreload } from "../../providers/preload-context";
import { useStyledNode } from "../../hooks/use-styled-node";
import { ComponentRegistryProps, LogicValue } from "../../types";
import { tryParse } from "../../utils/try-parse";

export default function ContainerRegistry({
  domNode,
  config,
}: ComponentRegistryProps) {
  const attribs = domNode?.attribs ?? {};
  const logic = tryParse<LogicValue>(attribs.logic) || [];
  const styledCss = useStyledNode(attribs);
  const { createInteraction } = useInteraction();
  const preload = usePreload();

  useEffect(() => {
    if (preload) return;
    if (!logic.some((rule) => rule.trigger === "on_mount")) return;
    const { handleTrigger } = createInteraction();
    handleTrigger("on_mount", logic).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { logic: _l, ...rest } = attribs;
  const domProps = attributesToProps(rest);

  return (
    <div
      {...domProps}
      // eslint-disable-next-line react/no-unknown-property
      css={styledCss}
    >
      {domNode.children?.length
        ? domToReact(domNode.children as DOMNode[], config)
        : null}
    </div>
  );
}
