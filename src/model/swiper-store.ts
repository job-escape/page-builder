"use client";

import { createEvent, createStore } from "effector";

export type SwiperCommand =
  | { type: "slide_to"; index: number }
  | { type: "slide_next" }
  | { type: "slide_prev" };

export type SwiperCommands = Record<string, SwiperCommand>;

export const slideTo = createEvent<{ id: string; index: number }>();
export const slideNext = createEvent<{ id: string }>();
export const slidePrev = createEvent<{ id: string }>();
export const clearSwiperCommand = createEvent<string>();

export const $swiperCommands = createStore<SwiperCommands>({})
  .on(slideTo, (state, { id, index }) => ({ ...state, [id]: { type: "slide_to", index } }))
  .on(slideNext, (state, { id }) => ({ ...state, [id]: { type: "slide_next" } }))
  .on(slidePrev, (state, { id }) => ({ ...state, [id]: { type: "slide_prev" } }))
  .on(clearSwiperCommand, (state, id) => {
    const next = { ...state };
    delete next[id];
    return next;
  });
