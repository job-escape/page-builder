# Page Builder Repository Guide

## Package role

`@job-escape/page-builder` is the versioned runtime engine for constructor-authored
web experiences. It provides:

- Effector models for pages, HTML, dialogs, answers, history, and preloading;
- server and client builder wrappers;
- HTML-to-React parsing through consumer component registries;
- navigation and condition evaluation;
- the serialized logic-action executor;
- host adapters for analytics, pixels, links, subscriptions, sessions, and
  browser integrations.

This repository is a public contract producer. A successful local build is not
enough: serialized content, package entry points, generated declarations, and
every affected consumer must remain compatible.

When opened from the JobEscape workspace, also read the workspace-root
`AGENTS.md`, `workspace.json`, and `services.yaml`.

## Contract participants and version drift

Known package consumers:

| Consumer | Runtime surface |
|---|---|
| `funnel` | quiz builder |
| `frontend-alpha` | onboarding, upsell, and unsubscribe builders |

Known producers of data interpreted by this package:

| Producer | Contract surface |
|---|---|
| `funnel-constructor-editor` | action definitions, parameter editors, conditions, and serialized page/dialog HTML |
| `funnel_backend` | constructor persistence and AI logic-action validation/generation |

At the audit that created this guide:

- this repository was version `0.2.95`;
- `funnel` declared and locked `0.2.95`;
- `frontend-alpha` declared `^0.2.68` but remained locked to `0.2.68`.

These values will drift. Before every public change, inspect each consumer's
`package.json`, its
`package-lock.json["packages"]["node_modules/@job-escape/page-builder"]`, and
the exact imports it uses. Never assume a caret range, installed package, and
this repository's `main` branch contain the same behavior.

## Start every task

1. Check `git status --short --branch` and preserve unrelated work.
2. Classify the public surface: types, server entry, client entry, model,
   navigation, conditions, actions, parser/registry, UI, telemetry, peers, or
   release tooling.
3. Trace changed symbols through `src/server.ts`, `src/client.ts`,
   `src/index.ts`, `package.json.exports`, and generated `dist` declarations.
4. Inspect every affected runtime at its locked package version.
5. For serialized actions, conditions, page/dialog fields, or component
   attributes, inspect both authoring producers before changing the runtime.
6. State compatibility strategy, required version bump, consumer validation,
   and safe release/upgrade/deploy order.

Prefer additive exports, optional fields, tolerant readers, and host adapters.
Published content can outlive the application version that authored it.

## Package and entry-point boundaries

- npm with lockfile version 3
- TypeScript strict mode
- tsup ESM/CJS builds plus declarations
- Jest with jsdom and ts-jest
- React, Next.js, Effector, Farfetched, Emotion, and renderer integrations as
  peer dependencies
- restricted GitHub Packages publishing

Only these imports are public:

| Import | Responsibility |
|---|---|
| `@job-escape/page-builder` | server-safe types, model factory, async `Builder`, pure utilities, and logger |
| `@job-escape/page-builder/client` | `"use client"` entry, all root exports, client model, providers, hooks, parser, dialogs/drawers, registries, and UI |

`src/index.ts` re-exports `src/server.ts`. The client bundle deliberately
re-exports the server-safe surface and receives a `"use client"` banner from
tsup. Preserve this split:

- do not add hooks, contexts, browser globals, or client-only framework imports
  to the root entry;
- do not remove the client banner or inline peer frameworks into the bundle;
- keep type-only dependencies type-only where possible;
- do not introduce deep imports into `src/` or `dist/`;
- `src/server-builder.ts` is not currently an exported package entry point.

The local build resolves React 18 and Next.js 14, while known consumers run
React 19 with Next.js 15 or 16. Peer-range compatibility must be validated in
the consumers, not inferred from this repository alone.

`dist/` is generated, ignored, and is the only code shipped by the package
alongside `README.md`. Never edit it by hand. Build before inspecting or packing.

## Architecture map

| Path | Responsibility |
|---|---|
| `src/types.ts` | serialized page, dialog, condition, action, request, analytics, and key-value contracts |
| `src/model/store.ts` | server-safe Effector model, fetching, HTML, history, dialogs, answers, and preloading |
| `src/model/gate.ts` | client Gate and dialog-fetch lifecycle |
| `src/model/local-model.ts` | per-page local interaction state |
| `src/hooks/use-navigation.ts` | condition-aware next/previous/finish behavior |
| `src/hooks/use-interaction.ts` | serialized action interpreter and host integration points |
| `src/utils/condition-engine.ts` | condition normalization, fact keys, value coercion, and operators |
| `src/utils/previous-page.ts` | history and reverse-navigation resolution |
| `src/ui/parser.tsx` | HTML parser and component-registry dispatch |
| `src/ui/builder.tsx` | server-side Effector fork and hydration values |
| `src/ui/builder-client.tsx` | client rendering, preloading, dialogs, failure fallback, and telemetry |
| `src/providers/` | model, page, preloading, analytics, pixel, and host-adapter contexts |
| `src/const/default-registry.ts` | built-in component registry |

## Model and navigation contracts

`BuilderPageBase`, `BuilderDialog`, the `createBuilderModel` options, returned
stores/events, and `Builder`/`BuilderClient` props are public contracts.

- Preserve page IDs, `pageId`, `next_node_id`, order/tree-order meaning, MDX
  URLs, dialog UUID/type/HTML fields, and history semantics.
- Keep Effector `sid` values stable unless a deliberate hydration migration is
  planned.
- Page and dialog fetches settle per item so one failed asset does not discard
  successful results or trigger retry loops.
- Preload defaults and visible-page windows affect performance and behavior;
  validate forward navigation, back navigation, reconnect/failure fallback,
  dialogs, and SSR hydration.
- Conditions take precedence over `next_node_id`; failure falls back to default
  navigation.

## Serialized actions and conditions

`LogicAction`, `LogicRule`, `RequestConfig`, and condition shapes are stored in
authored content. Action names and parameter meanings are data-schema fields,
not internal implementation details.

For an action change, inspect at minimum:

- `page-builder/src/types.ts` and `src/hooks/use-interaction.ts`;
- `funnel-constructor-editor/src/features/content-constructor/const/common-logic-actions.ts`;
- the editor's logic field types, nested conditional/timeout editors, and AI
  schema;
- `funnel_backend/constructor/base/ai_logic.py`;
- the host `InteractionOptionsProvider` implementations in each runtime.

Land tolerant runtime support before authoring begins emitting a new action or
parameter. Validate old content with missing optional parameters and nested
actions in condition, timeout, and HTTP lifecycle blocks.

Condition facts use data-type-prefixed keys such as
`onboarding_data-device_type`. Preserve operator mapping, nested `all`/`any`
groups, value coercion, default branches, subscription facts, and missing-fact
behavior across authoring and runtimes.

Known compatibility debt at guide creation:

- public type `ComponentRegisry` is misspelled but already consumed; do not
  rename it without an additive alias and deprecation plan;
- `use-interaction.ts` handles a legacy `buy_upsell` case that is absent from
  the public `LogicAction` union and current authoring lists;
- `README.md` still labels the package as v0.1 although the package is 0.2.x.

Do not opportunistically “clean up” these mismatches inside an unrelated
feature.

## Parser, registry, styling, and client behavior

The parser dispatches elements carrying `component-type` or
`data-lexical-component` through a consumer registry. Changing attribute
names, parser recursion, registry props, or default components affects all
published HTML.

- Validate both authored HTML and every runtime registry.
- Keep parser configuration and parsed trees stable enough to avoid rebuilding
  heavy pages on unrelated state changes.
- Preserve client/server component boundaries around dynamic dialogs, drawers,
  Swiper, Lottie, and other browser-only integrations.
- Consumers explicitly scan `node_modules/@job-escape/page-builder/dist` from
  Tailwind CSS. Class-name or package-layout changes need consumer CSS builds.
- `sideEffects` is `false`; new import-time effects or implicit style imports
  require an explicit packaging decision.

## Styling — the class names you emit are a public contract

This package **ships no CSS**. It emits Tailwind class-name strings in its compiled
output, and each consumer (`funnel`, `sart-funnel`) compiles them by pointing Tailwind
at `node_modules/@job-escape/page-builder/dist` with `@source`. So a class name here is
an API, and the usual library rule applies: renaming one is a breaking change that
needs a consumer CSS rebuild, and deleting one renders published funnels unstyled.

### Practices

1. **Never construct a class name at runtime.** `` `bg-${tone}` `` and
   `"text-" + size` produce no CSS in any consumer — Tailwind's scanner reads literal
   strings out of `dist` and cannot evaluate an expression. Write the complete name in
   each branch, or put the axes in a `cva` recipe (`src/ui/internal/button.tsx` is the
   pattern). This currently holds everywhere; keep it that way, because the failure is
   silent here and only visible in someone else's app.
2. **Prefer stock utilities to arbitrary values.** `w-[327px]` still compiles in
   consumers, but every arbitrary value is a literal the consumer's theme cannot
   retheme. Semantic utilities (`bg-primary`, `bg-secondary`) are better still — but
   see 3.
3. **A semantic utility is a demand on the consumer.** Custom names like `bg-primary`
   generate no CSS unless the consumer maps them; `sart-funnel` carries an explicit
   mapping block in `globals.css` for exactly the ones used here. Introducing a new
   semantic name means updating both consumers, so weigh it against a stock utility.
4. **Merge with `cn()`** from `src/lib/cn.ts`, never string concatenation. It is
   `clsx` + `extendTailwindMerge` with `rounded-cta` registered in the `rounded` group.
   **A new custom utility that collides with a Tailwind class group must be registered
   there too**, or merging keeps both classes and source order decides the winner.
5. **Forward `className` last** so a consumer can adjust a component from its call site
   instead of forking it.
6. **Never import a stylesheet.** `sideEffects: false` lets consumers drop it, so the
   import would silently do nothing. Shipping CSS from this package is a packaging
   decision, not a styling one.

### Emotion is the runtime pipeline for authored content

`src/hooks/use-styled-node.ts` parses `style`, `hover-style`, `disabled-style` and
their `desktop-` / `mobile-` variants off authored HTML attributes and turns them into
Emotion objects at render time. That is what makes constructor-authored CSS work, and
Tailwind structurally cannot do it — it is a compile-time scanner with no knowledge of
what a designer will type next week.

**Emotion for content-driven styles, Tailwind class names for the component's own
chrome.** Never reach for Emotion to style a component you are writing.

One consequence to know: those Emotion classes are load-bearing and lose to
high-specificity CSS. Both consumers keep `cascade-layers` off in `postcss.config.mjs`
because the polyfill rewrites Tailwind's `@layer base` to ID-level specificity and
beats them — stripping backgrounds and collapsing controls. If you change how styled
nodes emit, that interaction is what to re-check.

## Telemetry, external effects, and sensitive data

Host adapters may navigate, open dialogs, mutate cookies/state, make HTTP
requests, select subscriptions, refresh sessions, send analytics, and invoke
pixel/tag-manager integrations.

- Mock external effects in tests.
- Preserve HTTP timeout, lifecycle-action, response-mapping, and auth-header
  behavior.
- Do not log tokens, secrets, full payment details, or unnecessary personal
  data. Treat request bodies, email, attribution data, and URLs as potentially
  sensitive.
- Keep logger behavior a safe no-op when the host has not initialized Grafana
  Faro.

## Commands and validation

Run commands from this repository with npm:

```bash
# Requires NODE_AUTH_TOKEN for the private registry
npm ci

npm run typecheck
npm test -- --runInBand
npm run build
npm pack --dry-run --ignore-scripts
```

There is no lint script. Do not claim lint coverage or invent a repository-wide
lint command without first adding and configuring that tool intentionally.

Use a packed artifact or published version for final consumer evidence. Local
source links can hide missing `files`, bad exports, absent client directives,
stale declarations, peer duplication, and Tailwind scanning problems.

Minimum consumer checks:

| Change | Validation |
|---|---|
| types, actions, conditions, or utilities | tests/build here plus both locked-version consumers and authoring producers |
| server model or `Builder` | SSR build and hydration in each affected runtime |
| client hook/provider/parser/UI | relevant quiz/onboarding/upsell/unsubscribe flow and browser failure states |
| exports, peers, or build config | packed contents plus clean consumer install/build |
| class names or packaged UI | consumer Tailwind production build and visual smoke test |

## Publishing and delivery

The publish workflow runs on `main` when `package.json` changes, or by manual
dispatch. It installs, builds, skips an already-published version, and publishes
prereleases under the `beta` dist-tag.

- Keep `package.json` and the root lockfile version synchronized.
- Choose semver intentionally; a package.json change merged to `main` can
  trigger publishing.
- Never run `npm publish`, bump a version, push, dispatch the workflow, create a
  release/tag, or deploy a consumer without explicit user authorization.
- The tracked `.npmrc` correctly references `NODE_AUTH_TOKEN`; never replace it
  with or print a literal credential.

Safe default order:

1. Add backward-compatible runtime support and tests.
2. Build, pack, and validate both consumers against the intended artifact.
3. Commit the agreed package version.
4. Publish only with explicit authorization.
5. Upgrade and lock each consumer in separate commits.
6. Deploy runtime support before enabling authoring of the new contract.

Keep package, authoring, backend, and consumer changes in separate linked
commits and pull requests. Report the old/new declared and locked versions,
peer compatibility, content compatibility, validation, rollback, and safe
merge/deploy order.
