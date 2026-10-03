# 03: Keep focus correct through history and session changes

**What to build:** Focus remains accurate across transformed messages, compaction, session changes, forks, reloads, and rendering changes, without missing or duplicated answers or stale output from another session.

**Blocked by:** 02 — Add the live fullscreen focus toggle.

**Status:** ready-for-agent

- [x] Reconcile focused content with Pi's authoritative current display context after relevant message transformations and history changes. Reuse current branch/compaction behavior; do not build another archive reader.
- [x] Account for extensions processing messages before public listeners and listeners receiving `message_end` before session persistence. Verify exactly-once live completion and correct eventual displayed content, including transformed user and assistant messages.
- [x] Keep focus active across subsequent turns, in-process session switches, new sessions, and forks. Replace displayed content with the selected session's current context rather than mixing sessions.
- [x] Clear stale pending output on session replacement and provide a presentation lifecycle boundary at which the later diagnostic slice can clear its own session-local state. Do not require callers to manipulate focused containers or reproduce reset ordering.
- [x] Handle compaction and boundary-compaction updates using retained display history. Exclude compaction/branch summaries and usage notices without resurrecting pre-compaction conversation text.
- [x] Reconcile rendering after reload and changes to theme, padding, or Markdown transformations. Preserve active ordinary updates and the user's ordinary tool/thinking preferences.
- [x] Toggle during compaction, retries, and branch summarization without aborting, delaying, or restarting them. Completion and rebuild boundaries must not lose or duplicate focused answers.
- [x] Do not rebuild conversation history merely because bash finishes; it adds no qualifying focused conversation message. Preserve ordinary behavior and avoid discarding transient output owned by other presentation paths.
- [x] Keep event and history reconciliation rules inside the presentation boundary or its narrow integration, not scattered among callers. Do not require the archived implementation's exact hook names or container layout.
- [x] Add deterministic event-sequence and faux-provider integration tests covering transformed messages, listener-before-persistence ordering, session replacement, forks, compaction, retries, and reload/rendering changes. Assert displayed results and unchanged ordinary behavior, not private state structure.
- [x] Verify original messages, stored history, and model context are unchanged by focus. Show a focused session surviving a history change and an in-process session switch through the native fullscreen workflow.
- [x] Run affected tests and required code checks. Record the lifecycle integration points and any newly exposed upstream coupling in the completion report.

## Scope boundary

Follow the parent Focus specification. Diagnostic counts and their reset behavior are implemented in ticket 05 using the session lifecycle established here; no placeholder diagnostic UI is needed. Do not change the parent spec, recreate all transcript history, or commit without authorization.

## Comments

Completed and originally validated at `494c6c0b6`. Original implementation `4bffee44b` is rebased as `2a21f1dd7` at rebased checkpoint `1f915d492`, with subsequent explicit-output/diagnostic fixes committed in `f843f6521` on `stock/pi-1.0.0`. Clean baseline packaging and local consolidation commits are complete; [current target check/commit gates](../validation.md#current-rebased-target-gate) record the owner's accepted unchanged upstream check exception and separate pending target cherry-pick. Offline tests cover transformed completions, history reconciliation, compaction/retry/branch/reload and session replacement. Final owner checks 2–3 passed. See [validation](../validation.md) for lifecycle seams, gates and owner/automated distinctions. The existing `ready-for-agent` label is retained because the tracker defines readiness but no completed status; it does not indicate unfinished implementation.
