import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const tuiTestName = "resets document search and selection without closing unrelated overlays or losing editor input";

export const checks = [
	{ name: "model-data", command: "npm", args: ["run", "hydrate:model-data"], directory: "." },
	{ name: "repository", command: "npm", args: ["run", "check"], directory: "." },
	{
		name: "coding-agent",
		command: "node",
		args: [
			"../../node_modules/vitest/dist/cli.js", "--run",
			"test/transcript-presentation.test.ts", "test/interactive-mode-presentation.test.ts",
			"test/interactive-mode-focus.test.ts", "test/interactive-mode-focus-lifecycle.test.ts",
			"test/interactive-mode-focus-output.test.ts", "test/interactive-mode-focus-interactions.test.ts",
			"test/interactive-mode-focus-upgrade.test.ts", "test/footer-width.test.ts",
		],
		directory: "packages/coding-agent",
	},
	{ name: "tui", command: "node", args: ["--test", "--test-reporter=tap", "test/tui-document-interactions.test.ts"], directory: "packages/tui" },
];

// Exit codes and Git state are gates. Model judgments never participate.
export function validateUpdate(root, run = spawnSync, emit = (output) => process.stdout.write(output), expectedBranch = "focus/main") {
	const configCount = Number(process.env.GIT_CONFIG_COUNT ?? "0");
	if (!Number.isSafeInteger(configCount) || configCount < 0) throw new Error("GIT_CONFIG_COUNT must be a nonnegative integer.");
	const env = {
		...process.env,
		GIT_CONFIG_COUNT: String(configCount + 1),
		[`GIT_CONFIG_KEY_${configCount}`]: "core.hooksPath",
		[`GIT_CONFIG_VALUE_${configCount}`]: "/dev/null",
	};
	function git(...args) {
		const result = run("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: root, encoding: "utf8", env });
		if (result.status !== 0) throw new Error(result.stderr || "Git inspection failed");
		return result.stdout.trim();
	}
	const head = git("rev-parse", "HEAD");
	const branch = git("branch", "--show-current");
	const report = { head, branch, checks: [], gitStateVerified: false, outcome: "blocked", reason: "" };
	if (branch !== expectedBranch) {
		report.reason = `Run validation on ${expectedBranch}.`;
		return report;
	}
	if (git("status", "--porcelain", "--untracked-files=all")) {
		report.reason = "Working tree must be clean before validation.";
		return report;
	}
	for (const check of checks) {
		const capture = check.name === "tui";
		const result = run(check.command, check.args, {
			cwd: resolve(root, check.directory),
			env,
			...(capture ? { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] } : { stdio: "inherit" }),
		});
		if (capture) emit((result.stdout ?? "") + (result.stderr ?? ""));
		report.checks.push({ name: check.name, exitCode: result.status, signal: result.signal ?? null, outcome: "failed" });
		if (result.status !== 0) {
			report.reason = result.error?.message ?? `Check failed: ${check.name}. Inspect its output; no automatic recovery was attempted.`;
			return report;
		}
		if (capture && !result.stdout?.split("\n").some((line) => /^ok [0-9]+ - /u.test(line) && line.replace(/^ok [0-9]+ - /u, "") === tuiTestName)) {
			report.reason = "The required TUI regression did not run and pass (missing, renamed, skipped, or TODO).";
			return report;
		}
		report.checks.at(-1).outcome = "passed";
	}
	if (git("rev-parse", "HEAD") !== head || git("branch", "--show-current") !== branch) {
		report.reason = "HEAD or branch changed during validation; results are stale.";
		return report;
	}
	if (git("status", "--porcelain", "--untracked-files=all")) {
		report.reason = "Validation changed the working tree. Inspect changes before publishing.";
		return report;
	}
	report.gitStateVerified = true;
	report.outcome = "passed";
	report.reason = "All required checks passed; HEAD, branch, and clean working tree are unchanged.";
	return report;
}

export function formatValidationSummary(report) {
	const lines = [
		`Validation: ${report.outcome}`,
		`Tested HEAD: ${report.head}`,
		`Branch: ${report.branch || "(detached)"}`,
	];
	for (const { name } of checks) {
		const result = report.checks.find((check) => check.name === name);
		lines.push(result
			? `${name}: ${result.outcome} (exit ${result.exitCode ?? "none"}${result.signal ? `, signal ${result.signal}` : ""})`
			: `${name}: not run`);
	}
	lines.push(
		`Final HEAD/branch unchanged and worktree clean: ${report.gitStateVerified ? "verified" : "not verified"}`,
		`Details: ${report.reason}`,
		"Publication and global installation: not checked by this runner.",
	);
	return `${lines.join("\n")}\n`;
}

export function validationCli(args, root, run = spawnSync, emit = (output) => process.stdout.write(output)) {
	if (args.length !== 2 || args[0] !== "--report") {
		throw new Error("Usage: node scripts/validate-pi-update.mjs --report /tmp/pi-update-validation.json");
	}
	root = realpathSync(root);
	const requested = resolve(args[1]);
	const path = resolve(realpathSync(dirname(requested)), basename(requested));
	if (path === root || path.startsWith(`${root}/`)) throw new Error("Store the report outside the checkout.");
	if (existsSync(path)) throw new Error("Report already exists; choose a new path.");
	const report = validateUpdate(root, run, emit);
	// Exclusive creation also refuses existing or dangling destination symlinks.
	writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
	emit(`${formatValidationSummary(report)}Report: ${path}\n`);
	return report.outcome === "passed" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		process.exitCode = validationCli(process.argv.slice(2), resolve(dirname(fileURLToPath(import.meta.url)), ".."));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
