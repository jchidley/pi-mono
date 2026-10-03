# Focus validation closure

Tickets 01–06 are implemented; original owner acceptance closed at historical HEAD `494c6c0b674535d21bc6c978e88b7bf58f231546`. Current local code anchor on `focus/main` is `f843f652174ccd2fcf9b0d4acb81775872c5f291`, following rebased HEAD `1f915d4921946080e6df12d7aa4ed9a609a59cec`. Clean baseline packaging and canonical-checkout consolidation are complete; the separate target cherry-pick is still pending. The owner accepts the known unchanged upstream full-check failure for local commits, not a full-check pass. See [current gate](#current-rebased-target-gate) before using the historical passing checks below. The final local commit run repeated the full check and four affected test files as recorded below; no configuration or unrelated AI code changed.

The [original specification](spec.md) remains controlling. Its initial source-review checkpoint is historical, not the current validation result. Ticket checkmarks record criterion completion, not a claim that every variant was manually exercised. The tracker has no completion status: `ready-for-agent` is retained as its existing readiness label, with completion recorded in ticket comments and here; it is not a new work queue.

## Implementation reconciliation

The commit IDs in this table identify the original pre-rebase implementation checkpoints, not current branch tips. The six implementation slices remain complete; current source/target validation is distinguished below.

Paths below are relative to `packages/coding-agent/` unless stated otherwise. Commit subjects and changed paths were inspected against current presentation source, native interaction integration, and relevant test assertions.

| Ticket | Implementation commit | Evidence and integration responsibilities |
|---|---|---|
| [01](issues/01-establish-presentation-boundary.md) | `ce541449a` | `src/modes/interactive/transcript-presentation.ts` owns stable ordinary/focused documents and the separate pending surface. The host mounts them and retains native live components and surrounding controls. `test/interactive-mode-presentation.test.ts` and `test/transcript-presentation.test.ts` cover ordinary ordering/updates. Execution, persistence, model context and settings remain outside presentation policy. |
| [02](issues/02-live-fullscreen-focus-toggle.md) | `cbaba6512` | `/focus` and unbound `app.transcript.toggleFinalOnly` share local dispatch. Presentation projects user text and completed tool-free `stop` answers without mutating messages; thinking/media/skill bodies and unsolicited output are excluded. `test/interactive-mode-focus.test.ts` covers local side effects, current retained history, live streaming/tools and exactly-once completion before persistence; presentation tests cover the filter matrix. Owner broad B1–B4/B7–B8 and final check 1 cover observable behavior. |
| [03](issues/03-focus-history-and-session-lifecycle.md) | `4bffee44b` | Host reconciliation uses `buildContextEntries()`; live message boundaries account for completion before persistence. Session reset clears pending output and session-local mappings/counts while retaining Focus. `test/interactive-mode-focus-lifecycle.test.ts` covers transformed completions, compaction/boundary compaction, retry, branch summary, reload/rendering, stale bash callbacks, forks/new/resume and unchanged history. Final owner checks 2–3 cover turn/reload retention and native new/resume. |
| [04](issues/04-preserve-explicit-output.md) | `5b317b6be` | Explicit native components are shared, not reconstructed; pending bash retains its native dock and execution guards. `test/interactive-mode-focus-output.test.ts` covers native commands, pending/deferred/intercepted/failed/cancelled bash, reload ordering, queues and extension UI. Owner broad C2–C6 passed; C1 contains an observation/question, not a marked pass. The subsequent Ticket 07 cancellation confirms acceptance of the original native-command exception. |
| [05](issues/05-quiet-diagnostic-awareness.md) | `48045db6f` | Presentation owns live warning/error accounting; explicit host diagnostic routes and the isolated footer integration expose counts without unsolicited details. Focus/lifecycle/presentation tests cover unsuccessful completions, exclusions, retention and resets; `test/footer-width.test.ts` covers width/status coexistence. Owner broad E4 and final check 2 establish native footer/diagnostic observations. |
| [06](issues/06-native-fullscreen-interactions-and-exit.md) | `494c6c0b6` | `packages/tui/src/tui-alt-screen.ts` provides `resetDocumentInteractions()`; mounted renderer input handles the configured action even during search. Regular-mode transition disables Focus, and existing exit rendering prints ordinary output. `test/interactive-mode-focus-interactions.test.ts` and native TUI tests cover search, selection, growth/resize, mode and both exits. Owner broad D1–D7/E1–E2 and final checks 4–7 close actual-host interaction/lifetime validation. |

The boundary still depends on upstream display-history semantics, public event ordering, native component mounting/output intent, rendering refresh hooks, and fullscreen interaction/mode/exit APIs. These are identifiable host integrations, not a compatibility guarantee for future Pi versions. No generic renderer, extension-classification framework, persisted Focus setting or schema migration was introduced.

## Owner acceptance

The owner recorded **P for all seven final checks** through Windows Terminal → WSL/Debian → Herdr → Pi:

1. Live toggles, filtering, exactly-once final answer and resize.
2. Quiet warning/error counts retained across a turn and `/reload`, then reset on reentry.
3. Native resume/new/session replacement with Focus retained and counts reset.
4. Fullscreen→regular disables Focus; regular mode explains the requirement; returning stays ordinary.
5. Copy-on-select enabled: active-drag reset in both directions does not overwrite the sentinel; fresh selections copy normally.
6. Ordinary transcript exit includes hidden reasoning and returns to a usable shell.
7. New process starts ordinary; hint-only exit prints no transcript and returns to a usable shell.

Earlier owner passes stand, including native selected-document search/reset, visible selection-copy, completed-selection reset, active-drag reset with copy-on-select disabled, `/copy` semantics, manual bash and scroll/navigation. The original checklist's B5/B6/E3 NT entries and unmarked G–J rows remain as recorded; they are **not** retroactively manual passes. Automated coverage supplies protocol/history/filter variants, not fictional owner observations. Original D8 was the outstanding enabled-copy drag case, now closed by final check 5.

## Automated and native evidence

Recorded prior-parent run from `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/interactive-mode-focus.test.ts test/interactive-mode-focus-lifecycle.test.ts test/interactive-mode-focus-output.test.ts test/interactive-mode-focus-interactions.test.ts
```

**4 files, 73 tests passed; 16.70 seconds.** The faux harness used no real provider requests. Ticket 06 separately records earlier parent gates: six coding-agent files **81/81**, two native TUI files **64/64**, and `npm run check` passed; after review cleanup, **20 affected tests** and `npm run check` passed again. These are separate historical runs, not additive totals or checks newly executed during housekeeping.

The final temporary fixture self-check passed:

```bash
bash /tmp/pi-focus-owner-validation/launch.sh --self-check
bash /tmp/pi-focus-owner-validation/parent-native-smoke.sh
```

The first covered actual reasoning/tool events, repeated faux turns with exact request deltas, turn/reload diagnostic retention, persisted A/B replacement/fork/new, scoped native resume picker, settings mode/exit changes and both exit renderings. The second passed native tmux live toggles/resize, session count reset, new/resume, mode transitions and both quits (exit 0). Saved captures include hidden reasoning in ordinary transcript exit and no transcript in hint-only exit. Earlier worker failures/startup-only limitations were superseded by final passing parent checks. Cross-family source review's two low-severity fixture assertion/comment findings were fixed before the final self-check passed.

No full suite or build was run. The fixture used real native InteractiveMode and AgentSessionRuntime with disposable persisted sessions, in-memory settings and run-local paths/keybindings; completed runs removed disposable state. It is not an arbitrary command/network sandbox. Fixture executables remain temporary and were not copied into production or permanent test infrastructure. Native tmux evidence alone did not establish Windows clipboard passthrough; the owner results do.

## Upgrade-review fixes

A subsequent full code/upgrade review identified two untested contract gaps in the committed checkpoint above. Both are now fixed in local code commit `f843f652174ccd2fcf9b0d4acb81775872c5f291`: active idle manual bash survives manual/automatic completion and boundary compaction rebuilds; newly appearing resource diagnostics during reload increment quiet typed counts without replaying unchanged loading failures. Initial/session loading seeds a baseline; resolution followed by recurrence counts as a new diagnostic. Execution, persistence and the pending dock are unchanged.

The new `packages/coding-agent/test/interactive-mode-focus-upgrade.test.ts` covers eight held-bash compaction combinations (`!`/`!!`, ordinary/focused, native manual/actual boundary compaction), real DefaultResourceLoader error/recovery/recurrence and typed warning/collision cases. The worker captured **9 failing reproductions before production fixes**; the final file has **10 passing tests**. Preserved [red evidence](validation-evidence/upgrade-fixes/red-corrected.log) and [worker handoff](validation-evidence/upgrade-fixes/worker-handoff.md) distinguish corrected fixture mistakes from actual failures.

Parent independent validation after updating two existing hand-built test fixtures:

```bash
# From packages/coding-agent:
PI_OFFLINE=1 node ../../node_modules/vitest/dist/cli.js --run \
  test/interactive-mode-focus-upgrade.test.ts test/transcript-presentation.test.ts \
  test/interactive-mode-presentation.test.ts test/interactive-mode-focus.test.ts \
  test/interactive-mode-focus-lifecycle.test.ts test/interactive-mode-focus-output.test.ts \
  test/interactive-mode-focus-interactions.test.ts test/interactive-mode-assistant-diagnostics.test.ts \
  test/interactive-mode-compaction.test.ts test/interactive-mode-status.test.ts test/footer-width.test.ts
# From packages/tui:
node --test test/tui-document-interactions.test.ts test/tui-alt-screen.test.ts
# From repo root:
npm run check
bash /tmp/focus-upgrade-native-smoke.sh
```

Results: **159/159 coding-agent tests in 11 files**, **64/64 native TUI tests**, and all code checks passed with no formatter fixes. The first parent broader run found 22 failures due to stale private-method test contexts, not failures in the new regressions; the fixtures now use the actual shared helpers and all assertions pass. Fresh standalone same-family review found no substantive defect in the production fixes/new tests; this is context-isolated review, not cross-family independent review.

Parent native smoke passed live toggle/resize, count reset, new/resume picker, mode transitions and both quits with exit 0; [new captures](validation-evidence/upgrade-fixes/parent-native.log) do not overwrite prior owner-validation logs. These native smoke observations are not a direct ProcessTerminal reproduction of the two new edge cases: those are exercised through native VirtualTerminal integration with real offline session/loader paths. No Windows/Herdr acceptance, full suite, build or paid-provider exercise was repeated.

The superseded consolidated binary snapshot included these then-uncommitted fixes. Parent temporary-index replay onto `v1.0.0` exactly reproduced that snapshot, including the new test. [Replay evidence](validation-evidence/upgrade-fixes/parent-replay.log) records the then-unresolved newer-upstream conflict; later authorized integration resolved it. The [clean baseline mail patch](upgrade-bundle/README.md) now includes these fixes and the subsequent #5943 fixture correction. Patch applicability is not behavioral compatibility.

## Current rebased target gate

Verified Git anchors: parent `focus/main` (formerly `stock/pi-1.0.0`) rebased checkpoint `1f915d4921946080e6df12d7aa4ed9a609a59cec`, exactly eight commits above upstream ancestor `83692682f095528f8b71652ddacff7075e36e893`, followed by local code commit `f843f652174ccd2fcf9b0d4acb81775872c5f291` and separate local records commits; backup `backup/focus-before-main-rebase-20261003-494c6c0b` at original `494c6c0b6`; stash `1d55952d583caf79cd8d79111db95684feacd17b` retained. Upstream README text is preserved with a local signpost section. Portable baseline code/tests and local records remain separate.

| Checkpoint | Evidence and result |
|---|---|
| Clean v1.0.0 baseline | `focus/clean-v1.0.0` commit `400f5b939456f59e872b4c89cd78bce3209d19d8`: 32 source/test paths; 218/218 coding-agent, 64/64 TUI, full `npm run check` passed. `/tmp/focus-clean-integration/HANDOFF.md` and its `baseline-*-final.log`/`baseline-tui-tests.log` own the evidence. |
| Separate pinned v1.0.1 integration | Managed worktree `/home/jack/.herdr/worktrees/pi-mono/focus-clean-v1-0-0`, branch `focus/pi-1.0.1`, HEAD `a7229ddc21810d6245105978033b7df645ecc2f7`: resolved/staged cherry-pick of baseline, **no target commit**. 261/261 coding-agent and 65/65 TUI tests, runtime self-check and native smoke passed, including two added animation tests. Full check blocked by untouched AI test. Same handoff and `target-*.log` own this separate evidence. |
| Parent rebase/restored fixes | `/tmp/focus-main-rebase/HANDOFF.md`: 259/259 coding-agent tests in 26 files, 65/65 TUI, offline runtime self-check and ProcessTerminal smoke passed. Preserved animation/MCP/image behavior established by source comparison and regression checks; separate target animation tests were not imported. Restored upgrade fixes, three modified fixtures and new upgrade test are now committed in `f843f6521`. |
| Parent after dependency synchronization | Parent reports `npm install --ignore-scripts` synchronized target dependencies with no lock drift, and independently passed 23 upgrade/interactions/#5943 tests. Full `npm run check` now fails **only** `packages/ai/test/stream.test.ts:705`; earlier stale Anthropic SDK errors in the rebase handoff are resolved. |

The remaining error is TS2345 for Cloudflare AI Gateway `claude-sonnet-4-5`, absent from the hash-verified pinned catalog `d28b6de6985826060b6e2ccf589d16800d9fdbc40681ae4c698421c92d2ff86f`. The untouched test is upstream blob `44a2c0d19c847ee68fc76a7bb6e489602e9e104e`. Browser-smoke was not reached by the blocked full check. Owner declined the unrelated test fix and accepts this known gate exception for the three local consolidation commits. No hook/configuration changes or bypass occurred. The separate `focus/pi-1.0.1` staged cherry-pick remains untouched and uncommitted.

Final local verification before code commit `f843f6521`: **58/58 tests in four files passed** (`interactive-mode-focus-upgrade`, `interactive-mode-compaction`, `interactive-mode-status`, `suite/regressions/5943-session-start-notify`; offline, two workers). Full `npm run check` passed Biome without fixes and pinned/runtime dependency, TS import, entry-graph and install-lock gates, then failed only at the unchanged upstream line above. Durable [test output](validation-evidence/local-consolidation/tests.log) and [full check output](validation-evidence/local-consolidation/check.log) preserve this run; `/tmp/focus-final-commits/HANDOFF.md` records exact local commit IDs and final Git verification. Local code and records commits are complete; full target check and separate target integration commit are not.

These target runs do not replace the recorded Windows Terminal/Herdr clipboard acceptance with fictional new passes. Original NT/unmarked rows and all cancellation/scroll/shortcut limitations below remain. No full suite, build, paid-provider check, publication or deployment was performed. Later targets still require pinned integration and contract validation; no arbitrary-update guarantee.

## Scope decisions and limitations

- [Focus Ticket 07 Comments](issues/07-hide-native-command-output.md#comments) withdraw hiding native command output. Native `/hotkeys`, `/session`, `/name` and `/changelog` output remains visible and is transient display content, not saved conversation messages; a changed session name itself is persisted.
- Manual `!` and `!!` output remains visible and saved. `!!` excludes output from model context, not session history.
- [Selection-copy ticket Comments](../fullscreen-selection-copy/issues/01-preserve-logical-line-breaks.md#comments) cancel wrapping changes in favor of the whole-underlying-message workflow using the chosen `pi-copy-message` extension and existing `herdr-helix` / `hh` workflow. Both cancelled tickets remain `wontfix`; their unchecked criteria are historical, not pending work.
- Extension source inspection was recorded for raw stored user/assistant/tool/bash/visible custom messages and summaries; tool/bash are hidden by default in its picker. Transient native output cannot be recovered from saved history. No extension installation, runtime compatibility test or `hh` integration was performed or established here. Setup is a separate task requiring owner authorization.
- Approved scroll policy is bottom-on-view-replacement with native follow-end/relayout, not per-view offset restoration. Existing viewport shortcuts retain precedence; use a non-conflicting configurable Focus binding (owner used Ctrl+Alt+F).

## Preserved provenance

These files are byte-for-byte archives of the named temporary inputs, not competing acceptance guides. Their `/tmp` links and launch instructions are historical; use this record for current closure. No secrets or sensitive conversation content were included in the fixture captures. Staged whitespace checking flags historical patch context prefixes and two original owner-record whitespace lines; these archival bytes are intentionally preserved. Maintained records and code pass their scoped whitespace checks.

| Durable artifact | Original source |
|---|---|
| [Original owner recording](validation-evidence/focus-owner-manual-test-checklist.md) | `/tmp/focus-owner-manual-test-checklist.md` |
| [Seven final owner passes](validation-evidence/focus-outstanding-checklist.md) | `/tmp/focus-outstanding-checklist.md` |
| [Final automated evidence](validation-evidence/focus-outstanding-automated-evidence.md) | `/tmp/focus-outstanding-automated-evidence.md` |
| [Fixture isolation/verification record](validation-evidence/fixture-readme.md) | `/tmp/pi-focus-owner-validation/README.md` |
| [Parent native captures](validation-evidence/parent-native.log) | `/tmp/pi-focus-owner-validation/parent-native.log` |

Reconciliation authority: `/tmp/focus-validation-housekeeping-handoff.md`. Earlier gate counts are also recorded durably in Ticket 06; no further manual acceptance exercise is required by this closure.
