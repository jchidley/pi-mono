# Focus current state and next gate

## Position

Canonical checkout: `~/git/pi-mono`, branch `focus/main` (renamed from `stock/pi-1.0.0` after consolidation). Eight original commits were rebased onto upstream ancestor `83692682f095528f8b71652ddacff7075e36e893`, reaching `1f915d4921946080e6df12d7aa4ed9a609a59cec`; the subsequent local code commit is `f843f652174ccd2fcf9b0d4acb81775872c5f291`. Local consolidation records are committed separately on this branch. No publication or arbitrary-release compatibility is claimed.

The clean Focus-only baseline is complete: `focus/clean-v1.0.0` at `400f5b939456f59e872b4c89cd78bce3209d19d8`, based on approved stock `v1.0.0` (`a13d35a74`). It contains 32 source/test paths, including the upgrade fixes and #5943 fixture correction, without local tracker/acceptance docs. Its [mail patch](upgrade-bundle/README.md) is the baseline delivery artifact.

Current rebased source retains upstream integration and the restored upgrade fixes/test fixtures, now committed in `f843f6521`. The separate managed worktree `/home/jack/.herdr/worktrees/pi-mono/focus-clean-v1-0-0` retains branch `focus/pi-1.0.1` at pinned target `a7229ddc21810d6245105978033b7df645ecc2f7`, with a resolved/staged cherry-pick of the baseline commit. **No target integration commit exists.**

## Accepted local check exception; target integration pending

The owner authorized all pending canonical-checkout work as three local consolidation commits: code/tests, Focus records, and the cancelled selection-copy record. The owner declined the unrelated AI-test fix and explicitly accepts its known full-check failure for these local commits. This does not authorize target-worktree operations, publication, deployment or cleanup.

After `npm install --ignore-scripts` synchronized target dependencies without lockfile drift, parent `npm run check` fails only at untouched `packages/ai/test/stream.test.ts:705`: Cloudflare AI Gateway `claude-sonnet-4-5` is absent from the hash-verified pinned catalog `d28b6de6985826060b6e2ccf589d16800d9fdbc40681ae4c698421c92d2ff86f`. The file remains upstream blob `44a2c0d19c847ee68fc76a7bb6e489602e9e104e`. Stale Anthropic SDK errors are resolved. Do not weaken catalog types or report a passing full check. The final pre-commit `npm run check` reproduced only this unchanged upstream error; browser-smoke was not reached. The full check is not a pass, and no hook was bypassed.

[Task 08](issues/08-clean-replayable-focus-commit-set.md) separates completed baseline and canonical-checkout commits from the still-pending target cherry-pick. The final local run passed 58 tests across the upgrade, compaction, status and #5943 files; [validation](validation.md#current-rebased-target-gate) preserves the known gate exception. Portable code/tests remain separate from local records and the cancelled selection-copy record.

## Contract and acceptance boundaries

The [spec](spec.md) remains the complete contract. Tickets 01–06 are implemented, not a new implementation queue. Updated-target checks must preserve:

- Current retained/compaction-aware history, transformed messages, completion-before-persistence ordering and exactly-once final answers.
- Live ordinary updates while hidden, explicit native-command/manual-bash origin, active/deferred/pending output, guards, persistence and model context.
- Theme/padding/Markdown refresh, extension reload, newly appearing typed diagnostics, retention/reset and narrow-width footer coexistence.
- Configurable local dispatch without requests/queue submission, selected-document search and selection reset, surrounding controls, fullscreen-only lifetime, ordinary transcript and non-printing exits.

Both target integrations retain upstream fullscreen Armin animation and Focus's explicit inline fallback, upstream Daxnuts removal, header-logo animation, MCP renderer resolution and PNG/native TUI image behavior. The parent rebase did not import the separate target's two animation tests; its preservation evidence is source comparison plus existing integration coverage. Textual replay alone is not behavioral compatibility. If a later release cannot safely meet the contract, explicitly leave Focus unavailable and retain ordinary stock use; do not silently weaken filtering or add speculative compatibility machinery.

The accepted scroll policy remains bottom-on-switch/native follow-end, not exact-offset restoration. Native viewport shortcut precedence remains; the Focus action is unbound by default. Owner seven final Windows Terminal → WSL/Debian → Herdr → Pi passes remain valid for their tested checkpoint. NT/unmarked earlier rows are not manual passes. Linux tmux/VirtualTerminal target checks do not newly establish that host's clipboard behavior; repeat host checks only when changed assumptions require it.

[Focus 07](issues/07-hide-native-command-output.md#comments) and [selection-copy](../fullscreen-selection-copy/issues/01-preserve-logical-line-breaks.md#comments) remain cancelled (`wontfix`). Native command output stays visible and transient; `!`/`!!` output stays visible and saved (`!!` excludes model context, not history). Preserve native selection wrapping. The chosen optional whole-stored-message workflow is `pi-copy-message` with existing `herdr-helix` / `hh`; global registration/npm metadata were observed, but runtime compatibility and `hh` integration remain unverified. Setup/verification needs separate owner scope; do not reinstall or change configuration here.

## Evidence and retained artifacts

- [Validation](validation.md#current-rebased-target-gate) records historical owner acceptance, baseline checks, target checks and the current blocker separately. Parent rebase: 259/259 coding-agent and 65/65 TUI tests, offline runtime self-check and native smoke passed. Parent independently passed 23 upgrade/interactions/#5943 tests after dependency synchronization. No full suite, build or paid-provider validation was performed.
- `/tmp/focus-clean-integration/HANDOFF.md` owns clean-baseline and separate v1.0.1 evidence; `/tmp/focus-main-rebase/HANDOFF.md` owns rebase/restoration evidence. Its stale-SDK failure and initial README restoration describe that earlier run, not the corrected parent state above.
- [Bundle](upgrade-bundle/README.md) distinguishes the clean baseline mail patch from superseded binary/six-mail-patch snapshots. Do not regenerate a production snapshot from this dirty docs checkout or apply multiple exports together.
- Backup `backup/focus-before-main-rebase-20261003-494c6c0b` retains `494c6c0b674535d21bc6c978e88b7bf58f231546`; stash `1d55952d583caf79cd8d79111db95684feacd17b` is retained, not popped/dropped. Comparison worktrees at `~/git/pi-focus-comparison.bNwr3t/{baseline,current}` and temporary validation fixtures remain; no cleanup is authorized.
- Completed local code commit `f843f6521`: InteractiveMode, compaction/status fixtures, #5943 fixture and new `interactive-mode-focus-upgrade.test.ts` (five files). Root local README section and all Focus records/evidence/patches form the separate documentation commit; the cancelled selection-copy record forms a third commit. These local commits do not complete the separate target cherry-pick. Final command logs and exact commit IDs: `/tmp/focus-final-commits/HANDOFF.md`; durable check/test evidence is linked from validation.
