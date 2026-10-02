# 04: Preserve explicit commands and manual bash while focused

**What to build:** Users can invoke native commands and manual shell commands while focused and see their normal output without changing views or opening a new viewer. Agent tool output remains hidden.

**Blocked by:** 02 — Add the live fullscreen focus toggle.

**Status:** ready-for-agent

- [ ] Preserve normal inline output for explicitly invoked native commands, including `/session`, `/hotkeys`, `/name`, and `/changelog`, while focus remains active. These outputs are intentional exceptions to conversation-only filtering.
- [ ] Preserve ordinary output as well; do not replace native command presentation with a separate feedback area, latest-item-only policy, dismissible viewer, or automatic focus exit.
- [ ] Show manually requested `!command` and `!!command` output normally, including live streaming, pending/deferred presentation, and asynchronous `user_bash` interception. Keep the existing difference in their model-context behavior unchanged.
- [ ] Keep manual bash distinguishable from agent-initiated tool output without guessing from text or timing. Agent tool output remains hidden even when it runs shell commands.
- [ ] Toggle both ways during manual and intercepted bash without losing output, cancelling execution, submitting queued input, or weakening existing overlap prevention and cancellation behavior.
- [ ] Integrate explicit output with the presentation boundary and existing pending-output dock. Retain native ordering and lifecycle instead of implementing another transcript history or reconstructing command output from session messages.
- [ ] Preserve extension dialogs, widgets, editor interactions, header/footer, working status, and steering/follow-up controls. Unsolicited extension transcript messages stay hidden and can be inspected by toggling out.
- [ ] Do not introduce an extension command-output classification API, heuristics based on which command ran recently, or a new viewer.
- [ ] Add offline tests exercising representative native commands and the normal, deferred, intercepted, failed, and cancelled manual-bash paths while focused and across toggles. Check ordinary output remains available and execution/context behavior is unchanged.
- [ ] Verify command routing uses no unintended model request and that unrelated agent tool output remains hidden during explicit output. Use the existing faux-provider harness for session integration, never real paid providers.
- [ ] Run affected tests and required code checks. Demonstrate explicit native command output and streaming manual bash while focused in the native fullscreen workflow.

## Scope boundary

Follow the parent Focus specification. Quiet unsolicited diagnostic awareness belongs to ticket 05; do not restore the archived separate-feedback design. This ticket is logically independent of lifecycle reconciliation work, but overlapping writes to the same integration code must be coordinated sequentially. Do not modify the parent spec or commit without authorization.
