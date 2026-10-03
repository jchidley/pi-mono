# Focus baseline delivery bundle

[`baseline-focus.patch`](baseline-focus.patch) is the portable **Git mail patch** for clean Focus-only commit `400f5b939456f59e872b4c89cd78bce3209d19d8` on `focus/clean-v1.0.0`, based on stock `v1.0.0` (`a13d35a742c6ef8462812a28fbe1d8c8b7431c32`). It contains 32 source/test paths, upgrade fixes and the #5943 fixture binding correction; it excludes local tracker/docs/acceptance housekeeping.

SHA-256: `9a816db8d42e402e8d6b21109bf75756f645b96b22c02480b34d4dac510c61b3`. Copied unchanged from `/tmp/focus-clean-integration/baseline-focus.patch`. Baseline validation: 218/218 coding-agent tests, 64/64 native TUI tests and full `npm run check` passed. Detailed evidence: `/tmp/focus-clean-integration/HANDOFF.md` and [validation](../validation.md#current-rebased-target-gate).

## Replay the baseline into an approved clean checkout

After pinning the target and obtaining integration authority, inspect a dedicated clean checkout and use **one** delivery method: cherry-pick the baseline commit if available, or apply its mail patch:

```bash
git status --short
git rev-parse HEAD
git am /absolute/path/to/upgrade-bundle/baseline-focus.patch
```

Do not apply this over the already integrated canonical checkout or the retained in-progress target cherry-pick. On newer targets inspect conflicts, preserve both upstream and Focus behavior, and validate affected ordinary/Focus tests, native TUI tests, required code checks and offline native smoke before committing. Clean application does not prove compatibility. The [spec](../spec.md) and [current plan](../upgrade-review.md) control behavior, acceptance limits and authority. If compatibility cannot be preserved, explicitly leave Focus unavailable while retaining ordinary stock use.

## Current integration gate

Parent `focus/main` (formerly `stock/pi-1.0.0`) rebased checkpoint `1f915d4921946080e6df12d7aa4ed9a609a59cec` is the original eight-commit history above upstream ancestor `83692682f`; upgrade fixes and fixture corrections are now committed in `f843f652174ccd2fcf9b0d4acb81775872c5f291`. Local documentation commits are separate. Separate managed branch `focus/pi-1.0.1` at `a7229ddc2` retains a resolved/staged baseline cherry-pick, **not a target commit**. Native Armin animation/explicit fallback and upstream removals/APIs were reconciled on both.

Target tests/native smoke passed, but full check remains blocked by untouched upstream `packages/ai/test/stream.test.ts:705`: `claude-sonnet-4-5` is absent from the pinned catalog. Parent dependency synchronization removed the stale SDK errors without lock drift. Owner declined the unrelated AI-test fix and accepts its known gate failure for the completed local consolidation commits. The full check is not a pass; browser-smoke was not reached. This bundle remains a baseline artifact, not an export of the current rebased source or a guarantee for arbitrary updates.

## Superseded artifacts: provenance only

- [`focus.patch`](focus.patch): binary Git diff for source history `494c6c0b6` plus the earlier four-file upgrade snapshot, tree `201c589a715fab2ba2974e615ffc7109d05f59b4`, SHA-256 `c774282cdff2dc874a159fd2e8d66e348b97dda8cd1059e08268e9789bc1ed36`. Historical 159 coding-agent/64 TUI/full-check/native-smoke evidence belongs to that checkpoint. It predates the extra #5943 fixture correction and rebased target integration. It uses `git apply`, **not `git am`**, but is no longer the delivery choice.
- [Six-mail-patch export](../patches/README.md): original committed implementation through `494c6c0b6`, without the upgrade-review fixes.

Never apply multiple exports together. Do not regenerate a production binary snapshot from the dirty docs checkout. Update delivery provenance only after an authorized verified source/test commit; preserve these historical bytes until cleanup is separately authorized.
