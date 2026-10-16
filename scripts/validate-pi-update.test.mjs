import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checks, formatValidationSummary, tuiTestName, validateUpdate, validationCli } from "./validate-pi-update.mjs";

function fixture({ failure, dirtyBefore = false, dirtyAfter = false, changedHead = false, changedBranch = false, branch = "focus/main", tuiOutput = `ok 1 - ${tuiTestName}\n` } = {}) {
	let heads = 0;
	let branches = 0;
	let statuses = 0;
	const executed = [];
	function run(command, args) {
		if (command === "git") {
			assert.deepEqual(args.slice(0, 2), ["-c", "core.hooksPath=/dev/null"]);
			args = args.slice(2);
			let stdout;
			if (args[0] === "rev-parse") stdout = changedHead && heads++ > 0 ? "new-head" : "original-head";
			else if (args[0] === "branch") stdout = changedBranch && branches++ > 0 ? "pistage/other-update" : branch;
			else {
				assert.ok(args.includes("--untracked-files=all"));
				stdout = (statuses++ === 0 ? dirtyBefore : dirtyAfter) ? " M changed.txt" : "";
			}
			return { status: 0, stdout };
		}
		const name = checks[executed.length].name;
		executed.push(name);
		return { status: name === failure ? 1 : 0, stdout: name === "tui" ? tuiOutput : "" };
	}
	return { run, executed };
}

const silent = () => {};

test("passes only after every required check and unchanged clean Git state", () => {
	const f = fixture();
	const report = validateUpdate("/tmp/repo", f.run, silent);
	assert.equal(report.outcome, "passed");
	assert.equal(report.head, "original-head");
	assert.equal(report.branch, "focus/main");
	assert.equal(report.gitStateVerified, true);
	assert.deepEqual(report.checks, checks.map(({ name }) => ({ name, exitCode: 0, signal: null, outcome: "passed" })));
	assert.deepEqual(f.executed, checks.map((check) => check.name));
});

test("accepts only the updater-recorded stage branch", () => {
	const branch = "pistage/recorded-update";
	const f = fixture({ branch });
	const report = validateUpdate("/tmp/repo", f.run, silent, branch);
	assert.equal(report.outcome, "passed");
	assert.equal(report.branch, branch);
	assert.equal(report.gitStateVerified, true);
	assert.deepEqual(f.executed, checks.map((check) => check.name));
});

test("blocks a different stage branch before running checks", () => {
	const f = fixture({ branch: "pistage/other-update" });
	const report = validateUpdate("/tmp/repo", f.run, silent, "pistage/recorded-update");
	assert.equal(report.outcome, "blocked");
	assert.equal(report.reason, "Run validation on pistage/recorded-update.");
	assert.deepEqual(f.executed, []);
});

test("blocks stage validation if the branch changes during checks", () => {
	const branch = "pistage/recorded-update";
	const f = fixture({ branch, changedBranch: true });
	const report = validateUpdate("/tmp/repo", f.run, silent, branch);
	assert.equal(report.outcome, "blocked");
	assert.equal(report.gitStateVerified, false);
	assert.match(report.reason, /HEAD or branch changed/);
	assert.deepEqual(f.executed, checks.map((check) => check.name));
});

test("disables hooks for every subprocess without discarding caller Git configuration", (t) => {
	const originalEnv = { ...process.env };
	t.after(() => {
		for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
		Object.assign(process.env, originalEnv);
	});
	process.env.GIT_CONFIG_COUNT = "2";
	process.env.GIT_CONFIG_KEY_0 = "user.name";
	process.env.GIT_CONFIG_VALUE_0 = "Validator caller";
	process.env.GIT_CONFIG_KEY_1 = "core.hooksPath";
	process.env.GIT_CONFIG_VALUE_1 = "/caller/hooks";
	const f = fixture();
	const calls = [];
	const run = (command, args, options) => {
		calls.push({ command, options });
		assert.equal(options.env.GIT_CONFIG_COUNT, "3");
		assert.equal(options.env.GIT_CONFIG_KEY_0, "user.name");
		assert.equal(options.env.GIT_CONFIG_VALUE_0, "Validator caller");
		assert.equal(options.env.GIT_CONFIG_KEY_1, "core.hooksPath");
		assert.equal(options.env.GIT_CONFIG_VALUE_1, "/caller/hooks");
		assert.equal(options.env.GIT_CONFIG_KEY_2, "core.hooksPath");
		assert.equal(options.env.GIT_CONFIG_VALUE_2, "/dev/null");
		return f.run(command, args);
	};
	assert.equal(validateUpdate("/tmp/repo", run, silent).outcome, "passed");
	assert.equal(calls.filter(({ command }) => command === "git").length, 6);
	assert.equal(calls.filter(({ command }) => command !== "git").length, checks.length);
	const env = calls[0].options.env;
	for (const [key, expected] of [["core.hooksPath", "/dev/null"], ["user.name", "Validator caller"]]) {
		const result = spawnSync("git", ["config", "--get", key], { env, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.trim(), expected);
	}
	assert.equal(process.env.GIT_CONFIG_COUNT, "2");
	assert.equal(process.env.GIT_CONFIG_VALUE_1, "/caller/hooks");
});

for (const check of checks) {
	test(`stops on ${check.name} failure`, () => {
		const f = fixture({ failure: check.name });
		const report = validateUpdate("/tmp/repo", f.run, silent);
		assert.equal(report.outcome, "blocked");
		assert.equal(f.executed.at(-1), check.name);
		assert.equal(report.checks.at(-1).exitCode, 1);
		assert.equal(report.checks.at(-1).outcome, "failed");
	});
}

for (const options of [{ dirtyBefore: true }, { branch: "main" }, { branch: "" }, { dirtyAfter: true }, { changedHead: true }]) {
	test(`rejects preconditions or stale results ${JSON.stringify(options)}`, () => {
		const f = fixture(options);
		assert.equal(validateUpdate("/tmp/repo", f.run, silent).outcome, "blocked");
		if (options.dirtyBefore || options.branch !== undefined) assert.deepEqual(f.executed, []);
	});
}

test("process termination and spawn errors cannot pass", () => {
	for (const result of [{ status: null, signal: "SIGTERM" }, { status: null, error: new Error("ENOENT") }]) {
		const f = fixture();
		const run = (command, args) => command === "git" ? f.run(command, args) : result;
		const report = validateUpdate("/tmp/repo", run, silent);
		assert.equal(report.outcome, "blocked");
		assert.equal(report.checks[0].signal, result.signal ?? null);
		if (result.error) assert.equal(report.reason, "ENOENT");
	}
});

test("Git inspection failure throws rather than fabricating a pass", () => {
	assert.throws(() => validateUpdate("/tmp/repo", () => ({ status: 1, stderr: "Git failed" }), silent), /Git failed/);
});

for (const output of ["", "ok 1 - empty.test.mjs\n", `ok 1 - ${tuiTestName} # SKIP\n`, `ok 1 - ${tuiTestName} # TODO\n`]) {
	test(`missing or skipped named regression blocks even with exit 0: ${JSON.stringify(output)}`, () => {
		const f = fixture({ tuiOutput: output });
		assert.match(validateUpdate("/tmp/repo", f.run, silent).reason, /required TUI regression/);
	});
}

function temporary(t) {
	const path = mkdtempSync(join(tmpdir(), "validate-pi-test-"));
	t.after(() => rmSync(path, { recursive: true, force: true }));
	return path;
}

test("real node:test zero-test file cannot satisfy the named TUI gate", (t) => {
	const path = temporary(t);
	const file = join(path, "empty.test.mjs");
	writeFileSync(file, "");
	const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", file], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	const f = fixture({ tuiOutput: result.stdout });
	assert.equal(validateUpdate(path, f.run, silent).outcome, "blocked");
});

test("CLI writes private reports with correct exit codes and refuses overwrite", (t) => {
	const path = temporary(t);
	const root = join(path, "repo");
	mkdirSync(root);
	for (const options of [{}, { failure: "repository" }]) {
		const file = join(path, options.failure ? "blocked.json" : "passed.json");
		assert.equal(validationCli(["--report", file], root, fixture(options).run, silent), options.failure ? 1 : 0);
		const report = JSON.parse(readFileSync(file, "utf8"));
		assert.equal(report.outcome, options.failure ? "blocked" : "passed");
		assert.equal(statSync(file).mode & 0o777, 0o600);
		assert.throws(() => validationCli(["--report", file], root), /already exists/);
	}
	assert.throws(() => validationCli([], root), /Usage/);
	assert.throws(() => validationCli(["--report", join(root, "report.json")], root), /outside/);
});

test("standalone CLI blocks stage branches and does not accept a branch override", (t) => {
	const path = temporary(t);
	const root = join(path, "repo");
	mkdirSync(root);
	const file = join(path, "stage.json");
	const f = fixture({ branch: "pistage/recorded-update" });
	assert.equal(validationCli(["--report", file], root, f.run, silent), 1);
	const report = JSON.parse(readFileSync(file, "utf8"));
	assert.equal(report.reason, "Run validation on focus/main.");
	assert.deepEqual(f.executed, []);
	assert.throws(() => validationCli(["--report", join(path, "override.json"), "--branch", "pistage/recorded-update"], root, f.run, silent), /Usage/);
});

test("CLI rejects symlinked parents and exclusively refuses dangling destination links", (t) => {
	const path = temporary(t);
	const root = join(path, "repo");
	mkdirSync(root);
	const parent = join(path, "alias");
	symlinkSync(root, parent);
	assert.throws(() => validationCli(["--report", join(parent, "report.json")], root), /outside/);
	const file = join(path, "dangling.json");
	const target = join(root, "unwanted.json");
	symlinkSync(target, file);
	assert.throws(() => validationCli(["--report", file], root, fixture({ dirtyBefore: true }).run, silent), /EEXIST/);
	assert.equal(existsSync(target), false);
});

test("Git failure does not create a report", (t) => {
	const path = temporary(t);
	const root = join(path, "repo");
	mkdirSync(root);
	const file = join(path, "report.json");
	assert.throws(() => validationCli(["--report", file], root, () => ({ status: 1, stderr: "Git failed" }), silent), /Git failed/);
	assert.equal(existsSync(file), false);
});

test("summary reports success without claiming publication or installation", () => {
	const report = validateUpdate("/tmp/repo", fixture().run, silent);
	const summary = formatValidationSummary(report);
	assert.match(summary, /^Validation: passed\n/u);
	for (const { name } of checks) assert.ok(summary.includes(`${name}: passed (exit 0)`));
	assert.match(summary, /worktree clean: verified/u);
	assert.match(summary, /Publication and global installation: not checked by this runner/u);
});

test("summary distinguishes failed checks from unrun checks", () => {
	const report = validateUpdate("/tmp/repo", fixture({ failure: "repository" }).run, silent);
	const summary = formatValidationSummary(report);
	assert.match(summary, /Validation: blocked/u);
	assert.match(summary, /model-data: passed/u);
	assert.match(summary, /repository: failed \(exit 1\)/u);
	assert.match(summary, /coding-agent: not run/u);
	assert.match(summary, /tui: not run/u);
	assert.match(summary, /worktree clean: not verified/u);
});

test("summary cannot equate exit 0 with a passed missing TUI regression", () => {
	const report = validateUpdate("/tmp/repo", fixture({ tuiOutput: "" }).run, silent);
	assert.match(formatValidationSummary(report), /tui: failed \(exit 0\)/u);
	assert.equal(report.gitStateVerified, false);
});

test("summary reports no checks run for dirty or detached preconditions", () => {
	for (const options of [{ dirtyBefore: true }, { branch: "" }]) {
		const report = validateUpdate("/tmp/repo", fixture(options).run, silent);
		const summary = formatValidationSummary(report);
		for (const { name } of checks) assert.ok(summary.includes(`${name}: not run`));
		assert.match(summary, /worktree clean: not verified/u);
		if (options.branch === "") assert.match(summary, /Branch: \(detached\)/u);
	}
});
