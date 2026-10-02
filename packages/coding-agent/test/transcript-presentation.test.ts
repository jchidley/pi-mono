import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/compat";
import { Container, Text } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it } from "vitest";
import { getMarkdownTheme, initTheme } from "../src/modes/interactive/theme/theme.ts";
import { TranscriptPresentation } from "../src/modes/interactive/transcript-presentation.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

function pendingOutput(text: string): Container {
	const container = new Container();
	container.addChild(new Text(text, 0, 0));
	return container;
}

describe("transcript presentation", () => {
	beforeEach(() => initTheme("dark"));
	it("switches to user text and completed answers while ordinary live output keeps growing", () => {
		const transcript = new Container();
		const partial = new Text("partial answer", 0, 0);
		transcript.addChild(partial);
		const presentation = new TranscriptPresentation({
			header: new Text("header", 0, 0),
			resources: new Text("loaded resources", 0, 0),
			transcript,
			pendingOutput: pendingOutput("queued input"),
			getMarkdownTheme,
			getOutputPad: () => 1,
			getMarkdownTransformers: () => [],
		});
		presentation.replaceHistory([{ role: "user", content: "hello focus", timestamp: 1 }]);
		presentation.toggleFocus();
		const visible = () => presentation.document.render(80).join("\n");
		expect(visible()).toContain("hello focus");
		expect(visible()).not.toContain("partial answer");
		expect(visible()).not.toContain("loaded resources");
		partial.setText("latest partial answer");
		transcript.addChild(new Text("latest tool output", 0, 0));
		presentation.messageEnded(fauxAssistantMessage("completed answer"));
		expect(visible()).toContain("completed answer");
		presentation.toggleFocus();
		expect(visible()).toContain("latest partial answer");
		expect(visible()).toContain("latest tool output");
		presentation.toggleFocus();
		expect(visible().match(/completed answer/g)).toHaveLength(1);
		expect(presentation.pendingOutput.render(80).join("\n")).toContain("queued input");
	});
	it("projects only user text and successful tool-free answers without mutating history", () => {
		const presentation = new TranscriptPresentation({
			header: new Text("header", 0, 0),
			resources: new Text("resources", 0, 0),
			transcript: pendingOutput("ordinary"),
			pendingOutput: pendingOutput("pending"),
			getMarkdownTheme,
			getOutputPad: () => 1,
			getMarkdownTransformers: () => [],
		});
		const history: AgentMessage[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "user words" },
					{ type: "image", data: "image bytes", mimeType: "image/png" },
				],
				timestamp: 1,
			},
			{
				role: "user",
				content: '<skill name="example" location="/tmp/SKILL.md">\nexpanded skill body\n</skill>\n\nmy own request',
				timestamp: 2,
			},
			{
				role: "user",
				content: 'inspect this\n<file name="/tmp/attached.txt">attachment body</file>\nplease',
				timestamp: 3,
			},
			fauxAssistantMessage([
				{ type: "thinking", thinking: "secret reasoning" },
				{ type: "text", text: "successful answer" },
			]),
			...(["length", "error", "aborted", "toolUse"] as const).map((stopReason) =>
				fauxAssistantMessage(`excluded ${stopReason}`, { stopReason }),
			),
			fauxAssistantMessage([{ type: "text", text: "tool-bearing stop" }, fauxToolCall("echo", {})], {
				stopReason: "stop",
			}),
			{ role: "custom", customType: "background", content: "unsolicited custom", display: true, timestamp: 4 },
			{ role: "compactionSummary", summary: "hidden summary", tokensBefore: 100, timestamp: 5 },
			{
				role: "bashExecution",
				command: "echo",
				output: "deferred output",
				exitCode: 0,
				cancelled: false,
				truncated: false,
				timestamp: 6,
			},
		];
		const original = structuredClone(history);
		presentation.replaceHistory(history);
		presentation.messageStarted(fauxAssistantMessage("streaming text"));
		presentation.messageStarted({ role: "user", content: "live user", timestamp: 7 });
		presentation.toggleFocus();
		const output = presentation.document.render(100).join("\n");
		for (const text of ["user words", "my own request", "inspect this", "please", "successful answer", "live user"])
			expect(output).toContain(text);
		for (const text of [
			"image bytes",
			"expanded skill body",
			"attachment body",
			"secret reasoning",
			"Thinking",
			"excluded",
			"tool-bearing stop",
			"unsolicited custom",
			"hidden summary",
			"deferred output",
			"streaming text",
		])
			expect(output).not.toContain(text);
		expect(history).toEqual(original);
	});

	it("replaces started user text with its extension-transformed completion before persistence", () => {
		const presentation = new TranscriptPresentation({
			header: new Text("header", 0, 0),
			resources: new Text("resources", 0, 0),
			transcript: pendingOutput("ordinary"),
			pendingOutput: pendingOutput("pending"),
			getMarkdownTheme,
			getOutputPad: () => 1,
			getMarkdownTransformers: () => [],
		});
		const user: AgentMessage = { role: "user", content: "original request", timestamp: 1 };
		presentation.toggleFocus();
		presentation.messageStarted(user);
		expect(presentation.document.render(80).join("\n")).toContain("original request");
		// AgentSession applies extension replacements in place before public message_end.
		user.content = "transformed request";
		presentation.messageEnded(user);
		const answer = fauxAssistantMessage("completed once");
		presentation.messageEnded(answer);
		let output = presentation.document.render(80).join("\n");
		expect(output).not.toContain("original request");
		expect(output.match(/transformed request/g)).toHaveLength(1);
		expect(output.match(/completed once/g)).toHaveLength(1);
		presentation.replaceHistory([user, answer]);
		presentation.toggleFocus();
		presentation.toggleFocus();
		output = presentation.document.render(80).join("\n");
		expect(output.match(/transformed request/g)).toHaveLength(1);
		expect(output.match(/completed once/g)).toHaveLength(1);
	});

	it("refreshes theme, padding and Markdown inputs without discarding ordinary updates", () => {
		let padding = 1;
		let label = "old rendering";
		const ordinary = new Text("ordinary initial", 0, 0);
		const transcript = new Container();
		transcript.addChild(ordinary);
		const presentation = new TranscriptPresentation({
			header: new Text("header", 0, 0),
			resources: new Text("resources", 0, 0),
			transcript,
			pendingOutput: pendingOutput("pending"),
			getMarkdownTheme,
			getOutputPad: () => padding,
			getMarkdownTransformers: () => [(markdown) => markdown.replace("answer", label)],
		});
		presentation.replaceHistory([fauxAssistantMessage("`answer`")]);
		presentation.toggleFocus();
		const dark = presentation.document.render(80).join("\n");
		expect(dark).toContain("old rendering");
		initTheme("light");
		presentation.refreshConversation();
		expect(presentation.document.render(80).join("\n")).not.toEqual(dark);
		padding = 4;
		label = "new rendering";
		ordinary.setText("ordinary latest update");
		presentation.refreshConversation();
		const light = presentation.document.render(80).join("\n");
		expect(light).not.toContain("old rendering");
		expect(light).toContain("new rendering");
		expect(stripAnsi(light)).toMatch(/\n {4}new rendering/);
		presentation.toggleFocus();
		expect(presentation.document.render(80).join("\n")).toContain("ordinary latest update");
		presentation.toggleFocus();
		presentation.resetSession();
		expect(presentation.pendingOutput.render(80).join("\n")).not.toContain("pending");
		expect(presentation.document.render(80).join("\n")).not.toContain("new rendering");
		presentation.messageStarted({ role: "user", content: "new session user", timestamp: 2 });
		expect(presentation.document.render(80).join("\n")).toContain("new session user");
	});

	it("does not present a deferred answer as completed even if it has a stop reason", () => {
		const presentation = new TranscriptPresentation({
			header: new Text("header", 0, 0),
			resources: new Text("resources", 0, 0),
			transcript: pendingOutput("ordinary"),
			pendingOutput: pendingOutput("pending"),
			getMarkdownTheme,
			getOutputPad: () => 1,
			getMarkdownTransformers: () => [],
		});
		const message = fauxAssistantMessage("deferred answer", {
			deferred: { provider: "faux", modelId: "faux-1", api: "faux", id: "pending-response" },
		});
		presentation.replaceHistory([message]);
		presentation.messageEnded(message);
		presentation.toggleFocus();
		expect(presentation.document.render(80).join("\n")).not.toContain("deferred answer");
	});

	it("presents header, resources and live transcript in order, with pending output on its own surface", () => {
		const transcript = new Container();
		const assistant = new Text("assistant: starting", 0, 0);
		transcript.addChild(new Text("user: hello", 0, 0));
		transcript.addChild(assistant);
		const pendingText = new Text("pending bash: running", 0, 0);
		const pending = new Container();
		pending.addChild(pendingText);
		const presentation = new TranscriptPresentation({
			header: new Text("header", 0, 0),
			resources: new Text("loaded resources", 0, 0),
			transcript,
			pendingOutput: pending,
			getMarkdownTheme,
			getOutputPad: () => 1,
			getMarkdownTransformers: () => [],
		});

		expect(presentation.document.render(80).map((line) => line.trimEnd())).toEqual([
			"header",
			"loaded resources",
			"user: hello",
			"assistant: starting",
		]);
		expect(presentation.pendingOutput.render(80).map((line) => line.trimEnd())).toEqual(["pending bash: running"]);

		assistant.setText("assistant: complete");
		transcript.addChild(new Text("tool: complete", 0, 0));
		pendingText.setText("pending bash: complete");
		expect(presentation.document.render(80).map((line) => line.trimEnd())).toEqual([
			"header",
			"loaded resources",
			"user: hello",
			"assistant: complete",
			"tool: complete",
		]);
		expect(presentation.pendingOutput.render(80).map((line) => line.trimEnd())).toEqual(["pending bash: complete"]);
	});
});
