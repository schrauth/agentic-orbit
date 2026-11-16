# Fraunhofer Theme — Implementation Plan

## Executive summary and current ground

The map already has one shared palette model and renderer. [Setup](../../hooks/setup.ts) carries
the selected theme and named color overrides; [palette.ts](../../hooks/palette.ts) defines the
dark/light palettes and their roles; [scene.ts](../../hooks/draw/scene.ts) selects colors and
builds the SVG. The extension publishes its theme through the
[VS Code setting](../../vscode-extension/package.json). The [demo](../../demo/index.html) selects
the theme locally and uses page CSS for its surrounding browser surface. The
[standalone host](../../standalone/http.ts) already sends its raw setup before board snapshots;
the [standalone page](../../standalone/index.html) lets its local theme choice override that setup.
No board or hook-event field is involved.

The contract slice is now in place: `Setup.theme` and `agenticOrbit.theme` accept the additional
`fraunhofer` value, while the existing `auto` default and all existing values remain unchanged.
No runtime, page, or palette implementation is included in this contract change.

The user supplied an image of the Fraunhofer corporate palette guide, section 1.2.6, “Farbwerte
für Print, Screen und Events.” Its Screen RGB/HEX swatches provide the brand colors. The theme is
light, reusing the existing `LIGHT` palette neutrals for its surfaces and text; no new neutral
colors are sampled or derived.

## Design decisions

1. `fraunhofer` is an additional named light theme, not a replacement for `auto`, `dark`, or
   `light`; existing defaults and selections keep their current meaning.
2. The theme is carried through the existing `Setup`/raw-setup flow. Do not add a `Board`,
   `HookEvent`, or SSE message field, and do not duplicate palette selection in each host.
3. Existing named `colors` overrides continue to take precedence over the theme palette. Brand
   accents use sourced, approved values; light surfaces reuse the existing `LIGHT` neutrals.
4. The extension, demo, and standalone page expose the same selection. The standalone page's
   existing local-choice-over-host-setup behavior remains intact.
5. No new dependency or module-boundary change is needed.

## Implementation phases

### Phase 1 — Source and install the approved palette

#### - [x] Task 1.1: Confirm official Fraunhofer digital palette values

- **Problem:** A `fraunhofer` selector without source-backed values and role mapping would be a
  guessed brand palette.
- **Affected files:** [hooks/palette.ts](../../hooks/palette.ts) (palette values and source
  attribution).
- **Target state:** Use the supplied guide's Screen RGB/HEX swatches for the brand colors, reuse
  the existing light neutrals for surfaces and text, and put a concise source reference beside the
  values. Do not infer additional brand colors.
- **Verification:** Every Fraunhofer brand color is traceable to section 1.2.6; the remaining
  surface and text colors are reused from the existing `LIGHT` palette.

### Phase 2 — Shared theme resolution and extension contract behavior

#### - [x] Task 2.1: Resolve `fraunhofer` in shared setup and drawing

- **Problem:** The current parser accepts only `dark` and `light`; all other strings become `auto`,
  and the SVG renderer chooses only between the existing two palettes.
- **Affected files:** [hooks/setup.ts](../../hooks/setup.ts),
  [hooks/palette.ts](../../hooks/palette.ts), [hooks/draw/scene.ts](../../hooks/draw/scene.ts),
  [vscode-extension/test/quality.test.cjs](../../vscode-extension/test/quality.test.cjs).
- **Target state:** Preserve the new `fraunhofer` value in `setupFrom`, select the sourced palette
  in the shared SVG renderer, keep `auto`/`dark`/`light` behavior unchanged, and apply custom
  `colors` overrides after the selected palette as today.
- **Verification:** Regression tests cover `fraunhofer` parsing and rendered palette selection,
  existing values and invalid-value fallback; `cd vscode-extension && npm test` passes.

#### - [x] Task 2.2: Keep the extension setting surface aligned

- **Problem:** The setting schema already advertises the new value, so extension configuration
  must preserve it through `config()` and continue to honor the unchanged `auto` default.
- **Affected files:** [vscode-extension/package.json](../../vscode-extension/package.json),
  [vscode-extension/src/config.ts](../../vscode-extension/src/config.ts),
  [docs/usage.md](../../docs/usage.md).
- **Target state:** The setting description and user guide list `auto`, `dark`, `light`, and
  `fraunhofer`; extension config passes the named choice through without changing how `auto`
  follows the workbench theme. Avoid changes to settings unrelated to theme.
- **Verification:** Check the setting enum/default against `Setup.theme`; confirm the usage table
  matches the manifest; `cd vscode-extension && npm test` passes.

### Phase 3 — Workshop and standalone selections

#### - [x] Task 3.1: Add the theme to the browser demo

- **Problem:** The demo's state type, select options, and page-surface CSS currently expose only
  `dark`, `light`, and `auto`.
- **Affected files:** [demo/index.html](../../demo/index.html),
  [demo/main.ts](../../demo/main.ts), [demo/main.css](../../demo/main.css),
  [demo/engine.ts](../../demo/engine.ts).
- **Target state:** The demo select offers `fraunhofer`, passes it to the shared setup, and applies
  compatible surrounding-page colors; existing selections remain unchanged.
- **Verification:** `cd demo && npm run typecheck && npm run build` passes; manually switch among
  all four themes and confirm both the SVG and browser-page surface update.

#### - [ ] Task 3.2: Add the theme to the standalone page and configuration flow

- **Problem:** The standalone page's selector and page CSS omit `fraunhofer`, although the host
  already forwards raw setup and its config allow-list already includes `theme`.
- **Affected files:** [standalone/index.html](../../standalone/index.html),
  [standalone/main.ts](../../standalone/main.ts), [standalone/main.css](../../standalone/main.css),
  [standalone/test/server.test.cjs](../../standalone/test/server.test.cjs).
- **Target state:** The host-provided `fraunhofer` choice and the page's local override both select
  the shared Fraunhofer palette; the selected page override still wins across setup reconnects.
  Keep the existing setup frame and do not add a transport field or new CLI flag.
- **Verification:** `cd standalone && npm run typecheck && npm test` passes; tests cover Fraunhofer
  from a config file and the page menu/CSS. Manual page-side selection and reconnect behavior have
  not been visually verified.

### Phase 4 — End-to-end verification and release notes

#### - [ ] Task 4.1: Verify compatibility and document the new choice

- **Problem:** The new theme must work consistently across all three consumers without changing
  existing settings or the shared data boundaries.
- **Affected files:** [CHANGELOG.md](../../CHANGELOG.md), [docs/usage.md](../../docs/usage.md),
  plus the tests and surfaces listed above.
- **Target state:** Document Fraunhofer as an available theme and note its sourced palette. No
  board/event/SSE schema changes, new runtime dependencies, or edits under `.github/agents/`.
- **Verification:** `cd vscode-extension && npm test`, `cd demo && npm run typecheck && npm run build`,
  and `cd standalone && npm run typecheck && npm test` pass. Headless Chrome smoke-tested all four
  demo themes. The extension and standalone page have not been manually visually verified.

## Guard-rails

- Use only the supplied Screen RGB/HEX values for Fraunhofer brand colors; reuse existing `LIGHT`
  neutrals for light surfaces rather than inventing colors or deriving tints.
- Preserve `auto` as the setting default and preserve all current theme semantics.
- Keep palette selection in the shared renderer and keep the demo/standalone pages as consumers;
  do not fork map drawing or add theme data to `Board`, `HookEvent`, or SSE frames.
- Keep custom per-role colors as overrides and do not alter the privacy, hook, proxy, or network
  boundaries.
- Do not modify `.github/agents/`.
