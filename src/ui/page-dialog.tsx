/** @jsxImportSource @emotion/react */
import { domToReact, Element, type DOMNode } from "html-react-parser";

import { createContext, useEffect, useState } from "react";
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

  // The old Radix DialogContent ran with modal={false} and preventDefault on
  // both outside-interaction and Escape — i.e. no dismissal at all (closing a
  // dialog mid-3DS would lose the payment). A plain div is the same contract.
  return (
    <div role="dialog" css={css} style={{ pointerEvents: "auto" }}>
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
  // createPortal needs a browser document; this component is loaded with
  // next/dynamic({ ssr: false }), the guard just keeps it SSR-safe.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const dialogRegistry = {
    ...(registryProp ?? model.registry ?? {}),
    overlay: Overlay,
    "dialog-content": DialogContentReg,
  };

  if (!dialog.html || !mounted) {
    return null;
  }

  // force_mount keeps the subtree in the DOM while the dialog is closed:
  // Solidgate/Primer payment iframes hold per-session state that a remount
  // would destroy. Visibility is toggled purely via display, matching the
  // previous Radix Portal + forceMount behavior.
  if (!open && !dialog.force_mount) {
    return null;
  }

  return (
    <PageDialogContext.Provider value={{ onOpenChange }}>
      {createPortal(
        <div
          aria-hidden={!open}
          style={{ display: open ? "contents" : "none" }}
          {...(open
            ? { "data-bevr-active-dialog": "true", "data-bevr-dialog-id": String(dialog.id) }
            : { "data-bevr-dialog-id": String(dialog.id) })}
        >
          <Parser content={dialog.html} registry={dialogRegistry} />
        </div>,
        document.body,
      )}
    </PageDialogContext.Provider>
  );
}
