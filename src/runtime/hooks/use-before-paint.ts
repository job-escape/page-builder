import { useEffect, useLayoutEffect } from "react";

/**
 * A layout effect where there is a layout, a plain effect on a server.
 *
 * The device has to reach the store before the browser paints, or a desktop
 * visitor sees one frame of the phone layout on every crossing.
 */
export const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;
