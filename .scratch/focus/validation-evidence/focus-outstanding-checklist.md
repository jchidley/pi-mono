# Focus: remaining owner checks

**Seven checks only. Your earlier passes stand.** Mark each `P`, `F`, or `NT`; notes are needed only for failures or unclear results. No screenshots or per-pass evidence required.

## Launch the prepared offline fixture

From your usual Windows Terminal → WSL → Herdr terminal:

```bash
cd ~/git/pi-mono
bash /tmp/pi-focus-owner-validation/launch.sh --native
```

You should see **FOCUS-A**, its answer, and a **faux** model in the footer. Each launch starts ordinary and creates disposable A/B sessions. Settings and sessions are isolated and removed on exit; your real configuration is untouched. Use only the commands below. This fixture uses a faux provider, not merely `PI_OFFLINE=1`; no live model requests are needed.

**Ctrl+Alt+F** or `/focus` toggles Focus. Ctrl+F is Pi search, though search does not need retesting.

| # | What to do | Expected | Result / notes |
|---|---|---|---|
| 1 | Enable Focus. Run `/fixture-live 1`. While it works, toggle off/on and resize the terminal once. If you miss the active period, repeat with another number. | User text appears immediately. Focus hides partial text, thinking, and tools. Ordinary view shows current activity. Work continues; the final answer appears once in Focus. Layout remains usable after resize. | P |
| 2 | Once idle, toggle off/on to start fresh counts. Run `/fixture-warning`, then `/fixture-error`. Run `/fixture-live 2` and wait **without toggling**; then `/reload`. Finally toggle off, inspect details, and back on. | W:1 E:1 with no diagnostic detail text in Focus. Counts survive the turn/reload. Ordinary view shows warning/error details. Reentering Focus resets W/E to zero. | P |
| 3 | With Focus on, run `/resume` and select **FOCUS-B**. Then `/new`; then `/resume` and select **FOCUS-A**. | Focus stays on. B shows only B's conversation; new session is empty; A restores A. Counts reset at each session change. Only fixture sessions appear in the picker. | P |
| 4 | Focus on → `/settings` → search **TUI mode** → change to **regular**, then Esc. Run `/focus`. Return through `/settings` to **fullscreen**, then Esc. | Leaving fullscreen disables Focus. Regular mode explains that fullscreen is required. Returning fullscreen stays ordinary. Wait for each mode change before pressing Esc. | P | 
| 5 | `/settings`: **Fullscreen copy on select = true**. In a Windows scratch editor, copy `SENTINEL`. Back in Pi, drag-select text **without releasing the mouse button**, press Ctrl+Alt+F, then release. Paste into the scratch editor. Make a fresh Pi selection and paste again. Repeat in the opposite toggle direction. | Release after the toggle does **not** overwrite SENTINEL with a stale selection. A fresh completed selection copies normally. This is the single unfinished active-drag edge case—not a repeat of your passed copy tests. Use a drag without Shift. | P |
| 6 | Ensure fullscreen. Enable Focus and `/quit`. Inspect terminal scrollback. | Ordinary transcript prints, including `PRIVATE FOCUS-A REASONING MARKER` that Focus hid. You return to a usable shell. Default fixture exit output is `transcript`. | P |
| 7 | Relaunch with the command below. Confirm it starts ordinary, enable Focus, then `/quit`. | No transcript is printed on exit; the normal resume hint is allowed. You return to a usable shell. | P |

For check 7:

```bash
bash /tmp/pi-focus-owner-validation/launch.sh --native --exit-hint
```

The resume hint refers to disposable fixture data removed at exit; do not use it to reopen your real conversation. Relaunching the fixture creates fresh sessions. No settings restoration is needed outside the fixture.

## Already handled by the agent

- **73/73** targeted offline Focus tests passed: filter matrix, retries, compaction, branches, transforms/reload, diagnostics, pending/intercepted bash, native interactions and exits.
- Fixture self-check passed on the final script: actual thinking/tool events and repeated faux turns; diagnostic counts; persisted A/B replacement/fork/new; native mode and exit-output settings; both exit renderings.
- Parent native tmux smoke passed: live toggles/resize, diagnostic reset, new/resume picker, regular/fullscreen transitions, and both successful quits. Those checks do not substitute for the real Windows Terminal/Herdr observations above.

Detailed preparation evidence: `/tmp/focus-outstanding-automated-evidence.md` and `/tmp/pi-focus-owner-validation/README.md`. Original results remain in `/tmp/focus-owner-manual-test-checklist.md`.

**Scope decisions:** Focus Ticket 07 is closed as `wontfix`; native command output remains visible in Focus under the original specification. Selection-copy wrapping work was also cancelled; `/copy-message` remains the chosen whole-source-message workflow, and is not installed or loaded by this fixture. All seven owner checks above passed.
