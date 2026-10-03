# Prepared offline Focus validation fixture

Owner instructions: **`/tmp/focus-outstanding-checklist.md`**. It contains seven remaining checks and preserves all earlier passes.

```bash
cd ~/git/pi-mono
bash /tmp/pi-focus-owner-validation/launch.sh --native
```

For the second, non-printing exit run:

```bash
bash /tmp/pi-focus-owner-validation/launch.sh --native --exit-hint
```

## Isolation and controls

The fixture uses the repository's faux-provider suite harness, real `InteractiveMode`, native `ProcessTerminal`, and `AgentSessionRuntime`. Each launch starts ordinary with disposable persisted **FOCUS-A** and **FOCUS-B** sessions and real thinking blocks. It creates a unique `run-*` tree containing session files, agent state, harness work directories, and keybindings; cleanup removes that tree on normal exit. Shared settings are in memory, not the owner's real settings. A local symlink resolves the checkout's existing dependencies; nothing was installed.

The faux model and harmless fixture tool need no real provider credentials or API requests. `PI_OFFLINE=1` disables ordinary startup network paths; common fetch/request/connect entry points additionally throw. This is **not** a security sandbox for arbitrary commands: use the documented controls, not `/share`, authentication commands, arbitrary bash, or unrelated model selection.

- Ctrl+Alt+F / `/focus`: Focus toggle; Ctrl+F: Pi transcript search.
- `/fixture-live 1`: repeatable slow faux thinking/partial/tool/final sequence. The tool pauses four seconds; use another number for another turn. Final marker: `LIVE 1 FINAL ANSWER MARKER`. Calls remain faux.
- `/fixture-warning`, `/fixture-error`: background diagnostic details and quiet Focus counts.
- `/resume`, `/new`: native controls for run-local sessions only.
- `/fixture-resume-a`, `/fixture-resume-b`: direct conveniences using the real runtime replacement path.
- `/fixture-fork`: runtime fork at A's seeded answer; this is verified automatically, not required in the short owner checklist.
- `/settings`: real native settings UI; changes remain in memory.
- `/reload`: verified reload preserving Focus/counts/answers; fixture footer reports `FIXTURE RELOAD COMPLETE`.
- `/quit`: normal shutdown honoring in-memory exit output. Default is `transcript`; `--exit-hint` chooses `resume-hint`.

Resume hints printed on exit point at fixture sessions that are deliberately removed during cleanup. Relaunch the fixture rather than using that hint. Fixtures and owner instructions are temporary `/tmp` artifacts, not installed stock Pi functionality.

## Verified final state

Parent independently ran:

```bash
bash /tmp/pi-focus-owner-validation/launch.sh --self-check
```

**PASS on the final script.** Covers real reasoning/tool updates; hidden partial/tool/thinking and eligible final text; repeated faux turns with exact two-request deltas; diagnostic retention across a turn/reload and resets; persisted A/B replacement/fork/new; native resume-picker scoping; actual settings mode/exit-output changes; ordinary transcript printing and resume-hint non-printing. The earlier worker failures are superseded by these passing parent runs.

Parent also ran:

```bash
bash /tmp/pi-focus-owner-validation/parent-native-smoke.sh
```

**PASS.** The isolated native tmux exercise covered startup, live shortcut toggles/resize, warning reset on session switch, native new/resume picker, regular/fullscreen transitions and limitation feedback, and both normal `/quit` runs exiting 0. Evidence: `parent-native.log`; it contains the ordinary printed transcript with hidden reasoning and a separate hint-only exit. The smoke uses only its own tmux socket/server and cleans it up. It does not alter the owner's tmux configuration.

A source-isolated cross-family review found two low-severity issues: a vacuous real-session-path assertion and an overbroad network-blocking comment. Both were corrected; the final self-check passed afterward. The later reload-retention check was added and also passed. No production source or tracker files changed during fixture preparation.

The parent separately ran all four targeted Focus test files: **73/73 passed**. Details: `/tmp/focus-outstanding-automated-evidence.md`. No full suite/build or real provider call was run.

The native tmux result is not Windows Terminal/Herdr acceptance. Remaining owner observations are in the short checklist. The owner cancelled hiding native command transcript output; Focus Ticket 07 is `wontfix`, so the original visibility exception remains. All seven owner checks in the short checklist subsequently passed. The fixture does not install or load `/copy-message`.
