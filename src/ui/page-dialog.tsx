/** @jsxImportSource @emotion/react */
import { Dialog, DialogContent, DialogPortal } from "@radix-ui/react-dialog";
import { domToReact, Element, type DOMNode } from "html-react-parser";

import { createContext } from "react";

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
    <DialogContent
      css={css}
      style={{ pointerEvents: "auto" }}
      onInteractOutside={(e) => {
        e.preventDefault();
      }}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
      }}
    >
      {domToReact(domNode.children as DOMNode[], config)}
    </DialogContent>
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

  if (dialog.html) {
    return (
      <PageDialogContext.Provider value={{ onOpenChange }}>
        <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
          <DialogPortal forceMount={dialog.force_mount || undefined}>
            <div
              aria-hidden={!open}
              style={{ display: open ? "contents" : "none" }}
            >
              <Parser content={dialog.html} registry={dialogRegistry} />
            </div>
          </DialogPortal>
        </Dialog>
      </PageDialogContext.Provider>
    );
  }

  return null;
}
