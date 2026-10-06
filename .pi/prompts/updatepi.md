---
description: Stage and validate local focus changes against the latest upstream Pi release
---
Run `bash scripts/update-pi.sh status` from the repository root and reconcile any unresolved run before preparing another. Do not cancel a run or remove its stage without owner authorization.

Run `bash scripts/update-pi.sh prepare`. It requires a clean live `focus/main`, selects the latest stable upstream `vX.Y.Z` tag, creates a backup, and rebases a separate staging worktree. It does not change the live branch. Report `already-current` and stop if no rebase is needed; that status does not claim validation.

Inspect the structured report and retained stage. Review the staged diff, dependency changes, executable code, and any conflict resolutions before running new upstream code. Conflicts remain in the stage; do not automatically resolve, abort, stash, reset, commit, or force anything. Missing prerequisites and failed checks are blockers, not permission to weaken validation.

After review, prepare dependencies in the stage with `npm ci --ignore-scripts` if needed. Do not run lifecycle scripts. Then run `bash scripts/update-pi.sh validate --reviewed` from the original repository root. It runs hydration, repository checks, coding-agent regressions, and the named TUI regression in the stage. Use the report-generated summary; missing checks are not passes. A successful result is `validated`, not activated or published. `dependencies-required` means no checks ran: review and install the stage dependencies with `npm ci --ignore-scripts`, then retry. `--reviewed` permits running reviewed stage code with the inherited environment and network; it is not sandboxing. If formatting changes tracked files, stop for review rather than accepting modified content as validated.

Integration is a separate owner-confirmed action. Explain that `bash scripts/update-pi.sh integrate` replaces the live `focus/main` tip and files with the validated rebased stage using `git reset --keep`; the backup retains the old tip. It requires matching passed validation, unchanged source HEAD, and clean source and stage. Do not execute it without explicit authorization for that action.

Report the release, backup, stage path, lifecycle status, validation results, and whether integration actually occurred. Only after integration report the versioned push command as an optional next step; do not execute it. Do not push, install Pi globally, run a build, or commit changes.

The normal workflow uses deterministic checks, not Jev. See `scripts/pi-update-validation.md` for lifecycle and recovery details.
