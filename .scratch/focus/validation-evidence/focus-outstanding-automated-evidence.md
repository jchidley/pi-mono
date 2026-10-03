# Focus outstanding validation: automated evidence

Checkout: `stock/pi-1.0.0` at `494c6c0b6`.

Parent independently ran from `packages/coding-agent`:

```bash
node ../../node_modules/vitest/dist/cli.js --run test/interactive-mode-focus.test.ts test/interactive-mode-focus-lifecycle.test.ts test/interactive-mode-focus-output.test.ts test/interactive-mode-focus-interactions.test.ts
```

Result: **4 files passed; 73 tests passed; duration 16.70 seconds.** These targeted tests use the offline/faux session harness. No full suite, build, or real provider request was run.

Relevant coverage includes assistant streaming/tool toggles and completion-before-persistence; retained branch/compaction history; retry and branch summarization; transformed messages/reload; diagnostic routing/count retention/reset; pending/intercepted manual output and session replacement; native mode transitions; selected-document search and selection reset; scroll-to-bottom/growth/resize; ordinary transcript and resume-hint exits.

This is automated coverage, not owner acceptance through Windows Terminal/WSL/Herdr. Previously recorded owner passes remain in `/tmp/focus-owner-manual-test-checklist.md` and are not overwritten. The prepared fixture and seven-check owner guide exercise the remaining native-host paths without repeating those passes: `/tmp/focus-outstanding-checklist.md`.

The parent independently ran `bash /tmp/pi-focus-owner-validation/launch.sh --self-check` successfully on the final script, including additional diagnostic retention across a second live turn and `/reload`. The parent native smoke also passed: `bash /tmp/pi-focus-owner-validation/parent-native-smoke.sh`. It covered live shortcut toggles/resize, diagnostic reset, native new/resume picker, regular/fullscreen transitions, and two normal exits with exit code 0. Native captures are in `/tmp/pi-focus-owner-validation/parent-native.log`; they show hidden reasoning in transcript exit and no transcript in hint-only exit. A separate cross-family source review's two low-severity check/comment findings were corrected. All disposable run directories were removed after verification; real configuration and existing owner results remain unchanged.

The owner subsequently cancelled the change to hide native command transcript output (Focus Ticket 07: `wontfix`). The original visibility exception remains, and all seven outstanding owner checks passed. Selection-copy wrapping work was cancelled in favor of the raw-message picker workflow.
