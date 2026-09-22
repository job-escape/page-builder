/**
 * The safe-area insets a full-screen overlay still owes its content.
 *
 * A dialog as tall as the phone is drawn edge to edge — its background behind
 * the status bar and down past the home indicator, as the canvas draws it —
 * and its content is kept clear of both. Which frame pays the insets is the
 * first one that paints something (see `DrawnFrame`): it takes them as padding,
 * so its background bleeds while what is inside it starts below the notch.
 * Everything under it receives nothing, so they are paid once.
 *
 * Zero everywhere but inside such an overlay — a screen has `ScreenHost` for
 * this, and a sheet or a small dialog never reaches the edges.
 */
import { createContext } from "react";

export type Bleed = { top: number; bottom: number };

export const NO_BLEED: Bleed = { top: 0, bottom: 0 };

export const BleedContext = createContext<Bleed>(NO_BLEED);
