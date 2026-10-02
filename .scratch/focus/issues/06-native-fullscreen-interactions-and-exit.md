# 06: Complete native fullscreen interaction and exit behavior

**What to build:** Focus behaves predictably with native search, selection, scrolling, terminal-mode changes, and exit output, without maintaining separate interaction machinery.

**Blocked by:** 02 — Add the live fullscreen focus toggle.

**Status:** ready-for-agent

- [ ] Native search operates on the currently selected document. Hidden ordinary content is searchable by toggling out, not through new cross-view indexing or hidden-match reveal behavior.
- [ ] Selection-copy copies visible content. `/copy` retains its existing last-assistant-text meaning, and `/transcript` remains unchanged.
- [ ] Clear active selection and close search when toggling views so stale positions cannot apply to the replacement document. Handle the interaction through a narrow explicit boundary, not private-field probing or renderer replacement.
- [ ] Prefer per-view scroll position and follow-end restoration only if straightforward, starting the first focused view at the bottom. If it requires substantial integration complexity, use native behavior or scrolling to the bottom instead.
- [ ] Record which approved scroll behavior was selected and why. Test it while output grows and terminal dimensions change; do not introduce custom anchoring or promise exact restoration where native layout cannot support it simply.
- [ ] Leaving fullscreen disables focus. Returning to fullscreen leaves ordinary view active, and invoking focus in regular mode explains the limitation. Preserve surrounding controls and ordinary renderer behavior.
- [ ] Honor existing fullscreen exit settings. If configured to print a transcript, print ordinary output even when focus is active, including content hidden during focused viewing. If configured not to print, add no transcript output.
- [ ] Do not create a separate focus export/exit subsystem, change ordinary thinking/tool preferences to achieve exit rendering, or destroy live ordinary components during view transitions.
- [ ] Add focused integration tests for selected-document search, visible selection-copy, unchanged `/copy`, search/selection reset, terminal-mode transitions, chosen scrolling behavior, and both printing and non-printing exit settings.
- [ ] Use existing viewport and renderer seams where possible and keep any necessary new interaction reset interface narrow. Validate externally observable behavior, not private search/selection structures.
- [ ] Run affected tests and required code checks. Follow the native fullscreen interactive-testing workflow to toggle during work, search/select/copy, scroll, switch terminal modes, and inspect exit output using offline/faux inputs.
- [ ] Report any compatibility limitation explicitly rather than silently substituting weaker behavior. Verify ordinary mode remains usable and keep upstream integration changes identifiable and bounded.

## Scope boundary

Follow the parent Focus specification. Per-view scroll restoration is optional; search isolation, interaction reset, fullscreen-only lifetime, and ordinary exit output are required. Other slices need not be completed to verify this slice's interactions, but the whole feature is not release-ready until all six tickets meet their criteria. Do not modify the parent spec or commit without authorization.
