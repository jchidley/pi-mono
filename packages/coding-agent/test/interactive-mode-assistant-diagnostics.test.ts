import { fauxAssistantMessage } from "@earendil-works/pi-ai/compat";
import { describe, expect, it } from "vitest";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";
import { createHarness } from "./suite/harness.ts";

function droppedThinkingMessage() {
	const message = fauxAssistantMessage("survived");
	message.diagnostics = [
		{
			type: "anthropic_input_transformations",
			timestamp: 1,
			details: {
				transformations: [
					{ type: "thinking_dropped", path: "messages.2.content.0", reason: "prefix_binding_mismatch" },
					{ type: "thinking_dropped", path: "messages.5.content.0", reason: "prefix_binding_mismatch" },
					{ type: "thinking_dropped", path: "messages.8.content.0", reason: "prefix_binding_mismatch" },
				],
			},
		},
	];
	return message;
}

function submit(terminal: VirtualTerminal, text: string) {
	terminal.sendInput(`\x1b[200~${text}\x1b[201~`);
	terminal.sendInput("\r");
}

async function screen(terminal: VirtualTerminal) {
	await terminal.waitForRender();
	return terminal.getViewport().join("\n");
}

async function setup(showCacheMissNotices: boolean) {
	const harness = await createHarness({ settings: { theme: "dark", quietStartup: true, showCacheMissNotices } });
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
			throw new Error("Session replacement is outside this diagnostic scenario");
		},
	);
	const terminal = new VirtualTerminal(120, 60);
	const mode = new InteractiveMode(runtime, { tuiMode: "fullscreen", terminal });
	return {
		harness,
		terminal,
		mode,
		cleanup: () => {
			mode.stop("resume-hint");
			harness.cleanup();
		},
	};
}

const notice = "Anthropic dropped 3 thinking blocks (details in session)";

describe("InteractiveMode assistant diagnostics", () => {
	it.each([false, true])("counts only emitted thinking-drop warnings (notices enabled=%s)", async (enabled) => {
		const test = await setup(enabled);
		try {
			await test.mode.init();
			submit(test.terminal, "/focus");
			test.harness.setResponses([droppedThinkingMessage()]);
			await test.harness.session.prompt("thinking drop user");
			let output = await screen(test.terminal);
			expect(output).toContain(enabled ? "Focus W:1 E:0" : "Focus W:0 E:0");
			expect(output).toContain("survived");
			expect(output).not.toContain(notice);
			submit(test.terminal, "/focus");
			output = await screen(test.terminal);
			if (enabled) expect(output.split("\n").map((line) => line.trim())).toContain(notice);
			else expect(output).not.toContain(notice);
			expect(output).not.toContain(`Warning: ${notice}`);
			expect(test.harness.faux.state.callCount).toBe(1);
		} finally {
			test.cleanup();
		}
	});

	it("does not repeat unchanged thinking-drop warnings across live turns", async () => {
		const test = await setup(true);
		try {
			await test.mode.init();
			submit(test.terminal, "/focus");
			test.harness.setResponses([droppedThinkingMessage(), droppedThinkingMessage()]);
			await test.harness.session.prompt("first drop turn");
			await test.harness.session.prompt("unchanged drop turn");
			expect(await screen(test.terminal)).toContain("Focus W:1 E:0");
			submit(test.terminal, "/focus");
			expect((await screen(test.terminal)).match(/Anthropic dropped 3 thinking blocks/g)).toHaveLength(1);
		} finally {
			test.cleanup();
		}
	});

	it("does not replay saved thinking-drop diagnostics when entering focus", async () => {
		const test = await setup(true);
		try {
			test.harness.sessionManager.appendMessage(droppedThinkingMessage());
			test.harness.session.refreshContext();
			await test.mode.init();
			submit(test.terminal, "/focus");
			expect(await screen(test.terminal)).toContain("Focus W:0 E:0");
			test.harness.setResponses([droppedThinkingMessage()]);
			await test.harness.session.prompt("unchanged historical drops");
			expect(await screen(test.terminal)).toContain("Focus W:0 E:0");
		} finally {
			test.cleanup();
		}
	});
});
