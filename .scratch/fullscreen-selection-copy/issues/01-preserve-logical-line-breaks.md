# 01: Preserve logical line breaks in fullscreen selection-copy

**What to build:** Copying a selection from Pi's native fullscreen transcript preserves actual content line breaks without inserting extra newlines merely because the terminal visually wrapped the text. The same behavior applies in ordinary view and Focus.

**Blocked by:** None (can start immediately; independent of Focus command-output changes).

**Status:** wontfix

- [ ] Omit line breaks introduced solely by visual wrapping when copying selected transcript text. Preserve content whitespace at joined wrap boundaries so words neither concatenate nor gain spurious spacing.
- [ ] Preserve actual paragraph boundaries, explicit content newlines, blank lines, and code-block line structure/indentation. Do not infer whether a break is real from punctuation, line length, or prose heuristics.
- [ ] Handle partial selections, including selections that start or end within a wrapped logical line, and selections spanning real line breaks or distinct rendered blocks. Copy only the selected content; do not expand to a whole message or flatten unrelated blocks together.
- [ ] Apply the behavior through native fullscreen selection-copy for both automatic copy-on-select and explicit selection-copy with Ctrl+X when copy-on-select is disabled.
- [ ] Keep existing Ctrl+X behavior when there is no eligible active selection, and when copy-on-select is enabled. Leave `/copy` and its last-assistant-text meaning unchanged.
- [ ] Ordinary fullscreen view and Focus inherit the same native copy behavior without a Focus-specific text reconstruction or alternate clipboard implementation.
- [ ] Preserve visible rendering, selection highlighting/reset, search, scrolling, clipboard transport, and configured copy-on-select behavior. Do not change regular-terminal or outer-terminal selection behavior.
- [ ] Add offline native integration tests with exact clipboard-text expectations for narrow/wide terminals, soft wraps, explicit newlines, blank lines, code indentation, partial selections, and selections crossing rendered blocks. Verify both copy paths and both transcript views.
- [ ] Run affected tests and required repository checks. Validate clipboard contents through the owner's Windows Terminal → WSL/Debian → Herdr → Pi stack using nonsensitive text; distinguish Pi selection from outer-terminal selection and restore changed settings.
- [ ] Update relevant user-facing copy guidance to explain preserved logical breaks and distinguish selection-copy from `/copy`, without implying that outer-terminal copying is controlled by Pi.

## Scope

This is a native fullscreen selection-copy improvement, not a Focus feature. Focus respects it by reusing native selection-copy. It has no blocking dependency on the separate Focus native-command-output change.

Use a bounded native rendering/selection solution that can distinguish visual wrapping from actual content breaks; do not introduce general clipboard configuration or a second transcript renderer. Preserve unrelated work. Readiness does not itself authorize implementation, commits, deployment, or configuration changes.

## Comments

Owner cancelled this work: [`pi-copy-message`](https://github.com/fitchmultz/pi-copy-message), together with the existing Focus behavior, is sufficient for selecting and copying whole underlying messages. Native mouse-selection copying does not need to change for the owner's workflow. Acceptance criteria above are retained as historical scope, not implementation instructions. The separate Focus native-command-output ticket remains unchanged.
