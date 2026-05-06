/** @jsxImportSource @emotion/react */
import { domToReact, Element, type DOMNode } from "html-react-parser";

import { createContext, useContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { useBuilderModel } from "../hooks/use-builder-model";
import { useInteraction } from "../hooks/use-interaction";
import { useStyledNode } from "../hooks/use-styled-node";
import { BuilderDialog, ComponentRegisry, ComponentRegistryProps, LogicValue } from "../types";
import { tryParse } from "../utils/try-parse";

import Parser from "./parser";

const PageDrawerContext = createContext<{
  onOpenChange: (open: boolean) => void;
  onDismissRef: React.MutableRefObject<(() => void) | null>;
} | null>(null);

function Overlay({ domNode }: { domNode: Element }) {
  const css = useStyledNode(domNode.attribs);
  const attribs = domNode?.attribs ?? {};

  const logic = tryParse<LogicValue>(attribs.logic) || [];
  const { createInteraction } = useInteraction();

  const handleClick = () => {
    const { handleTrigger } = createInteraction();
    handleTrigger("click", logic);
  };

  return <div css={css} onClick={handleClick} />;
}

function DrawerContentReg({ domNode, config }: ComponentRegistryProps) {
  const css = useStyledNode(domNode.attribs);
  const attribs = domNode?.attribs ?? {};

  const logic = tryParse<LogicValue>(attribs.logic) || [];
  const { createInteraction } = useInteraction();
  const ctx = useContext(PageDrawerContext);

  useEffect(() => {
    if (!ctx) return;
    ctx.onDismissRef.current =
      logic.length > 0
        ? () => {
            const { handleTrigger } = createInteraction();
            handleTrigger("on_swipe_down", logic);
          }
        : null;

    return () => {
      ctx.onDismissRef.current = null;
    };
  }, [logic]);

  return (
    <div style={{ pointerEvents: "auto" }} css={css}>
      {domToReact(domNode.children as DOMNode[], config)}
    </div>
  );
}

export default function PageDrawer({
  dialog,
  open,
  onOpenChange,
  registry: registryProp,
}: {
  dialog: BuilderDialog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registry?: ComponentRegisry;
}) {
  const model = useBuilderModel();
  const onDismissRef = useRef<(() => void) | null>(null);

  const drawerRegistry = {
    ...(registryProp ?? model.registry ?? {}),
    "drawer-overlay": Overlay,
    "drawer-content": DrawerContentReg,
  };

  const html = dialog.html;
  if (!html) {
    return null;
  }

  if (!open && !dialog.force_mount) {
    return null;
  }

  return createPortal(
    <PageDrawerContext.Provider value={{ onOpenChange, onDismissRef }}>
      <div aria-hidden={!open} style={{ display: open ? "contents" : "none" }}>
        <Parser content={html} registry={drawerRegistry} />
      </div>
    </PageDrawerContext.Provider>,
    document.body,
  );
}
