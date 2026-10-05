import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "update-pi-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const upstream = join(root, "upstream");
	const local = join(root, "local");
	mkdirSync(upstream);
	function git(cwd, ...args) {
		const result = spawnSync("git", args, {
			cwd,
			encoding: "utf8",
			env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
		});
		assert.equal(result.status, 0, result.stderr);
		return result.stdout.trim();
	}
	git(upstream, "init", "-b", "main");
	git(upstream, "config", "user.name", "Test");
	git(upstream, "config", "user.email", "test@example.invalid");
	mkdirSync(join(upstream, "scripts"));
	copyFileSync(fileURLToPath(new URL("./update-pi.sh", import.meta.url)), join(upstream, "scripts/update-pi.sh"));
	writeFileSync(join(upstream, "shared.txt"), "base\n");
	git(upstream, "add", "scripts/update-pi.sh", "shared.txt");
	git(upstream, "commit", "-m", "base");
	git(upstream, "tag", "v1.0.3");
	git(root, "clone", upstream, local);
	git(local, "remote", "rename", "origin", "upstream");
	git(local, "config", "user.name", "Test");
	git(local, "config", "user.email", "test@example.invalid");
	git(local, "switch", "-c", "focus/main");
	function commit(cwd, file, text) {
		writeFileSync(join(cwd, file), text);
		git(cwd, "add", file);
		git(cwd, "commit", "-m", text.trim());
	}
	function run() {
		return spawnSync("bash", ["scripts/update-pi.sh"], {
			cwd: local,
			encoding: "utf8",
			env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
		});
	}
	return { git, upstream, local, commit, run };
}

test("rebases custom commits onto highest stable upstream tag, not main or a local tag", (t) => {
	const f = fixture(t);
	f.commit(f.local, "custom.txt", "custom\n");
	const oldTip = f.git(f.local, "rev-parse", "HEAD");
	f.git(f.local, "tag", "v99.0.0");
	f.commit(f.upstream, "release.txt", "release\n");
	f.git(f.upstream, "tag", "v1.0.10");
	f.git(f.upstream, "tag", "-a", "v1.0.9", "-m", "older");
	f.commit(f.upstream, "future.txt", "future\n");
	f.git(f.upstream, "tag", "v2.0.0-rc.1");
	const result = f.run();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Updated focus\/main to v1\.0\.10/);
	assert.equal(f.git(f.local, "rev-parse", "HEAD~1"), f.git(f.upstream, "rev-parse", "v1.0.10"));
	const backup = f.git(f.local, "for-each-ref", "--format=%(objectname)", "refs/heads/backup/");
	assert.equal(backup, oldTip);
	assert.equal(f.git(f.local, "status", "--porcelain"), "");
	assert.match(f.run().stdout, /no rebase needed/);
});

test("accepts annotated release tags and does nothing when already current", (t) => {
	const f = fixture(t);
	f.git(f.upstream, "tag", "-a", "v1.0.4", "-m", "release");
	const result = f.run();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /latest release v1\.0\.4/);
	assert.equal(f.git(f.local, "for-each-ref", "refs/heads/backup/"), "");
});

test("refuses dirty worktrees without switching branches", (t) => {
	const f = fixture(t);
	f.git(f.local, "switch", "main");
	writeFileSync(join(f.local, "untracked.txt"), "preserve me\n");
	const result = f.run();
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /commit your changes/);
	assert.equal(f.git(f.local, "branch", "--show-current"), "main");
});

test("leaves conflicts for the owner and refuses another update until resolved", (t) => {
	const f = fixture(t);
	f.commit(f.local, "shared.txt", "custom change\n");
	const oldTip = f.git(f.local, "rev-parse", "HEAD");
	f.commit(f.upstream, "shared.txt", "upstream change\n");
	f.git(f.upstream, "tag", "v1.0.4");
	const result = f.run();
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /git rebase --continue/);
	assert.equal(f.git(f.local, "for-each-ref", "--format=%(objectname)", "refs/heads/backup/"), oldTip);
	assert.match(f.run().stderr, /existing Git operation/);
	f.git(f.local, "rebase", "--abort");
	assert.equal(f.git(f.local, "rev-parse", "HEAD"), oldTip);
});
