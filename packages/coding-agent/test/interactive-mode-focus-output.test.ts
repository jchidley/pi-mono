import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
	type FauxProviderRegistration,
	fauxAssistantMessage,
	fauxToolCall,
	registerFauxProvider,
} from "@earendil-works/pi-ai/compat";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { createHarness, type HarnessOptions } from "./suite/harness.ts";

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
	const harness = await createHarness({
		...options,
		settings: { theme: "dark", quietStartup: true, showCacheMissNotices: false, ...options.settings },
	});
	const runtime = new AgentSessionRuntime(
		harness.session,
		{
			cwd: harness.tempDir,
			agentDir: harness.tempDir,
			modelRuntime: harness.session.modelRuntime,
			settingsManager: harness.settingsManager,
			resourceLoader: harness.session.resourceLoader,
			diagnostics: [],
		},
		async () => {
			throw new Error("Session replacement is not part of this test");
		},
	);
	writeFileSync(
		join(harness.tempDir, "keybindings.json"),
		JSON.stringify({ "app.transcript.toggleFinalOnly": ["f6"], "app.message.followUp": ["f7"] }),
	);
	vi.stubEnv("PI_CODING_AGENT_DIR", harness.tempDir);
	const terminal = new VirtualTerminal(120, 100);
	const mode = new InteractiveMode(runtime, { tuiMode: "fullscreen", terminal });
	await mode.init();
	return {
		harness,
		terminal,
		mode,
		cleanup: () => {
			mode.stop("resume-hint");
			harness.cleanup();
			vi.unstubAllEnvs();
		},
	};
}

describe("explicit native output in focus", () => {
	it.each([
		{ path: "idle", focused: false },
		{ path: "idle", focused: true },
		{ path: "flushed", focused: false },
		{ path: "flushed", focused: true },
	] as const)(
		"preserves mounted active $path bash through reload in native order (focus=$focused)",
		async ({ path, focused }) => {
			const toolStarted = deferred();
			const toolRelease = deferred();
			const bashStarted = deferred();
			const bashRelease = deferred();
			let executions = 0;
			const tool: AgentTool = {
				name: "hold",
				label: "Hold",
				description: "Offline held tool",
				parameters: Type.Object({}),
				execute: async () => {
					toolStarted.resolve();
					await toolRelease.promise;
					return { content: [{ type: "text", text: "held mounted tool result" }], details: {} };
				},
			};
			const test = await setup({
				tools: [tool],
				extensionFactories: [
					(pi) => {
						pi.on("user_bash", () => ({
							operations: {
								exec: async (_command, _cwd, { onData }) => {
									executions++;
									onData(Buffer.from("mounted active chunk\n"));
									bashStarted.resolve();
									await bashRelease.promise;
									onData(Buffer.from("mounted final chunk\n"));
									return { exitCode: 0 };
								},
							},
						}));
					},
				],
			});
			let prompt: Promise<void> | undefined;
			try {
				test.harness.setResponses(
					path === "flushed"
						? [
								fauxAssistantMessage([fauxToolCall("hold", {})], { stopReason: "toolUse" }),
								fauxAssistantMessage("answer before mounted flush"),
								fauxAssistantMessage("later mounted answer"),
							]
						: [fauxAssistantMessage("later mounted answer")],
				);
				if (focused) submit(test.terminal, "/focus");
				if (path === "flushed") {
					prompt = test.harness.session.prompt("user before mounted flush");
					await toolStarted.promise;
				}
				submit(test.terminal, "!!mounted manual command");
				await bashStarted.promise;
				if (path === "flushed") {
					toolRelease.resolve();
					await prompt;
				}
				submit(test.terminal, "later mounted user");
				expect(await test.mode.getUserInput()).toBe("later mounted user");
				await test.harness.session.prompt("later mounted user");
				let output = await screen(test.terminal);
				expect(output.indexOf("mounted active chunk")).toBeLessThan(output.indexOf("later mounted user"));
				const records = structuredClone(test.harness.sessionManager.getEntries());
				submit(test.terminal, "/reload");
				await vi.waitFor(async () =>
					expect(await screen(test.terminal)).toContain("Reloaded keybindings, extensions"),
				);
				expect(test.harness.session.isBashRunning).toBe(true);
				expect(test.harness.sessionManager.getEntries()).toEqual(records);
				for (let view = 0; view < 2; view++) {
					output = await screen(test.terminal);
					expect(output.split("\n").filter((line) => line.trim() === "mounted active chunk")).toHaveLength(1);
					expect(output.indexOf("mounted active chunk")).toBeLessThan(output.indexOf("later mounted user"));
					expect(output.indexOf("later mounted user")).toBeLessThan(output.indexOf("later mounted answer"));
					if (path === "flushed")
						expect(output.indexOf("answer before mounted flush")).toBeLessThan(
							output.indexOf("mounted active chunk"),
						);
					submit(test.terminal, "/focus");
				}
				bashRelease.resolve();
				await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("mounted final chunk"));
				for (let view = 0; view < 2; view++) {
					output = await screen(test.terminal);
					expect(output.split("\n").filter((line) => line.trim() === "mounted active chunk")).toHaveLength(1);
					expect(output.split("\n").filter((line) => line.trim() === "mounted final chunk")).toHaveLength(1);
					expect(output.indexOf("mounted final chunk")).toBeLessThan(output.indexOf("later mounted user"));
					submit(test.terminal, "/focus");
				}
				expect(executions).toBe(1);
				expect(test.harness.session.messages.filter((message) => message.role === "bashExecution")).toEqual([
					expect.objectContaining({ command: "mounted manual command", excludeFromContext: true }),
				]);
			} finally {
				bashRelease.resolve();
				toolRelease.resolve();
				await prompt;
				await screen(test.terminal);
				test.cleanup();
			}
		},
	);

	it.each([false, true])("preserves active deferred bash across reload and submission (focus=%s)", async (focused) => {
		const toolStarted = deferred();
		const toolRelease = deferred();
		const bashStarted = deferred();
		const bashRelease = deferred();
		const tool: AgentTool = {
			name: "hold",
			label: "Hold",
			description: "Offline held tool",
			parameters: Type.Object({}),
			execute: async () => {
				toolStarted.resolve();
				await toolRelease.promise;
				return { content: [{ type: "text", text: "held result" }], details: {} };
			},
		};
		const test = await setup({
			tools: [tool],
			extensionFactories: [
				(pi) => {
					pi.on("user_bash", () => ({
						operations: {
							exec: async (_command, _cwd, { onData }) => {
								onData(Buffer.from("active dock chunk\n"));
								bashStarted.resolve();
								await bashRelease.promise;
								onData(Buffer.from("completed dock tail\n"));
								return { exitCode: 0 };
							},
						},
					}));
				},
			],
		});
		let prompt: Promise<void> | undefined;
		try {
			test.harness.setResponses([
				fauxAssistantMessage([fauxToolCall("hold", {})], { stopReason: "toolUse" }),
				fauxAssistantMessage("answer before active reload"),
			]);
			if (focused) submit(test.terminal, "/focus");
			prompt = test.harness.session.prompt("user before active reload");
			await toolStarted.promise;
			submit(test.terminal, "!!active dock command");
			await bashStarted.promise;
			toolRelease.resolve();
			await prompt;
			submit(test.terminal, "/reload");
			await vi.waitFor(async () =>
				expect(await screen(test.terminal)).toContain("Reloaded keybindings, extensions"),
			);
			expect(test.harness.session.isBashRunning).toBe(true);
			expect(
				(await screen(test.terminal)).split("\n").filter((line) => line.trim() === "active dock chunk"),
			).toHaveLength(1);
			bashRelease.resolve();
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("completed dock tail"));
			submit(test.terminal, "user after active reload");
			expect(await test.mode.getUserInput()).toBe("user after active reload");
			for (let view = 0; view < 2; view++) {
				const output = await screen(test.terminal);
				expect(output.split("\n").filter((line) => line.trim() === "active dock chunk")).toHaveLength(1);
				expect(output.split("\n").filter((line) => line.trim() === "completed dock tail")).toHaveLength(1);
				expect(output.indexOf("answer before active reload")).toBeLessThan(output.indexOf("active dock chunk"));
				submit(test.terminal, "/focus");
			}
			expect(test.harness.session.messages.filter((message) => message.role === "bashExecution")).toEqual([
				expect.objectContaining({ command: "active dock command", excludeFromContext: true }),
			]);
		} finally {
			bashRelease.resolve();
			toolRelease.resolve();
			await prompt;
			await screen(test.terminal);
			test.cleanup();
		}
	});

	it.each([false, true])(
		"reconciles completed deferred bash across reload and submission (focus=%s)",
		async (focused) => {
			const started = deferred();
			const release = deferred();
			const tool: AgentTool = {
				name: "hold",
				label: "Hold",
				description: "Offline held tool",
				parameters: Type.Object({}),
				execute: async () => {
					started.resolve();
					await release.promise;
					return { content: [{ type: "text", text: "held agent tool result" }], details: {} };
				},
			};
			const test = await setup({
				tools: [tool],
				extensionFactories: [
					(pi) => {
						pi.on("user_bash", () => ({
							result: { output: "completed dock output", exitCode: 0, cancelled: false, truncated: false },
						}));
					},
				],
			});
			let prompt: Promise<void> | undefined;
			let reloadedFaux: FauxProviderRegistration | undefined;
			try {
				test.harness.setResponses([
					fauxAssistantMessage([fauxToolCall("hold", {})], { stopReason: "toolUse" }),
					fauxAssistantMessage("answer before reload"),
				]);
				if (focused) submit(test.terminal, "/focus");
				prompt = test.harness.session.prompt("user before reload");
				await started.promise;
				submit(test.terminal, "!completed dock command");
				await vi.waitFor(() => expect(test.harness.session.hasPendingBashMessages).toBe(true));
				release.resolve();
				await prompt;
				const records = structuredClone(test.harness.sessionManager.getEntries());
				submit(test.terminal, "/reload");
				await vi.waitFor(async () =>
					expect(await screen(test.terminal)).toContain("Reloaded keybindings, extensions"),
				);
				let output = await screen(test.terminal);
				expect(output.split("\n").filter((line) => line.trim() === "completed dock output")).toHaveLength(1);
				expect(test.harness.sessionManager.getEntries()).toEqual(records);
				submit(test.terminal, "user after reload");
				expect(await test.mode.getUserInput()).toBe("user after reload");
				// Reload clears temporary API registrations. Re-register a faux provider for this turn.
				reloadedFaux = registerFauxProvider();
				await test.harness.session.setModel(reloadedFaux.getModel());
				reloadedFaux.setResponses([fauxAssistantMessage("answer after reload")]);
				await test.harness.session.prompt("user after reload");
				for (let view = 0; view < 2; view++) {
					output = await screen(test.terminal);
					expect(output).toContain("answer after reload");
					expect(output.split("\n").filter((line) => line.trim() === "completed dock output")).toHaveLength(1);
					expect(output.indexOf("answer before reload")).toBeLessThan(output.indexOf("completed dock output"));
					expect(output.indexOf("completed dock output")).toBeLessThan(output.indexOf("user after reload"));
					expect(output.indexOf("user after reload")).toBeLessThan(output.indexOf("answer after reload"));
					submit(test.terminal, "/focus");
				}
				expect(test.harness.session.messages.filter((message) => message.role === "bashExecution")).toHaveLength(1);
			} finally {
				release.resolve();
				await prompt;
				reloadedFaux?.unregister();
				test.cleanup();
			}
		},
	);

	it.each(["native", "extension"] as const)("routes reload completion by its %s invocation origin", async (origin) => {
		let reloads = 0;
		const test = await setup({
			extensionFactories: [
				(pi) => {
					pi.registerCommand("extension-reload", {
						description: "Offline extension reload",
						handler: async (_args, ctx) => {
							await ctx.reload();
						},
					});
					pi.on("session_start", (event, ctx) => {
						if (event.reason === "reload") {
							reloads++;
							ctx.ui.setStatus("reload", "reload lifecycle complete");
						}
					});
				},
			],
		});
		try {
			submit(test.terminal, "/focus");
			if (origin === "native") {
				submit(test.terminal, "/reload");
				await vi.waitFor(async () =>
					expect(await screen(test.terminal)).toContain("Reloaded keybindings, extensions"),
				);
			} else {
				await test.harness.session.prompt("/extension-reload");
			}
			expect(reloads).toBe(1);
			let output = await screen(test.terminal);
			expect(output).toContain("reload lifecycle complete");
			if (origin === "native") expect(output).toContain("Reloaded keybindings, extensions");
			else expect(output).not.toContain("Reloaded keybindings, extensions");
			submit(test.terminal, "/focus");
			output = await screen(test.terminal);
			expect(output).toContain("Reloaded keybindings, extensions");
			expect(test.harness.faux.state.callCount).toBe(0);
			expect(test.harness.session.messages).toEqual([]);
		} finally {
			test.cleanup();
		}
	});
	it.each(["native", "extension"] as const)(
		"preserves only newly requested native tree summary output (%s origin)",
		async (origin) => {
			let targetId = "";
			const test = await setup({
				settings: { showCacheMissNotices: true },
				extensionFactories: [
					(pi) => {
						pi.registerCommand("extension-tree", {
							description: "Offline extension navigation",
							handler: async (_args, ctx) => {
								await ctx.navigateTree(targetId, { summarize: true });
							},
						});
						pi.on("session_before_tree", () => ({
							summary: {
								summary: "new branch summary",
								usage: { ...fauxAssistantMessage("offline usage").usage, input: 1234 },
							},
						}));
					},
				],
			});
			try {
				const manager = test.harness.sessionManager;
				const root = manager.appendMessage({ role: "user", content: "tree root", timestamp: 1 });
				manager.branchWithSummary(root, "historical branch summary", undefined, true, {
					...fauxAssistantMessage("offline usage").usage,
					input: 2345,
				});
				targetId = manager.appendMessage(fauxAssistantMessage("tree target answer"));
				manager.appendMessage({ role: "user", content: "departing branch user", timestamp: 2 });
				manager.appendMessage(fauxAssistantMessage("departing branch answer"));
				test.harness.session.refreshContext();
				test.mode.renderInitialMessages();
				submit(test.terminal, "/focus");
				if (origin === "native") {
					submit(test.terminal, "/tree");
					test.terminal.sendInput("tree target answer");
					test.terminal.sendInput("\r");
					expect(await screen(test.terminal)).toContain("Summarize branch?");
					test.terminal.sendInput("\x1b[B");
					test.terminal.sendInput("\r");
					await vi.waitFor(async () =>
						expect(await screen(test.terminal)).toContain("Navigated to selected point"),
					);
				} else {
					await test.harness.session.prompt("/extension-tree");
				}
				test.terminal.sendInput("\x0f");
				let output = await screen(test.terminal);
				if (origin === "native") {
					expect(output).toContain("new branch summary");
					expect(output).toContain("Branch summary: 1.2k tokens billed");
				} else {
					expect(output).not.toContain("new branch summary");
					expect(output).not.toContain("Branch summary: 1.2k tokens billed");
				}
				expect(output).not.toContain("historical branch summary");
				expect(output).not.toContain("Branch summary: 2.3k tokens billed");
				expect(output).not.toContain("departing branch answer");
				submit(test.terminal, "/focus");
				output = await screen(test.terminal);
				expect(output.match(/new branch summary/g)).toHaveLength(1);
				expect(output).toContain("historical branch summary");
				expect(output).toContain("Branch summary: 1.2k tokens billed");
				expect(output).toContain("Branch summary: 2.3k tokens billed");
				expect(test.harness.faux.state.callCount).toBe(0);
			} finally {
				test.cleanup();
			}
		},
	);
	it("preserves an extension dialog and editor restoration during manual bash interception", async () => {
		const started = deferred();
		const test = await setup({
			extensionFactories: [
				(pi) => {
					pi.on("user_bash", async (_event, ctx) => {
						started.resolve();
						const choice = await ctx.ui.select("Route the manual command?", ["Route", "Cancel"]);
						return {
							result: {
								output: choice === "Route" ? "dialog-routed output" : "declined route",
								exitCode: 0,
								cancelled: choice !== "Route",
								truncated: false,
							},
						};
					});
				},
			],
		});
		try {
			submit(test.terminal, "/focus");
			submit(test.terminal, "!route via dialog");
			await started.promise;
			expect(await screen(test.terminal)).toContain("Route the manual command?");
			test.terminal.sendInput("\r");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("dialog-routed output"));
			test.terminal.sendInput("\x1b[200~restored editor draft\x1b[201~");
			test.terminal.sendInput("\x1b[17~");
			expect(await screen(test.terminal)).toContain("restored editor draft");
			test.terminal.sendInput("\x1b[17~");
			const output = await screen(test.terminal);
			expect(output).toContain("restored editor draft");
			expect(output).toContain("dialog-routed output");
			expect(test.harness.faux.state.callCount).toBe(0);
			expect(test.harness.session.pendingMessageCount).toBe(0);
		} finally {
			test.cleanup();
		}
	});
	it("preserves native compact completion output without restoring summaries from unsolicited compaction", async () => {
		const test = await setup({
			settings: { compaction: { keepRecentTokens: 1, reserveTokens: 0 }, showCacheMissNotices: true },
			extensionFactories: [
				(pi) => {
					pi.on("session_before_compact", ({ preparation }) => ({
						compaction: {
							summary: "explicit native compact summary",
							firstKeptEntryId: preparation.firstKeptEntryId,
							tokensBefore: preparation.tokensBefore,
							usage: { ...fauxAssistantMessage("offline usage").usage, input: 1234 },
						},
					}));
				},
			],
		});
		try {
			test.harness.sessionManager.appendMessage({ role: "user", content: "compact this", timestamp: 1 });
			test.harness.sessionManager.appendMessage(fauxAssistantMessage("old answer"));
			test.harness.session.refreshContext();
			test.mode.renderInitialMessages();
			submit(test.terminal, "/focus");
			submit(test.terminal, "/compact");
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("[compaction]"));
			expect(await screen(test.terminal)).toContain("Compaction: 1.2k tokens billed");
			test.terminal.sendInput("\x0f"); // Native expansion still operates on the shared component.
			expect(await screen(test.terminal)).toContain("explicit native compact summary");
			submit(test.terminal, "/focus");
			expect((await screen(test.terminal)).match(/explicit native compact summary/g)).toHaveLength(1);
			expect(test.harness.faux.state.callCount).toBe(0);
		} finally {
			test.cleanup();
		}
	});
	it("fails closed when asynchronous interception throws, with visible native failure output", async () => {
		const release = deferred();
		const started = deferred();
		let interceptions = 0;
		const test = await setup({
			extensionFactories: [
				(pi) => {
					pi.on("user_bash", async () => {
						interceptions++;
						started.resolve();
						await release.promise;
						throw new Error("interception rejected");
					});
				},
			],
		});
		try {
			const marker = join(test.harness.tempDir, "must-not-execute");
			submit(test.terminal, "/focus");
			submit(test.terminal, `!printf fallback > '${marker}'`);
			await started.promise;
			test.terminal.sendInput("\x1b[17~");
			test.terminal.sendInput("\x1b[17~");
			release.resolve();
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("interception rejected"));
			expect(existsSync(marker)).toBe(false);
			expect(test.harness.session.messages).toEqual([]);
			expect(test.harness.faux.state.callCount).toBe(0);
			submit(test.terminal, "!!printf 'next manual command\\n'");
			// The same rejecting interceptor handles the second command: reservation must have cleared.
			await vi.waitFor(() => expect(interceptions).toBe(2));
			expect(await screen(test.terminal)).not.toContain("A bash command is already running");
		} finally {
			release.resolve();
			test.cleanup();
		}
	});

	it("keeps native status output intact when unrelated extension notifications follow it", async () => {
		const test = await setup({
			extensionFactories: [
				(pi) => {
					pi.registerCommand("background-notice", {
						description: "Offline extension notice",
						handler: async (_args, ctx) => {
							ctx.ui.notify("unsolicited replacement status");
						},
					});
				},
			],
		});
		try {
			submit(test.terminal, "/focus");
			submit(test.terminal, `/export ${join(test.harness.tempDir, "export.jsonl")}`);
			await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("Session exported to:"));
			await test.harness.session.prompt("/background-notice");
			let output = await screen(test.terminal);
			expect(output).toContain("Session exported to:");
			expect(output).not.toContain("unsolicited replacement status");
			submit(test.terminal, "/focus");
			output = await screen(test.terminal);
			expect(output).toContain("Session exported to:");
			expect(output).toContain("unsolicited replacement status");
			expect(test.harness.faux.state.callCount).toBe(0);
		} finally {
			test.cleanup();
		}
	});
	it.each(["operations", "result"] as const)(
		"retains deferred %s bash alongside queue controls while hiding agent tools and extension transcript output",
		async (path) => {
			const toolStarted = deferred();
			const toolRelease = deferred();
			const bashStarted = deferred();
			const bashRelease = deferred();
			const tool: AgentTool = {
				name: "bash",
				label: "Agent shell",
				description: "Offline held shell tool",
				parameters: Type.Object({}),
				execute: async (_id, _args, _signal, onUpdate) => {
					onUpdate?.({ content: [{ type: "text", text: "agent shell partial" }], details: {} });
					toolStarted.resolve();
					await toolRelease.promise;
					return { content: [{ type: "text", text: "agent shell final" }], details: {} };
				},
			};
			const test = await setup({
				tools: [tool],
				extensionFactories: [
					(pi) => {
						pi.on("session_start", () => {
							pi.sendMessage(
								{ customType: "background", content: "unsolicited extension message", display: true },
								{ triggerTurn: false },
							);
						});
						pi.on("user_bash", async (_event, ctx) => {
							ctx.ui.notify("unsolicited extension notice");
							if (path === "result") {
								bashStarted.resolve();
								await bashRelease.promise;
								return {
									result: {
										output: "deferred manual output",
										exitCode: 0,
										cancelled: false,
										truncated: false,
									},
								};
							}
							return {
								operations: {
									exec: async (_command, _cwd, { onData }) => {
										onData(Buffer.from("deferred manual output\n"));
										bashStarted.resolve();
										await bashRelease.promise;
										return { exitCode: 0 };
									},
								},
							};
						});
					},
				],
			});
			let prompt: Promise<void> | undefined;
			try {
				test.harness.setResponses([
					fauxAssistantMessage([fauxToolCall("bash", {})], { stopReason: "toolUse" }),
					fauxAssistantMessage("agent final answer"),
					fauxAssistantMessage("follow-up answer"),
				]);
				submit(test.terminal, "/focus");
				prompt = test.harness.session.prompt("user before manual bash");
				await toolStarted.promise;
				submit(test.terminal, "!!manual during tool");
				await bashStarted.promise;
				if (path === "result") bashRelease.resolve();
				await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("deferred manual output"));
				test.terminal.sendInput("\x1b[200~queued follow-up\x1b[201~");
				test.terminal.sendInput("\x1b[18~");
				let output = await screen(test.terminal);
				expect(output).toContain("Follow-up: queued follow-up");
				expect(output).toContain("deferred manual output");
				expect(output).not.toContain("agent shell partial");
				expect(output).not.toContain("unsolicited extension notice");
				expect(output).not.toContain("unsolicited extension message");
				test.terminal.sendInput("\x1b[17~");
				output = await screen(test.terminal);
				for (const text of [
					"agent shell partial",
					"unsolicited extension notice",
					"unsolicited extension message",
					"deferred manual output",
					"Follow-up: queued follow-up",
				])
					expect(output).toContain(text);
				test.terminal.sendInput("\x1b[17~");
				expect(await screen(test.terminal)).not.toContain("agent shell partial");
				expect(test.harness.session.pendingMessageCount).toBe(1);
				expect(test.harness.faux.state.callCount).toBe(1);
				bashRelease.resolve();
				await vi.waitFor(() => expect(test.harness.session.hasPendingBashMessages).toBe(true));
				toolRelease.resolve();
				await prompt;
				output = await screen(test.terminal);
				expect(output).toContain("agent final answer");
				expect(output).toContain("follow-up answer");
				expect(output).toContain("deferred manual output");
				expect(output).not.toContain("agent shell final");
				submit(test.terminal, "user after dock flush");
				expect(await test.mode.getUserInput()).toBe("user after dock flush");
				test.harness.setResponses([fauxAssistantMessage("answer after dock flush")]);
				await test.harness.session.prompt("user after dock flush");
				output = await screen(test.terminal);
				expect(output.split("\n").filter((line) => line.trim() === "deferred manual output")).toHaveLength(1);
				expect(output.indexOf("agent final answer")).toBeLessThan(output.indexOf("deferred manual output"));
				expect(output.indexOf("deferred manual output")).toBeLessThan(output.indexOf("user after dock flush"));
				expect(test.harness.session.messages.filter((message) => message.role === "bashExecution")).toHaveLength(1);
				expect(test.harness.session.pendingMessageCount).toBe(0);
			} finally {
				bashRelease.resolve();
				toolRelease.resolve();
				await prompt;
				test.cleanup();
			}
		},
	);
	it.each([false, true])(
		"toggles during asynchronous interception (cancelled=%s) without accepting overlapping bash or submitting a draft",
		async (cancelled) => {
			const started = deferred();
			const release = deferred();
			let interceptions = 0;
			const test = await setup({
				extensionFactories: [
					(pi) => {
						pi.on("session_start", (_event, ctx) => {
							ctx.ui.setHeader(() => new Text("extension header preserved", 0, 0));
							ctx.ui.setWidget("test", ["extension widget preserved"]);
							ctx.ui.setStatus("test", "extension status preserved");
						});
						pi.on("user_bash", async () => {
							interceptions++;
							started.resolve();
							await release.promise;
							return {
								result: { output: "intercepted shell result", exitCode: 7, cancelled, truncated: false },
							};
						});
					},
				],
			});
			try {
				submit(test.terminal, "/focus");
				submit(test.terminal, "!!intercept this");
				await started.promise;
				submit(test.terminal, "/name during interception");
				expect(await screen(test.terminal)).toContain("Session name set: during interception");
				submit(test.terminal, "!must not overlap interception");
				expect(await screen(test.terminal)).toContain("A bash command is already running");
				expect(interceptions).toBe(1);
				test.terminal.sendInput("\x15");
				test.terminal.sendInput("\x1b[200~unsubmitted draft\x1b[201~");
				test.terminal.sendInput("\x1b[17~");
				test.terminal.sendInput("\x1b[17~");
				let output = await screen(test.terminal);
				for (const text of [
					"unsubmitted draft",
					"extension header preserved",
					"extension widget preserved",
					"extension status preserved",
				])
					expect(output).toContain(text);
				release.resolve();
				await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("intercepted shell result"));
				output = await screen(test.terminal);
				expect(output).toContain(cancelled ? "(cancelled)" : "(exit 7)");
				expect(output).toContain("unsubmitted draft");
				expect(test.harness.session.messages).toHaveLength(1);
				expect(test.harness.session.messages[0]).toMatchObject({ role: "bashExecution", excludeFromContext: true });
				expect(test.harness.faux.state.callCount).toBe(0);
				expect(test.harness.session.pendingMessageCount).toBe(0);
			} finally {
				release.resolve();
				test.cleanup();
			}
		},
	);
	it.each(["complete", "cancel", "fail"] as const)(
		"keeps streaming manual bash visible across toggles through %s",
		async (ending) => {
			const started = deferred();
			const release = deferred();
			let executions = 0;
			const test = await setup({
				extensionFactories: [
					(pi) => {
						pi.on("user_bash", () => ({
							operations: {
								exec: async (_command, _cwd, { onData, signal }) => {
									executions++;
									onData(Buffer.from("live manual chunk\n"));
									signal?.addEventListener("abort", release.resolve, { once: true });
									started.resolve();
									await release.promise;
									signal?.removeEventListener("abort", release.resolve);
									if (ending === "fail") throw new Error("manual execution failure");
									if (!signal?.aborted) onData(Buffer.from("last manual chunk\n"));
									return { exitCode: signal?.aborted ? 130 : 0 };
								},
							},
						}));
					},
				],
			});
			try {
				submit(test.terminal, "/focus");
				submit(test.terminal, "!controlled shell");
				await started.promise;
				expect(await screen(test.terminal)).toContain("live manual chunk");
				submit(test.terminal, "/focus");
				expect(await screen(test.terminal)).toContain("live manual chunk");
				submit(test.terminal, "/focus");
				expect(await screen(test.terminal)).toContain("live manual chunk");
				expect(test.harness.session.isBashRunning).toBe(true);
				submit(test.terminal, "!!must not execute");
				expect(await screen(test.terminal)).toContain("A bash command is already running");
				expect(executions).toBe(1);
				test.terminal.sendInput("\x15");
				if (ending === "cancel") test.terminal.sendInput("\x1b");
				else release.resolve();
				await vi.waitFor(() => expect(test.harness.session.isBashRunning).toBe(false));
				const expected =
					ending === "complete"
						? "last manual chunk"
						: ending === "cancel"
							? "(cancelled)"
							: "Bash command failed: manual execution failure";
				await vi.waitFor(async () => expect(await screen(test.terminal)).toContain(expected));
				submit(test.terminal, "/focus");
				expect(await screen(test.terminal)).toContain(expected);
				expect(test.harness.faux.state.callCount).toBe(0);
				expect(test.harness.session.pendingMessageCount).toBe(0);
			} finally {
				release.resolve();
				await test.harness.session.waitForIdle();
				test.cleanup();
			}
		},
	);
	it.each([
		["/name", "Usage: /name <name>"],
		["/copy", "No agent messages to copy yet."],
		["/import", "Usage: /import <path.jsonl>"],
		["/thinking invalid-level", "Unknown thinking level"],
	])(
		"preserves explicit %s validation output, but not subsequent unsolicited diagnostics",
		async (command, expected) => {
			const test = await setup();
			try {
				submit(test.terminal, "/focus");
				submit(test.terminal, command);
				await vi.waitFor(async () => expect(await screen(test.terminal)).toContain(expected));
				test.mode.showError("background error after command");
				expect(await screen(test.terminal)).not.toContain("background error after command");
				submit(test.terminal, "/focus");
				const output = await screen(test.terminal);
				expect(output).toContain(expected);
				expect(output).toContain("background error after command");
				expect(test.harness.faux.state.callCount).toBe(0);
				expect(test.harness.session.messages).toEqual([]);
			} finally {
				test.cleanup();
			}
		},
	);
	it.each([
		["!", true],
		["!!", true],
		["!", false],
		["!!", false],
	] as const)(
		"shows normal %s bash results (startedFocused=%s) through toggles without changing context inclusion",
		async (prefix, startedFocused) => {
			const test = await setup();
			try {
				if (startedFocused) submit(test.terminal, "/focus");
				submit(test.terminal, `${prefix}printf 'manual result\\n'`);
				await vi.waitFor(async () => expect(await screen(test.terminal)).toContain("manual result"));
				await vi.waitFor(() => expect(test.harness.session.isBashRunning).toBe(false));
				const message = test.harness.session.messages.find((message) => message.role === "bashExecution");
				expect(message).toMatchObject({
					output: "manual result\n",
					excludeFromContext: prefix === "!!",
					exitCode: 0,
				});
				const records = structuredClone(test.harness.sessionManager.getEntries());
				submit(test.terminal, "/focus");
				expect(await screen(test.terminal)).toContain("manual result");
				submit(test.terminal, "/focus");
				expect(
					(await screen(test.terminal)).split("\n").filter((line) => line.trim() === "manual result"),
				).toHaveLength(1);
				expect(test.harness.sessionManager.getEntries()).toEqual(records);
				expect(test.harness.faux.state.callCount).toBe(0);
				test.harness.setResponses([
					(context) => {
						const modelInput = JSON.stringify(context.messages);
						if (prefix === "!") expect(modelInput).toContain("manual result");
						else expect(modelInput).not.toContain("manual result");
						return fauxAssistantMessage("after manual answer");
					},
				]);
				await test.harness.session.prompt("continue after manual bash");
				expect(test.harness.faux.state.callCount).toBe(1);
			} finally {
				test.cleanup();
			}
		},
	);
	it.each([
		["/hotkeys", "Keyboard Shortcuts", "Move cursor / browse history"],
		["/changelog", "What's New", "Added"],
	])("keeps the native %s document scrollable in both views", async (command, title, body) => {
		const test = await setup();
		try {
			submit(test.terminal, "/focus");
			submit(test.terminal, command);
			await screen(test.terminal);
			test.terminal.sendInput("\x1b[H"); // Native fullscreen Home, not a separate command viewer.
			let output = await screen(test.terminal);
			expect(output).toContain(title);
			expect(output).toContain(body);
			submit(test.terminal, "/focus");
			await screen(test.terminal);
			test.terminal.sendInput("\x1b[H");
			output = await screen(test.terminal);
			expect(output).toContain(title);
			expect(output).toContain(body);
			expect(test.harness.faux.state.callCount).toBe(0);
			expect(test.harness.session.messages).toEqual([]);
		} finally {
			test.cleanup();
		}
	});
	it("keeps native name and session output inline in both views without exposing background output", async () => {
		const test = await setup();
		try {
			test.mode.showWarning("unsolicited diagnostic");
			submit(test.terminal, "/focus");
			submit(test.terminal, "/name deliberate name");
			let output = await screen(test.terminal);
			expect(output).toContain("Session name set: deliberate name");
			submit(test.terminal, "/session");
			output = await screen(test.terminal);
			expect(output).toContain("Session Info");
			expect(output).toContain("Session name set: deliberate name");
			expect(output.indexOf("Session name set:")).toBeLessThan(output.indexOf("Session Info"));
			expect(output).not.toContain("unsolicited diagnostic");
			submit(test.terminal, "/focus");
			output = await screen(test.terminal);
			for (const text of ["Session Info", "Session name set: deliberate name", "unsolicited diagnostic"])
				expect(output).toContain(text);
			submit(test.terminal, "/focus");
			expect((await screen(test.terminal)).match(/Session Info/g)).toHaveLength(1);
			expect(test.harness.faux.state.callCount).toBe(0);
			expect(test.harness.session.messages).toEqual([]);
			expect(test.harness.session.pendingMessageCount).toBe(0);
		} finally {
			test.cleanup();
		}
	});
});
