import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { updatePi } from "./update-pi.mjs";

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "update-pi-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const upstream = join(root, "upstream");
	const local = join(root, "local");
	mkdirSync(upstream);
	function git(cwd, ...args) {
		const result = spawnSync("git", args, { cwd, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
		return result.stdout.trim();
	}
	git(upstream, "init", "-b", "main");
	git(upstream, "config", "user.name", "Test");
	git(upstream, "config", "user.email", "test@example.invalid");
	mkdirSync(join(upstream, "scripts"));
	for (const name of ["update-pi.sh", "update-pi.mjs", "validate-pi-update.mjs"]) {
		copyFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), join(upstream, "scripts", name));
	}
	writeFileSync(join(upstream, "shared.txt"), "base\n");
	writeFileSync(join(upstream, ".gitignore"), "node_modules/\n");
	git(upstream, "add", "scripts", "shared.txt", ".gitignore");
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
	function run(...args) {
		return spawnSync("bash", ["scripts/update-pi.sh", ...args], { cwd: local, encoding: "utf8" });
	}
	function state() { return JSON.parse(readFileSync(join(local, ".git/pi-update/state.json"), "utf8")); }
	function release() {
		commit(local, "custom.txt", "custom\n");
		commit(upstream, "release.txt", "release\n");
		git(upstream, "tag", "v1.0.4");
	}
	function validator(stage, _run, _emit, expectedBranch) {
		assert.equal(git(stage, "branch", "--show-current"), expectedBranch);
		return { head: git(stage, "rev-parse", "HEAD"), branch: expectedBranch, outcome: "passed",
			gitStateVerified: true, checks: [], reason: "Fixture passed." };
	}
	function dependencies() {
		// Prerequisite markers only: the injected validator is an offline
		// lifecycle fixture, not evidence that real tools executed.
		const stage = state().stagePath;
		for (const file of ["node_modules/.bin/biome", "node_modules/.bin/tsc", "node_modules/vitest/dist/cli.js"]) {
			const path = join(stage, file);
			mkdirSync(join(path, ".."), { recursive: true });
			writeFileSync(path, "");
		}
	}
	return { git, upstream, local, commit, run, state, release, validator, dependencies };
}

test("prepares latest stable release in a worktree, preserves source, backup and local tags", (t) => {
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
	const state = f.state();
	assert.equal(state.status, "review-required");
	assert.equal(state.tag, "v1.0.10");
	assert.equal(f.git(f.local, "rev-parse", "HEAD"), oldTip);
	assert.equal(f.git(f.local, "branch", "--show-current"), "focus/main");
	assert.equal(f.git(state.stagePath, "rev-parse", "HEAD~1"), f.git(f.upstream, "rev-parse", "v1.0.10"));
	assert.equal(f.git(f.local, "rev-parse", state.backup), oldTip);
	assert.equal(f.git(f.local, "status", "--porcelain", "-uall"), "");
	assert.equal(f.git(state.stagePath, "status", "--porcelain", "-uall"), "");
	assert.doesNotMatch(result.stdout, /git push/);
	const again = f.run();
	assert.equal(again.status, 1);
	assert.match(again.stderr, /Unresolved update/);
	assert.deepEqual(f.state(), state);
});

test("annotated release already included records no stage and no validation", (t) => {
	const f = fixture(t);
	f.git(f.upstream, "tag", "-a", "v1.0.4", "-m", "release");
	assert.equal(f.run().status, 0);
	const state = f.state();
	assert.equal(state.status, "already-current");
	assert.equal(state.tag, "v1.0.4");
	assert.equal(state.stagePath, undefined);
	assert.equal(state.validation, null);
	assert.equal(f.git(f.local, "for-each-ref", "refs/heads/backup/"), "");
	assert.equal(f.run().status, 0);
});

test("dirty source and wrong branch refuse preparation without switching or losing files", (t) => {
	const f = fixture(t);
	f.git(f.local, "config", "status.showUntrackedFiles", "no");
	writeFileSync(join(f.local, "untracked.txt"), "preserve me\n");
	assert.match(f.run().stderr, /Source must be clean/);
	assert.equal(readFileSync(join(f.local, "untracked.txt"), "utf8"), "preserve me\n");
	f.git(f.local, "switch", "main");
	assert.match(f.run().stderr, /live focus\/main/);
	assert.equal(f.git(f.local, "branch", "--show-current"), "main");
});

test("conflicts remain only in stage, source and backup unchanged, next preparation blocked", (t) => {
	const f = fixture(t);
	f.commit(f.local, "shared.txt", "custom change\n");
	const oldTip = f.git(f.local, "rev-parse", "HEAD");
	f.commit(f.upstream, "shared.txt", "upstream change\n");
	f.git(f.upstream, "tag", "v1.0.4");
	assert.equal(f.run().status, 1);
	const state = f.state();
	assert.equal(state.status, "conflicts");
	assert.equal(f.git(f.local, "rev-parse", "HEAD"), oldTip);
	assert.equal(f.git(f.local, "status", "--porcelain", "-uall"), "");
	assert.equal(f.git(f.local, "rev-parse", state.backup), oldTip);
	assert.equal(f.git(state.stagePath, "diff", "--name-only", "--diff-filter=U"), "shared.txt");
	assert.match(f.run().stderr, /Unresolved update/);
	f.git(state.stagePath, "rebase", "--abort");
	assert.equal(f.git(state.stagePath, "rev-parse", "HEAD"), oldTip);
});

test("validation requires review and explicit integration; retained stages are never removed", (t) => {
	const f = fixture(t);
	f.release();
	assert.equal(f.run().status, 0);
	const state = f.state();
	assert.match(f.run("validate").stderr, /Review the staged changes/);
	assert.match(f.run("integrate").stderr, /passed validation report/);
	assert.equal(f.state().status, "review-required");
	f.dependencies();
	const checked = updatePi(f.local, "validate", { reviewed: true, validator: f.validator, emit: () => {} });
	assert.equal(checked.status, "validated");
	assert.equal(f.git(f.local, "rev-parse", "HEAD"), state.sourceHead);
	const integrated = updatePi(f.local, "integrate", { emit: () => {} });
	assert.equal(integrated.status, "integrated");
	assert.equal(f.git(f.local, "rev-parse", "HEAD"), integrated.stageHead);
	assert.ok(existsSync(state.stagePath));
	assert.equal(f.git(f.local, "rev-parse", state.backup), state.sourceHead);
	assert.match(integrated.reason, /git push origin focus\/main:focus\/pi-1.0.4/);
	assert.equal(f.run().status, 0);
	assert.equal(f.state().status, "already-current");
});

test("source drift blocks validation and does not overwrite retained state", (t) => {
	const f = fixture(t);
	f.release();
	f.run();
	const state = f.state();
	f.commit(f.local, "other.txt", "other work\n");
	assert.throws(() => updatePi(f.local, "validate", { reviewed: true, validator: f.validator }), /Source HEAD changed/);
	assert.deepEqual(f.state(), state);
});

test("stage drift and failed checks cannot authorize integration", (t) => {
	const f = fixture(t);
	f.release();
	f.run();
	f.dependencies();
	updatePi(f.local, "validate", { reviewed: true, validator: f.validator, emit: () => {} });
	const validated = f.state();
	f.commit(validated.stagePath, "new.txt", "review again\n");
	assert.match(f.run("integrate").stderr, /Stage changed after validation/);
	const failed = updatePi(f.local, "validate", { reviewed: true,
		validator: (...args) => ({ ...f.validator(...args), outcome: "blocked", gitStateVerified: false, reason: "Fixture failure" }),
		emit: () => {} });
	assert.equal(failed.status, "validation-failed");
	assert.equal(failed.reason, "Fixture failure");
	assert.equal(f.git(f.local, "rev-parse", "HEAD"), validated.sourceHead);
	assert.match(f.run("integrate").stderr, /passed validation report/);
});

test("cancellation records disposition, keeps all work, and allows a new stage", (t) => {
	const f = fixture(t);
	f.release();
	f.run();
	const prior = f.state();
	assert.equal(f.run("cancel").status, 0);
	assert.equal(f.state().status, "cancelled");
	assert.ok(existsSync(prior.stagePath));
	assert.equal(f.run().status, 0);
	assert.notEqual(f.state().id, prior.id);
	const history = JSON.parse(readFileSync(join(f.local, ".git/pi-update/history", `${prior.id}.json`), "utf8"));
	assert.equal(history.status, "cancelled");
	assert.equal(f.git(f.local, "rev-parse", "HEAD"), prior.sourceHead);
});

test("unrecorded managed stages and update locks block overlapping work", (t) => {
	const f = fixture(t);
	const stage = join(f.local, "..", "orphan");
	f.git(f.local, "worktree", "add", "-b", "update-pi/orphan", stage);
	assert.match(f.run().stderr, /Unrecorded update stage/);
	const lock = join(f.local, ".git/pi-update/lock");
	mkdirSync(lock);
	assert.match(f.run().stderr, /Update lock exists/);
	assert.ok(existsSync(lock));
});

test("hooks are disabled for staging Git and CLI status never prepares an update", (t) => {
	const f = fixture(t);
	const sentinel = join(f.local, ".git/hook-invoked");
	writeFileSync(join(f.local, ".git/hooks/post-checkout"), `#!/bin/sh\nprintf invoked > '${sentinel}'\n`, { mode: 0o755 });
	f.release();
	assert.equal(f.run("status").status, 0);
	assert.equal(existsSync(join(f.local, ".git/pi-update")), false);
	assert.equal(f.run().status, 0);
	assert.equal(existsSync(sentinel), false);
	const result = f.run("status");
	assert.equal(result.status, 0);
	assert.equal(JSON.parse(result.stdout).status, "review-required");
});

test("fetch failure is a structured retained blocker and does not alter source", (t) => {
	const f = fixture(t);
	const head = f.git(f.local, "rev-parse", "HEAD");
	f.git(f.local, "remote", "set-url", "upstream", join(f.local, "..", "missing"));
	assert.equal(f.run().status, 1);
	assert.equal(f.state().status, "preparation-failed");
	assert.equal(f.git(f.local, "rev-parse", "HEAD"), head);
	assert.match(f.run().stderr, /Unresolved update/);
});

test("validation exceptions clear prior success and retain the unresolved stage", (t) => {
	const f = fixture(t);
	f.release();
	f.run();
	f.dependencies();
	const checked = updatePi(f.local, "validate", { reviewed: true, validator: f.validator, emit: () => {} });
	assert.equal(checked.status, "validated");
	const failed = updatePi(f.local, "validate", { reviewed: true,
		validator: () => { throw new Error("Dependency unavailable"); }, emit: () => {} });
	assert.equal(failed.status, "validation-failed");
	assert.equal(failed.validation, null);
	assert.match(f.run("integrate").stderr, /passed validation report/);
});

test("source changes during checks cannot produce validated or integrated status", (t) => {
	const f = fixture(t);
	f.release();
	f.run();
	f.dependencies();
	const failed = updatePi(f.local, "validate", { reviewed: true, validator: (...args) => {
		const report = f.validator(...args);
		f.commit(f.local, "concurrent.txt", "concurrent work\n");
		return report;
	}, emit: () => {} });
	assert.equal(failed.status, "validation-failed");
	assert.match(failed.reason, /Source HEAD changed/);
	assert.match(f.run("integrate").stderr, /Source HEAD changed/);
	assert.equal(readFileSync(join(f.local, "concurrent.txt"), "utf8"), "concurrent work\n");
});

test("integration refuses a missing backup and preserves source", (t) => {
	const f = fixture(t);
	f.release();
	f.run();
	f.dependencies();
	const checked = updatePi(f.local, "validate", { reviewed: true, validator: f.validator, emit: () => {} });
	f.git(f.local, "branch", "-D", checked.backup);
	assert.equal(f.run("integrate").status, 1);
	assert.equal(f.git(f.local, "rev-parse", "HEAD"), checked.sourceHead);
});

test("no stable upstream tags produces a structured failure, not a local-tag selection", (t) => {
	const f = fixture(t);
	f.git(f.upstream, "tag", "-d", "v1.0.3");
	assert.equal(f.run().status, 1);
	assert.equal(f.state().status, "preparation-failed");
	assert.match(f.state().reason, /no stable/);
	assert.equal(f.state().stagePath, undefined);
});

test("malformed state cannot bypass reconciliation", (t) => {
	const f = fixture(t);
	f.release();
	f.run();
	const state = f.state();
	writeFileSync(join(f.local, ".git/pi-update/state.json"), JSON.stringify({ ...state, id: "../unexpected" }));
	assert.match(f.run().stderr, /unexpected schema or owner/);
	assert.ok(existsSync(state.stagePath));
});

test("a fresh stage reports dependencies-required before executing any validation code", (t) => {
	const f = fixture(t);
	f.release();
	f.run();
	const prepared = f.state();
	assert.equal(existsSync(join(prepared.stagePath, "node_modules")), false);
	const result = f.run("validate", "--reviewed");
	assert.equal(result.status, 1);
	const blocked = f.state();
	assert.equal(blocked.status, "dependencies-required");
	assert.equal(blocked.validation, null);
	assert.match(blocked.reason, /npm ci --ignore-scripts/);
	assert.ok(blocked.reason.includes(prepared.stagePath));
	assert.match(blocked.reason, /No checks or install were run/);
	assert.equal(f.git(f.local, "rev-parse", "HEAD"), prepared.sourceHead);
	assert.equal(f.git(prepared.stagePath, "status", "--porcelain", "-uall"), "");
	assert.match(f.run("integrate").stderr, /passed validation report/);
	f.dependencies();
	const checked = updatePi(f.local, "validate", { reviewed: true, validator: f.validator, emit: () => {} });
	assert.equal(checked.status, "validated");
});

test("missing dependencies invalidate previous validation instead of leaving integration enabled", (t) => {
	const f = fixture(t);
	f.release();
	f.run();
	f.dependencies();
	updatePi(f.local, "validate", { reviewed: true, validator: f.validator, emit: () => {} });
	const prior = f.state();
	rmSync(join(prior.stagePath, "node_modules/.bin/tsc"));
	assert.equal(f.run("validate", "--reviewed").status, 1);
	assert.equal(f.state().status, "dependencies-required");
	assert.equal(f.state().validation, null);
	assert.match(f.run("integrate").stderr, /passed validation report/);
});

test("status stays read-only and available under the mutating operation lock", (t) => {
	const f = fixture(t);
	f.release();
	f.run();
	const before = f.state();
	const lock = join(f.local, ".git/pi-update/lock");
	mkdirSync(lock);
	const result = f.run("status");
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(JSON.parse(result.stdout), before);
	assert.deepEqual(f.state(), before);
	assert.ok(existsSync(lock));
});

test("retry after a completed archive accepts identical history and ignores partial temporary records", (t) => {
	const f = fixture(t);
	f.run();
	const prior = f.state();
	const history = join(f.local, ".git/pi-update/history");
	mkdirSync(history);
	const archive = join(history, `${prior.id}.json`);
	writeFileSync(archive, JSON.stringify(prior));
	writeFileSync(join(history, "record-interrupted.tmp"), "{");
	assert.equal(f.run().status, 0);
	assert.notEqual(f.state().id, prior.id);
	assert.equal(f.state().status, "already-current");
	assert.deepEqual(JSON.parse(readFileSync(archive, "utf8")), prior);
});

test("different history evidence blocks retry without overwriting the terminal report", (t) => {
	const f = fixture(t);
	f.run();
	const prior = f.state();
	const history = join(f.local, ".git/pi-update/history");
	mkdirSync(history);
	writeFileSync(join(history, `${prior.id}.json`), JSON.stringify({ ...prior, reason: "different evidence" }));
	assert.match(f.run().stderr, /Existing archive differs/);
	assert.deepEqual(f.state(), prior);
});
