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
  "@radix-ui/react-avatar",
  "@radix-ui/react-progress",
  "@radix-ui/react-slot",
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
    splitting: false,
    target: "es2020",
    external,
    banner: {
      js: `"use client";`,
    },
  },
]);
