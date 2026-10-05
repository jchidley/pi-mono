---
description: Rebase local focus changes onto the latest upstream Pi release
---
Run `bash scripts/update-pi.sh` from the repository root. It selects the latest stable upstream `vX.Y.Z` tag, requires a clean working tree, creates a backup before rebasing `focus/main`, and stops on conflicts.

If it fails, report the error and recovery instructions; do not automatically resolve conflicts, abort, stash, reset, commit, or force anything. If it reports no rebase needed, report the selected tag and stop.

After a successful rebase, run `npm run hydrate:model-data`, then `npm run check`, then the focused regression tests:

```bash
(cd packages/coding-agent && node ../../node_modules/vitest/dist/cli.js --run test/transcript-presentation.test.ts test/interactive-mode-presentation.test.ts test/interactive-mode-focus.test.ts test/interactive-mode-focus-lifecycle.test.ts test/interactive-mode-focus-output.test.ts test/interactive-mode-focus-interactions.test.ts test/interactive-mode-focus-upgrade.test.ts test/footer-width.test.ts)
(cd packages/tui && node --test test/tui-document-interactions.test.ts)
```

Stop and report any failed validation without expanding scope. Report the selected release, backup branch, validation results, and working-tree status. Do not push, install Pi globally, run a build, or commit changes.
