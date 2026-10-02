import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/compat";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { KEYBINDINGS, KeybindingsManager } from "../src/core/keybindings.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import * as toolsManager from "../src/utils/tools-manager.ts";
import { createHarness, type Harness } from "./suite/harness.ts";

function createMode(harness: Harness, terminal: VirtualTerminal, tuiMode: "fullscreen" | "regular") {
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
			throw new Error("Session replacement is outside Ticket 02");
		},
	);
	return new InteractiveMode(runtime, { tuiMode, terminal });
}

function submit(terminal: VirtualTerminal, text: string) {
	terminal.sendInput(`\x1b[200~${text}\x1b[201~`);
	terminal.sendInput("\r");
}

async function screen(terminal: VirtualTerminal) {
	await terminal.waitForRender();
	return terminal.getViewport().join("\n");
}

describe("live fullscreen focus", () => {
	it("counts extension handler errors quietly while preserving their exact ordinary text and stack", async () => {
		const harness = await createHarness({
			settings: { theme: "dark", quietStartup: true, showCacheMissNotices: false },
			extensionFactories: [
				{
					path: "/offline/focus-extension.ts",
					factory: (pi) => {
						pi.on("before_agent_start", () => {
							const error = new Error("extension failure detail");
							error.stack = "Error: extension failure detail\n    at offline-handler (focus-extension.ts:1:1)";
							throw error;
						});
					},
				},
			],
		});
		const terminal = new VirtualTerminal(120, 50);
		const mode = createMode(harness, terminal, "fullscreen");
		try {
			await mode.init();
			submit(terminal, "/focus");
			harness.setResponses([fauxAssistantMessage("answer after extension error")]);
			await harness.session.prompt("extension error user");
			let output = await screen(terminal);
			expect(output).toContain("Focus W:0 E:1");
			expect(output).toContain("answer after extension error");
			expect(output).not.toContain("extension failure detail");
			expect(output).not.toContain("offline-handler");
			submit(terminal, "/focus");
			output = await screen(terminal);
			expect(output).toMatch(/^ Extension "\/offline\/focus-extension.ts" error: extension failure detail\s*$/m);
			expect(output).toMatch(/^ {3}at offline-handler \(focus-extension.ts:1:1\)\s*$/m);
			expect(output).not.toContain("Error: extension failure detail");
			expect(harness.faux.state.callCount).toBe(1);
		} finally {
			mode.stop("resume-hint");
			harness.cleanup();
		}
	});

	it("counts automatic compaction failure while keeping its unprefixed ordinary diagnostic intact", async () => {
		const harness = await createHarness({
			models: [{ id: "faux-1", contextWindow: 1000, maxTokens: 100 }],
			settings: {
				theme: "dark",
				quietStartup: true,
				showCacheMissNotices: false,
				retry: { enabled: false },
				compaction: { enabled: true, keepRecentTokens: 1, reserveTokens: 0 },
			},
		});
		const terminal = new VirtualTerminal(120, 50);
		const mode = createMode(harness, terminal, "fullscreen");
		try {
			await mode.init();
			submit(terminal, "/focus");
			harness.setResponses([
				fauxAssistantMessage("successful answer before compaction"),
				fauxAssistantMessage("", { stopReason: "error", errorMessage: "offline summary failure" }),
			]);
			await harness.session.prompt(`auto compact user ${"x".repeat(5000)}`);
			const failure = "Context overflow recovery failed: Turn prefix summarization failed: offline summary failure";
			expect(harness.eventsOfType("compaction_end")).toEqual([
				expect.objectContaining({ reason: "overflow", errorMessage: failure, aborted: false }),
			]);
			let output = await screen(terminal);
			expect(output).toContain("Focus W:0 E:1");
			expect(output).toContain("successful answer before compaction");
			expect(output).not.toContain(failure);
			submit(terminal, "/focus");
			output = await screen(terminal);
			expect(output.split("\n").map((line) => line.trim())).toContain(failure);
			expect(output).not.toContain(`Error: ${failure}`);
			expect(harness.faux.state.callCount).toBe(2);
		} finally {
			mode.stop("resume-hint");
			harness.cleanup();
		}
	});

	it("counts typed managed-tool warnings but not install progress, without exposing unsolicited text", async () => {
		// Simulate the machine's managed dependency installer through its status callback, not private UI methods.
		const reporters: Array<NonNullable<Parameters<typeof toolsManager.ensureTool>[1]>> = [];
		const installer = vi.spyOn(toolsManager, "ensureTool").mockImplementation(async (_tool, onStatus) => {
			if (onStatus) reporters.push(onStatus);
			return undefined;
		});
		const harness = await createHarness({
			settings: { theme: "dark", quietStartup: true, showCacheMissNotices: false },
		});
		const terminal = new VirtualTerminal(120, 50);
		const mode = createMode(harness, terminal, "fullscreen");
		try {
			await mode.init();
			submit(terminal, "/focus");
			reporters[0]({ type: "info", message: "Downloading managed dependency" });
			expect(await screen(terminal)).toContain("Focus W:0 E:0");
			reporters[0]({ type: "warning", message: "managed dependency unavailable" });
			reporters[1]({ type: "info", message: "Other dependency installed" });
			let output = await screen(terminal);
			expect(output).toContain("Focus W:1 E:0");
			expect(output).not.toContain("managed dependency unavailable");
			expect(output).not.toContain("Downloading managed dependency");
			expect(output).not.toContain("Other dependency installed");
			submit(terminal, "/focus");
			output = await screen(terminal);
			const ordinaryLines = output.split("\n").map((line) => line.trim());
			expect(ordinaryLines).toContain("Downloading managed dependency");
			expect(ordinaryLines).toContain("Warning: managed dependency unavailable");
			expect(ordinaryLines).toContain("Other dependency installed");
			expect(harness.faux.state.callCount).toBe(0);
			expect(harness.session.messages).toEqual([]);
		} finally {
			mode.stop("resume-hint");
			harness.cleanup();
			installer.mockRestore();
		}
	});

	it("keeps warning-colored cache, billing and update notices informational", async () => {
		const harness = await createHarness({
			settings: {
				theme: "dark",
				quietStartup: true,
				showCacheMissNotices: true,
				compaction: { keepRecentTokens: 1, reserveTokens: 0 },
			},
			extensionFactories: [
				(pi) => {
					pi.on("message_end", ({ message }) => {
						if (message.role === "assistant")
							return {
								message: { ...message, usage: { ...message.usage, input: 30000, cacheRead: 0, cacheWrite: 0 } },
							};
					});
					pi.on("session_before_compact", ({ preparation }) => ({
						compaction: {
							summary: "offline billing summary",
							firstKeptEntryId: preparation.firstKeptEntryId,
							tokensBefore: preparation.tokensBefore,
							usage: { ...fauxAssistantMessage("usage").usage, input: 1234 },
						},
					}));
				},
			],
		});
		const terminal = new VirtualTerminal(120, 60);
		const mode = createMode(harness, terminal, "fullscreen");
		try {
			harness.sessionManager.appendMessage({ role: "user", content: "cached user", timestamp: 1 });
			const cached = fauxAssistantMessage("cached answer");
			cached.usage = { ...cached.usage, cacheWrite: 30000, totalTokens: 30000 };
			harness.sessionManager.appendMessage(cached);
			harness.session.refreshContext();
			await mode.init();
			submit(terminal, "/focus");
			mode.showNewVersionNotification({ version: "99.0.0" });
			mode.showPackageUpdateNotification(["offline-package"]);
			harness.setResponses([fauxAssistantMessage("answer with cache miss")]);
			await harness.session.prompt("cache miss user");
			let output = await screen(terminal);
			expect(output).toContain("Focus W:0 E:0");
			for (const text of ["Cache miss:", "Update Available", "Package Updates Available"])
				expect(output).not.toContain(text);
			submit(terminal, "/focus");
			output = await screen(terminal);
			for (const text of ["Cache miss: 30k tokens re-billed", "Update Available", "Package Updates Available"])
				expect(output).toContain(text);
			submit(terminal, "/focus");
			await harness.session.compact();
			expect(await screen(terminal)).toContain("Focus W:0 E:0");
			expect(await screen(terminal)).not.toContain("Compaction: 1.2k tokens billed");
			submit(terminal, "/focus");
			expect(await screen(terminal)).toContain("Compaction: 1.2k tokens billed");
			expect(harness.faux.state.callCount).toBe(1);
		} finally {
			mode.stop("resume-hint");
			harness.cleanup();
		}
	});

	it("reports live diagnostics quietly beside extension statuses and reveals their details on leaving focus", async () => {
		const harness = await createHarness({
			settings: { theme: "dark", quietStartup: true, showCacheMissNotices: false },
			extensionFactories: [
				(pi) => {
					pi.on("session_start", (_event, ctx) => {
						ctx.ui.setStatus("codex", "Cdx");
						ctx.ui.setStatus("other", "other status");
					});
				},
			],
		});
		const terminal = new VirtualTerminal(120, 50);
		const mode = createMode(harness, terminal, "fullscreen");
		try {
			await mode.init();
			mode.showError("before focus");
			submit(terminal, "/focus");
			expect(await screen(terminal)).toContain("Focus W:0 E:0");
			mode.showWarning("live warning detail");
			mode.showError("live error detail");
			const output = await screen(terminal);
			const statusLine = output.split("\n").find((line) => line.includes("Cdx"))!;
			expect(statusLine).toMatch(/^Cdx other status +Focus W:1 E:1$/);
			for (const text of ["before focus", "live warning detail", "live error detail"])
				expect(output).not.toContain(text);
			submit(terminal, "/focus");
			const ordinary = await screen(terminal);
			for (const text of ["before focus", "live warning detail", "live error detail"])
				expect(ordinary).toContain(text);
			expect(ordinary).not.toContain("Focus W:");
			expect(harness.faux.state.callCount).toBe(0);
			expect(harness.session.messages).toEqual([]);
		} finally {
			mode.stop("resume-hint");
			harness.cleanup();
		}
	});
	it.each([
		["error", "Focus W:0 E:1"],
		["aborted", "Focus W:0 E:1"],
		["length", "Focus W:1 E:0"],
	] as const)("counts a live %s completion without exposing its unfinished answer", async (stopReason, status) => {
		const harness = await createHarness({
			settings: { theme: "dark", quietStartup: true, retry: { enabled: false }, showCacheMissNotices: false },
		});
		const terminal = new VirtualTerminal(120, 50);
		const mode = createMode(harness, terminal, "fullscreen");
		try {
			harness.sessionManager.appendMessage(fauxAssistantMessage("historical failure", { stopReason: "error" }));
			harness.session.refreshContext();
			await mode.init();
			submit(terminal, "/focus");
			expect(await screen(terminal)).toContain("Focus W:0 E:0");
			harness.setResponses([
				fauxAssistantMessage("unfinished answer", { stopReason, errorMessage: "provider detail" }),
			]);
			await harness.session.prompt("first turn");
			let output = await screen(terminal);
			expect(output).toContain(status);
			expect(output).not.toContain("unfinished answer");
			expect(output).not.toContain("provider detail");
			harness.setResponses([fauxAssistantMessage("next successful answer")]);
			await harness.session.prompt("next turn");
			expect(await screen(terminal)).toContain(status);
			const records = structuredClone(harness.sessionManager.getEntries());
			const context = structuredClone(harness.session.messages);
			submit(terminal, "/focus");
			output = await screen(terminal);
			expect(output).toContain("unfinished answer");
			expect(output).toContain("historical failure");
			submit(terminal, "/focus");
			expect(await screen(terminal)).toContain("Focus W:0 E:0");
			expect(harness.faux.state.callCount).toBe(2);
			expect(harness.sessionManager.getEntries()).toEqual(records);
			expect(harness.session.messages).toEqual(context);
		} finally {
			mode.stop("resume-hint");
			harness.cleanup();
		}
	});

	it("excludes agent tool failures, warning-colored tool output and routine notices from diagnostic counts", async () => {
		const tool: AgentTool = {
			name: "fail",
			label: "Fail",
			description: "Offline failure",
			parameters: Type.Object({}),
			execute: async (_id, _args, _signal, onUpdate) => {
				onUpdate?.({ content: [{ type: "text", text: "\x1b[33mWarning: tool progress\x1b[0m" }], details: {} });
				throw new Error("intermediate tool failure");
			},
		};
		const harness = await createHarness({
			tools: [tool],
			settings: { theme: "dark", quietStartup: true, showCacheMissNotices: false },
			extensionFactories: [
				(pi) => {
					pi.on("before_agent_start", (_event, ctx) => ctx.ui.notify("routine info"));
				},
			],
		});
		const terminal = new VirtualTerminal(120, 50);
		const mode = createMode(harness, terminal, "fullscreen");
		try {
			await mode.init();
			submit(terminal, "/focus");
			harness.setResponses([
				fauxAssistantMessage([fauxToolCall("fail", {})], { stopReason: "toolUse" }),
				fauxAssistantMessage("recovered tool answer"),
			]);
			await harness.session.prompt("tool user");
			let output = await screen(terminal);
			expect(output).toContain("Focus W:0 E:0");
			expect(output).toContain("recovered tool answer");
			expect(output).not.toContain("intermediate tool failure");
			expect(output).not.toContain("routine info");
			submit(terminal, "/focus");
			output = await screen(terminal);
			expect(output).toContain("intermediate tool failure");
			expect(output).toContain("routine info");
			expect(harness.faux.state.callCount).toBe(2);
		} finally {
			mode.stop("resume-hint");
			harness.cleanup();
		}
	});

	it("leaves the focus action unbound and editor defaults unchanged", () => {
		const keys = new KeybindingsManager();
		expect(keys.getKeys("app.transcript.toggleFinalOnly")).toEqual([]);
		expect(KEYBINDINGS["app.transcript.toggleFinalOnly"].defaultKeys).toEqual([]);
		expect(keys.getKeys("tui.editor.yank")).toContain("ctrl+y");
	});

	it.each(["regular", "fullscreen"] as const)(
		"dispatches locally in %s without submitting pending editor input",
		async (tuiMode) => {
			const harness = await createHarness({ settings: { theme: "dark", showCacheMissNotices: false } });
			writeFileSync(
				join(harness.tempDir, "keybindings.json"),
				JSON.stringify({ "app.transcript.toggleFinalOnly": ["f6"] }),
			);
			vi.stubEnv("PI_CODING_AGENT_DIR", harness.tempDir);
			const terminal = new VirtualTerminal(120, 50);
			const mode = createMode(harness, terminal, tuiMode);
			try {
				harness.sessionManager.appendMessage({ role: "user", content: "restored user", timestamp: 1 });
				harness.sessionManager.appendMessage(fauxAssistantMessage("restored answer"));
				harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;
				const records = structuredClone(harness.sessionManager.getEntries());
				await mode.init();
				mode.showWarning("ordinary diagnostic");
				submit(terminal, "/focus");
				let output = await screen(terminal);
				expect(output).toContain("restored user");
				expect(output).toContain("restored answer");
				if (tuiMode === "fullscreen") expect(output).not.toContain("ordinary diagnostic");
				else expect(output).toContain("Focus requires fullscreen");
				terminal.sendInput("\x1b[200~pending editor input\x1b[201~");
				terminal.sendInput("\x1b[17~"); // Configured F6, not a built-in default.
				output = await screen(terminal);
				expect(output).toContain("ordinary diagnostic");
				expect(output).toContain("pending editor input");
				expect(harness.faux.state.callCount).toBe(0);
				expect(harness.session.messages).toHaveLength(2);
				expect(harness.sessionManager.getEntries()).toEqual(records);
				expect(harness.session.pendingMessageCount).toBe(0);
				// getUserInput must still wait: neither command nor shortcut submitted a prompt.
				let submitted = false;
				void mode.getUserInput().then(() => {
					submitted = true;
				});
				await Promise.resolve();
				expect(submitted).toBe(false);
			} finally {
				mode.stop("resume-hint");
				harness.cleanup();
				vi.unstubAllEnvs();
			}
		},
	);

	it("starts from the selected branch and retained post-compaction display history", async () => {
		const harness = await createHarness({ settings: { theme: "dark", showCacheMissNotices: false } });
		const terminal = new VirtualTerminal(120, 60);
		const mode = createMode(harness, terminal, "fullscreen");
		try {
			harness.sessionManager.appendMessage({ role: "user", content: "archived user", timestamp: 1 });
			harness.sessionManager.appendMessage(fauxAssistantMessage("archived answer"));
			const kept = harness.sessionManager.appendMessage({ role: "user", content: "retained user", timestamp: 2 });
			harness.sessionManager.appendMessage(fauxAssistantMessage("retained answer"));
			const compacted = harness.sessionManager.appendCompaction("compaction summary", kept, 1000);
			harness.sessionManager.appendMessage(fauxAssistantMessage("unselected branch answer"));
			harness.sessionManager.branch(compacted);
			harness.sessionManager.appendMessage({ role: "user", content: "selected user", timestamp: 3 });
			harness.sessionManager.appendMessage(fauxAssistantMessage("selected answer"));
			harness.session.agent.state.messages = harness.sessionManager.buildSessionContext().messages;
			const records = structuredClone(harness.sessionManager.getEntries());
			await mode.init();
			submit(terminal, "/focus");
			const output = await screen(terminal);
			for (const text of ["retained user", "retained answer", "selected user", "selected answer"])
				expect(output).toContain(text);
			for (const text of [
				"archived user",
				"archived answer",
				"unselected branch answer",
				"compaction summary",
				"Session compacted",
			])
				expect(output).not.toContain(text);
			expect(harness.sessionManager.getEntries()).toEqual(records);
			expect(harness.faux.state.callCount).toBe(0);
		} finally {
			mode.stop("resume-hint");
			harness.cleanup();
		}
	});

	it("toggles during assistant streaming and tools, exposing latest ordinary output and one final answer before persistence", async () => {
		let releaseTool = () => {};
		let toolStarted = () => {};
		const started = new Promise<void>((resolve) => {
			toolStarted = resolve;
		});
		const held = new Promise<void>((resolve) => {
			releaseTool = resolve;
		});
		const tool: AgentTool = {
			name: "echo",
			label: "Echo",
			description: "Offline echo",
			parameters: Type.Object({}),
			execute: async (_id, _args, _signal, onUpdate) => {
				onUpdate?.({ content: [{ type: "text", text: "tool partial" }], details: {} });
				toolStarted();
				await held;
				return { content: [{ type: "text", text: "tool finished" }], details: {} };
			},
		};
		const harness = await createHarness({
			tools: [tool],
			fauxStreaming: { tokensPerSecond: 100, tokenSize: { min: 1, max: 1 } },
			settings: { theme: "dark", showCacheMissNotices: false },
			extensionFactories: [
				(pi) => {
					pi.on("message_end", (event) => {
						if (event.message.role === "assistant" && event.message.stopReason === "stop") {
							return {
								message: {
									...event.message,
									content: [
										{ type: "thinking", thinking: "extension reasoning" },
										{ type: "text", text: "final focused answer" },
									],
								},
							};
						}
					});
					pi.on("session_start", (_event, ctx) => {
						ctx.ui.setHeader(() => new Text("focus header", 0, 0));
						ctx.ui.setWidget("widget", ["focus widget"]);
						ctx.ui.setStatus("test", "focus status");
					});
				},
			],
		});
		writeFileSync(
			join(harness.tempDir, "keybindings.json"),
			JSON.stringify({ "app.transcript.toggleFinalOnly": ["f6"], "app.message.followUp": ["f7"] }),
		);
		vi.stubEnv("PI_CODING_AGENT_DIR", harness.tempDir);
		const terminal = new VirtualTerminal(120, 60);
		const mode = createMode(harness, terminal, "fullscreen");
		let unsubscribe = () => {};
		let prompt: Promise<void> | undefined;
		try {
			await mode.init();
			mode.showWarning("hidden notice");
			submit(terminal, "/focus");
			expect(await screen(terminal)).not.toContain("hidden notice");
			let sawPartial = false;
			let completedBeforePersistence = false;
			unsubscribe = harness.session.subscribe((event) => {
				if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta" && !sawPartial) {
					sawPartial = true;
					// Native input dispatch is synchronous: toggle out while the response is unfinished.
					submit(terminal, "/focus");
					terminal.sendInput("\x1b[200~still pending\x1b[201~");
				}
				if (
					event.type === "message_end" &&
					event.message.role === "assistant" &&
					event.message.stopReason === "stop"
				) {
					completedBeforePersistence = !harness.sessionManager
						.getBranch()
						.some((entry) => entry.type === "message" && entry.message === event.message);
					// No later history rebuild occurs: the next frame must contain this event's answer.
				}
			});
			harness.setResponses([
				fauxAssistantMessage(
					[
						{ type: "thinking", thinking: "private reasoning" },
						{ type: "text", text: "assistant tool commentary grows while running" },
						fauxToolCall("echo", {}),
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage([
					{ type: "thinking", thinking: "final private reasoning" },
					{ type: "text", text: "untransformed provider answer" },
				]),
			]);
			prompt = harness.session.prompt("live user text");
			await started;
			let output = await screen(terminal);
			expect(sawPartial).toBe(true);
			expect(output).toContain("assistant tool commentary grows while running");
			expect(output).toContain("tool partial");
			expect(output).toContain("still pending");
			// Delete the draft without invoking interrupt or the double-Ctrl+C exit action.
			terminal.sendInput("\x15");
			submit(terminal, "/focus");
			output = await screen(terminal);
			expect(output).toContain("live user text");
			expect(output).not.toContain("tool partial");
			expect(output).not.toContain("assistant tool commentary");
			expect(output).not.toContain("private reasoning");
			expect(output).not.toContain("Thinking...");
			for (const text of ["focus header", "focus widget", "focus status", "Working"]) expect(output).toContain(text);
			expect(harness.session.isStreaming).toBe(true);
			expect(harness.session.pendingMessageCount).toBe(0);
			terminal.sendInput("\x1b[200~pending tool input\x1b[201~");
			terminal.sendInput("\x1b[17~");
			output = await screen(terminal);
			expect(output).toContain("tool partial");
			expect(output).toContain("pending tool input");
			terminal.sendInput("\x1b[17~");
			expect(await screen(terminal)).not.toContain("tool partial");
			expect(harness.session.pendingMessageCount).toBe(0);
			terminal.sendInput("\x15");
			terminal.sendInput("\x1b[200~/focus\x1b[201~");
			terminal.sendInput("\x1b[18~"); // Follow-up submission must still dispatch this local command.
			expect(await screen(terminal)).toContain("tool partial");
			expect(harness.session.pendingMessageCount).toBe(0);
			submit(terminal, "/focus");
			releaseTool();
			await prompt;
			expect(completedBeforePersistence).toBe(true);
			expect(await screen(terminal)).toContain("final focused answer");
			terminal.sendInput("\x15");
			submit(terminal, "/focus");
			output = await screen(terminal);
			expect(output).toContain("tool finished");
			expect(output).toContain("hidden notice");
			submit(terminal, "/focus");
			expect((await screen(terminal)).match(/final focused answer/g)).toHaveLength(1);
			expect(harness.faux.state.callCount).toBe(2);
			expect(harness.session.messages.filter((message) => message.role === "user")).toHaveLength(1);
		} finally {
			releaseTool();
			await prompt;
			unsubscribe();
			mode.stop("resume-hint");
			harness.cleanup();
			vi.unstubAllEnvs();
		}
	});
});
