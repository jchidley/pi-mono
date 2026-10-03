# 01: Establish the presentation boundary without changing ordinary behavior

**What to build:** Ordinary chat continues working through a bounded transcript-presentation interface that later tickets can extend. This prefactoring establishes the ownership boundary without adding focus mode or migrating all of Pi's transcript rendering.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Establish one presentation boundary for the ordinary document with a small interface suitable for view selection and subsequent focused projection. Hide document-composition mechanics rather than exporting raw containers for callers to coordinate.
- [x] Keep the extraction bounded to what the live-toggle slice needs. Do not move the entire interactive controller, create a parallel renderer, or introduce a generic filtering/plugin framework.
- [x] Reuse the native document and fullscreen viewport, accounting for the separate pending-output dock. Preserve ordinary behavior in both fullscreen and regular terminal modes.
- [x] Ordinary user messages, assistant streaming, agent tool updates, native command output, diagnostics, and manual bash remain visible in their existing order and presentation.
- [x] Existing live ordinary components continue receiving updates through the refactor. Preserve the editor, header, working indicator, footer, widgets, and steering/follow-up controls.
- [x] Keep execution, persistence, model context, tool availability, and normal rendering preferences outside the presentation policy. No schema or settings migration is introduced.
- [x] Add behavior-level regression coverage through the new boundary and existing interactive integration. Drive representative messages and updates and assert visible output, not private container arrangements or class identities.
- [x] Reuse existing session/viewport seams and the current faux-provider harness where session execution is involved. Use no real providers, credentials, paid tokens, or network calls.
- [x] Demonstrate ordinary streaming and command output through the extracted boundary. Run affected tests and the repository-required code checks; follow its interactive-testing workflow for native UI validation.
- [x] Document the small set of integration responsibilities and any unresolved upstream coupling in the completion report. This slice does not expose or claim a complete focus feature.

## Scope boundary

Follow the parent Focus specification. Preserve all unrelated behavior and existing work. Do not implement the subsequent focus, diagnostics, command-exception, or fullscreen-transition slices here. Do not change the parent spec or commit without authorization. Readiness is not authorization to begin implementation.

## Comments

Completed and originally validated at `494c6c0b6`. Original implementation `ce541449a` is rebased as `c6a41ac77` at rebased checkpoint `1f915d492`; clean baseline packaging and local consolidation commits are complete, with code anchor `f843f6521` on `stock/pi-1.0.0`. The [current target gate](../validation.md#current-rebased-target-gate) records the owner's accepted unchanged upstream check exception and separate pending target cherry-pick, not unfinished presentation work. All criteria remain controlling and are reconciled against current presentation source, ordinary behavior coverage and later complete-feature validation. Host integration responsibilities and remaining upstream coupling are recorded in [validation](../validation.md#implementation-reconciliation). The existing `ready-for-agent` label is retained because the tracker defines readiness but no completed status; it does not indicate unfinished implementation.
