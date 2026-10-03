# 07: Hide native command transcript output in Focus

**What to build:** While Focus is enabled, deliberately invoked native commands no longer add their transcript output to the focused document. Their normal output remains available in ordinary view. Manually requested bash output and native interactive controls remain usable while focused.

**Blocked by:** None (can start immediately against the existing Focus implementation).

**Status:** wontfix

- [ ] Hide transcript output from native commands, including `/hotkeys`, `/session`, `/name`, and `/changelog`, while Focus is active. Apply the policy consistently to native command transcript output rather than special-casing only those examples.
- [ ] Preserve command execution and normal ordinary output. Toggling Focus off reveals the command output in its native order; repeated commands and toggles neither lose nor duplicate it.
- [ ] Keep native command transcript output hidden when entering Focus after it was produced in ordinary view, as well as when invoking a command while already focused.
- [ ] Keep manually requested `!` and `!!` output visible in both views, including live, failed, cancelled, pending/deferred, and intercepted manual-bash paths. Agent tool output remains hidden in Focus.
- [ ] Preserve native dialogs, settings selectors, extension dialogs/widgets, and editor interactions. Distinguish transcript output from interactive controls; do not suppress the UI needed to operate commands.
- [ ] Do not add a replacement feedback panel, dismissible reader, automatic view switch, or new extension-output classification API. Preserve the existing quiet diagnostic indicator and its counting rules.
- [ ] Add offline behavioral regression coverage for native command output before/after enabling Focus, both toggle directions, repeated commands, manual-bash exceptions, and preserved interactive controls. Use faux session events where needed, with no real providers, credentials, paid tokens, or network calls.
- [ ] Run affected tests and required repository checks. Demonstrate native command output hidden in Focus and revealed in ordinary view, alongside visible manual bash and working native settings controls.
- [ ] Update the owner checklist and relevant feature documentation to reflect this approved change without invalidating previously recorded passes for unchanged behavior.

## Scope and approved requirement change

The owner approved hiding native command transcript output while retaining manual `!`/`!!` output. This ticket supersedes the native-command visibility exception in the original Focus specification and Ticket 04; that earlier implementation was consistent with its then-approved requirements. It does not supersede the manual-bash exception or preservation of interactive controls.

Do not modify the parent specification as part of publishing or implementing this ticket. Document the approved exception here and reference it from relevant user-facing guidance. Preserve unrelated work; readiness does not itself authorize implementation, commits, deployment, or configuration changes.

Selection-copy line-break handling is a separate native fullscreen improvement. This ticket neither implements nor blocks it; Focus must continue using native selection-copy behavior.

## Comments

Owner cancelled this change after confirming the persistence distinction: native command output is transient display content, while both `!` and `!!` bash results are saved session entries (`!!` excludes them from model context, not from history). Retain the existing native-command and manual-bash visibility exceptions in Focus. This closure withdraws the requirement change above; the original Focus specification and Ticket 04 remain controlling. Acceptance criteria are retained as historical scope, not implementation instructions. Existing owner validation passes remain valid.
