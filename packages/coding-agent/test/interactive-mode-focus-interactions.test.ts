import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import type { FullscreenExitOutput } from "../src/core/settings-manager.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import * as clipboard from "../src/utils/clipboard.ts";
import { createHarness } from "./suite/harness.ts";

function submit(terminal: VirtualTerminal, text: string) {
	terminal.sendInput(`\x1b[200~${text}\x1b[201~`);
	terminal.sendInput("\r");
}

async function screen(terminal: VirtualTerminal) {
	await terminal.waitForRender();
	return terminal.getViewport().join("\n");
}

async function setup(exitOutput: FullscreenExitOutput = "resume-hint") {
	const harness = await createHarness({
		tools: [
			{
				name: "echo",
				label: "Echo",
				description: "Offline exit output",
				parameters: Type.Object({}),
				execute: async () => ({ content: [{ type: "text", text: "ordinary exit tool detail" }], details: {} }),
			},
		],
		settings: {
			theme: "dark",
			quietStartup: true,
			showCacheMissNotices: false,
			fullscreenExitOutput: exitOutput,
			fullscreenCopyOnSelect: false,
			fullscreenScrollbar: "hidden",
			hideThinkingBlock: false,
		},
	});
	writeFileSync(
		join(harness.tempDir, "keybindings.json"),
		JSON.stringify({ "app.transcript.toggleFinalOnly": ["f6"], "tui.altScreen.search": ["ctrl+shift+f"] }),
	);
	vi.stubEnv("PI_CODING_AGENT_DIR", harness.tempDir);
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
			throw new Error("Session replacement is outside this test");
		},
	);
	const terminal = new VirtualTerminal(120, 50);
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
			vi.restoreAllMocks();
		},
	};
}

async function select(terminal: VirtualTerminal, text: string) {
	await terminal.waitForRender();
	const lines = terminal.getViewport();
	const row = lines.findIndex((line) => line.includes(text));
	expect(row).toBeGreaterThanOrEqual(0);
	const col = lines[row].indexOf(text);
	terminal.sendInput(`\x1b[<0;${col + 1};${row + 1}M`);
	terminal.sendInput(`\x1b[<32;${col + text.length};${row + 1}M`);
	terminal.sendInput(`\x1b[<0;${col + text.length};${row + 1}m`);
}

describe("native fullscreen focus interactions", () => {
	it("disables focus when settings switch to regular mode and keeps ordinary view on returning", async () => {
		const test = await setup();
		try {
			test.harness.setResponses([fauxAssistantMessage("mode answer")]);
			await test.harness.session.prompt("mode user");
			test.mode.showWarning("ordinary mode diagnostic");
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).not.toContain("ordinary mode diagnostic");
			submit(test.terminal, "/settings");
			test.terminal.sendInput("TUI mode");
			expect(await screen(test.terminal)).toMatch(/TUI mode +fullscreen/);
			test.terminal.sendInput("\r");
			test.terminal.sendInput("\x1b");
			let output = await screen(test.terminal);
			expect(output).toContain("ordinary mode diagnostic");
			expect(output).not.toContain("Focus W:");
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("Focus requires fullscreen");
			submit(test.terminal, "/settings");
			test.terminal.sendInput("TUI mode");
			expect(await screen(test.terminal)).toMatch(/TUI mode +regular/);
			test.terminal.sendInput("\r");
			test.terminal.sendInput("\x1b");
			output = await screen(test.terminal);
			expect(output).toContain("ordinary mode diagnostic");
			expect(output).not.toContain("Focus W:");
			test.terminal.sendInput("\x1b[17~");
			output = await screen(test.terminal);
			expect(output).toContain("Focus W:0 E:0");
			expect(output).not.toContain("ordinary mode diagnostic");
			expect(test.harness.settingsManager.getHideThinkingBlock()).toBe(false);
			expect(test.harness.faux.state.callCount).toBe(1);
		} finally {
			test.cleanup();
		}
	});

	it("starts each replacement at the bottom and follows growing output through terminal relayout", async () => {
		const test = await setup();
		try {
			test.terminal.resize(80, 24);
			test.harness.setResponses([
				fauxAssistantMessage(`${"old conversation line\n".repeat(50)}first bottom answer`),
			]);
			await test.harness.session.prompt("first scroll user");
			test.mode.showWarning("ordinary bottom diagnostic");
			expect(await screen(test.terminal)).toContain("first bottom answer");
			test.terminal.sendInput("\x1bOH");
			expect(await screen(test.terminal)).not.toContain("first bottom answer");
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("first bottom answer");
			test.harness.setResponses([fauxAssistantMessage("growing bottom answer")]);
			await test.harness.session.prompt("growing user");
			expect(await screen(test.terminal)).toContain("growing bottom answer");
			test.terminal.sendInput("\x1bOH");
			expect(await screen(test.terminal)).not.toContain("growing bottom answer");
			test.harness.setResponses([fauxAssistantMessage("hidden latest answer")]);
			await test.harness.session.prompt("hidden latest user");
			expect(await screen(test.terminal)).not.toContain("hidden latest answer");
			// Resize and toggle before the next native frame: no custom position/anchor restoration.
			test.terminal.resize(60, 18);
			submit(test.terminal, "/focus");
			let output = await screen(test.terminal);
			expect(output).toContain("hidden latest answer");
			test.terminal.sendInput("\x1bOH");
			await screen(test.terminal);
			test.terminal.resize(90, 28);
			submit(test.terminal, "/focus");
			output = await screen(test.terminal);
			expect(output).toContain("hidden latest answer");
			expect(output).not.toContain("ordinary bottom diagnostic");
			test.harness.setResponses([fauxAssistantMessage("final growing answer")]);
			await test.harness.session.prompt("final scroll user");
			expect(await screen(test.terminal)).toContain("final growing answer");
		} finally {
			test.cleanup();
		}
	});
	it.each(["transcript", "resume-hint"] as const)(
		"honors %s exit output without changing ordinary preferences",
		async (exitOutput) => {
			const test = await setup(exitOutput);
			try {
				test.terminal.sendInput("\x0f"); // Keep ordinary tool output expanded through focus and exit.
				submit(test.terminal, "/focus");
				test.harness.setResponses([
					fauxAssistantMessage([fauxToolCall("echo", {})], { stopReason: "toolUse" }),
					fauxAssistantMessage([
						{ type: "thinking", thinking: "ordinary exit reasoning" },
						{ type: "text", text: "completed exit answer" },
					]),
				]);
				await test.harness.session.prompt("exit user");
				test.mode.showWarning("hidden exit diagnostic");
				const focused = await screen(test.terminal);
				expect(focused).toContain("completed exit answer");
				expect(focused).not.toContain("ordinary exit reasoning");
				expect(focused).not.toContain("hidden exit diagnostic");
				expect(focused).not.toContain("ordinary exit tool detail");
				test.mode.stop();
				await test.terminal.flush();
				const printed = test.terminal.getScrollBuffer().join("\n");
				if (exitOutput === "transcript") {
					for (const text of [
						"exit user",
						"completed exit answer",
						"ordinary exit reasoning",
						"ordinary exit tool detail",
						"hidden exit diagnostic",
					])
						expect(printed).toContain(text);
					expect(printed).not.toContain("Focus W:");
				} else {
					for (const text of [
						"exit user",
						"completed exit answer",
						"ordinary exit reasoning",
						"ordinary exit tool detail",
						"hidden exit diagnostic",
					])
						expect(printed).not.toContain(text);
				}
				expect(test.harness.settingsManager.getHideThinkingBlock()).toBe(false);
				expect(test.harness.settingsManager.getFullscreenCopyOnSelect()).toBe(false);
				expect(test.harness.settingsManager.getFullscreenExitOutput()).toBe(exitOutput);
			} finally {
				test.cleanup();
			}
		},
	);
	it("searches only the selected document and closes search when the configured action replaces it", async () => {
		const test = await setup();
		try {
			test.harness.setResponses([fauxAssistantMessage("visible answer")]);
			await test.harness.session.prompt("search user");
			test.mode.showWarning("hiddenneedle");
			submit(test.terminal, "/focus");
			test.terminal.sendInput("\x1b[102;6u");
			test.terminal.sendInput("hiddenneedle");
			expect(await screen(test.terminal)).toContain("No matches");
			test.terminal.sendInput("\x1b[17~");
			let output = await screen(test.terminal);
			expect(output).not.toContain("Shift+Enter");
			expect(output).toContain("Warning: hiddenneedle");
			test.terminal.sendInput("\x1b[102;6u");
			test.terminal.sendInput("hiddenneedle");
			expect(await screen(test.terminal)).toContain("1/1");
			test.terminal.sendInput("\x1b[17~");
			output = await screen(test.terminal);
			expect(output).not.toContain("Shift+Enter");
			expect(output).not.toContain("hiddenneedle");
			test.terminal.sendInput("draft after search");
			expect(await screen(test.terminal)).toContain("draft after search");
			test.terminal.sendInput("\x1b[102;6u");
			expect(await screen(test.terminal)).toContain("Find in transcript");
			test.terminal.sendInput("visible answer");
			expect(await screen(test.terminal)).toContain("1/1");
			expect(test.harness.session.pendingMessageCount).toBe(0);
			expect(test.harness.faux.state.callCount).toBe(1);
		} finally {
			test.cleanup();
		}
	});
	it("copies visible selected text, leaves /copy meaning unchanged, and clears selection in both switch directions", async () => {
		const test = await setup();
		const copied: string[] = [];
		vi.spyOn(clipboard, "copyToClipboard").mockImplementation(async (text) => {
			copied.push(text);
		});
		try {
			test.harness.setResponses([fauxAssistantMessage("last assistant answer")]);
			await test.harness.session.prompt("visible user text");
			submit(test.terminal, "/focus");
			await select(test.terminal, "visible user text");
			test.terminal.sendInput("\x18");
			await screen(test.terminal);
			expect(copied).toEqual(["visible user text"]);
			submit(test.terminal, "/copy");
			await screen(test.terminal);
			expect(copied).toEqual(["visible user text", "last assistant answer"]);
			submit(test.terminal, "/focus");
			await screen(test.terminal);
			test.terminal.sendInput("\x18");
			await screen(test.terminal);
			expect(copied).toEqual(["visible user text", "last assistant answer", "last assistant answer"]);
			await select(test.terminal, "visible user text");
			submit(test.terminal, "/focus");
			await screen(test.terminal);
			test.terminal.sendInput("\x18");
			await screen(test.terminal);
			expect(copied).toEqual([
				"visible user text",
				"last assistant answer",
				"last assistant answer",
				"last assistant answer",
			]);
		} finally {
			test.cleanup();
		}
	});
});
