/** @jsxImportSource @emotion/react */
import { domToReact, Element, type DOMNode } from "html-react-parser";

import { createContext } from "react";
import { createPortal } from "react-dom";

import { useBuilderModel } from "../hooks/use-builder-model";
import { useInteraction } from "../hooks/use-interaction";
import { useStyledNode } from "../hooks/use-styled-node";
import { BuilderDialog, ComponentRegisry, ComponentRegistryProps, LogicValue } from "../types";
import { tryParse } from "../utils/try-parse";

import Parser from "./parser";

const PageDialogContext = createContext<{
  onOpenChange: (open: boolean) => void;
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

function DialogContentReg({ domNode, config }: ComponentRegistryProps) {
  const css = useStyledNode(domNode.attribs);

  return (
    <div css={css} style={{ pointerEvents: "auto" }}>
      {domToReact(domNode.children as DOMNode[], config)}
    </div>
  );
}

export default function PageDialog({
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
  const dialogRegistry = {
    ...(registryProp ?? model.registry ?? {}),
    overlay: Overlay,
    "dialog-content": DialogContentReg,
  };

  const html = dialog.html;
  if (!html) {
    return null;
  }

  if (!open && !dialog.force_mount) {
    return null;
  }

  return createPortal(
    <PageDialogContext.Provider value={{ onOpenChange }}>
      <div aria-hidden={!open} style={{ display: open ? "contents" : "none" }}>
        <Parser content={html} registry={dialogRegistry} />
      </div>
    </PageDialogContext.Provider>,
    document.body,
  );
}
