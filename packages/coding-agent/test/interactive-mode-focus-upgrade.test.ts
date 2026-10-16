import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/compat";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { DefaultResourceLoader } from "../src/core/resource-loader.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { createCodemodeExtension } from "../src/extensions/codemode/index.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { initTheme, setTerminalColorScheme, setTerminalColors, theme } from "../src/modes/interactive/theme/theme.ts";
import { createHarness, type Harness, type HarnessOptions } from "./suite/harness.ts";

function submit(terminal: VirtualTerminal, text: string) {
	terminal.sendInput(`\x1b[200~${text}\x1b[201~`);
	terminal.sendInput("\r");
}

async function screen(terminal: VirtualTerminal) {
	await terminal.waitForRender();
	return terminal.getViewport().join("\n");
}

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function setup(options: HarnessOptions = {}) {
	const harnesses: Harness[] = [];
	const initial = await createHarness({
		...options,
		settings: { theme: "dark", quietStartup: true, showCacheMissNotices: false, ...options.settings },
	});
	harnesses.push(initial);
	const services = (harness: Harness) => ({
		cwd: harness.tempDir,
		agentDir: harness.tempDir,
		modelRuntime: harness.session.modelRuntime,
		settingsManager: harness.settingsManager,
		resourceLoader: harness.session.resourceLoader,
		diagnostics: [],
	});
	const runtime = new AgentSessionRuntime(initial.session, services(initial), async ({ sessionManager }) => {
		const next = await createHarness({ ...options, sessionManager, settings: initial.settingsManager.getSettings() });
		harnesses.push(next);
		return {
			session: next.session,
			services: services(next),
			diagnostics: [],
			extensionsResult: next.session.resourceLoader.getExtensions(),
		};
	});
	const terminal = new VirtualTerminal(120, 80);
	const mode = new InteractiveMode(runtime, { tuiMode: "fullscreen", terminal });
	return {
		initial,
		runtime,
		terminal,
		mode,
		cleanup: () => {
			mode.stop("resume-hint");
			for (const harness of harnesses.reverse()) harness.cleanup();
		},
	};
}

function expectChunk(output: string, chunk: string) {
	expect(output.split("\n").filter((line) => line.trim() === chunk)).toHaveLength(1);
	expect(output.indexOf(chunk)).toBeLessThan(output.indexOf("retained later user"));
}

describe("Focus upgrade regressions", () => {
	// Issues #10267 and #5581: custom-message runs must use before_agent_start.
	it("keeps custom-message startup busy and hidden until its completed answer arrives", async () => {
		const started = deferred();
		const release = deferred();
		let starts = 0;
		const test = await setup({
			extensionFactories: [
				(pi) => {
					pi.on("before_agent_start", async (event) => {
						if (event.messageType !== "custom") return;
						starts++;
						started.resolve();
						await release.promise;
					});
				},
			],
		});
		let run: Promise<void> | undefined;
		try {
			await test.mode.init();
			submit(test.terminal, "/focus");
			test.initial.setResponses([fauxAssistantMessage("custom completed answer")]);
			run = test.initial.session.sendCustomMessage(
				{ customType: "offline", content: "custom startup detail", display: true },
				{ triggerTurn: true },
			);
			await started.promise;
			expect(test.initial.session.isIdle).toBe(false);
			expect(test.initial.faux.state.callCount).toBe(0);
			let output = await screen(test.terminal);
			expect(output).toContain("Focus W:0 E:0");
			expect(output).not.toContain("custom startup detail");
			expect(output).not.toContain("custom completed answer");
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).not.toContain("Focus W:");
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("Focus W:0 E:0");
			release.resolve();
			await run;
			output = await screen(test.terminal);
			expect(output.match(/custom completed answer/g)).toHaveLength(1);
			expect(output).not.toContain("custom startup detail");
			expect(test.initial.session.isIdle).toBe(true);
			expect(starts).toBe(1);
			expect(test.initial.faux.state.callCount).toBe(1);
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("custom startup detail");
		} finally {
			release.resolve();
			await run;
			test.cleanup();
		}
	});

	it("keeps codemode nested calls live in ordinary view but projects only the final answer", async () => {
		const started = deferred();
		const release = deferred();
		const test = await setup({
			initialActiveToolNames: ["codemode"],
			extensionFactories: [
				createCodemodeExtension({ models: false }),
				(pi) => {
					pi.registerTool({
						name: "nested_echo",
						label: "Nested echo",
						description: "Offline nested tool",
						exposure: "codemode",
						parameters: Type.Object({}),
						execute: async () => {
							started.resolve();
							await release.promise;
							return { content: [{ type: "text", text: "nested tool detail" }], details: {} };
						},
					});
				},
			],
		});
		let run: Promise<void> | undefined;
		try {
			await test.mode.init();
			test.terminal.sendInput("\x0f");
			submit(test.terminal, "/focus");
			test.initial.setResponses([
				fauxAssistantMessage([fauxToolCall("codemode", { code: "text(await tools.nested_echo({}));" })], {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage("nested completed answer"),
			]);
			run = test.initial.session.prompt("nested user");
			await started.promise;
			let output = await screen(test.terminal);
			expect(output).toContain("nested user");
			expect(output).not.toContain("nested_echo");
			expect(output).not.toContain("nested completed answer");
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("nested_echo");
			submit(test.terminal, "/focus");
			release.resolve();
			await run;
			output = await screen(test.terminal);
			expect(output.match(/nested completed answer/g)).toHaveLength(1);
			expect(output).not.toContain("nested tool detail");
			expect(output).not.toContain("nested_echo");
			const result = test.initial.session.messages.find((message) => message.role === "toolResult");
			expect(result).toMatchObject({
				nestedCalls: { calls: [expect.objectContaining({ name: "nested_echo", status: "ok" })] },
			});
			submit(test.terminal, "/focus");
			output = await screen(test.terminal);
			expect(output).toContain("nested_echo");
			expect(output).toContain("nested tool detail");
			expect(test.initial.faux.state.callCount).toBe(2);
		} finally {
			release.resolve();
			await run;
			test.cleanup();
		}
	});

	// Issue #10769: unhandled overlay wheel input must reach the selected transcript.
	it.each([false, true])("scrolls the selected document beneath an unhandled overlay (focus=%s)", async (focused) => {
		let close = () => {};
		const test = await setup({
			extensionFactories: [
				(pi) => {
					pi.registerCommand("wheel-overlay", {
						description: "Offline overlay",
						handler: async (_args, ctx) => {
							await ctx.ui.custom<void>(
								(_tui, _theme, _keys, done) => {
									close = () => done();
									return new Text("wheel overlay", 0, 0);
								},
								{ overlay: true, overlayOptions: { anchor: "top-left", width: 20 } },
							);
						},
					});
				},
			],
		});
		let command: Promise<void> | undefined;
		try {
			const answer = Array.from({ length: 60 }, (_, i) => `overlay history ${i}`).join("\n");
			test.initial.sessionManager.appendMessage(fauxAssistantMessage(answer));
			test.initial.session.refreshContext();
			await test.mode.init();
			test.terminal.resize(80, 24);
			if (focused) submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("overlay history 59");
			command = test.initial.session.prompt("/wheel-overlay");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("wheel overlay"));
			const before = await screen(test.terminal);
			for (let i = 0; i < 8; i++) test.terminal.sendInput("\x1b[<64;3;1M");
			const after = await screen(test.terminal);
			expect(after).toContain("wheel overlay");
			expect(after).toContain("overlay history");
			expect(after).not.toContain("overlay history 59");
			expect(after).not.toBe(before);
			close();
			await command;
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("overlay history 59");
			expect(test.initial.faux.state.callCount).toBe(0);
		} finally {
			close();
			await command;
			test.cleanup();
		}
	});

	it("refreshes focused Markdown on automatic system-theme changes, including while focus is off", async () => {
		vi.stubEnv("COLORFGBG", "");
		setTerminalColors({});
		setTerminalColorScheme("dark");
		const test = await setup({ settings: { theme: "system" } });
		const writes = vi.spyOn(test.terminal, "write");
		try {
			test.initial.sessionManager.appendMessage(fauxAssistantMessage("# automatic theme answer"));
			test.initial.session.refreshContext();
			await test.mode.init();
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("automatic theme answer");
			const dark = theme.getFgAnsi("mdHeading");
			writes.mockClear();
			test.terminal.sendInput("\x1b[?997;2n");
			test.terminal.sendInput("\x1b]10;rgb:1e/1e/1e\x07");
			test.terminal.sendInput("\x1b]11;rgb:fa/fa/fa\x07");
			test.terminal.sendInput("\x1b[?1;2c");
			await vi.waitFor(() => expect(theme.appearance).toBe("light"));
			expect(await screen(test.terminal)).toContain("automatic theme answer");
			const light = theme.getFgAnsi("mdHeading");
			expect(light).not.toBe(dark);
			expect(writes.mock.calls.map(([data]) => data).join("")).toContain(light);
			submit(test.terminal, "/focus");
			test.terminal.sendInput("\x1b[?997;1n");
			test.terminal.sendInput("\x1b]10;rgb:f8/f8/f2\x07");
			test.terminal.sendInput("\x1b]11;rgb:28/2a/36\x07");
			test.terminal.sendInput("\x1b[?1;2c");
			await vi.waitFor(() => expect(theme.appearance).toBe("dark"));
			await screen(test.terminal);
			writes.mockClear();
			submit(test.terminal, "/focus");
			test.terminal.resize(100, 80);
			expect(await screen(test.terminal)).toContain("automatic theme answer");
			expect(writes.mock.calls.map(([data]) => data).join("")).toContain(theme.getFgAnsi("mdHeading"));
			expect(test.initial.settingsManager.getThemeSetting()).toBe("system");
			expect(test.initial.faux.state.callCount).toBe(0);
		} finally {
			test.cleanup();
			writes.mockRestore();
			setTerminalColors({});
			setTerminalColorScheme(undefined);
			initTheme("dark");
			vi.unstubAllEnvs();
		}
	});

	it.each([
		{ compaction: "manual", prefix: "!", focused: false },
		{ compaction: "manual", prefix: "!!", focused: false },
		{ compaction: "manual", prefix: "!", focused: true },
		{ compaction: "manual", prefix: "!!", focused: true },
		{ compaction: "boundary", prefix: "!", focused: false },
		{ compaction: "boundary", prefix: "!!", focused: false },
		{ compaction: "boundary", prefix: "!", focused: true },
		{ compaction: "boundary", prefix: "!!", focused: true },
	] as const)(
		"keeps active idle $prefix output ordered and live through $compaction compaction (focus=$focused)",
		async ({ compaction, prefix, focused }) => {
			const started = deferred();
			const nextChunk = deferred();
			const chunkSent = deferred();
			const finish = deferred();
			let retainedId = "";
			let executions = 0;
			const test = await setup({
				settings: { compaction: { enabled: false, keepRecentTokens: 1, reserveTokens: 0 } },
				extensionFactories: [
					(pi) => {
						pi.on("user_bash", () => ({
							operations: {
								exec: async (_command, _cwd, { onData }) => {
									executions++;
									onData(Buffer.from("active before compaction\n"));
									started.resolve();
									await nextChunk.promise;
									onData(Buffer.from("active after compaction\n"));
									chunkSent.resolve();
									await finish.promise;
									onData(Buffer.from("completed after compaction\n"));
									return { exitCode: 0 };
								},
							},
						}));
						pi.on("session_before_compact", ({ preparation }) => ({
							compaction: {
								summary: "offline manual handoff",
								firstKeptEntryId: retainedId,
								tokensBefore: preparation.tokensBefore,
							},
						}));
						pi.on("turn_end", (_event, ctx) => {
							retainedId = ctx.sessionManager
								.getBranch()
								.findLast((entry) => entry.type === "message" && entry.message.role === "user")!.id;
							if (compaction === "boundary")
								return {
									entries: [
										{ type: "compaction", summary: "offline boundary handoff", firstKeptEntryId: retainedId },
									],
								};
						});
					},
				],
			});
			try {
				test.initial.sessionManager.appendMessage({ role: "user", content: "archived earlier user", timestamp: 1 });
				test.initial.sessionManager.appendMessage(fauxAssistantMessage("archived earlier answer"));
				test.initial.session.refreshContext();
				await test.mode.init();
				if (focused) submit(test.terminal, "/focus");
				submit(test.terminal, `${prefix}held offline command`);
				await started.promise;
				expect(await screen(test.terminal)).toContain("active before compaction");
				test.initial.setResponses([fauxAssistantMessage("retained later answer")]);
				await test.initial.session.prompt("retained later user");
				if (compaction === "manual") {
					submit(test.terminal, "/compact");
					await vi.waitFor(() => expect(test.initial.eventsOfType("compaction_end")[0]?.result).toBeDefined());
				} else {
					expect(
						test.initial.eventsOfType("entry_appended").some((event) => event.entry.type === "compaction"),
					).toBe(true);
				}
				expect(test.initial.session.isBashRunning).toBe(true);
				expect(test.initial.session.messages.some((message) => message.role === "bashExecution")).toBe(false);
				for (let view = 0; view < 2; view++) {
					const output = await screen(test.terminal);
					expect(output).not.toContain("archived earlier user");
					expectChunk(output, "active before compaction");
					expect(output.indexOf("retained later user")).toBeLessThan(output.indexOf("retained later answer"));
					submit(test.terminal, "/focus");
				}
				nextChunk.resolve();
				await chunkSent.promise;
				expectChunk(await screen(test.terminal), "active after compaction");
				finish.resolve();
				await vi.waitFor(() => expect(test.initial.session.isBashRunning).toBe(false));
				for (let view = 0; view < 4; view++) {
					const output = await screen(test.terminal);
					for (const chunk of [
						"active before compaction",
						"active after compaction",
						"completed after compaction",
					])
						expectChunk(output, chunk);
					submit(test.terminal, "/focus");
				}
				expect(executions).toBe(1);
				expect(test.initial.session.messages.filter((message) => message.role === "bashExecution")).toEqual([
					expect.objectContaining({
						command: "held offline command",
						output: "active before compaction\nactive after compaction\ncompleted after compaction\n",
						excludeFromContext: prefix === "!!",
						exitCode: 0,
					}),
				]);
				expect(test.initial.faux.state.callCount).toBe(1);
			} finally {
				nextChunk.resolve();
				finish.resolve();
				await test.initial.session.waitForIdle();
				await screen(test.terminal);
				test.cleanup();
			}
		},
	);

	it("counts genuinely new reload loading errors quietly, not startup failures or unchanged reloads", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-focus-load-failure-"));
		let fail = false;
		let reloads = 0;
		const loader = new DefaultResourceLoader({
			cwd: directory,
			agentDir: directory,
			settingsManager: SettingsManager.inMemory(),
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			extensionFactories: [
				() => {
					throw new Error("historical startup load failure");
				},
				() => {
					if (fail) throw new Error("new reload load failure");
				},
				(pi) => {
					pi.on("session_start", (event, ctx) => {
						if (event.reason === "reload") ctx.ui.setStatus("reload", `loading finished ${++reloads}`);
					});
					pi.registerCommand("refresh-theme", {
						description: "Offline theme refresh",
						handler: async (_args, ctx) => {
							ctx.ui.setTheme("light");
						},
					});
				},
			],
		});
		await loader.reload();
		const test = await setup({ resourceLoader: loader });
		try {
			await test.mode.init();
			expect(await screen(test.terminal)).toContain("historical startup load failure");
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("Focus W:0 E:0");
			fail = true;
			submit(test.terminal, "/reload");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("loading finished 1"));
			expect(loader.getExtensions().errors).toEqual([
				expect.objectContaining({ error: "historical startup load failure" }),
				expect.objectContaining({ error: "new reload load failure" }),
			]);
			let output = await screen(test.terminal);
			expect(output).not.toContain("new reload load failure");
			expect(output).not.toContain("historical startup load failure");
			expect(output).toContain("Focus W:0 E:1");
			await test.runtime.session.prompt("/refresh-theme");
			test.terminal.resize(100, 80);
			expect(await screen(test.terminal)).toContain("Focus W:0 E:1");
			submit(test.terminal, "/reload");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("loading finished 2"));
			expect(await screen(test.terminal)).toContain("Focus W:0 E:1");
			submit(test.terminal, "/focus");
			output = await screen(test.terminal);
			expect(output.match(/new reload load failure/g)).toHaveLength(1);
			expect(output.match(/historical startup load failure/g)).toHaveLength(1);
			submit(test.terminal, "/focus");
			submit(test.terminal, "/reload");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("loading finished 3"));
			expect(await screen(test.terminal)).toContain("Focus W:0 E:0");
			fail = false;
			submit(test.terminal, "/reload");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("loading finished 4"));
			fail = true;
			submit(test.terminal, "/reload");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("loading finished 5"));
			expect(await screen(test.terminal)).toContain("Focus W:0 E:1");
			await test.runtime.newSession();
			expect(await screen(test.terminal)).toContain("Focus W:0 E:0");
			submit(test.terminal, "/reload");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("loading finished 6"));
			expect(await screen(test.terminal)).toContain("Focus W:0 E:0");
			expect(test.initial.faux.state.callCount).toBe(0);
		} finally {
			test.cleanup();
			rmSync(directory, { recursive: true });
		}
	});

	it("uses typed severities for newly loaded skill warnings, prompt collisions and theme warnings", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-focus-resource-diagnostics-"));
		const skills = join(directory, "skill-resource");
		const themes = join(directory, "theme-resource");
		const prompts = [join(directory, "prompt-one"), join(directory, "prompt-two")];
		for (const resource of [skills, themes, ...prompts]) mkdirSync(resource);
		let reloads = 0;
		const loader = new DefaultResourceLoader({
			cwd: directory,
			agentDir: directory,
			settingsManager: SettingsManager.inMemory(),
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			additionalSkillPaths: [skills],
			additionalPromptTemplatePaths: prompts,
			additionalThemePaths: [themes],
			extensionFactories: [
				(pi) => {
					pi.on("session_start", (event, ctx) => {
						if (event.reason === "reload") ctx.ui.setStatus("reload", `resource load ${++reloads}`);
					});
				},
			],
		});
		await loader.reload();
		const test = await setup({ resourceLoader: loader });
		try {
			await test.mode.init();
			submit(test.terminal, "/focus");
			rmSync(skills, { recursive: true });
			writeFileSync(join(themes, "broken.json"), "not a theme");
			for (const prompt of prompts) writeFileSync(join(prompt, "duplicate.md"), "offline prompt");
			submit(test.terminal, "/reload");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("resource load 1"));
			expect(loader.getSkills().diagnostics).toEqual([
				expect.objectContaining({ type: "warning", message: "skill path does not exist" }),
			]);
			expect(loader.getPrompts().diagnostics).toEqual([expect.objectContaining({ type: "collision" })]);
			expect(loader.getThemes().diagnostics).toEqual([expect.objectContaining({ type: "warning" })]);
			let output = await screen(test.terminal);
			expect(output).toContain("Focus W:3 E:0");
			for (const detail of ["skill path does not exist", "collision", "broken.json", "[Theme conflicts]"])
				expect(output).not.toContain(detail);
			submit(test.terminal, "/reload");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("resource load 2"));
			expect(await screen(test.terminal)).toContain("Focus W:3 E:0");
			submit(test.terminal, "/focus");
			output = await screen(test.terminal);
			for (const detail of ["skill path does not exist", "collision", "broken.json", "[Theme conflicts]"])
				expect(output).toContain(detail);
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("Focus W:0 E:0");
			expect(test.initial.session.messages).toEqual([]);
			expect(test.initial.faux.state.callCount).toBe(0);
		} finally {
			test.cleanup();
			rmSync(directory, { recursive: true });
		}
	});
});
