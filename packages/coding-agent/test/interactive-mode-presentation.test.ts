import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/compat";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { createHarness } from "./suite/harness.ts";

describe("InteractiveMode ordinary presentation", () => {
	it.each(["regular", "fullscreen"] as const)(
		"keeps live messages, tools, commands, diagnostics and surrounding controls visible in %s mode",
		async (tuiMode) => {
			const tool: AgentTool = {
				name: "echo",
				label: "Echo",
				description: "Offline echo",
				parameters: Type.Object({}),
				execute: async (_id, _args, _signal, onUpdate) => {
					onUpdate?.({ content: [{ type: "text", text: "tool partial" }], details: {} });
					return { content: [{ type: "text", text: "tool finished" }], details: {} };
				},
			};
			const harness = await createHarness({
				tools: [tool],
				fauxStreaming: { tokensPerSecond: 40, tokenSize: { min: 1, max: 1 } },
				settings: { theme: "dark", showCacheMissNotices: false },
				extensionFactories: [
					(pi) => {
						pi.on("session_start", (_event, ctx) => {
							ctx.ui.setHeader(() => new Text("presentation header", 0, 0));
							ctx.ui.setWidget("above", ["above editor"]);
							ctx.ui.setWidget("below", ["below editor"], { placement: "belowEditor" });
							ctx.ui.setStatus("test", "presentation status");
						});
					},
				],
			});
			const terminal = new VirtualTerminal(120, 60);
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
					throw new Error("Session replacement is outside this presentation scenario");
				},
			);
			const mode = new InteractiveMode(runtime, { tuiMode, terminal });
			const frames: string[] = [];
			const firstAssistantFrames: string[] = [];
			let firstAssistantEnded = false;
			const eventTypes: string[] = [];
			let unsubscribe = () => {};
			let checkedPendingDock = false;
			try {
				await mode.init();
				unsubscribe = harness.session.agent.subscribe(async (event) => {
					if (event.type === "message_end" && event.message.role === "assistant") {
						firstAssistantEnded = true;
					}
					if (event.type === "message_update" && !checkedPendingDock) {
						checkedPendingDock = true;
						terminal.sendInput("\x1b[200~!!printf 'pending bash %s\\n' visible\x1b[201~");
						terminal.sendInput("\r");
						await vi.waitFor(async () => {
							await terminal.waitForRender();
							expect(terminal.getViewport().join("\n")).toMatch(/^\s*pending bash visible\s*$/m);
							expect(harness.session.isBashRunning).toBe(false);
						});
						await harness.session.steer("queued steering");
						await harness.session.followUp("queued follow-up");
						await terminal.waitForRender();
						const dock = terminal.getViewport().join("\n");
						expect(dock).toContain("Steering: queued steering");
						expect(dock).toContain("Follow-up: queued follow-up");
						expect(dock).toContain("to edit all queued messages");
						expect(dock).toContain("Working");
					}
					if (event.type === "message_update" || event.type.startsWith("tool_execution_")) {
						await terminal.waitForRender();
						const frame = terminal.getViewport().join("\n");
						frames.push(frame);
						if (
							event.type === "message_update" &&
							event.assistantMessageEvent.type === "text_delta" &&
							!firstAssistantEnded
						) {
							firstAssistantFrames.push(frame);
						}
						eventTypes.push(event.type);
					}
				});
				const streamedAnswer = "assistant streaming starts, keeps growing, and finishes";
				harness.setResponses([
					fauxAssistantMessage([{ type: "text", text: streamedAnswer }, fauxToolCall("echo", {})], {
						stopReason: "toolUse",
					}),
					fauxAssistantMessage("assistant final"),
					fauxAssistantMessage("follow-up final"),
				]);
				await harness.session.prompt("user message");
				await terminal.waitForRender();
				const conversation = terminal.getViewport().join("\n");
				// Require visible growth while this same answer is unfinished, not a particular chunk boundary.
				const partialAnswers = [
					...new Set(
						firstAssistantFrames.flatMap((frame) => {
							const answer = frame.match(/^[ \t]*(assistant streaming[^\n]*)$/m)?.[1].trimEnd();
							return answer && answer !== streamedAnswer ? [answer] : [];
						}),
					),
				];
				expect(partialAnswers.length).toBeGreaterThanOrEqual(2);
				expect(partialAnswers[1].length).toBeGreaterThan(partialAnswers[0].length);
				expect(eventTypes).toContain("tool_execution_update");
				expect(frames.some((frame) => frame.includes("tool partial") && !frame.includes("tool finished"))).toBe(
					true,
				);
				expect(conversation).toMatch(
					/user message[\s\S]*assistant streaming[\s\S]*tool finished[\s\S]*assistant final/,
				);

				terminal.sendInput("\x1b[200~/name presentation-test\x1b[201~");
				terminal.sendInput("\r");
				mode.showWarning("presentation warning");
				mode.showError("presentation error");
				terminal.sendInput("\x1b[200~!printf 'manual bash %s\\n' visible\x1b[201~");
				terminal.sendInput("\r");
				await vi.waitFor(async () => {
					await terminal.waitForRender();
					expect(terminal.getViewport().join("\n")).toMatch(/^\s*manual bash visible\s*$/m);
					expect(harness.session.isBashRunning).toBe(false);
				});
				const output = terminal.getViewport().join("\n");
				expect(output).toMatch(
					/Session name set: presentation-test[\s\S]*Warning: presentation warning[\s\S]*Error: presentation error[\s\S]*manual bash visible/,
				);
				expect(output).toMatch(
					/presentation header[\s\S]*user message[\s\S]*above editor[\s\S]*below editor[\s\S]*presentation status/,
				);
				expect(output).toContain("faux-1");
				expect(harness.faux.state.callCount).toBe(3);
			} finally {
				unsubscribe();
				mode.stop("resume-hint");
				harness.cleanup();
			}
		},
	);
});
