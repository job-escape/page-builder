/**
 * `@job-escape/page-builder/swiper` — the carousel a design's `swiper` slot
 * draws. **Beta.**
 *
 * The old engine's swiper, for the tree runtime: the frames drawn inside the
 * slot are its slides, and `slidesPerView`, `spaceBetween`, `loop`, `autoplay`
 * and `centeredSlides` are the design's to set.
 *
 * Client-only. It imports no carousel library — the host passes its loader to
 * `createSwiper` — and nothing from the runtime: a slot's props and the slides
 * it is handed are the whole of the coupling.
 */
export type { SwiperLibrary, SwiperLoader, SwiperProps } from "./swiper/swiper";
export { createSwiper } from "./swiper/swiper";
