# 02: Add the live fullscreen focus toggle

**What to build:** A fullscreen user can immediately toggle between ordinary output and user/completed-answer text while work continues. Switching back reveals current ordinary progress, not a stale reconstruction.

**Blocked by:** 01 — Establish the presentation boundary without changing ordinary behavior.

**Status:** ready-for-agent

- [ ] Register `/focus` and preserve the configurable `app.transcript.toggleFinalOnly` action against the same toggle. The action has no default shortcut; existing editor bindings remain unchanged.
- [ ] Handle toggling locally without model requests, new conversation messages, queued prompts, or unintended execution of pending input. Test behavioral side effects rather than prohibiting an internal dispatch through `session.prompt`.
- [ ] Support fullscreen only. In regular terminal mode, explain the requirement without enabling focus or altering ordinary behavior. Each new process starts ordinary; no persisted focus setting is added.
- [ ] Build the initial focused conversation from Pi's current branch and compaction-aware display context, not every session record or pre-compaction archive content.
- [ ] Show user text at message start. Show assistant text only after completion with stop reason `stop` and no tool-call block. Reject tool-bearing `stop`, streaming/partial/pending/deferred output, and failed, aborted, or truncated answer text.
- [ ] Remove thinking, including hidden/expandable thinking labels, from focused rendering input without mutating original messages. Hide agent tool output, unsolicited custom/background entries, summaries, usage notices, and the loaded-resource listing.
- [ ] Render focused conversation text without images, attachments, or expanded skill bodies; retain the user's own text and reuse existing Markdown components, theme, padding, and transformations.
- [ ] Toggle during live assistant and tool events without pausing, cancelling, restarting, or waiting for idle. Do not introduce a busy-state guard or queue the toggle during other active operations.
- [ ] Keep ordinary live components updating while hidden. Verify that toggling back reveals the latest partial assistant and tool output, with ordinary tool/thinking preferences and surrounding UI unchanged.
- [ ] Display each qualifying live answer exactly once around message completion and repeated toggles. Cover listener-before-persistence ordering so the newly completed answer is not dependent on a later stored-history rebuild.
- [ ] Leave `/transcript`, model context, session data, tool availability, and execution unchanged. Keep the feature isolated enough that ordinary stock use remains possible when focus is unavailable; do not add speculative version-detection machinery.
- [ ] Add offline behavioral tests for the filter matrix, local command/action dispatch, restored history, and live toggling. Reuse the current faux-provider harness for session integration and assert observable output rather than private internals.
- [ ] Run affected tests and required code checks, and demonstrate a native fullscreen user/assistant/tool sequence with toggles in both directions using the repository's interactive-testing workflow.

## Scope boundary

Follow the parent Focus specification. Later tickets complete lifecycle reconciliation, explicit command/manual-bash exceptions, quiet diagnostics, and fullscreen interaction/exit semantics. Do not substitute an idle-only or overlay implementation, and do not treat this intermediate slice as the complete release-ready feature. Do not modify the parent spec or commit without authorization.
