import { defineConfig } from "tsup";

const external = [
  "react",
  "react-dom",
  "next",
  "next-axiom",
  "next/dynamic",
  "next/navigation",
  "effector",
  "effector-react",
  "@effector/next",
  "@farfetched/core",
  "@lottiefiles/react-lottie-player",
  "react-aria-components",
  "framer-motion",
  "html-react-parser",
  "html-react-parser/lib/index",
  "swiper",
  "swiper/modules",
  "swiper/react",
  "vaul",
];

export default defineConfig([
  // Server/default entry — no "use client" banner.
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: { resolve: true, compilerOptions: { jsxImportSource: "@emotion/react" } },
    sourcemap: true,
    clean: true,
    splitting: false,
    target: "es2020",
    external,
  },
  // Client entry — banner preserves the directive across bundling.
  {
    entry: { client: "src/client.ts" },
    format: ["esm", "cjs"],
    dts: { resolve: true, compilerOptions: { jsxImportSource: "@emotion/react" } },
    sourcemap: true,
    clean: false,
    // Enable code-splitting so `dynamic(() => import(...))` boundaries (lottie,
    // swiper) emit real lazy chunks instead of being inlined into client.mjs.
    splitting: true,
    target: "es2020",
    external,
    banner: {
      js: `"use client";`,
    },
  },
  // Beta entry — the compiled-funnel runtime. Built separately so it shares no
  // chunks with the shipped entries: a consumer resolving `.` or `./client`
  // must not pull any of this in. Pure logic, so no client banner.
  {
    entry: { runtime: "src/runtime.ts" },
    format: ["esm", "cjs"],
    dts: { resolve: true },
    sourcemap: true,
    clean: false,
    splitting: false,
    target: "es2020",
    external,
  },
  // Beta client entry — the React half. Own build, own banner, no chunks shared
  // with `.` or `./client`.
  {
    entry: { "runtime-client": "src/runtime-client.ts" },
    format: ["esm", "cjs"],
    dts: { resolve: true },
    sourcemap: true,
    clean: false,
    splitting: false,
    target: "es2020",
    external,
    banner: { js: `"use client";` },
  },
]);
