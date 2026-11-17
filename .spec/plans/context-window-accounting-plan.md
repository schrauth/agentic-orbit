# Context Window Accounting — Draft

**Status: idea sketch, not scheduled, not for execution.** Reminders of what the
Copilot Chat session panel does better than the map; no tasks until we decide to
pursue it.

## Where we stand

[proxy.ts](../../app/proxy.ts) takes `usage.prompt_tokens` or falls back to
`length / 4`; [withContext](../../app/board.ts) turns it into one percentage against
the single `contextWindowLimit` from [setup.ts](../../hooks/setup.ts); the ring in
[scene.ts](../../hooks/draw/scene.ts) and the meter in [feed.ts](../../hooks/feed.ts)
show only that percentage.

## Ideas worth borrowing

1. **Say where the number came from.** Measured `usage` vs. character estimate are
   different claims; draw the estimate dashed or with `~`.
2. **Reserve for the response.** Show the answer budget as a distinct, non-consumed
   segment; compute the percentage against the usable prompt budget.
3. **Count the segments, not the text.** System prompt, tool definitions, messages,
   tool results, other — integers only, classified by role/shape.
4. **Show absolute figures.** `75.7K / 238K · 32 %` says more than `32 %`.
5. **Resolve the window per model.** One global 128K is wrong for mixed models;
   configured fallback plus a per-model source.
6. **Mark the compaction point.** A threshold tick on the ring, and a brief mark
   when the figure drops.
7. **Keep the ring aggregate.** Composition belongs in the drawer/tooltip, not in a
   second ring.
8. **Stay session-honest.** Detail is per session; the merged view shows it only
   when exactly one session has a context, like `contextShared`.

## Before any code

- Settle reserve source (`max_tokens` vs. a new setting), window source, whether the
  breakdown is persisted or transient, and the threshold.
- Update the PRIVACY.md proxy paragraph first: structural counts are new
  classification, even though no content is kept.
- Rebase on the [multi-session plan](./multi-session-boards-plan.md); do not build a
  second context channel beside its registry.

## Guard-rails

- No content, no tokenizer dependency, no new telemetry channel — detail rides on
  the existing `modelStep` line (ADR-007).
- Single-session parity: without detail, the map draws exactly as today.
- Keep settings minimal; every new key needs a reason.
