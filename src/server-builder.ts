// Separate entry for the async server Builder component.
// Kept as its own bundle so Next.js resolves @effector/next as a separate
// npm module (with its own "use client" directive) instead of seeing it
// inlined inside our server bundle.

export { default as Builder } from "./ui/builder";
