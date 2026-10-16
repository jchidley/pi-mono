# Focus: maintainable live fullscreen transcript view

Status: ready-for-agent

## Problem Statement

Pi's ordinary transcript combines user messages and assistant answers with thinking, tool activity, diagnostics, and other output. The owner wants to temporarily read and continue a conversation without that noise, while retaining immediate access to ordinary output and ongoing work.

Focus must remain maintainable across upstream upgrades through a clean, bounded architecture. A small patch is not sufficient if it spreads knowledge of focus mode across unstable internals.

## Solution

Provide `/focus` as an immediate, local toggle of the live native fullscreen transcript. Focused conversation content consists of user text and completed final assistant answers. Ordinary output continues updating while hidden and becomes visible when focus is disabled.

Explicit native commands and manually requested bash output retain their normal presentation. A compact right-aligned indicator on the existing extension-status row reports focus state and diagnostic counts without displaying unsolicited diagnostic text or opening another panel. The user toggles back to inspect details.

Reuse Pi's native viewport, surrounding controls, search, selection, and rendering. Encapsulate presentation policy behind a small integration boundary rather than maintaining a separate renderer or parallel transcript implementation. Upstream adoption is welcome but not required. If an upgrade breaks compatibility, report focus as unavailable and allow ordinary stock use rather than delay upgrades or silently weaken the contract.

## User Stories

1. As a fullscreen Pi user, I want `/focus` to toggle the native transcript immediately, so that I can reduce noise without leaving the live conversation.
2. As a user working with an active agent, I want to toggle during streaming and tool execution, so that reading preferences do not interrupt work.
3. As a user, I want toggling to work during compaction, retries, branch summarization, and manual or intercepted bash execution, so that I do not need to wait for an idle state.
4. As a user, I want toggling to be entirely local, so that it creates no model request, conversation message, queued prompt, or unintended input submission.
5. As a keyboard user, I want an optional configurable action for the same toggle, so that I can choose a shortcut without losing an existing default binding.
6. As a regular-terminal user, I want an explanation that focus requires fullscreen, so that unsupported behavior is explicit.
7. As a user, I want my text to appear when my message starts, so that the focused conversation remains responsive.
8. As a user, I want assistant answers to appear only after successful completion without tool calls, so that unfinished or tool-related commentary does not interrupt reading.
9. As a user, I want thinking and its expandable labels absent from focused answers, so that focus is more than collapsed ordinary output.
10. As a user, I want agent tool calls, results, and summaries hidden, so that execution detail does not dominate the conversation.
11. As a user, I want partial, pending, deferred, failed, aborted, and truncated assistant answers excluded, so that unfinished text is not presented as a completed answer.
12. As a user, I want a text-only focused conversation without images, attachments, or expanded skill bodies, so that the view stays compact while preserving my own text.
13. As a user, I want unsolicited extension transcript output, loaded-resource listings, summaries, usage entries, and background notices hidden, so that focus remains quiet.
14. As a user, I want explicit native commands such as `/session`, `/hotkeys`, `/name`, and `/changelog` to display their output normally, so that focus does not obstruct commands I deliberately invoke.
15. As a user, I want manually requested `!command` and `!!command` output to remain visible and live, so that I can use shell commands without changing views.
16. As a user, I want existing extension dialogs, widgets, and editor interactions preserved, so that enabling focus does not disable unrelated functionality.
17. As a user, I want to reveal hidden extension transcript output simply by toggling focus off, so that extensions need no new output-classification API.
18. As a user, I want ordinary output to continue updating while hidden, so that toggling back reveals current assistant and tool progress rather than a stale reconstruction.
19. As a user, I want each completed answer to appear exactly once through toggles and reconciliation, so that no content disappears or duplicates around completion.
20. As a user, I want focus to follow Pi's current branch and retained transcript history, so that it does not become a separate archive reader after compaction.
21. As a user, I want focus retained across turns and in-process session changes, so that I do not have to enable it repeatedly.
22. As a user switching sessions, I want stale diagnostics and pending output cleared, so that content from the previous session does not leak into the selected one.
23. As a user, I want a new process to start in ordinary view, so that a temporary viewing preference does not become persistent configuration.
24. As a user leaving fullscreen, I want focus disabled, so that regular mode retains its existing behavior and returning to fullscreen does not unexpectedly restore focus.
25. As a user, I want focus to leave session records, model context, available tools, and execution unchanged, so that filtering affects only presentation.
26. As a user, I want my ordinary thinking-visibility and tool-expansion preferences preserved, so that switching views does not overwrite them.
27. As a user, I want themes, padding, Markdown transformations, and reload changes reflected in focus, so that both views remain consistent with Pi's rendering settings.
28. As a user, I want the editor, header, working indicator, footer, widgets, and steering/follow-up controls available, so that I can keep working normally while focused.
29. As a user, I want a right-aligned focus and diagnostic indicator beside existing extension statuses such as `Cdx`, so that I can notice problems without another panel.
30. As a user, I want warning/error counts without unsolicited diagnostic text or automatic view changes, so that notifications do not interrupt reading.
31. As a user, I want counts for user-facing warnings/errors and unsuccessful assistant completions rather than every intermediate tool failure, so that the indicator remains meaningful.
32. As a user, I want counts to represent diagnostics since entering focus, survive new turns, and clear on leaving focus or changing sessions, so that their meaning is predictable without pretending to track what I have read.
33. As a user, I want native search to operate on the selected document, so that matches can be shown directly and I can toggle out to search ordinary output.
34. As a user, I want selection-copy to copy visible content while `/copy` keeps its existing meaning, so that focus does not unexpectedly change copy commands.
35. As a user, I want active selection cleared and search closed on a view switch, so that stale positions do not apply to different content.
36. As a user, I would like each view's scroll position and follow-end state remembered when straightforward, so that toggling does not lose my place; I accept native behavior or scrolling to the bottom if restoration adds substantial maintenance complexity.
37. As a user exiting fullscreen, I want Pi's configured exit behavior preserved and any printed transcript to contain ordinary output, so that focus remains an active-viewing switch only.
38. As an existing user, I want `/transcript` left untouched, so that its separate workflow continues working.
39. As the fork maintainer, I want a deep presentation module with few explicit upstream integration points, so that upgrades normally require localized adaptation rather than repeated feature reconstruction.
40. As the fork maintainer, I want behavior-level regression coverage using offline events and native fullscreen integration, so that upgrades expose contract failures without tests depending on private container arrangements.
41. As the fork maintainer, I want to upgrade with focus explicitly unavailable when necessary, so that this feature does not block stock Pi upgrades or encourage silent degradation.

## Implementation Decisions

### Presentation boundary and ownership

- Introduce or extract a bounded transcript-presentation module with a small interface hiding view selection, focused projection, reconciliation, diagnostic accounting, and explicit-output handling. Callers express presentation intent rather than manipulate focused containers or reproduce ordering rules.
- Keep a small set of explicit integration responsibilities: mount the presented document, deliver relevant live events, reconcile or replace current history, route native command output and user-facing diagnostics, publish status, and reset view-specific interactions.
- Preserve upstream execution, persistence, ordinary live components, editor, viewport, rendering, search, and selection. Keep the ordinary component graph alive and updating while hidden; do not rebuild it from persisted messages on every toggle.
- A unified semantic presentation model is acceptable where it reduces lifecycle dependencies or duplication, but a wholesale transcript rewrite is not required. Avoid monkey-patching, private-container probing, and generic filtering or extension frameworks.
- A supported upstream boundary would reduce maintenance further, but acceptance upstream is not a dependency. The goal is a module normally unchanged by upgrades with adaptations confined to an identifiable integration layer, not a guarantee based on changed-line count.

### Command and filter contracts

- `/focus` and the configurable action `app.transcript.toggleFinalOnly` use the same toggle. Preserve the action identifier for compatibility and leave it unbound by default. F6 is only an example; Ctrl+Y retains its editor binding.
- Fullscreen is required. Regular mode reports the limitation without enabling focus.
- Local dispatch must cause no model request, conversation entry, queued prompt, or accidental pending-input execution. This does not forbid calling `session.prompt` internally: stock Pi dispatches registered extension commands before prompt queuing.
- Use a positive conversation allowlist. User text qualifies. An assistant answer qualifies only after completion with stop reason `stop` and no tool-call block. A tool-bearing `stop` does not qualify. “Final” is structural, not a semantic assessment of task completion.
- Hide streaming, partial, pending, deferred, truncated, failed, and aborted answer text. Strip thinking from focused rendering input without mutating the underlying message; do not substitute ordinary thinking-collapse preferences.
- Focused conversation rendering is text-only. Omit images, attachments, and expanded skill bodies while preserving the user's own text.
- Explicit native command output and manual bash output, including pending, deferred, streaming, and intercepted bash, are intentional exceptions to conversation-only filtering. Keep their normal presentation and ordinary output; preserve existing execution guards. Native command output is transient display content. Both `!` and `!!` bash results are saved; `!!` excludes output from model context, not session history. No new viewer, feedback panel, or automatic mode exit is introduced.
- Preserve extension dialogs, widgets, and editor interactions. Unsolicited extension transcript content stays hidden and is available in ordinary view. No new extension-output classification API or inference from message text/timing is required.

### Live lifecycle and history

- Display user text at message start and qualifying assistant text at completion. Toggling never cancels, pauses, restarts, or queues ongoing work.
- Reuse Pi's current branch and compaction-aware display context. Do not reconstruct all pre-compaction history or unrelated branches.
- Reconcile with authoritative current display history after relevant message transformations, compaction, session changes, and reloads. Do not prescribe particular event names as permanent architecture.
- Stock Pi emits `message_end` to public listeners after extension handling but before session persistence. A rebuild using only persisted entries inside that callback can omit the just-completed answer. Integration must account for this ordering without losing or duplicating content.
- The fullscreen transcript document and pending-output dock are distinct surfaces. Handle explicit pending bash visibility without replacing the renderer or hiding unrelated queue controls. Preserve active manual bash components, ordering, later chunks, and exactly-once completion across manual, automatic, and boundary compaction rebuilds.
- Focus is process-local: ordinary on startup, retained across turns and in-process session changes, cleared when leaving fullscreen. Session replacement clears old diagnostics and stale pending output. Returning to fullscreen does not implicitly re-enable focus.
- No schema migration, persisted focus setting, model-context modification, or change to tool execution is required. Ordinary thinking and tool-expansion preferences remain unchanged.
- Reuse existing message rendering, theme, padding, and Markdown transformations. Refresh rendering inputs without destroying active ordinary components. Preserve surrounding application controls while hiding the loaded-resource transcript listing.

### Diagnostic status

- Add a small isolated footer integration that keeps extension statuses on the left and places focus state and diagnostic counts on the right of the same row. It must be independent of the Codex extension and coexist with other statuses, including at narrow widths.
- Count user-facing warnings/errors and unsuccessful assistant completions, including failure, abortion, and truncation. Do not promote routine notices, warning-colored tool text, or every intermediate tool failure into counts.
- Counts mean diagnostics since entering focus, not unread messages. Do not populate them by replaying historical failures during reconciliation. Retain counts across new turns; clear them on leaving focus or changing sessions. Initial/session resource loading seeds a diagnostic baseline; reload counts newly appearing typed errors, warnings, and collisions without replaying unchanged failures. Recovery followed by recurrence counts anew.
- Keep diagnostic details in ordinary output. Do not display unsolicited diagnostic text in focus, open another area, or automatically change views. The user toggles out to inspect details.

### Fullscreen interactions and exit

- Reuse native search against the selected view's document and native selection-copy for visible content. `/copy` retains its existing last-assistant-text behavior; `/transcript` remains unchanged.
- Close search and clear active selection on toggling. Merely swapping the document does not provide these semantics automatically.
- Use the approved scroll-to-bottom policy on every view replacement, with native follow-end for output growth and relayout. Exact per-view offsets would require additional layout-timing coordination between documents of different heights; no custom anchoring or exact-position restoration is required.
- Native fullscreen viewport shortcuts retain precedence. The Focus action is unbound by default; choose a non-conflicting binding rather than overriding native controls.
- Respect Pi's fullscreen exit setting. When printing a transcript on exit, explicitly use ordinary output even if focus was active. When configured not to print, do not add output. No separate export or exit subsystem is needed.

### Upgrade policy

- Verify the target release's actual APIs rather than assuming a supported transcript-filter hook exists. An editor replacement, overlay, or Markdown transform without the required message metadata does not satisfy this contract.
- Allow explicit temporary unavailability when a target Pi release cannot support the feature safely. Keep ordinary stock use possible. Do not substitute an idle-only mode, overlay reader, or weakened filter without a new owner decision.

## Testing Decisions

- The owner approved one primary behavioral boundary: drive transcript presentation through commands and session events and assert visible output, diagnostic status, and unchanged ordinary behavior. Use focused native fullscreen integration tests for behavior that this boundary cannot establish alone.
- A good test asserts observable contracts, not private fields, container indices, specific class arrangements, or a duplicate implementation of filtering rules. Verify hidden ordinary updates by revealing current output again, not by building tests around internal component layout.
- Test the transcript-presentation module and its interactive-mode integration at the highest practical seam. Reuse existing session and viewport seams before adding new ones. Avoid creating separate test-only seams for each predicate or lifecycle helper.
- Reuse the current faux-provider session harness for lifecycle integration. Existing session boundary, compaction, retry, queue, and bash-persistence tests provide prior art. Use no real provider APIs, keys, paid tokens, or network calls.
- Existing chat-viewport tests provide layout configuration prior art; interactive-mode command, status, diagnostics, and compaction tests identify regression scenarios. Some legacy tests reach private methods; reuse their scenarios, not that coupling.
- Cover the full filter matrix: user text; successful tool-free completion; tool-bearing `stop`; thinking and labels; streaming/partial/pending/deferred messages; unsuccessful completions; agent tool output; media; skill bodies; custom/background entries; and the explicit command/manual bash exceptions.
- Exercise command and action dispatch while idle and busy. Assert immediate view changes without model calls, message creation, prompt queuing, or execution of pending input. Check the unbound action and the regular-mode explanation.
- Toggle in both directions during real faux event sequences for assistant streaming, tools, retries, compaction, branch summarization, and manual/intercepted bash. Verify ordinary updates remain current, output is neither lost nor duplicated, and execution guards remain effective.
- Verify final answers appear exactly once at completion, after toggles around completion, and after authoritative reconciliation. Include extension-altered messages and the listener-before-persistence ordering rather than allowing a later rebuild to conceal a missed or duplicated live answer.
- Verify diagnostic scope, absence of unsolicited text, exclusion of intermediate tool failures, retention across turns, reset on view/session change, and no historical replay. Exercise footer coexistence with `Cdx`, other statuses, and narrow terminals.
- Verify session replacement, compaction, and reload against current retained history and rendering inputs. Ensure stale pending output is cleared and no pre-compaction archive content reappears. Check immutability of original messages and unchanged model context, tools, and ordinary preferences.
- Verify explicit native commands and manual `!`/`!!` output retain their native presentation while agent tool and unsolicited extension transcript content remain hidden. Confirm existing extension UI controls still work.
- Native fullscreen coverage must exercise selected-document search, visible selection-copy, unchanged `/copy`, clearing search/selection on toggle, the chosen simple scroll policy, surrounding controls, switching to regular mode, and ordinary transcript printing on exit. Exercise non-printing exit settings as well.
- Verify bottom-on-view-replacement, native follow-end during growth/resize, and native shortcut precedence. Check active-drag reset with copy-on-select both enabled and disabled in both toggle directions; releasing a stale drag must not overwrite the clipboard, and fresh selections must still copy normally.
- Use verified disposable faux-provider fixtures with benign data for native checks. Offline startup alone does not prevent real provider requests. Automated or Linux terminal checks do not establish the owner's actual host mouse/clipboard behavior; distinguish manual passes, failures, and untested variants.
- After implementation changes, run affected tests, the repository-required `npm run check`, and its interactive-testing workflow. Assess whether integration changes remain bounded and test explicit unsupported behavior where applicable. Do not run the full test suite or builds contrary to repository rules.

## Out of Scope

- Implementing focus in regular terminal mode or persisting focus across process restarts.
- Replacing `/transcript`, changing `/copy`, or creating another static/overlay transcript reader.
- Recovering pre-compaction archive history or defining a second history model.
- Focused conversation media rendering or expanded skill bodies.
- Cross-view search, hidden-match reveal logic, or custom scroll anchoring.
- Dedicated diagnostic panels/viewers, unsolicited diagnostic text, unread-message tracking, or automatic view changes for diagnostics.
- A new extension command-output API, timing heuristics, or semantic classification of messages.
- A separate transcript renderer, broad parallel rewrite of upstream behavior, or generic presentation plugin framework.
- Agent execution changes, session schema changes, model-context filtering, or changes to tool availability.
- Requiring upstream acceptance, blocking stock upgrades for focus, or silently weakening behavior for compatibility.
- Launcher installation, model aliases, fork publication, unrelated archived patches, commits, deployment, or implementation as part of publishing this specification.

## Authority and target integration

This is the single authoritative Focus specification. The readiness label describes specified requirements, not a queue to reimplement the feature or permission for side effects. The [documentation pointer](../../packages/coding-agent/docs/focus-spec.md) must not become a competing copy. Repository conventions live in [docs/agents](../../docs/agents/); native smoke procedures live in the [interactive-testing instructions](../../.pi/skills/interactive-testing.md).

Target integration remains a separately authorized task, not an outcome implied by local commit consolidation:

- Pin the source and selected target revisions. Inspect conflicts and preserve both upstream behavior and this contract, including native fullscreen animation and its explicit inline fallback, header animation, upstream removals, MCP rendering, and PNG/native TUI image behavior.
- Complete affected offline Focus and ordinary regressions, native TUI tests, runtime self-check, bounded native smoke, and required repository checks against the exact integrated target. Textual replay alone is not compatibility. Repeat actual-host clipboard checks when changed assumptions require them; do not infer new host acceptance from Linux tests.
- Record the exact tested target commit and distinguish passed, failed, and unperformed gates. An accepted check exception is not a passing full check. Any target delivery artifact must come only from authorized, verified code/tests, not local tracker or validation records.
- Integrating another worktree, creating delivery artifacts, publishing, deployment, and optional copy-extension setup require their own authority. Do not silently weaken Focus or block ordinary stock upgrades when compatibility is unavailable.

Native selection wrapping remains unchanged. The optional whole-stored-message workflow (`pi-copy-message` with `herdr-helix` / `hh`) is separate from Focus; runtime compatibility and integration require separate verification, not an assumed installation or configuration change.
