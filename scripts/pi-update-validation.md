# Staged fork updates

Run commands from the original repository root, not the stage. The existing shell entrypoint now prepares a separate worktree instead of rebasing live `focus/main`.

```bash
bash scripts/update-pi.sh status
bash scripts/update-pi.sh prepare
```

Preparation requires a clean live `focus/main`, including untracked files, with no Git operation in progress. It fetches upstream tags, selects the highest stable `vX.Y.Z` actually advertised by upstream, creates a backup branch, and rebases a new sibling worktree on `update-pi/<run-id>`. Local-only tags and prereleases do not select the target. Source HEAD, branch, and files stay unchanged. Hooks and commit signing are disabled for the updater's Git operations.

An unresolved run blocks another preparation. The helper also detects unrecorded worktrees on its `update-pi/` branches and concurrent updater processes. Metadata lives under `pi-update/` in the repository's Git common directory, outside tracked files:
- `state.json`: current structured lifecycle report
- `history/<run-id>.json`: prior terminal reports, archived when another run begins
- `lock/`: exclusive operation lock; inspect the previous process before explicitly clearing a stale lock

`status` only reads the current atomic report, creates no metadata, and remains available while a mutating operation holds the lock. History archives are written atomically; retrying after an archive completed but before the next state was saved accepts the identical archive. Different or corrupt evidence blocks continuation.

Existing unrelated worktrees are not claimed, changed, or removed. Reports record source HEAD, release/tag commit, backup, stage path/branch/HEAD, validation evidence, status, and reason as these facts become available. Malformed reports block continuation.

## Review and validate

A successful preparation ends at `review-required`, not validation success. Inspect the diff between the report's `sourceHead` and `stageHead`, including dependency and executable changes. Git operations may still use trusted local configuration and filters: a worktree is not a sandbox. Resolve any conflicts in the stage, preserving intended customizations, and complete its rebase there. Never blindly select ours or theirs.

Fresh worktrees do not have installed dependencies. Before executing checks, validation looks for the stage\'s Biome, TypeScript and Vitest entrypoints. Missing tools produce `dependencies-required` with the installation directory and retry command; presence alone is not proof that the dependency tree is correct. After reviewing upstream package and lockfile changes, run `npm ci --ignore-scripts` in the stage if dependencies are needed. This can access package registries; do not run lifecycle scripts or install globally. The helper does not automatically install dependencies or execute upstream validation code during preparation.

After review and dependency preparation, run from the original checkout:

```bash
bash scripts/update-pi.sh validate --reviewed
```

The flag acknowledges review; it is not a model judgment or proof of review quality. It explicitly allows the reviewed stage code to run with the caller\'s environment and ordinary network access, including hydration fetches. The helper does not sandbox upstream code or strip credentials from the environment; do not validate untrusted changes until they have been reviewed and are acceptable to execute. Validation runs the original checkout's runner against the recorded stage branch. It streams command output except for the short TUI test, whose TAP output is captured and printed in full to verify that the named regression actually passed. It records the tested HEAD, branch, executed checks, exit codes, and outcome. Hydration accesses upstream model catalogs; checks may modify stage files. Dirty or changed stage results block completion. The root check intentionally runs Biome with `--write`; if it changes tracked files, inspect those changes, preserve approved changes in a commit only when authorized, and validate again. Hydrated provider JSON lives in the ignored `packages/ai/src/providers/data/` directory, so hydration writes normally do not dirty tracked files. Network or hydration failures still block validation. Git hooks are disabled for validation subprocesses while preserving caller configuration.

## Integration and recovery

```bash
# Only after explicit owner authorization to change the live branch:
bash scripts/update-pi.sh integrate
```

Integration requires passed validation for the exact stage HEAD and branch, verified clean final Git state, unchanged clean source, and a still-clean unchanged stage. Rebase rewrites commits, so a fast-forward is generally impossible: integration uses `git reset --keep <validated-stage-head>` on live `focus/main`. This replaces its tip and checked-out files while retaining the original tip in the backup. It never force-pushes or removes a worktree.

For an intentionally abandoned run, explicitly authorize `bash scripts/update-pi.sh cancel`. Cancellation records the disposition but keeps the stage, branches, backup, and any unfinished Git operation there. Cleanup is a separate authorized action. A failed or interrupted operation stays unresolved until reconciled; do not delete metadata to bypass it.

| Lifecycle status | Meaning / next step |
| --- | --- |
| `already-current` | Release already included; no stage and no validation run |
| `preparing` | Interrupted preparation; inspect recorded evidence and stage |
| `conflicts` | Resolve or abort the stage rebase; live checkout unchanged |
| `preparation-failed` | Inspect the reported prerequisite or Git error |
| `review-required` | Stage prepared; review before running code |
| `dependencies-required` | Stage tools are missing; after package/lockfile review install with `npm ci --ignore-scripts` in the stage, then retry; no checks ran |
| `validating` | Interrupted validation; inspect and rerun after review |
| `validation-failed` | Fix prerequisite or review changes, then validate again |
| `validated` | Checked stage; integration still separate |
| `integration-failed` | Inspect source and backup; no automatic rollback |
| `integrated` | Live branch updated locally; publication remains separate |
| `cancelled` | Explicitly abandoned; all work retained |

Precondition failures before a run starts leave existing lifecycle evidence untouched and report an actionable error. State is not proof of model/runtime workflow quality. A pass covers the listed checks, not every possible bug or global installation.

## Standalone validation

For validation of a clean live `focus/main` without staging, the original runner remains available:

```bash
node scripts/validate-pi-update.mjs --report /tmp/pi-update-validation-$(date -u +%Y%m%d-%H%M%S).json
```

This requires a new report outside the checkout and never changes the live branch itself.

| Evidence | Deterministic outcome |
| --- | --- |
| All four commands exit 0; named TUI regression passed (not skipped/TODO); HEAD/branch unchanged; worktree clean | Passed |
| Any command exits nonzero or is terminated | Blocked; later checks not run |
| Dirty initial worktree or wrong branch | Blocked before checks |
| HEAD/branch changes or checks leave modified files | Blocked; inspect, do not automatically reset |
| Git inspection fails | Error; no pass report |

The runner generates its completion summary directly from the same structured report it writes to disk. It lists each required check as passed, failed, or not run, identifies the tested HEAD and branch, and distinguishes verified final Git state from unverified state. A check with exit 0 can still be failed if the required TUI regression did not pass. Publication and global installation are explicitly outside this runner's evidence.

Publishing remains a separate explicit action. Never infer a test pass from a successful rebase, clean status, or push. No Jev call is needed to generate or verify this structured summary.

## Separate, optional free-form claim checking

Jev is not part of the normal update workflow. The optional helper is retained only for separately requested checks of **free-form natural-language claims against evidence**, not reading exit codes or authorizing publication. For example, “the fork is updated” can mean rebased, validated, published, or installed. Those are different claims.

Prepare a JSON array of `{ "claim": "...", "evidence": "..." }` items in a temporary file. Supply only the relevant, manually redacted evidence. The helper does not collect logs, retrieve credentials, or make API calls:

Use a private temporary directory (`mktemp -d` creates it with owner-only access), and prepare the redacted input there before running the builder:

```bash
review_dir=$(mktemp -d /tmp/pi-update-review.XXXXXX)
# Create "$review_dir/claims.json" containing only selected, redacted evidence.
(umask 077; node scripts/pi-update-jev-request.mjs "$review_dir/claims.json" > "$review_dir/request.json")
```

After inspecting or explicitly submitting it, remove only those temporary files with `rm -- "$review_dir/claims.json" "$review_dir/request.json"; rmdir -- "$review_dir"`. Neither file needs to persist in the repository.

The output is a TypeSafe HTTP API request body for `jev-latest`. Each item gets its own named state field and Choice question. Batching shares state across questions; these are scoped judgments, not isolated model contexts. The outcomes are `supported`, `contradicted`, and `insufficient`. At most 32 items and 64 KiB are allowed; oversized input is rejected, not silently truncated.

Sending that body to `POST https://api.typesafe.ai/v1/systemone` requires a **separate authorized inference step**, an approved consuming credential mechanism, and inspection of the data being sent. No API key belongs in the request file. With the session's enabled `typesafe_evaluate` tool, pass the body's model, state and questions only after that authorization.

Report the returned Choice, its complete probabilities, confidence, and resolved response model as **Jev's judgment**, not established truth. Preserve uncertainty; there is no qualified automatic-acceptance threshold. Never let a favorable judgment override a failed deterministic gate or grant permission to push. Malformed responses and service errors are not favorable judgments.

### Expected outcomes and qualification

`scripts/pi-update-jev-cases.json` contains synthetic supported, contradicted, and insufficient cases, including missing coding-agent results and confusing publication with installation. Its `expected` labels are human expectations, not measured Jev answers. The request builder excludes these labels from model state.

For an explicitly authorized qualification run, build a request from this fixture, submit it once, and compare each returned answer with its corresponding expected label. Record response model, probabilities, source revision, costs/usage, and mismatches. For reproducible qualification, explicitly select a versioned model ID verified against the current catalog rather than relying on the moving `jev-latest` alias. Unit tests verify payload construction and deterministic gates only: **Jev performance remains unqualified until evaluated**.

Sources inspected: [API](https://docs.typesafe.ai/api.md), [Choice](https://docs.typesafe.ai/primitives/choice.md), [confidence](https://docs.typesafe.ai/confidence.md), and [citation checking](https://docs.typesafe.ai/cookbooks/citation_check.md). Cookbook thresholds and results do not qualify this workflow.
