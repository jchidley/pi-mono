# Focus upgrade fix handoff

## Changes

Only production file changed: `packages/coding-agent/src/modes/interactive/interactive-mode.ts` (+108/-90, including callback indentation and replacing duplicated diagnostic gathering).

- Manual/automatic compaction completion and boundary compaction now use the existing same-session chat-rebuild helper. That helper delegates live explicit component preservation to TranscriptPresentation, preserving the mounted manual bash component and its original position relative to retained conversation messages. The pending-output dock is untouched by preservation.
- Resource diagnostics are gathered once through a typed shared grouping used for ordinary rendering and loading-boundary accounting. Initial/session binding seeds a baseline; completed reload reports newly appearing diagnostics. Identity includes resource scope, type, path, message and collision identity. Unchanged reloads and rendering refresh do not replay counts; a resolved diagnostic recurring after a successful clean reload is new. Collisions count as warnings; errors retain their typed severity. Counts still belong to TranscriptPresentation and follow its existing focus/session resets.
- No execution, persistence, session-core, native-command visibility, selection-wrap, ambient async output scope, or extension API changes.

New test: `packages/coding-agent/test/interactive-mode-focus-upgrade.test.ts` (343 lines; 10 native VirtualTerminal/offline faux session integration cases).

Coverage: both !/!!, initially ordinary/focused, manual native /compact and actual turn_end boundary compaction, retained-history order, active execution with no persisted bash record, follow-on chunks and exactly-once completion across toggles; real DefaultResourceLoader factory failure first introduced during /reload, historic failure exclusion, hidden focused detail/ordinary detail, unchanged reload/theme/resize exclusion, recurrence after recovery, focus and session reset; actual skill warning, prompt collision and invalid-theme warning loading.

## Red evidence

From `/home/jack/git/pi-mono/packages/coding-agent`:

```bash
PI_OFFLINE=1 node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run test/interactive-mode-focus-upgrade.test.ts
```

Before production edits, corrected fixture: **9 failed / 9**. Eight compaction cases fail because visible chunk count becomes zero while execution remains active and no bash result has been persisted; one reload case fails because typed new loader error is present but focused footer remains `E:0` instead of `E:1`.

Full log: `/tmp/pi-focus-upgrade-fixes/red-corrected.log`.

Earlier `/tmp/pi-focus-upgrade-fixes/red.log` includes a fixture defect: prompt user content is structured, so string equality failed to find its entry. Fixture was corrected to use the latest typed user entry, then all manual and boundary cases reproduced the requested symptom before any fix.

## Green evidence

The same single-file command: **10/10 passed**, full log `/tmp/pi-focus-upgrade-fixes/green-upgrade.log` (24.49 s).

Final targeted regression command, from package root:

```bash
PI_OFFLINE=1 node "$(git rev-parse --show-toplevel)/node_modules/vitest/dist/cli.js" --run \
  test/interactive-mode-focus-upgrade.test.ts \
  test/interactive-mode-focus-output.test.ts \
  test/interactive-mode-focus-lifecycle.test.ts \
  test/interactive-mode-focus.test.ts \
  test/interactive-mode-focus-interactions.test.ts \
  test/interactive-mode-assistant-diagnostics.test.ts \
  test/transcript-presentation.test.ts
```

**7 files / 94 tests passed**, 18.46 s. Full log: `/tmp/pi-focus-upgrade-fixes/green-final.log`.

From repository root:

```bash
npm run check
```

**Passed**: Biome, pinned/runtime dependencies, TS imports, entry graphs, shrinkwrap/install lock, TypeScript, browser smoke. Full log: `/tmp/pi-focus-upgrade-fixes/check-final.log`.

```bash
git diff --check
```

Passed, no output.

## Native offline smoke

Read `.pi/skills/interactive-testing.md` and tmux skill. Inspected the existing `/tmp/pi-focus-owner-validation/fixture.ts`, launcher and README; suitable for bounded native integration smoke because it uses the same checkout's real InteractiveMode/ProcessTerminal, isolated disposable sessions, offline faux model, and blocked network entry points. Did not run its broad owner self-check or existing broad smoke.

```bash
bash /tmp/pi-focus-upgrade-fixes/native-smoke.sh
```

**Passed**: native fullscreen startup, /focus, deliberate !!printf output, ordinary reveal, /reload with retained manual output, focused/ordinary document transitions, /quit with actual fixture exit code 0. Full terminal captures: `/tmp/pi-focus-upgrade-fixes/native-smoke.log`.

The native fixture can emit a delayed stock warning because the isolated tmux server has extended-keys off. Ordinary capture identifies it explicitly; no user tmux configuration changed. The first smoke incorrectly expected zero warnings; subsequent smoke correctly checks focus activation rather than zero startup diagnostics. Another smoke initially confused the helper's retained shell with a running fixture; the final script observes an explicit exit-code sentinel.

Limitations: the native ProcessTerminal smoke does not directly reproduce held compaction or a newly broken extension. Those exact scenarios are covered through native VirtualTerminal fullscreen integration plus real offline faux session/DefaultResourceLoader. No Windows Terminal/Herdr or broad manual acceptance rerun. This is bounded regression evidence, not proof of the full Focus acceptance specification.

## Validation corrections

- Added severity test initially guessed missing skill path was an error. Real loader returned warning; expectation corrected to its typed API result. Production already mapped severity correctly. Final scope test expects W:3 E:0.
- One concurrent suite/check attempt timed out under load. Sequential reruns passed. First complete check found callback narrowing and a required test-factory extensionsResult field; captured narrowed values and completed the fixture result, then final check and all tests passed.
- Full intermediate logs retained in this directory, alongside authoritative final logs.

## Checkout/history

No commits, pushes, merges, deployment, branch/worktree changes, or additional agents. Own changes remain uncommitted as requested:

- Modified `packages/coding-agent/src/modes/interactive/interactive-mode.ts`.
- Untracked `packages/coding-agent/test/interactive-mode-focus-upgrade.test.ts`.

Parent-owned dirty/untracked paths remain untouched:

- Modified `.scratch/focus/issues/01-establish-presentation-boundary.md` through `06-native-fullscreen-interactions-and-exit.md`.
- Untracked `.scratch/focus/issues/07-hide-native-command-output.md`, `.scratch/focus/patches/`, `.scratch/focus/upgrade-review.md`, `.scratch/focus/validation-evidence/`, `.scratch/focus/validation.md`, `.scratch/fullscreen-selection-copy/`.

No conflicted files. No residual test or fixture processes found in final process check. Temporary evidence/scripts are under `/tmp/pi-focus-upgrade-fixes/` only.
