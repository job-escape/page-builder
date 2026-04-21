# @job-escape/page-builder

Generic page-builder engine extracted from the Job Escape funnel. Powers the quiz-builder and is designed to be reused by other funnel apps (onboarding, upsell, unsub, selling, etc.).

## What it provides

- `createBuilderModel<Page>()` — factory that wires an Effector store graph for pages, HTML, navigation history, dialogs, and prefetch.
- `Builder` / `BuilderClient` — SSR + client wrappers around `@effector/next` with page prefetching and framer-motion transitions.
- `Parser` — `html-react-parser` configured to route `component-type` / `data-lexical-component` elements through a consumer-supplied registry.
- Logic actions — discriminated-union `LogicAction` type with 20+ action kinds (`write_user_data`, `next_page`, `http_request`, `conditional`, `open_dialog`, …).
- Condition engine — `json-rules-engine` wrapper used for page branching and active-state evaluation.
- Hooks: `useBuilderModel`, `usePage`, `useNavigation`, `useInteraction`, `useActiveState`, `useLocalModel`, `useStyledNode`.

## Installation

```bash
pnpm add @job-escape/page-builder
```

All state libraries (`effector`, `effector-react`, `@effector/next`, `@farfetched/core`) are **peer dependencies** — the consumer installs them so there is a single store runtime.

## Usage (quiz-builder as reference)

```tsx
import { createBuilderModel } from "@job-escape/page-builder";

const model = createBuilderModel({
  fetchPage: async ({ id, lang }) => /* call your API */,
  fetchPagesByOrder: async ({ order, lang }) => /* optional */,
  registry: { /* map component-type → React FC */ },
});
```

The consumer supplies:
- Page fetchers (the library is domain-agnostic about where pages come from).
- A component registry (the library ships a minimal `defaultRegistry` — spread it and add your own components).
- An analytics adapter (e.g. `trackPixel`) via `<BuilderProvider>`.
- A `loadingComponent` for `<BuilderClient>`.

## Status

v0.1 — feature parity with the funnel's in-repo `features/page-builder`. Breaking changes expected until v1.
