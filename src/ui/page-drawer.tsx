/** @jsxImportSource @emotion/react */
import { Drawer } from "@heroui/react";
import { domToReact, Element, type DOMNode } from "html-react-parser";

import { createContext, useContext, useEffect, useRef } from "react";

import { useBuilderModel } from "../hooks/use-builder-model";
import { useInteraction } from "../hooks/use-interaction";
import { useStyledNode } from "../hooks/use-styled-node";
import { BuilderDialog, ComponentRegisry, ComponentRegistryProps, LogicValue } from "../types";
import { tryParse } from "../utils/try-parse";

import Parser from "./parser";

type DrawerType = React.ComponentType<Record<string, unknown>> & {
  Backdrop: React.ComponentType<Record<string, unknown>>;
  Content: React.ComponentType<Record<string, unknown>>;
  Dialog: React.ComponentType<Record<string, unknown>>;
};

const DrawerAny = Drawer as unknown as DrawerType;

const DISABLE_ANIMATION =
  "data-[entering]:duration-0 data-[exiting]:duration-0 data-[entering]:animate-none data-[exiting]:animate-none";

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

  const handleOpenChange = (next: boolean) => {
    if (!next) onDismissRef.current?.();
    onOpenChange(next);
  };

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

  return (
    <PageDrawerContext.Provider value={{ onOpenChange, onDismissRef }}>
      <DrawerAny>
        <DrawerAny.Backdrop
          isOpen={open}
          onOpenChange={handleOpenChange}
          variant="transparent"
          isDismissable={false}
          isKeyboardDismissDisabled
          className={`hidden bg-transparent ${DISABLE_ANIMATION}`}
        >
          <DrawerAny.Content
            placement="bottom"
            className={`items-stretch justify-stretch p-0 max-w-none ${DISABLE_ANIMATION}`}
          >
            <DrawerAny.Dialog
              className={`bg-transparent shadow-none m-0 max-w-none rounded-none h-auto outline-none ${DISABLE_ANIMATION}`}
            >
              <div aria-hidden={!open} style={{ display: open ? "contents" : "none" }}>
                <Parser content={html} registry={drawerRegistry} />
              </div>
            </DrawerAny.Dialog>
          </DrawerAny.Content>
        </DrawerAny.Backdrop>
      </DrawerAny>
    </PageDrawerContext.Provider>
  );
}
