# 01: Establish the presentation boundary without changing ordinary behavior

**What to build:** Ordinary chat continues working through a bounded transcript-presentation interface that later tickets can extend. This prefactoring establishes the ownership boundary without adding focus mode or migrating all of Pi's transcript rendering.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Establish one presentation boundary for the ordinary document with a small interface suitable for view selection and subsequent focused projection. Hide document-composition mechanics rather than exporting raw containers for callers to coordinate.
- [ ] Keep the extraction bounded to what the live-toggle slice needs. Do not move the entire interactive controller, create a parallel renderer, or introduce a generic filtering/plugin framework.
- [ ] Reuse the native document and fullscreen viewport, accounting for the separate pending-output dock. Preserve ordinary behavior in both fullscreen and regular terminal modes.
- [ ] Ordinary user messages, assistant streaming, agent tool updates, native command output, diagnostics, and manual bash remain visible in their existing order and presentation.
- [ ] Existing live ordinary components continue receiving updates through the refactor. Preserve the editor, header, working indicator, footer, widgets, and steering/follow-up controls.
- [ ] Keep execution, persistence, model context, tool availability, and normal rendering preferences outside the presentation policy. No schema or settings migration is introduced.
- [ ] Add behavior-level regression coverage through the new boundary and existing interactive integration. Drive representative messages and updates and assert visible output, not private container arrangements or class identities.
- [ ] Reuse existing session/viewport seams and the current faux-provider harness where session execution is involved. Use no real providers, credentials, paid tokens, or network calls.
- [ ] Demonstrate ordinary streaming and command output through the extracted boundary. Run affected tests and the repository-required code checks; follow its interactive-testing workflow for native UI validation.
- [ ] Document the small set of integration responsibilities and any unresolved upstream coupling in the completion report. This slice does not expose or claim a complete focus feature.

## Scope boundary

Follow the parent Focus specification. Preserve all unrelated behavior and existing work. Do not implement the subsequent focus, diagnostics, command-exception, or fullscreen-transition slices here. Do not change the parent spec or commit without authorization. Readiness is not authorization to begin implementation.
