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
