import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, readdirSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatValidationSummary, validateUpdate } from "./validate-pi-update.mjs";

const terminal = new Set(["already-current", "integrated", "cancelled"]);

export function updatePi(root, action = "prepare", { reviewed = false, validator = validateUpdate, emit = (output) => process.stdout.write(output) } = {}) {
	root = realpathSync(root);
	function git(args, cwd = root) {
		const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", ...args], { cwd, encoding: "utf8" });
		if (result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || `git ${args[0]} failed`);
		return result.stdout.trim();
	}
	if (realpathSync(git(["rev-parse", "--show-toplevel"])) !== root) throw new Error("Run from the owning repository root.");
	const common = realpathSync(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]));
	const metadata = join(common, "pi-update");
	const stateFile = join(metadata, "state.json");
	function readState() {
		if (!existsSync(stateFile)) return undefined;
		const record = JSON.parse(readFileSync(stateFile, "utf8"));
		if (record.schema !== 1 || record.sourceRoot !== root || typeof record.id !== "string" ||
			!/^[0-9a-f-]{36}$/u.test(record.id) || typeof record.status !== "string") {
			throw new Error("Update report has an unexpected schema or owner; inspect it before continuing.");
		}
		return record;
	}
	if (action === "status") {
		const record = readState();
		emit(record ? `${JSON.stringify(record, null, 2)}\n` : "No recorded update.\n");
		return record;
	}
	mkdirSync(metadata, { recursive: true, mode: 0o700 });
	const lock = join(metadata, "lock");
	try { mkdirSync(lock, { mode: 0o700 }); }
	catch { throw new Error(`Update lock exists at ${lock}. Inspect the previous process before explicitly removing a stale lock.`); }
	let state;
	function writeJson(path, record) {
		const temporary = join(dirname(path), `record-${randomUUID()}.tmp`);
		writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
		renameSync(temporary, path);
	}
	function save() { writeJson(stateFile, state); }
	function operation(cwd) {
		for (const name of ["rebase-merge", "rebase-apply", "sequencer", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
			if (existsSync(git(["rev-parse", "--path-format=absolute", "--git-path", name], cwd))) return name;
		}
	}
	function cleanSource(expectedHead) {
		if (git(["branch", "--show-current"]) !== "focus/main") throw new Error("Run on the live focus/main branch.");
		if (operation(root)) throw new Error("Finish the existing Git operation first.");
		if (git(["status", "--porcelain", "--untracked-files=all"])) throw new Error("Source must be clean, including untracked files. Preserve intended work before updating.");
		if (expectedHead && git(["rev-parse", "HEAD"]) !== expectedHead) throw new Error("Source HEAD changed since preparation; reconcile the retained stage.");
	}
	function verifyStage() {
		if (!state.stagePath || !existsSync(state.stagePath)) throw new Error("Recorded stage is missing; reconcile it explicitly.");
		const stage = realpathSync(state.stagePath);
		if (realpathSync(git(["rev-parse", "--path-format=absolute", "--git-common-dir"], stage)) !== common ||
			git(["branch", "--show-current"], stage) !== state.stageBranch) throw new Error("Recorded stage repository or branch differs; reconcile it explicitly.");
		if (operation(stage)) throw new Error("Stage has an unfinished Git operation. Resolve it there first.");
		return stage;
	}
	function finish(status, reason) {
		state.status = status;
		state.reason = reason;
		save();
		emit(`Update: ${status}\nRelease: ${state.tag ?? "not selected"}\nDetails: ${reason}\nReport: ${stateFile}\n`);
		if (state.stagePath) emit(`Retained stage: ${state.stagePath}\nStage branch: ${state.stageBranch}\nBackup: ${state.backup}\n`);
		return state;
	}
	try {
		state = readState();
		if (action === "cancel") {
			if (!state || terminal.has(state.status)) throw new Error("No unresolved update to cancel.");
			return finish("cancelled", "Owner cancelled this run. Worktree, branches, and backup retained; no source changes made.");
		}
		if (action === "prepare") {
			if (state && !terminal.has(state.status)) throw new Error(`Unresolved update ${state.id} (${state.status}). Inspect ${stateFile}; validate, integrate, or explicitly cancel it before preparing another.`);
			cleanSource();
			const knownStages = new Set(state?.stagePath ? [state.stagePath] : []);
			const history = join(metadata, "history");
			if (existsSync(history)) {
				for (const file of readdirSync(history)) {
					if (!file.endsWith(".json")) continue;
					const prior = JSON.parse(readFileSync(join(history, file), "utf8"));
					if (terminal.has(prior.status) && prior.stagePath) knownStages.add(prior.stagePath);
				}
			}
			for (const entry of git(["worktree", "list", "--porcelain"]).split("\n\n")) {
				const branch = entry.split("\n").find((line) => line.startsWith("branch refs/heads/update-pi/"));
				const path = entry.split("\n").find((line) => line.startsWith("worktree "))?.slice(9);
				if (branch && !knownStages.has(path)) throw new Error(`Unrecorded update stage at ${path}; reconcile it before preparing another.`);
			}
			if (state) {
				mkdirSync(history, { recursive: true, mode: 0o700 });
				const archive = join(history, `${state.id}.json`);
				if (existsSync(archive)) {
					if (JSON.stringify(JSON.parse(readFileSync(archive, "utf8"))) !== JSON.stringify(state)) {
						throw new Error("Existing archive differs from the terminal report; inspect it before continuing.");
					}
				} else writeJson(archive, state);
			}
			state = { schema: 1, id: randomUUID(), sourceRoot: root, sourceHead: git(["rev-parse", "HEAD"]), status: "preparing", validation: null };
			save();
			try {
				git(["fetch", "upstream", "--tags"]);
				const releases = git(["ls-remote", "--refs", "--tags", "upstream"]).split("\n")
					.map((line) => line.split(/\s+/u))
					.filter(([, ref]) => /^refs\/tags\/v[0-9]+\.[0-9]+\.[0-9]+$/u.test(ref ?? ""))
					.map(([oid, ref]) => ({ oid, tag: ref.slice(10) }));
				releases.sort((a, b) => {
					const left = a.tag.slice(1).split(".").map(BigInt);
					const right = b.tag.slice(1).split(".").map(BigInt);
					for (let index = 0; index < 3; index++) {
						if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
					}
					return 0;
				});
				const latest = releases.at(-1);
				if (!latest) throw new Error("Upstream has no stable vX.Y.Z release tags.");
				state.tag = latest.tag;
				if (git(["rev-parse", `refs/tags/${state.tag}`]) !== latest.oid) throw new Error("Local release tag differs from upstream; inspect it.");
				state.targetCommit = git(["rev-parse", `refs/tags/${state.tag}^{commit}`]);
				if (git(["rev-list", "--count", `${state.sourceHead}..${state.targetCommit}`]) === "0") {
					cleanSource(state.sourceHead);
					return finish("already-current", "focus/main includes the selected release. No worktree created; validation was not run.");
				}
				state.backup = `backup/focus-before-${state.tag}-${state.id}`;
				state.stageBranch = `update-pi/${state.id}`;
				state.stagePath = join(dirname(root), `${basename(root)}-update-${state.id}`);
				save();
				git(["branch", state.backup, state.sourceHead]);
				git(["worktree", "add", "-b", state.stageBranch, state.stagePath, state.sourceHead]);
				try {
					git(["-c", "rebase.autoStash=false", "rebase", state.targetCommit], state.stagePath);
				} catch (error) {
					cleanSource(state.sourceHead);
					return finish(operation(state.stagePath) ? "conflicts" : "preparation-failed",
						`${error.message}\nResolve in the stage and run git rebase --continue there, or abort there. The live branch is unchanged.`);
				}
				state.stageHead = git(["rev-parse", "HEAD"], state.stagePath);
				state.changedFiles = git(["diff", "--name-only", state.sourceHead, state.stageHead]).split("\n").filter(Boolean);
				cleanSource(state.sourceHead);
				return finish("review-required", "Rebase prepared outside the live checkout. Review the staged diff and changed executable/dependency code before running validate --reviewed. Nothing was activated or pushed.");
			} catch (error) { return finish("preparation-failed", error.message); }
		}
		if (!state || terminal.has(state.status)) throw new Error("No unresolved stage. Prepare an update first.");
		cleanSource(state.sourceHead);
		const stage = verifyStage();
		if (action === "validate") {
			if (!reviewed) throw new Error("Review the staged changes first, then explicitly use validate --reviewed.");
			if (git(["status", "--porcelain", "--untracked-files=all"], stage)) throw new Error("Stage must be clean before validation. Preserve reviewed changes first.");
			state.stageHead = git(["rev-parse", "HEAD"], stage);
			if (git(["rev-list", "--count", `${state.stageHead}..${state.targetCommit}`]) !== "0") throw new Error("Stage no longer includes the selected release.");
			state.validation = null;
			const missing = ["node_modules/.bin/biome", "node_modules/.bin/tsc", "node_modules/vitest/dist/cli.js"]
				.filter((file) => !existsSync(join(stage, file)));
			if (missing.length) {
				return finish("dependencies-required",
					`Missing stage dependencies: ${missing.join(", ")}. After reviewing package and lockfile changes, run npm ci --ignore-scripts in ${stage}, then retry validate --reviewed. No checks or install were run.`);
			}
			state.status = "validating";
			save();
			try {
				state.validation = validator(stage, spawnSync, emit, state.stageBranch);
				cleanSource(state.sourceHead);
				emit(formatValidationSummary(state.validation));
				return finish(state.validation.outcome === "passed" ? "validated" : "validation-failed",
					state.validation.outcome === "passed" ? "Stage validated. Live checkout is unchanged. Explicit integration is still required." : state.validation.reason);
			} catch (error) { return finish("validation-failed", error.message); }
		}
		if (action === "integrate") {
			if (state.status !== "validated" || state.validation?.outcome !== "passed" || !state.validation.gitStateVerified ||
				state.validation.head !== state.stageHead || state.validation.branch !== state.stageBranch) throw new Error("A matching passed validation report is required before integration.");
			if (git(["rev-parse", "HEAD"], stage) !== state.stageHead ||
				git(["status", "--porcelain", "--untracked-files=all"], stage)) throw new Error("Stage changed after validation; review and validate again.");
			cleanSource(state.sourceHead);
			if (git(["rev-parse", state.backup]) !== state.sourceHead) throw new Error("Backup no longer retains the original tip; reconcile it before integration.");
			// A rebase rewrites commits, so fast-forward integration is not possible.
			// --keep refuses overwriting conflicting local changes; the backup retains the old tip.
			git(["reset", "--keep", state.stageHead]);
			if (git(["rev-parse", "HEAD"]) !== state.stageHead || git(["status", "--porcelain", "--untracked-files=all"])) {
				return finish("integration-failed", "Source changed during integration; inspect source and backup. No automatic rollback attempted.");
			}
			return finish("integrated", `Validated stage integrated locally. Publication is separate: git push origin focus/main:focus/pi-${state.tag.slice(1)}`);
		}
		throw new Error(`Unknown action: ${action}`);
	} finally { rmdirSync(lock); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const args = process.argv.slice(2);
		const action = args[0] ?? "prepare";
		if (!["prepare", "status", "validate", "integrate", "cancel"].includes(action) ||
			(args.length > 1 && !(action === "validate" && args.length === 2 && args[1] === "--reviewed"))) {
			throw new Error("Usage: bash scripts/update-pi.sh [prepare|status|validate --reviewed|integrate|cancel]");
		}
		const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
		if (realpathSync(process.cwd()) !== realpathSync(root)) throw new Error("Run from the owning repository root.");
		const state = updatePi(root, action, { reviewed: args[1] === "--reviewed" });
		process.exitCode = state && action !== "status" && ["preparation-failed", "conflicts", "dependencies-required", "validation-failed", "integration-failed"].includes(state.status) ? 1 : 0;
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
