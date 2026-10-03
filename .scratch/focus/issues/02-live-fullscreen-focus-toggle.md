# 02: Add the live fullscreen focus toggle

**What to build:** A fullscreen user can immediately toggle between ordinary output and user/completed-answer text while work continues. Switching back reveals current ordinary progress, not a stale reconstruction.

**Blocked by:** 01 — Establish the presentation boundary without changing ordinary behavior.

**Status:** ready-for-agent

- [x] Register `/focus` and preserve the configurable `app.transcript.toggleFinalOnly` action against the same toggle. The action has no default shortcut; existing editor bindings remain unchanged.
- [x] Handle toggling locally without model requests, new conversation messages, queued prompts, or unintended execution of pending input. Test behavioral side effects rather than prohibiting an internal dispatch through `session.prompt`.
- [x] Support fullscreen only. In regular terminal mode, explain the requirement without enabling focus or altering ordinary behavior. Each new process starts ordinary; no persisted focus setting is added.
- [x] Build the initial focused conversation from Pi's current branch and compaction-aware display context, not every session record or pre-compaction archive content.
- [x] Show user text at message start. Show assistant text only after completion with stop reason `stop` and no tool-call block. Reject tool-bearing `stop`, streaming/partial/pending/deferred output, and failed, aborted, or truncated answer text.
- [x] Remove thinking, including hidden/expandable thinking labels, from focused rendering input without mutating original messages. Hide agent tool output, unsolicited custom/background entries, summaries, usage notices, and the loaded-resource listing.
- [x] Render focused conversation text without images, attachments, or expanded skill bodies; retain the user's own text and reuse existing Markdown components, theme, padding, and transformations.
- [x] Toggle during live assistant and tool events without pausing, cancelling, restarting, or waiting for idle. Do not introduce a busy-state guard or queue the toggle during other active operations.
- [x] Keep ordinary live components updating while hidden. Verify that toggling back reveals the latest partial assistant and tool output, with ordinary tool/thinking preferences and surrounding UI unchanged.
- [x] Display each qualifying live answer exactly once around message completion and repeated toggles. Cover listener-before-persistence ordering so the newly completed answer is not dependent on a later stored-history rebuild.
- [x] Leave `/transcript`, model context, session data, tool availability, and execution unchanged. Keep the feature isolated enough that ordinary stock use remains possible when focus is unavailable; do not add speculative version-detection machinery.
- [x] Add offline behavioral tests for the filter matrix, local command/action dispatch, restored history, and live toggling. Reuse the current faux-provider harness for session integration and assert observable output rather than private internals.
- [x] Run affected tests and required code checks, and demonstrate a native fullscreen user/assistant/tool sequence with toggles in both directions using the repository's interactive-testing workflow.

## Scope boundary

Follow the parent Focus specification. Later tickets complete lifecycle reconciliation, explicit command/manual-bash exceptions, quiet diagnostics, and fullscreen interaction/exit semantics. Do not substitute an idle-only or overlay implementation, and do not treat this intermediate slice as the complete release-ready feature. Do not modify the parent spec or commit without authorization.

## Comments

Completed and originally validated at `494c6c0b6`. Original implementation `cbaba6512` is rebased as `ce3e3081e` at rebased checkpoint `1f915d492`. Clean baseline packaging and local consolidation commits are complete, with code anchor `f843f6521` on `stock/pi-1.0.0`; [current target check/commit gates](../validation.md#current-rebased-target-gate) record the owner's accepted unchanged upstream check exception and separate pending target cherry-pick. Existing offline tests cover local dispatch, positive filtering, live ordinary updates and completion-before-persistence. Owner live toggle/resize check 1 passed. See [validation](../validation.md) for final gates, prior native results and limitations. The existing `ready-for-agent` label is retained because the tracker defines readiness but no completed status; it does not indicate unfinished implementation.
