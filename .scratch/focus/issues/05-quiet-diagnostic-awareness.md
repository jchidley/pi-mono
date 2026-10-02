# 05: Add quiet diagnostic awareness

**What to build:** Focused users can notice user-facing problems through a compact right-aligned status indicator and toggle out to inspect details, without unsolicited diagnostic text or another panel.

**Blocked by:** 02 — Add the live fullscreen focus toggle; 03 — Keep focus correct through history and session changes.

**Status:** ready-for-agent

- [ ] Show focus state and warning/error counts on the right of the existing extension-status row. Preserve ordinary extension statuses such as `Cdx` on the left without replacing their content or coupling to the Codex extension.
- [ ] Keep footer changes small and isolated. Verify coexistence with multiple statuses, an otherwise empty extension-status row, and narrow terminal widths without adding a diagnostic panel or overflowing the terminal.
- [ ] Count user-facing warnings/errors and unsuccessful assistant completions, including failed, aborted, and truncated responses. Keep unfinished assistant text out of the focused conversation.
- [ ] Do not count every intermediate tool failure, routine informational notice, or warning-colored tool text. Do not infer diagnostic meaning from rendered colors or wording.
- [ ] Show no unsolicited diagnostic message text while focused and do not open a viewer or automatically change views. Preserve existing ordinary diagnostic details for inspection by toggling out.
- [ ] Define the counts as diagnostics since entering focus, not unread messages. Do not replay historical failures or increment counts simply because the document is rebuilt or rendering settings change.
- [ ] Keep counts across new turns. Clear them when leaving focus or changing sessions, using the presentation lifecycle established by ticket 03; entering focus begins a fresh counting interval.
- [ ] Keep diagnostic accounting inside the presentation boundary with explicit routing from existing user-facing warning/error sources. Avoid another logging system or a new extension API.
- [ ] Add behavior tests for live warning/error reporting, unsuccessful assistant completions, tool-failure exclusion, no historical replay, retention across turns, and resets across toggles and session changes.
- [ ] Verify ordinary diagnostics remain available and focus does not alter execution, retries, session data, or native command behavior. Assert observable status/output rather than private counters or container topology.
- [ ] Run affected tests and required code checks. Demonstrate the native footer beside existing extension statuses and inspect diagnostic details after toggling out.

## Scope boundary

Follow the parent Focus specification. No separate feedback/viewer area, unread-tracking scheme, or text-classification mechanism is authorized. Readiness still requires the listed blockers; logical independence from other tickets does not authorize overlapping file edits in parallel. Do not modify the parent spec or commit without authorization.
