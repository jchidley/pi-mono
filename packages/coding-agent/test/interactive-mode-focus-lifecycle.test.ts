import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
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
		settings: { theme: "dark", showCacheMissNotices: false, ...options.settings },
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
		const next = await createHarness({
			...options,
			sessionManager,
			settings: { theme: "dark", showCacheMissNotices: false, ...options.settings },
		});
		harnesses.push(next);
		return {
			session: next.session,
			services: services(next),
			diagnostics: [],
			extensionsResult: next.session.resourceLoader.getExtensions(),
		};
	});
	const terminal = new VirtualTerminal(120, 60);
	const mode = new InteractiveMode(runtime, { tuiMode: "fullscreen", terminal });
	return {
		initial,
		runtime,
		terminal,
		mode,
		current: () => harnesses.at(-1)!,
		cleanup: () => {
			mode.stop("resume-hint");
			for (const harness of harnesses.reverse()) harness.cleanup();
		},
	};
}

describe("focus lifecycle", () => {
	it.each([false, true])(
		"rejects new manual commands during replacement construction, preserves their draft, then permits retry (intercepted=%s)",
		async (intercepted) => {
			const replacementStarted = deferred();
			const replacementRelease = deferred();
			let factories = 0;
			let interceptions = 0;
			const test = await setup({
				settings: { quietStartup: true },
				extensionFactories: [
					async (pi) => {
						if (++factories === 2) {
							replacementStarted.resolve();
							await replacementRelease.promise;
						}
						if (intercepted)
							pi.on("user_bash", () => {
								interceptions++;
								return {
									result: { output: "construction output", exitCode: 0, cancelled: false, truncated: false },
								};
							});
					},
				],
			});
			const marker = join(test.initial.tempDir, "construction-marker");
			const command = intercepted
				? "held-window-command"
				: `printf 'construction output\\n'; printf marker > '${marker}'`;
			const draftPrefix = intercepted ? "!held-window-command" : "!printf 'construction output";
			try {
				await test.mode.init();
				submit(test.terminal, "/focus");
				submit(test.terminal, "/new");
				await replacementStarted.promise;
				submit(test.terminal, `!${command}`);
				await vi.waitFor(async () =>
					expect(await screen(test.terminal)).toContain("Session replacement is still in progress"),
				);
				const output = await screen(test.terminal);
				expect(output).toContain("Retry this command after it finishes");
				expect(output).toContain(draftPrefix);
				expect(interceptions).toBe(0);
				expect(existsSync(marker)).toBe(false);
				expect(test.initial.session.messages).toEqual([]);
				replacementRelease.resolve();
				await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("New session started"));
				expect(await screen(test.terminal)).toContain(draftPrefix);
				expect(test.current().session.messages).toEqual([]);
				test.terminal.sendInput("\r"); // Retry the preserved draft only after the new session is ready.
				await vi.waitFor(() =>
					expect(test.current().session.messages).toEqual([
						expect.objectContaining({
							role: "bashExecution",
							command,
							output: intercepted ? "construction output" : "construction output\n",
						}),
					]),
				);
				expect(
					(await screen(test.terminal)).split("\n").filter((line) => line.trim() === "construction output"),
				).toHaveLength(1);
				expect(interceptions).toBe(intercepted ? 1 : 0);
				expect(existsSync(marker)).toBe(!intercepted);
				expect(test.initial.session.messages).toEqual([]);
				expect(test.current().faux.state.callCount).toBe(0);
			} finally {
				replacementRelease.resolve();
				await screen(test.terminal);
				test.cleanup();
			}
		},
	);

	it("discards an old interception error during replacement construction, before the new session is applied", async () => {
		const interceptionStarted = deferred();
		const interceptionRelease = deferred();
		const replacementStarted = deferred();
		const replacementRelease = deferred();
		let factoryRuns = 0;
		const test = await setup({
			settings: { quietStartup: true },
			extensionFactories: [
				async (pi) => {
					if (++factoryRuns === 2) {
						replacementStarted.resolve();
						await replacementRelease.promise;
					}
					pi.on("user_bash", async () => {
						interceptionStarted.resolve();
						await interceptionRelease.promise;
						throw new Error("invalidated interception error");
					});
				},
			],
		});
		try {
			await test.mode.init();
			submit(test.terminal, "!invalidated command");
			await interceptionStarted.promise;
			submit(test.terminal, "/new");
			await replacementStarted.promise;
			interceptionRelease.resolve();
			expect(await screen(test.terminal)).not.toContain("invalidated interception error");
			replacementRelease.resolve();
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("New session started"));
			expect(await screen(test.terminal)).not.toContain("invalidated interception error");
			expect(test.current().session.messages).toEqual([]);
		} finally {
			interceptionRelease.resolve();
			replacementRelease.resolve();
			await screen(test.terminal);
			test.cleanup();
		}
	});

	it("ignores late old execution callbacks while a new session's manual command is streaming", async () => {
		const oldStarted = deferred();
		const oldRelease = deferred();
		const nextStarted = deferred();
		const nextRelease = deferred();
		const executions: string[] = [];
		const test = await setup({
			settings: { quietStartup: true },
			extensionFactories: [
				(pi) => {
					pi.on("user_bash", () => ({
						operations: {
							exec: async (command, _cwd, { onData }) => {
								executions.push(command);
								if (command === "old execution") {
									onData(Buffer.from("old initial chunk\n"));
									oldStarted.resolve();
									await oldRelease.promise; // Deliberately model a remote callback arriving after cancellation.
									onData(Buffer.from("late old execution chunk\n"));
									return { exitCode: 17 };
								}
								onData(Buffer.from("new initial chunk\n"));
								nextStarted.resolve();
								await nextRelease.promise;
								onData(Buffer.from("new final chunk\n"));
								return { exitCode: 0 };
							},
						},
					}));
				},
			],
		});
		try {
			await test.mode.init();
			submit(test.terminal, "/focus");
			submit(test.terminal, "!old execution");
			await oldStarted.promise;
			submit(test.terminal, "/new");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("New session started"));
			submit(test.terminal, "!new execution");
			await nextStarted.promise;
			oldRelease.resolve();
			let output = await screen(test.terminal);
			expect(output).toContain("new initial chunk");
			expect(output).not.toContain("late old execution chunk");
			nextRelease.resolve();
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("new final chunk"));
			for (let view = 0; view < 2; view++) {
				output = await screen(test.terminal);
				expect(output).toContain("new initial chunk");
				expect(output).toContain("new final chunk");
				expect(output).not.toContain("old initial chunk");
				expect(output).not.toContain("late old execution chunk");
				expect(output).not.toContain("exit code 17");
				submit(test.terminal, "/focus");
			}
			expect(executions).toEqual(["old execution", "new execution"]);
			expect(test.current().session.messages).toEqual([
				expect.objectContaining({
					role: "bashExecution",
					command: "new execution",
					output: "new initial chunk\nnew final chunk\n",
					exitCode: 0,
				}),
			]);
		} finally {
			oldRelease.resolve();
			nextRelease.resolve();
			await screen(test.terminal);
			test.cleanup();
		}
	});

	it.each(["result", "operations", "rejection"] as const)(
		"discards stale manual interception %s after native session replacement",
		async (path) => {
			const started = deferred();
			const release = deferred();
			let oldExecutions = 0;
			const test = await setup({
				settings: { quietStartup: true },
				extensionFactories: [
					(pi) => {
						pi.on("user_bash", async ({ command }) => {
							if (command === "old held command") {
								started.resolve();
								await release.promise;
								if (path === "rejection") throw new Error("stale interception rejection");
								if (path === "operations")
									return {
										operations: {
											exec: async (_command, _cwd, { onData }) => {
												oldExecutions++;
												onData(Buffer.from("stale manual output\n"));
												return { exitCode: 0 };
											},
										},
									};
								return {
									result: { output: "stale manual output", exitCode: 0, cancelled: false, truncated: false },
								};
							}
							return {
								result: {
									output: "new session manual output",
									exitCode: 0,
									cancelled: false,
									truncated: false,
								},
							};
						});
					},
				],
			});
			try {
				await test.mode.init();
				submit(test.terminal, "/focus");
				submit(test.terminal, "!old held command");
				await started.promise;
				submit(test.terminal, "/new");
				await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("New session started"));
				release.resolve();
				let output = await screen(test.terminal);
				expect(output).not.toContain("stale manual output");
				expect(output).not.toContain("stale interception rejection");
				submit(test.terminal, "/focus");
				output = await screen(test.terminal);
				expect(output).not.toContain("old held command");
				expect(output).not.toContain("stale interception rejection");
				expect(oldExecutions).toBe(0);
				expect(test.initial.session.messages).toEqual([]);
				expect(test.current().session.messages).toEqual([]);
				submit(test.terminal, "!!new command");
				await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("new session manual output"));
				expect(test.current().session.messages).toEqual([
					expect.objectContaining({ role: "bashExecution", command: "new command", excludeFromContext: true }),
				]);
				expect(test.current().faux.state.callCount).toBe(0);
			} finally {
				release.resolve();
				await screen(test.terminal);
				test.cleanup();
			}
		},
	);

	it("releases the old reservation on replacement without letting its finally clear a newer interception", async () => {
		const oldStarted = deferred();
		const oldRelease = deferred();
		const nextStarted = deferred();
		const nextRelease = deferred();
		const interceptions: string[] = [];
		const test = await setup({
			settings: { quietStartup: true },
			extensionFactories: [
				(pi) => {
					pi.on("user_bash", async ({ command }) => {
						interceptions.push(command);
						if (command === "old reservation") {
							oldStarted.resolve();
							await oldRelease.promise;
						}
						if (command === "new reservation") {
							nextStarted.resolve();
							await nextRelease.promise;
						}
						return { result: { output: `${command} output`, exitCode: 0, cancelled: false, truncated: false } };
					});
				},
			],
		});
		try {
			await test.mode.init();
			submit(test.terminal, "/focus");
			submit(test.terminal, "!old reservation");
			await oldStarted.promise;
			submit(test.terminal, "/new");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("New session started"));
			submit(test.terminal, "!new reservation");
			await vi.waitFor(() => expect(interceptions).toEqual(["old reservation", "new reservation"]));
			await nextStarted.promise;
			oldRelease.resolve();
			expect(await screen(test.terminal)).not.toContain("old reservation output");
			submit(test.terminal, "!overlapping reservation");
			expect(await screen(test.terminal)).toContain("A bash command is already running");
			expect(interceptions).toEqual(["old reservation", "new reservation"]);
			nextRelease.resolve();
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("new reservation output"));
			expect(test.current().session.messages).toEqual([expect.objectContaining({ command: "new reservation" })]);
			test.terminal.sendInput("\x15"); // Clear the natively preserved rejected-command draft.
			submit(test.terminal, "!after reservation");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("after reservation output"));
			expect(interceptions).toEqual(["old reservation", "new reservation", "after reservation"]);
		} finally {
			oldRelease.resolve();
			nextRelease.resolve();
			await screen(test.terminal);
			test.cleanup();
		}
	});

	it.each(["native", "extension"] as const)(
		"routes resume completion by its %s invocation origin while retaining focus",
		async (origin) => {
			const directory = mkdtempSync(join(tmpdir(), "pi-focus-resume-origin-"));
			const initialManager = SessionManager.create(directory, directory);
			initialManager.appendMessage({ role: "user", content: "initial resume user", timestamp: 1 });
			const selected = SessionManager.create(directory, directory);
			selected.appendMessage({ role: "user", content: "selected resume user", timestamp: 2 });
			selected.appendMessage(fauxAssistantMessage("selected resume answer"));
			selected.appendSessionInfo("selected resume session");
			const selectedPath = selected.getSessionFile()!;
			const test = await setup({
				sessionManager: initialManager,
				settings: { quietStartup: true },
				extensionFactories: [
					(pi) => {
						pi.registerCommand("extension-resume", {
							description: "Offline extension resume",
							handler: async (_args, ctx) => {
								await ctx.switchSession(selectedPath);
							},
						});
					},
				],
			});
			try {
				await test.mode.init();
				submit(test.terminal, "/focus");
				if (origin === "native") {
					submit(test.terminal, "/resume");
					await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("selected resume session"));
					test.terminal.sendInput("selected resume session");
					test.terminal.sendInput("\r");
					await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("Resumed session"));
				} else {
					await test.initial.session.prompt("/extension-resume");
				}
				expect(test.runtime.session.sessionFile).toBe(selectedPath);
				let output = await screen(test.terminal);
				expect(output).toContain("selected resume user");
				expect(output).toContain("selected resume answer");
				expect(output).not.toContain("initial resume user");
				if (origin === "native") expect(output).toContain("Resumed session");
				else expect(output).not.toContain("Resumed session");
				test.mode.showWarning("resume background diagnostic");
				expect(await screen(test.terminal)).not.toContain("resume background diagnostic");
				submit(test.terminal, "/focus");
				output = await screen(test.terminal);
				expect(output).toContain("Resumed session");
				expect(output).toContain("resume background diagnostic");
				expect(test.initial.faux.state.callCount).toBe(0);
				expect(test.current().faux.state.callCount).toBe(0);
			} finally {
				test.cleanup();
				rmSync(directory, { recursive: true });
			}
		},
	);
	it("shows transformed user and assistant completions once before persistence and after reconciliation", async () => {
		const test = await setup({
			extensionFactories: [
				(pi) => {
					pi.on("message_end", ({ message }) => {
						if (message.role === "user") return { message: { ...message, content: "transformed user" } };
						if (message.role === "assistant")
							return { message: { ...message, content: [{ type: "text", text: "transformed answer" }] } };
					});
				},
			],
		});
		try {
			await test.mode.init();
			submit(test.terminal, "/focus");
			let completedBeforePersistence = false;
			let completionFrame = "";
			// Agent listeners are awaited, so the next turn/agent boundary cannot rebuild
			// history while this completion frame is observed through the native terminal.
			const unsubscribeCompletion = test.initial.session.agent.subscribe(async (event) => {
				if (
					event.type === "message_end" &&
					event.message.role === "assistant" &&
					event.message.stopReason === "stop"
				) {
					completionFrame = await screen(test.terminal);
				}
			});
			const unsubscribe = test.initial.session.subscribe((event) => {
				if (event.type === "message_end" && event.message.role === "assistant") {
					expect(
						test.initial.sessionManager
							.getBranch()
							.some((entry) => entry.type === "message" && entry.message === event.message),
					).toBe(false);
					completedBeforePersistence = true;
				}
			});
			test.initial.setResponses([fauxAssistantMessage("provider answer")]);
			await test.initial.session.prompt("original user");
			unsubscribe();
			unsubscribeCompletion();
			expect(completionFrame).not.toContain("original user");
			expect(completionFrame).not.toContain("provider answer");
			expect(completionFrame.match(/transformed user/g)).toHaveLength(1);
			expect(completionFrame.match(/transformed answer/g)).toHaveLength(1);
			const output = await screen(test.terminal);
			expect(output).not.toContain("original user");
			expect(output).not.toContain("provider answer");
			expect(output.match(/transformed user/g)).toHaveLength(1);
			expect(output.match(/transformed answer/g)).toHaveLength(1);
			expect(completedBeforePersistence).toBe(true);
			const records = structuredClone(test.initial.sessionManager.getEntries());
			const context = structuredClone(test.initial.session.messages);
			submit(test.terminal, "/focus");
			submit(test.terminal, "/focus");
			expect((await screen(test.terminal)).match(/transformed answer/g)).toHaveLength(1);
			expect(test.initial.sessionManager.getEntries()).toEqual(records);
			expect(test.initial.session.messages).toEqual(context);
		} finally {
			test.cleanup();
		}
	});

	it("reconciles manual compaction without resurrecting archived text or exposing summaries", async () => {
		let keptId = "";
		const test = await setup({
			settings: { compaction: { keepRecentTokens: 1, reserveTokens: 0 } },
			extensionFactories: [
				(pi) => {
					pi.on("session_before_compact", ({ preparation }) => ({
						compaction: {
							summary: "hidden compact summary",
							firstKeptEntryId: keptId,
							tokensBefore: preparation.tokensBefore,
						},
					}));
				},
			],
		});
		try {
			test.initial.sessionManager.appendMessage({ role: "user", content: "archived user", timestamp: 1 });
			test.initial.sessionManager.appendMessage(fauxAssistantMessage("archived answer"));
			keptId = test.initial.sessionManager.appendMessage({ role: "user", content: "retained user", timestamp: 2 });
			test.initial.sessionManager.appendMessage(fauxAssistantMessage("retained answer"));
			test.initial.session.refreshContext();
			await test.mode.init();
			submit(test.terminal, "/focus");
			const unsubscribe = test.initial.session.subscribe((event) => {
				if (event.type === "compaction_start") {
					submit(test.terminal, "/focus");
					submit(test.terminal, "/focus");
				}
			});
			const records = structuredClone(test.initial.sessionManager.getEntries());
			await test.initial.session.compact();
			unsubscribe();
			expect(test.initial.sessionManager.getEntries().slice(0, records.length)).toEqual(records);
			const output = await screen(test.terminal);
			expect(output).not.toContain("archived user");
			expect(output).not.toContain("archived answer");
			expect(output).not.toContain("hidden compact summary");
			expect(output.match(/retained user/g)).toHaveLength(1);
			expect(output.match(/retained answer/g)).toHaveLength(1);
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("[compaction]");
			test.terminal.sendInput("\x0f");
			expect(await screen(test.terminal)).toContain("hidden compact summary");
		} finally {
			test.cleanup();
		}
	});

	it("reconciles a retain-none boundary compaction before continuing without duplicate answers", async () => {
		let compacted = false;
		const test = await setup({
			extensionFactories: [
				(pi) => {
					pi.on("turn_end", () => {
						if (compacted) return;
						compacted = true;
						return {
							entries: [{ type: "compaction", summary: "boundary handoff", firstKeptEntryId: null }],
							continue: true,
						};
					});
				},
			],
		});
		try {
			await test.mode.init();
			submit(test.terminal, "/focus");
			let afterBoundary = "";
			test.initial.setResponses([
				fauxAssistantMessage("discarded answer"),
				async (context) => {
					expect(JSON.stringify(context.messages)).toContain("boundary handoff");
					afterBoundary = await screen(test.terminal);
					submit(test.terminal, "/focus");
					submit(test.terminal, "/focus");
					return fauxAssistantMessage("continued answer");
				},
			]);
			await test.initial.session.prompt("discarded user");
			expect(afterBoundary).not.toContain("discarded user");
			expect(afterBoundary).not.toContain("discarded answer");
			expect(afterBoundary).not.toContain("boundary handoff");
			const output = await screen(test.terminal);
			expect(output.match(/continued answer/g)).toHaveLength(1);
			expect(output).not.toContain("discarded answer");
			expect(test.initial.faux.state.callCount).toBe(2);
		} finally {
			test.cleanup();
		}
	});

	it("toggles during automatic retry without restarting it or presenting failed text", async () => {
		const test = await setup({ settings: { retry: { enabled: true, maxRetries: 2, baseDelayMs: 1 } } });
		try {
			await test.mode.init();
			submit(test.terminal, "/focus");
			let retried = false;
			const unsubscribe = test.initial.session.subscribe((event) => {
				if (event.type === "auto_retry_start") {
					retried = true;
					submit(test.terminal, "/focus");
					submit(test.terminal, "/focus");
				}
			});
			test.initial.setResponses([
				fauxAssistantMessage("failed partial", { stopReason: "error", errorMessage: "overloaded_error" }),
				fauxAssistantMessage("recovered answer"),
			]);
			await test.initial.session.prompt("retry user");
			unsubscribe();
			const output = await screen(test.terminal);
			expect(retried).toBe(true);
			expect(output).not.toContain("failed partial");
			expect(output.match(/retry user/g)).toHaveLength(1);
			expect(output.match(/recovered answer/g)).toHaveLength(1);
			expect(test.initial.faux.state.callCount).toBe(2);
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("failed partial");
		} finally {
			test.cleanup();
		}
	});

	it("updates focused Mermaid diagrams immediately when native settings change", async () => {
		const test = await setup({ settings: { markdown: { mermaid: "off" } } });
		try {
			test.initial.sessionManager.appendMessage(
				fauxAssistantMessage("```mermaid\ngraph TD\n  A[First node] --> B[Second node]\n```"),
			);
			test.initial.session.refreshContext();
			await test.mode.init();
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("graph TD");
			const records = structuredClone(test.initial.sessionManager.getEntries());
			submit(test.terminal, "/settings");
			test.terminal.sendInput("Mermaid");
			test.terminal.sendInput("\r");
			expect(test.initial.settingsManager.getMermaidRenderingMode()).toBe("final");
			test.terminal.sendInput("\x1b");
			const output = await screen(test.terminal);
			expect(output).not.toContain("graph TD");
			expect(output).toContain("First node");
			expect(output).toContain("Second node");
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).not.toContain("graph TD");
			expect(test.initial.sessionManager.getEntries()).toEqual(records);
		} finally {
			test.cleanup();
		}
	});

	it("refreshes Markdown transformations on reload while preserving focus and ordinary preferences", async () => {
		let label = "first rendering";
		const test = await setup({
			settings: { hideThinkingBlock: true },
			extensionFactories: [
				(pi) => {
					pi.registerMarkdownTransformer((markdown) => markdown.replace("rendered answer", label));
					pi.on("session_start", (event, ctx) => {
						ctx.ui.setStatus("lifecycle", event.reason === "reload" ? "reload finished" : "initial load");
					});
				},
			],
		});
		try {
			test.initial.sessionManager.appendMessage(
				fauxAssistantMessage([
					{ type: "thinking", thinking: "ordinary reasoning" },
					{ type: "text", text: "rendered answer" },
				]),
			);
			test.initial.session.refreshContext();
			await test.mode.init();
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("first rendering");
			test.mode.showWarning("diagnostic before reload");
			expect(await screen(test.terminal)).toContain("Focus W:1 E:0");
			const records = structuredClone(test.initial.sessionManager.getEntries());
			const context = structuredClone(test.initial.session.messages);
			label = "reloaded rendering";
			submit(test.terminal, "/reload");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("reload finished"));
			const output = await screen(test.terminal);
			expect(output).toContain("reloaded rendering");
			expect(output).toContain("Focus W:1 E:0");
			expect(output).not.toContain("first rendering");
			expect(output).not.toContain("ordinary reasoning");
			test.mode.showWarning("reload ordinary warning");
			expect(await screen(test.terminal)).not.toContain("reload ordinary warning");
			expect(await screen(test.terminal)).toContain("Focus W:2 E:0");
			expect(test.initial.sessionManager.getEntries()).toEqual(records);
			expect(test.initial.session.messages).toEqual(context);
			expect(test.initial.settingsManager.getHideThinkingBlock()).toBe(true);
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("reload ordinary warning");
		} finally {
			test.cleanup();
		}
	});

	it("toggles during branch summarization and follows the selected branch without showing its summary", async () => {
		let selectedId = "";
		let toggle = () => {};
		const test = await setup({
			extensionFactories: [
				(pi) => {
					pi.registerCommand("select-history", {
						description: "Offline navigation",
						handler: async (_args, ctx) => {
							await ctx.navigateTree(selectedId, { summarize: true });
						},
					});
					pi.on("session_before_tree", () => {
						toggle();
						return { summary: { summary: "hidden branch summary" } };
					});
				},
			],
		});
		try {
			test.initial.sessionManager.appendMessage({ role: "user", content: "selected user", timestamp: 1 });
			selectedId = test.initial.sessionManager.appendMessage(fauxAssistantMessage("selected answer"));
			test.initial.sessionManager.appendMessage({ role: "user", content: "other branch user", timestamp: 2 });
			test.initial.sessionManager.appendMessage(fauxAssistantMessage("other branch answer"));
			test.initial.session.refreshContext();
			await test.mode.init();
			submit(test.terminal, "/focus");
			toggle = () => {
				submit(test.terminal, "/focus");
				submit(test.terminal, "/focus");
			};
			await test.initial.session.prompt("/select-history");
			const output = await screen(test.terminal);
			expect(output.match(/selected answer/g)).toHaveLength(1);
			expect(output).not.toContain("other branch answer");
			expect(output).not.toContain("hidden branch summary");
			expect(test.initial.faux.state.callCount).toBe(0);
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("Branch summary");
		} finally {
			test.cleanup();
		}
	});

	it("clears deferred bash output on session replacement and never reattaches it on the next submission", async () => {
		let started = () => {};
		let release = () => {};
		const toolStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tool: AgentTool = {
			name: "hold",
			label: "Hold",
			description: "Offline held tool",
			parameters: Type.Object({}),
			execute: async (_id, _args, signal, onUpdate) => {
				onUpdate?.({ content: [{ type: "text", text: "active ordinary tool update" }], details: {} });
				signal?.addEventListener("abort", release, { once: true });
				started();
				await held;
				signal?.removeEventListener("abort", release);
				return { content: [{ type: "text", text: "old tool result" }], details: {} };
			},
		};
		const test = await setup({
			tools: [tool],
			extensionFactories: [
				(pi) => {
					pi.registerCommand("render-light", {
						description: "Change rendering while active",
						handler: async (_args, ctx) => {
							ctx.ui.setTheme("light");
						},
					});
					pi.on("user_bash", () => ({
						result: { output: "old pending bash", exitCode: 0, cancelled: false, truncated: false },
					}));
				},
			],
		});
		let prompt: Promise<void> | undefined;
		try {
			await test.mode.init();
			test.mode.showWarning("ordinary transient notice");
			test.initial.setResponses([fauxAssistantMessage([fauxToolCall("hold", {})], { stopReason: "toolUse" })]);
			prompt = test.initial.session.prompt("old session user");
			await toolStarted;
			submit(test.terminal, "/focus");
			await test.initial.session.prompt("/render-light");
			expect(test.initial.session.isStreaming).toBe(true);
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("active ordinary tool update");
			submit(test.terminal, "!!offline-command");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("old pending bash"));
			expect(await screen(test.terminal)).toContain("ordinary transient notice");
			submit(test.terminal, "/focus");
			await test.runtime.newSession();
			await prompt;
			let output = await screen(test.terminal);
			expect(output).not.toContain("old pending bash");
			expect(output).not.toContain("old session user");
			submit(test.terminal, "/focus");
			submit(test.terminal, "new native submission");
			expect(await test.mode.getUserInput()).toBe("new native submission");
			output = await screen(test.terminal);
			expect(output).not.toContain("old pending bash");
			expect(output).not.toContain("ordinary transient notice");
		} finally {
			release();
			await prompt;
			test.cleanup();
		}
	});

	it("retains focus through forks, new sessions and resumed sessions without mixing history", async () => {
		const test = await setup();
		try {
			test.initial.sessionManager.appendMessage({ role: "user", content: "first user", timestamp: 1 });
			const forkId = test.initial.sessionManager.appendMessage(fauxAssistantMessage("first answer"));
			test.initial.sessionManager.appendMessage({ role: "user", content: "later user", timestamp: 2 });
			test.initial.sessionManager.appendMessage(fauxAssistantMessage("later answer"));
			test.initial.session.refreshContext();
			await test.mode.init();
			submit(test.terminal, "/focus");
			test.mode.showError("first session error");
			expect(await screen(test.terminal)).toContain("Focus W:0 E:1");
			await test.runtime.fork(forkId, { position: "at" });
			let output = await screen(test.terminal);
			expect(output).toContain("Focus W:0 E:0");
			expect(output).toContain("first answer");
			expect(output).not.toContain("later answer");
			test.mode.showWarning("fork ordinary warning");
			expect(await screen(test.terminal)).not.toContain("fork ordinary warning");
			expect(await screen(test.terminal)).toContain("Focus W:1 E:0");
			await test.runtime.newSession();
			output = await screen(test.terminal);
			expect(output).toContain("Focus W:0 E:0");
			expect(output).not.toContain("first answer");
			test.current().setResponses([fauxAssistantMessage("new session answer")]);
			await test.runtime.session.prompt("new session user");
			expect(await screen(test.terminal)).toContain("new session answer");
			const selected = SessionManager.create(test.current().tempDir, test.current().tempDir);
			selected.appendMessage({ role: "user", content: "selected user", timestamp: 3 });
			selected.appendMessage(fauxAssistantMessage("selected answer"));
			selected.appendMessage(fauxAssistantMessage("selected historical failure", { stopReason: "error" }));
			test.mode.showWarning("new session warning");
			expect(await screen(test.terminal)).toContain("Focus W:1 E:0");
			await test.runtime.switchSession(selected.getSessionFile()!);
			output = await screen(test.terminal);
			expect(output).toContain("Focus W:0 E:0");
			expect(output).not.toContain("selected historical failure");
			expect(output).toContain("selected answer");
			expect(output).not.toContain("new session answer");
			test.mode.showWarning("selected ordinary warning");
			expect(await screen(test.terminal)).not.toContain("selected ordinary warning");
			expect(await screen(test.terminal)).toContain("Focus W:1 E:0");
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("selected ordinary warning");
			expect(await screen(test.terminal)).toContain("selected historical failure");
			expect(await screen(test.terminal)).not.toContain("Focus W:");
		} finally {
			test.cleanup();
		}
	});
});
