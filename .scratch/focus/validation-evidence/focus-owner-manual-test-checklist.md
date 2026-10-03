# Focus owner acceptance checklist

Test the checkout's complete Focus feature through **Windows Terminal → WSL/Debian → Herdr → Pi**, using the Surface keyboard. This is not a checklist for installed stock Pi or just Ticket 06.

## Run and record

1. Complete sections A–F with an existing, nonsensitive conversation. These checks need no new model response. Manual bash runs local shell commands, not a provider.
2. Complete G–I in a disposable offline/faux session prepared by an agent. The fixture prerequisites below are not currently runnable assets. Until supplied, record these cases **NT**, not pass. Do not submit ordinary prompts, `/compact`, or summarizing branch operations to a real provider for this checklist without explicit approval of provider use/cost.
3. Run J's exit checks last. Restore changed settings and record outstanding failures/NT cases in K.

For **every row**, replace `—` with **P** (pass), **F** (fail), or **NT** (not tested). In Actual/evidence, record what happened; for NT, give the missing prerequisite. Never infer a pass from automated tests or a broad statement that shortcuts work. Repeat rows with multiple variants separately, recording each result in that row.

Date: ______  Tester: ______  Checkout commit: ______
Terminal/Herdr versions: ______  Terminal size: ______
Original settings: TUI mode ______; Fullscreen copy on select ______; Fullscreen exit output ______; theme ______; padding ______
Ordinary thinking/tool expansion state: ______
Session used (nonsensitive identifier): ______

## A. Correct checkout and controls

Run from the canonical project root:

```bash
cd ~/git/pi-mono
git branch --show-current
git log -1 --oneline
PI_OFFLINE=1 bash ./pi-test.sh --tui-mode fullscreen --continue
```

Prepared against branch `stock/pi-1.0.0`, commit `494c6c0b6`. If the checkout differs, record it and have the checklist's assumptions reassessed. `PI_OFFLINE=1` is **not** a fake provider and does not make submitted prompts free. If no existing conversation is available, stop and request a disposable fixture.

The confirmed owner binding is `"app.transcript.toggleFinalOnly": ["ctrl+alt+f"]` in `~/.pi/agent/keybindings.json`. Preserve all other bindings; do not replace that file to perform these checks. The action is unbound by default in stock checkout configuration. No F6/F8 setup is needed.

I am not recording evidence of pass

| ID | Preconditions and steps | Expected result | Result | Actual/evidence |
|---|---|---|---|---|
| A1 | Launch as above; inspect existing assistant/tool content. | Starts in ordinary fullscreen view; no `Focus W:… E:…` indicator. This is the checkout, not installed `pi`. | P | |
| A2 | Invoke `/hotkeys`; locate focus and search actions. Close any command viewer before continuing. | Focus uses Ctrl+Alt+F; Pi search uses Ctrl+F in this WSL stack. Other configured shortcuts are unchanged. | P | |
| A3 | Press Ctrl+F on the existing transcript; close Pi search. | Search belongs to Pi's fullscreen transcript, not Windows Terminal's Find UI. Ctrl+Shift+F opens the outer terminal Find in this owner's stack and is not the key for these tests. | P | |
| A4 | Use an ordinary mouse drag **without Shift** inside Pi's transcript. | Pi owns the selection. If only Herdr/Windows Terminal selects, record a host-input failure or NT for dependent Pi-selection checks; Shift-drag is not evidence of Pi selection. | P |  |

## B. Toggle and filter existing history

Precondition: ordinary view contains user text, final answers, and at least one item normally hidden by Focus. For missing content types, use G's prepared fixture and mark the corresponding row NT here.

| ID | Preconditions and steps | Expected result | Result | Actual/evidence |
|---|---|---|---|---|
| B1 | Enter `/focus`; toggle off with Ctrl+Alt+F; toggle on with the shortcut; toggle off with `/focus`. | Both routes immediately switch the same native transcript. Focus shows `Focus W:0 E:0` on the right of the extension-status row. No separate reader or overlay opens. | p | |
| B2 | While idle, type `DO NOT SUBMIT — focus draft` without Enter. Toggle twice using Ctrl+Alt+F; then clear the draft. | Draft stays editable and unsubmitted. No working/request activity, new conversation turn, or queued prompt appears from the toggle. | P | |
| B3 | In Focus, inspect user messages and successful final assistant answers; repeat toggles several times. | User text and completed tool-free answers remain readable, ordered, and appear once each. | P | |
| B4 | Compare ordinary and Focus views of thinking and agent tool calls/results/summaries. | Focus has no thinking text or expandable thinking labels and no agent tool content; ordinary view still has it. | P | |
| B5 | Compare a user message with image, attachment, and expanded skill content, if available. | Focus retains the user's own text, not images, attachment bodies, or expanded skill bodies. Ordinary view remains intact. | NT | |
| B6 | Compare loaded-resource listings, unsolicited extension transcript entries, background notices, summaries, and usage entries. | Hidden in Focus; available again in ordinary view. Explicit commands are exceptions tested in C. | NT | |
| B7 | Note ordinary thinking/tool expansion state; toggle repeatedly without changing those controls. | Ordinary preferences are unchanged on return. Focus does not achieve filtering merely by collapsing thinking. | P | |
| B8 | Scroll and inspect a Markdown-rich final answer in both views. | Native Markdown/theme/padding behavior is retained; no second custom renderer or broken wrapping is apparent. | P | I notice that when I copy something and paste it, from pi's output, it adds linebreaks a line end when word wrapping, I assume that this is a pi thing. can I turn that off? |

## C. Deliberately requested output remains visible

Use a disposable session for any state-changing command. `/name` **without an argument** queries the name or gives usage guidance; it need not rename a session.

| ID | Preconditions and steps | Expected result | Result | Actual/evidence |
|---|---|---|---|---|
| C1 | With Focus on, invoke `/session`, `/hotkeys`, `/name`, and `/changelog` one at a time. Dismiss native viewers as needed. | Each gives its normal output/UI; Focus stays enabled after dismissal. Inline explicit output is also present when toggled to ordinary view, rather than replacing earlier output in a separate feedback area. | — | /hotkeys for example displays the output in the normal output - not soemthing that I can dismiss. did we decide we wanted to keep this in the focus output too? because it is kept. I think I want to change my mind about keeping it. |
| C2 | Run `!printf 'FOCUS-MANUAL-A\n'; sleep 3; printf 'FOCUS-MANUAL-B\n'` while focused. Toggle twice during the pause. Repeat using `!!` instead of `!`. | Manual output appears live in its normal transcript/dock presentation; both markers are retained in order in both views. No cancellation or duplicate execution from toggling. | P | |
| C3 | In a disposable session, run `!printf 'FOCUS-MANUAL-FAIL\n'; exit 1`; inspect and toggle. | Deliberately requested failed bash output remains visible in Focus and ordinary view; failure does not force a view switch. | P | |
| C4 | Run `!printf 'FOCUS-CANCEL-START\n'; sleep 10; printf 'FOCUS-CANCEL-END\n'`; cancel with the active interrupt binding shown in `/hotkeys`, then toggle. | Normal native cancellation behavior and already produced output remain visible. Toggle alone does not cancel; the deliberate interrupt does. | P | |
| C5 | Open `/settings` and an already available extension dialog/editor/widget while focused. Exercise harmless controls and dismiss. | Surrounding editor, header, footer, widgets, and extension controls remain usable. No extension installation is required for this check; absent extension UI means NT for that variant. | P | |
| C6 | If this runtime already provides `/transcript`, exercise its normal workflow in both views. | Existing workflow is unchanged. `/transcript` is not in the checked native built-in command list; absence is a recorded unavailable/NT extension case, not a Focus defect. | P | Transcript is visible only in the normal not focus view, which is correct |

## D. Search, Pi selection, and clipboard — required real-host checks

Precondition: identify a unique phrase in a visible final answer and a different phrase present **only** in hidden agent/thinking/background output. Do not use manual bash output as the hidden phrase: manual output is an intentional visible exception.

| ID | Preconditions and steps | Expected result | Result | Actual/evidence |
|---|---|---|---|---|
| D1 | Focus on: Ctrl+F; search the visible phrase; then search the hidden-only phrase. | Visible matches can be navigated within Pi; hidden-only phrase has no matches. | P | |
| D2 | Leave search open with a query; Ctrl+Alt+F to ordinary view. Search the hidden phrase again. Repeat ordinary→Focus with search open. | Each switch closes search and clears its old query/match state. Ordinary search finds ordinary-only content; Focus search does not reveal hidden content. | P | |
| D3 | `/settings`: set **Fullscreen copy on select = false**. Focus on: drag a small visible phrase without Shift, release, press Ctrl+X, paste into Windows scratch editor. Repeat in ordinary view. | Clipboard contains the selected visible text, not hidden content or another answer. No automatic copy is expected on drag completion with this setting. | P | |
| D4 | With copy-on-select false and a completed selection, toggle Focus→ordinary; press Ctrl+X and inspect clipboard. Repeat ordinary→Focus. Use selection text different from the last assistant text. | Selection is cleared on each switch. Ctrl+X now copies the last assistant text, not the stale selected fragment. | P | |
| D5 | With copy-on-select false, hold the mouse button during a Pi drag and press Ctrl+Alt+F, then release. Test both directions; make a fresh selection and copy it afterward. | Old drag/selection is cleared; release does not continue a stale selection in the new document. New Pi selection/copy still works. | P | |
| D6 | Set **Fullscreen copy on select = true**. Put benign sentinel text in the Windows clipboard; drag a visible phrase without Shift and release; paste into scratch editor. Repeat both views. | Drag completion automatically copies the selected visible text across the actual host stack. | P | |
| D7 | With copy-on-select true, select text different from the last assistant answer, then press Ctrl+X and paste. | Ctrl+X copies the last assistant text in this setting, not the selection. Automatic selection-copy happened at drag completion. | P | |
| D8 | With copy-on-select true, repeat completed-selection and active-drag toggles **both directions**. Before each active drag, reset clipboard to a sentinel. Release after toggling, then make a fresh selection. | Selection/highlight and drag state clear; release does not copy a stale fragment from the replacement document. Completed selection may already be in clipboard: clearing selection is not a promise to erase clipboard contents. Fresh selection auto-copy still works. | — | I am not sure what you're asking here or how I am supposed to do this. |
| D9 | In each copy-on-select setting, invoke `/copy` with a selection; paste into scratch editor. Repeat with Focus off. | Always copies last assistant text, independent of selection and view. It is not a command to copy the focused document. | P | |
| D10 | Restore original copy-on-select setting. | Original value is restored; record it. | P | |

## E. Scrolling, resize, and surrounding controls

The accepted policy is **scroll to the bottom on every view replacement**. Exact per-view position restoration is not required.

| ID | Preconditions and steps | Expected result | Result | Actual/evidence |
|---|---|---|---|---|
| E1 | In a transcript taller than the viewport, use PageUp/PageDown and Home/End (or active equivalents from `/hotkeys`). Try ordinary mouse-wheel scrolling too. | Native navigation works on the selected document. | P | |
| E2 | Scroll away from the bottom; toggle each direction. | Each view replacement returns to the bottom. Losing the old offset is expected, not a failure. | P | |
| E3 | At bottom, run C2's delayed manual bash; resize during its pause, then observe the second output marker. | Latest output remains reachable/follows the bottom; wrapping/viewport relayout stays coherent. G also tests growth of a qualifying assistant answer. | NT | |
| E4 | Resize to a narrow terminal, then restore width; inspect header/editor/footer/widgets and status row in both views. | No diagnostic panel or overflow is introduced. Focus status coexists on the same row with available left-side extension statuses such as Cdx; compact/truncated presentation at narrow widths is acceptable if coherent. | P | |
| E5 | With no new request, type/edit/clear a draft, open native settings, and return to transcript. | Editor and surrounding controls remain live; Focus affects transcript presentation only. Working/steering/follow-up behavior requires H's busy fixture. | P | |

## F. Mode, session, and rendering lifetime

Use disposable nonsensitive sessions for new/fork/branch operations. Do not change your real working conversation merely to populate a test case.

| ID | Preconditions and steps | Expected result | Result | Actual/evidence |
|---|---|---|---|---|
| F1 | Focus on; `/settings` → **TUI mode = regular**. Close active unrelated overlays if instructed. | Focus turns off; ordinary output/controls work in regular mode. | — | |
| F2 | In regular mode, invoke `/focus` and Ctrl+Alt+F. | Reports `Focus requires fullscreen mode. Enable it in /settings.`; does not enable Focus or submit a prompt. | — | |
| F3 | `/settings` → **TUI mode = fullscreen**. | Returns in ordinary view, not implicitly focused. | — | |
| F4 | Focus on; `/resume` another disposable session; switch back in the same process. | Focus stays enabled; only the selected session's retained conversation is shown, without old session text/pending output mixed in. | — | |
| F5 | Focus on; `/new`; then `/resume` the disposable original. | New empty session is focused; returning shows that session's correct content. No provider request is needed. | — | |
| F6 | Focus on; `/fork` at an earlier user message in the disposable fixture. Use `/tree` to choose a different existing branch **without requesting a summary**. | Focus follows the chosen retained branch, not other branches or a separate archive. If a summary/provider request is offered, cancel and use H instead. | — | |
| F7 | Focus on; change theme/padding through available settings, inspect, then `/reload`. Toggle back and restore original rendering settings. | Focus reflects current native rendering inputs after refresh/reload; answers do not duplicate, ordinary output/preferences remain intact. Markdown transformer variants require I's fixture. | — | |

## Prepared offline fixture prerequisite for G–I

**Not supplied by this checklist:** the previous `/tmp/pi-focus06-smoke.mts` was removed. Do not try to launch it. G–I remain NT until an agent supplies a tested, disposable fixture using `packages/coding-agent/test/suite/harness.ts` and its faux provider, mounted in the checkout's native fullscreen UI using `.pi/skills/interactive-testing.md`.

Ask for one execution guide with the exact launch command, scenario controls, marker names, expected diagnostic counts, and cleanup. It must run without network/provider credentials or paid tokens, use benign data/temp files, and retain the owner's real mouse/keyboard/clipboard path. A detached tmux capture alone cannot accept D.

Required fixture scenarios:

- A seeded history containing distinct user/final/hidden-only markers, thinking, image/attachment/skill bodies, loaded resources, unsolicited extension output, summaries, usage entries, and historical failures. Include multiple branches and retained post-compaction history.
- Controllable pauses during user start, assistant text streaming, agent tool activity, successful completion, retry, compaction/boundary compaction, and branch summarization. Include tool-bearing `stop`, pending/deferred text, error, abortion, and length truncation.
- Session replacement with pending output; transformed user/assistant messages before public completion listeners; reload/theme/padding/Markdown-transform refresh.
- Explicit manual bash while busy, pending/deferred dock output, asynchronous `user_bash` interception, failed/cancelled bash, overlap prevention, steering/follow-up queues, and unrelated extension dialog/widget/editor controls.
- Individually triggered user-facing warning/error, routine informational notice, warning-colored tool output, and intermediate tool failure; footer with no other statuses and with multiple statuses including Cdx where available.

The agent must verify its fixture before handing it to the owner. Do not ask the owner to manufacture protocol stop reasons or private session events.

## G. Live filtering and exactly-once answers (offline fixture)

| ID | Preconditions and steps | Expected result | Result | Actual/evidence |
|---|---|---|---|---|
| G1 | Start a faux turn while focused; pause at user start, then assistant streaming. | User text appears immediately; assistant partial/thinking/tool commentary does not. Working indicator remains usable. | — | |
| G2 | While streaming, use `/focus` and Ctrl+Alt+F in both directions at separate pause points. | Immediate switching; ordinary view reveals current partial output, not stale history. Execution continues without toggle-induced cancel/restart. | — | |
| G3 | Pause during an agent tool call/result; toggle twice; complete tool work. | Agent output is hidden in Focus, current in ordinary view. Manual bash exceptions do not accidentally expose agent bash tools. | — | |
| G4 | Complete a successful tool-free answer; toggle around completion and trigger reconciliation/reload. | Answer appears at completion, exactly once, without needing a later history rebuild to reveal it. Repeated toggles/reconciliation neither lose nor duplicate it. | — | |
| G5 | Run fixture tool-bearing `stop`, streaming/partial, pending, deferred, failed, aborted, and truncated assistant variants; inspect each in both views. | None is presented as a completed focused answer. Ordinary output remains available. Tool-bearing `stop` is excluded even though its stop reason is `stop`. | — | |
| G6 | Run media/attachment/skill and unsolicited background/custom/summary/usage variants. | User's own text remains; excluded bodies/media/noise do not leak. Explicit UI controls/output continue working. | — | |
| G7 | Complete a second faux turn while focused. | Focus remains on; both turns' qualifying content appears once, in order. | — | |

## H. Busy operations and history (offline fixture)

| ID | Preconditions and steps | Expected result | Result | Actual/evidence |
|---|---|---|---|---|
| H1 | At retry, compaction, boundary-compaction, and branch-summary pause points, toggle via command and shortcut in both directions. | Immediate local switch; operation is not aborted, postponed, or restarted. Ordinary output keeps updating. | — | |
| H2 | Finish compaction; inspect retained markers. Switch branch/session afterward. | Focus follows current retained display history: no compaction/branch summary, unrelated branch, or resurrected pre-compaction archive. | — | |
| H3 | Trigger fixture-transformed user/assistant messages and its completion/reconciliation boundary. | Focus displays authoritative transformed text once; original session is not visibly mixed with old projection. Immutability itself is automated-only. | — | |
| H4 | While busy, leave an unsent draft and prepared steering/follow-up items; toggle both routes. | Draft stays unsubmitted; queues/control UI stay available; toggles do not add a queued prompt or execute pending input. Verify exact request/queue counts automatically as well. | — | |
| H5 | Run manual bash in the busy/pending/deferred dock and intercepted `user_bash` variants. Toggle during execution, complete, fail, and cancel the supplied cases. | Explicit output remains live/in order in its native surface; no loss/duplicate execution or cancellation caused by toggles. Normal overlap/cancel guards still act as described by the fixture. | — | |
| H6 | Change session with fixture-owned stale pending output and diagnostics. | Focus remains on, but old pending output and diagnostic counts are cleared; no old-session content leaks. | — | |
| H7 | Grow a long final answer at bottom and resize; scroll up, then toggle. | Native follow-end handles growth/relayout; every replacement scrolls to bottom. No exact offset restoration is promised. | — | |
| H8 | Keep a supplied unrelated extension overlay/widget active; toggle with shortcut where fixture supports it. | Unrelated overlay/widget/editor interactions survive; search/selection reset does not close unrelated overlays. | — | |

## I. Quiet diagnostics and refresh (offline fixture)

Each count below starts with a fresh Focus interval; wait for one trigger to complete before reading its result.

| ID | Preconditions and steps | Expected result | Result | Actual/evidence |
|---|---|---|---|---|
| I1 | Enter Focus over seeded historical failures. | `Focus W:0 E:0`; historical errors are not replayed into counters. | — | |
| I2 | Trigger one user-facing warning, then one user-facing error. | W increases by 1 then E by 1. No unsolicited detail text, panel, or automatic view change. Ordinary view has details. | — | |
| I3 | Separately trigger failed, aborted, and truncated assistant completions. | Failed/aborted each add one error; length-truncated adds one warning. Unfinished answer text stays excluded. | — | |
| I4 | Trigger routine notice, warning-colored tool text, and intermediate tool failure without a separate user-facing warning/error. | No counter increase merely for these events; tool activity remains hidden. | — | |
| I5 | With nonzero counts, complete another successful turn; reload/refresh rendering/theme/padding/Markdown transformations. | Counts survive turns and reconciliation without replay/double-counting. Focus rendering reflects current transformations/settings. | — | |
| I6 | With nonzero counts, toggle off to inspect details; toggle back on. Repeat via session change. | Leaving clears the interval; reentry begins at zero. Session change also clears counts. Counts mean 'since entering Focus', not 'unread'. | — | |
| I7 | Inspect status with zero other extension statuses, then multiple statuses; resize narrow/wide. | Focus/counts occupy the right of the existing row, other statuses remain on the left; no dependence on the Codex extension or extra diagnostic panel. | — | |

## J. Exit behavior and next-process startup

Precondition: a nonsensitive transcript containing hidden thinking/tool/background markers. Keep ordinary thinking/tool preferences unchanged while testing. Exit only the disposable Pi process, not Herdr or the terminal.

| ID | Preconditions and steps | Expected result | Result | Actual/evidence |
|---|---|---|---|---|
| J1 | `/settings` → **Fullscreen exit output = transcript**. Enable Focus and `/quit` (or Ctrl+D with empty editor). Inspect returned terminal scrollback. | Prints ordinary transcript, including content hidden by Focus according to existing ordinary rendering preferences. No focused-only export is substituted. Terminal returns to usable shell state. | — | |
| J2 | Relaunch checkout with the command in A. | Starts ordinary even though the preceding process exited while focused. | — | |
| J3 | Set **Fullscreen exit output = resume-hint**; enable Focus; quit; inspect returned scrollback. | No transcript is added on exit. The normal resume hint is allowed; hidden marker content is not dumped. Terminal returns to usable shell state. | — | |
| J4 | Relaunch and restore original exit output, copy-on-select, theme/padding, thinking/tool preferences, and TUI mode. | Temporary changes are restored. Focus is not persisted as a setting. | — | |

