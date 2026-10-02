/**
 * The swiper a host registers for a design's `swiper` slot.
 *
 * The carousel the old engine drew (`ui/components/swiper`), for the tree
 * runtime: the same library — Swiper — given the same five settings, so a
 * design moved across behaves as it did. The slides are the frames drawn
 * inside the slot, handed over already rendered; each becomes one slide.
 *
 * `createSwiper` takes the library from the host rather than importing it, for
 * the reason `createCheckout` takes its SDKs: a bundler resolves even a dynamic
 * import at build time, so a package that named `swiper` would fail the build
 * of a host with no carousel in any of its designs.
 *
 *     import "swiper/css";
 *     const Swiper = createSwiper(async () => {
 *       const [react, modules] = await Promise.all([import("swiper/react"), import("swiper/modules")]);
 *       return { Swiper: react.Swiper, SwiperSlide: react.SwiperSlide, Autoplay: modules.Autoplay };
 *     });
 *     <Funnel components={{ swiper: Swiper }} … />
 *
 * **Before the library lands the slides are still there** — the first ones, in
 * a row at the widths the carousel will give them — so a screen with a
 * carousel paints its content at once and does not jump when the library
 * arrives. A library that fails to load leaves that row, which reads as a
 * carousel that does not move rather than as a hole.
 */
import {
  Children,
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";

/** What the host's loader hands over — Swiper's own React components. */
export type SwiperLibrary = {
  Swiper: ComponentType<Record<string, unknown>>;
  SwiperSlide: ComponentType<Record<string, unknown>>;
  /** `swiper/modules`' Autoplay. Without it `autoplay` is ignored. */
  Autoplay?: unknown;
};

/** The host's loader — see the example above. */
export type SwiperLoader = () => Promise<SwiperLibrary>;

/**
 * The settings a design gives a swiper — the old component's, by its names.
 *
 * Each arrives as the design stored it, which may be a number, a boolean or
 * the string of one: a prop set in the inspector is a number, one bound to a
 * variable is whatever the variable holds.
 */
export type SwiperProps = {
  /** The slides: the frames drawn inside the slot, one each. */
  children?: ReactNode;
  /** How many slides are on show at once. Default 1; fractions peek the next. */
  slidesPerView?: number | string;
  /** The gap between slides, in pixels. Default 0. */
  spaceBetween?: number | string;
  /** Goes round: after the last slide comes the first. */
  loop?: boolean | string;
  /** Moves on by itself. */
  autoplay?: boolean | string;
  /** The active slide sits in the middle rather than at the start. */
  centeredSlides?: boolean | string;
};

const flag = (value: unknown): boolean => value === true || value === "true" || value === "1";

const count = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : fallback;
};

export function createSwiper(load: SwiperLoader): (props: SwiperProps) => ReactElement {
  // One load per page, whichever carousel asks first.
  let loading: Promise<SwiperLibrary> | null = null;
  let loaded: SwiperLibrary | null = null;

  function Swiper(props: SwiperProps): ReactElement {
    const [library, setLibrary] = useState<SwiperLibrary | null>(loaded);

    useEffect(() => {
      if (library) return undefined;
      let gone = false;
      loading ??= load().catch((error: unknown) => {
        loading = null;
        throw error;
      });
      loading
        .then((arrived) => {
          loaded = arrived;
          if (!gone) setLibrary(arrived);
        })
        .catch((error: unknown) => {
          // Stable name: alerting selects on it. The row below stays.
          console.error("pb.swiper.load_failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return () => {
        gone = true;
      };
    }, [library]);

    const slides = Children.toArray(props.children);
    const slidesPerView = Math.max(count(props.slidesPerView, 1), 0.1);
    const spaceBetween = Math.max(count(props.spaceBetween, 0), 0);
    const autoplay = flag(props.autoplay);
    const loop = flag(props.loop);
    const centeredSlides = flag(props.centeredSlides);
    // One array for as long as autoplay is what it is: a new one each render
    // makes Swiper re-process its modules.
    const modules = useMemo(
      () => (autoplay && library?.Autoplay ? [library.Autoplay] : []),
      [autoplay, library],
    );

    if (!library) {
      // The carousel's first frame, without the carousel: the slides in a row,
      // each as wide as it will be, the ones past the edge cut off.
      const shown = Math.ceil(slidesPerView);
      const width = `calc((100% - ${spaceBetween * (slidesPerView - 1)}px) / ${slidesPerView})`;
      return (
        <div
          data-swiper="pending"
          style={{ display: "flex", gap: spaceBetween, width: "100%", overflow: "hidden" }}
        >
          {slides.slice(0, shown + 1).map((slide, index) => (
            // The authored order is what identifies a slide; nothing reorders them.
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} style={{ flex: `0 0 ${width}`, minWidth: 0 }}>
              {slide}
            </div>
          ))}
        </div>
      );
    }

    const { Swiper: Carousel, SwiperSlide: Slide } = library;
    return (
      <Carousel
        data-swiper="ready"
        style={{ width: "100%" }}
        autoplay={autoplay}
        loop={loop}
        centeredSlides={centeredSlides}
        spaceBetween={spaceBetween}
        slidesPerView={slidesPerView}
        modules={modules}
      >
        {slides.map((slide, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Slide key={index}>
            <Fragment>{slide}</Fragment>
          </Slide>
        ))}
      </Carousel>
    );
  }
  return Swiper;
}
