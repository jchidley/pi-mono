# 05: Add quiet diagnostic awareness

**What to build:** Focused users can notice user-facing problems through a compact right-aligned status indicator and toggle out to inspect details, without unsolicited diagnostic text or another panel.

**Blocked by:** 02 — Add the live fullscreen focus toggle; 03 — Keep focus correct through history and session changes.

**Status:** ready-for-agent

- [x] Show focus state and warning/error counts on the right of the existing extension-status row. Preserve ordinary extension statuses such as `Cdx` on the left without replacing their content or coupling to the Codex extension.
- [x] Keep footer changes small and isolated. Verify coexistence with multiple statuses, an otherwise empty extension-status row, and narrow terminal widths without adding a diagnostic panel or overflowing the terminal.
- [x] Count user-facing warnings/errors and unsuccessful assistant completions, including failed, aborted, and truncated responses. Keep unfinished assistant text out of the focused conversation.
- [x] Do not count every intermediate tool failure, routine informational notice, or warning-colored tool text. Do not infer diagnostic meaning from rendered colors or wording.
- [x] Show no unsolicited diagnostic message text while focused and do not open a viewer or automatically change views. Preserve existing ordinary diagnostic details for inspection by toggling out.
- [x] Define the counts as diagnostics since entering focus, not unread messages. Do not replay historical failures or increment counts simply because the document is rebuilt or rendering settings change.
- [x] Keep counts across new turns. Clear them when leaving focus or changing sessions, using the presentation lifecycle established by ticket 03; entering focus begins a fresh counting interval.
- [x] Keep diagnostic accounting inside the presentation boundary with explicit routing from existing user-facing warning/error sources. Avoid another logging system or a new extension API.
- [x] Add behavior tests for live warning/error reporting, unsuccessful assistant completions, tool-failure exclusion, no historical replay, retention across turns, and resets across toggles and session changes.
- [x] Verify ordinary diagnostics remain available and focus does not alter execution, retries, session data, or native command behavior. Assert observable status/output rather than private counters or container topology.
- [x] Run affected tests and required code checks. Demonstrate the native footer beside existing extension statuses and inspect diagnostic details after toggling out.

## Scope boundary

Follow the parent Focus specification. No separate feedback/viewer area, unread-tracking scheme, or text-classification mechanism is authorized. Readiness still requires the listed blockers; logical independence from other tickets does not authorize overlapping file edits in parallel. Do not modify the parent spec or commit without authorization.

## Comments

Completed and originally validated at `494c6c0b6`. Original implementation `48045db6f` is rebased as `1b732efb5` at rebased checkpoint `1f915d492`; typed diagnostic routing/accounting preserve ordinary details, exclude intermediate/tool-color noise and use the specified resets. Footer width/status tests and final owner check 2 establish the quiet indicator and turn/reload retention/reset. See [validation](../validation.md) for gates and coverage. The existing `ready-for-agent` label is retained because the tracker defines readiness but no completed status; it does not indicate unfinished implementation.

Upgrade-review follow-up: fixed the previously uncovered resource-reload diagnostic gap in local code commit `f843f6521` on `stock/pi-1.0.0`. Typed diagnostic gathering is shared by ordinary rendering and loading-boundary accounting; initial/session loading seeds the baseline and reload counts newly appearing errors/warnings/collisions without replaying unchanged failures. Recovery followed by recurrence counts anew. See [final fix validation](../validation.md#upgrade-review-fixes); fixes are included in clean baseline commit `400f5b939` and the committed rebased parent. Local consolidation is complete; [current target check/commit gates](../validation.md#current-rebased-target-gate) record the owner's accepted unchanged upstream check exception and separate pending target cherry-pick, not unfinished behavior.
