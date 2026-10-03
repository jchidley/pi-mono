# Superseded Focus mail patches

This retained six-patch export represents original committed source through `494c6c0b6` and **does not contain the upgrade-review fixes or later #5943 fixture correction**. It predates the parent rebase and is provenance only, not a second delivery workflow.

Use the [clean baseline mail patch](../upgrade-bundle/README.md) for commit `400f5b939456f59e872b4c89cd78bce3209d19d8`, governed by [the current plan](../upgrade-review.md) and [Task 08](../issues/08-clean-replayable-focus-commit-set.md). The old consolidated binary snapshot is also superseded. Never apply multiple exports together.

Baseline packaging and local consolidation commits on `stock/pi-1.0.0` are complete (code anchor `f843f6521`, local records separate). Owner declined the unrelated AI-test fix and accepts the known full-check failure for local commits. The separate target cherry-pick remains pending; no full-check pass or cleanup is claimed.
