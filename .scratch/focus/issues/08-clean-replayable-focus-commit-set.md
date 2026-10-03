# 08: Prepare a clean replayable Focus commit set

**What to deliver:** One owner-approved Focus-only commit set, with implementation and regression tests together, independent of local tracker conventions and acceptance housekeeping. Replaying it onto an updated Pi requires a pinned target and verified compatibility, not a promise of arbitrary future applicability.

**Status:** ready-for-agent

**Current state and plan:** [Focus current state](../upgrade-review.md). Clean baseline `400f5b939456f59e872b4c89cd78bce3209d19d8` on `focus/clean-v1.0.0` is complete; [baseline mail patch](../upgrade-bundle/README.md) is retained. Parent checkpoint `1f915d4921946080e6df12d7aa4ed9a609a59cec` rebases the original eight commits onto upstream ancestor `83692682f`; restored fixes are committed in `f843f652174ccd2fcf9b0d4acb81775872c5f291` on `focus/main` (renamed from `stock/pi-1.0.0`). Local consolidation commits are complete, with Focus records and cancelled selection-copy records committed separately from code. Separate `focus/pi-1.0.1` retains a resolved/staged cherry-pick, not a target commit. Owner declined the unrelated AI-test fix and accepts its known check failure for local commits; no approval question remains for canonical-checkout consolidation.

## Criteria

- [x] Obtain explicit owner authorization for clean baseline commit creation and selected integration/history work. Owner also authorized and accepted the known upstream check exception for all pending parent changes as three local consolidation commits.
- [x] Keep the portable baseline scope to 32 Focus source/test paths in `packages/coding-agent` and `packages/tui`, including upgrade regressions and modified fixtures. Exclude local tracker/docs/acceptance changes. Local records are committed separately from code; the cancelled selection-copy record is a third scope.
- [x] Produce the approved clean baseline commit from the verified source/test snapshot, with the #5943 fixture binding correction. Preserve dirty parent changes, staging boundaries and artifacts; no push/automatic cleanup.
- [x] Pin updated targets separately from source baseline `v1.0.0` (`a13d35a74`): separate integration `a7229ddc2` (v1.0.1), parent rebase `83692682f`. These anchors are not a claim of latest-remote freshness.
- [x] Resolve target conflicts preserving upstream fullscreen Armin animation and Focus explicit fallback, upstream Daxnuts removal and Focus bash guards. Do not choose one entire side.
- [x] Complete canonical-checkout consolidation with code/tests, Focus records and cancelled selection-copy records in separate local commits. Code anchor: `f843f6521`; exact commit list is in `/tmp/focus-final-commits/HANDOFF.md`. Final affected run passed 58/58 tests; full `npm run check` failed only at untouched `packages/ai/test/stream.test.ts:705`, accepted by the owner. This is not a full-check pass.
- [ ] Complete the separate selected-target integration and any remaining gates against every [spec](../spec.md) requirement under separate authority. Its resolved/staged cherry-pick remains pending and untouched here. Affected offline tests, native TUI tests, runtime self-check and bounded smoke passed; full check has the same known upstream failure. Actual-host clipboard acceptance is not newly established by target Linux runs. See [current validation](../validation.md#current-rebased-target-gate).
- [x] Preserve the compatibility policy: if a target cannot meet the contract, report Focus unavailable and retain ordinary stock use rather than block stock upgrades or silently weaken behavior. Preserve architecture, owner cancellations, scroll and shortcut limits; no new compatibility framework.
- [x] Export the clean baseline mail patch with provenance. Retain superseded binary/six-mail-patch exports as historical artifacts, never apply them together.
- [x] Update canonical-checkout records with local code anchor `f843f6521`, accepted check exception and separate documentation scopes. Retain baseline delivery commit `400f5b939` and patch bytes unchanged; do not export local docs as a production snapshot.
- [ ] After a separately authorized target commit, update its exact anchor and any target delivery artifact from verified code/tests only.

## Separate owner choice, not a blocker or substitute objective

`pi-copy-message` is the chosen optional whole-stored-message workflow. Global package registration/npm metadata are present, but runtime compatibility and `herdr-helix` / `hh` integration are unverified. Ask whether the owner wants that separate verification before doing setup; do not assume absence, reinstall, or change configuration. The cancellation records remain authoritative.

## Authority

Owner authorized the three canonical-checkout commits and declined unrelated AI-test changes. Ordinary Git commits were made without hook bypass, hook/config changes, dependency changes, branch changes, target-worktree operations, publication, deployment or cleanup. The accepted known exception does not mean the full check passed. Readiness for remaining target work is not authorization to operate that worktree.

## Comments

Baseline packaging, target conflict resolution and canonical-checkout consolidation are done. The owner decision is settled: leave the upstream AI test unchanged and accept the known check failure for local commits. `ready-for-agent` replaces the resolved `needs-info` decision state; it denotes specified remaining target work, not authorization or an invented completion label. Tickets 01–06 remain implemented; neither the gate exception nor packaging reopens their earlier owner acceptance. The separate target integration commit and passing full target check are not complete.
