#!/usr/bin/env bash
# Rebase the local focus branch onto upstream's latest stable release.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

git rev-parse --show-toplevel >/dev/null
for state in rebase-merge rebase-apply sequencer MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD; do
	if [[ -e "$(git rev-parse --git-path "$state")" ]]; then
		printf 'Stop: finish or abort the existing Git operation first.\n' >&2
		exit 1
	fi
done
if [[ -n "$(git status --porcelain)" ]]; then
	printf 'Stop: commit your changes before updating (including untracked files).\n' >&2
	exit 1
fi
git show-ref --verify --quiet refs/heads/focus/main || {
	printf 'Stop: local branch focus/main does not exist.\n' >&2
	exit 1
}

git fetch upstream --tags
# Only select stable version tags actually advertised by upstream, not local tags.
releases=$(git ls-remote --refs --tags upstream)
tag=$(printf '%s\n' "$releases" | awk '$2 ~ /^refs\/tags\/v[0-9]+\.[0-9]+\.[0-9]+$/ { sub(/^refs\/tags\//, "", $2); print $2 }' | sort -V | awk 'END { print }')
if [[ -z "$tag" ]]; then
	printf 'Stop: upstream has no stable vX.Y.Z release tags.\n' >&2
	exit 1
fi
remote_oid=$(printf '%s\n' "$releases" | awk -v ref="refs/tags/$tag" '$2 == ref { print $1 }')
if [[ "$(git rev-parse "refs/tags/$tag")" != "$remote_oid" ]]; then
	printf 'Stop: local %s differs from upstream; inspect the tag before retrying.\n' "$tag" >&2
	exit 1
fi
git rev-parse "refs/tags/$tag^{commit}" >/dev/null
git switch focus/main
if git merge-base --is-ancestor "refs/tags/$tag" HEAD; then
	printf 'focus/main already includes latest release %s; no rebase needed.\n' "$tag"
	exit 0
fi
backup="backup/focus-before-$tag-$(date -u +%Y%m%d-%H%M%S)-$$"
git branch "$backup"
printf 'Rebasing focus/main onto %s. Backup: %s\n' "$tag" "$backup"
if ! git -c rebase.autoStash=false rebase "refs/tags/$tag"; then
	printf 'Rebase stopped. Resolve conflicts and run git rebase --continue, or git rebase --abort.\nBackup: %s\n' "$backup" >&2
	exit 1
fi
printf 'Updated focus/main to %s. Run repository checks and focused tests before using it.\n' "$tag"
