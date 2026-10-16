import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/compat";
import { Container, Text } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
	describe("history rebuilds", () => {
		function setup() {
			const transcript = new Container();
			const pending = pendingOutput("pending dock");
			const getTheme = vi.fn(getMarkdownTheme);
			const presentation = new TranscriptPresentation({
				header: new Text("header", 0, 0),
				resources: new Text("resources", 0, 0),
				transcript,
				pendingOutput: pending,
				getMarkdownTheme: getTheme,
				getOutputPad: () => 1,
				getMarkdownTransformers: () => [],
			});
			return { transcript, pending, getTheme, presentation };
		}

		it.each([false, true])("constructs focused history once, or not at all while disabled (focus=%s)", (focused) => {
			const { transcript, pending, getTheme, presentation } = setup();
			transcript.addChild(new Text("startup diagnostic", 0, 0));
			if (focused) presentation.toggleFocus();
			presentation.reportDiagnostic("warning");
			const history = Array.from({ length: 300 }, (_, i) => fauxAssistantMessage(`retained answer ${i}`));
			presentation.rebuildHistory(history, undefined, () => {
				for (const [index, message] of history.entries()) {
					const component = new Text(`ordinary answer ${index}`, 0, 0);
					transcript.addChild(component);
					presentation.messagePresented(message, component);
					if (index === 0) presentation.addExplicitOutput(new Text("inline command", 0, 0));
				}
				expect(getTheme).not.toHaveBeenCalled();
				return undefined;
			});
			expect(getTheme).toHaveBeenCalledTimes(focused ? history.length : 0);
			let output = presentation.document.render(80).join("\n");
			expect(output).toContain("inline command");
			if (focused) {
				expect(output.indexOf("retained answer 0")).toBeLessThan(output.indexOf("inline command"));
				expect(output.indexOf("inline command")).toBeLessThan(output.indexOf("retained answer 1"));
				expect(output.match(/retained answer 299/g)).toHaveLength(1);
				expect(output).not.toContain("startup diagnostic");
				expect(presentation.getStatus()).toBe("Focus W:1 E:0");
				presentation.toggleFocus();
				output = presentation.document.render(80).join("\n");
			} else {
				presentation.toggleFocus();
				expect(presentation.document.render(80).join("\n")).toContain("retained answer 299");
				expect(getTheme).toHaveBeenCalledTimes(history.length);
			}
			expect(output).toContain("startup diagnostic");
			expect(output).toContain("ordinary answer 299");
			expect(pending.render(80).join("\n")).toContain("pending dock");
		});

		it.each(["first", "later", "none"] as const)(
			"retains the live manual component before the %s surviving follower by message identity",
			(survivor) => {
				const { transcript, getTheme, presentation } = setup();
				const before = fauxAssistantMessage("removed earlier answer");
				const first = fauxAssistantMessage("first follower");
				const later = fauxAssistantMessage("later follower");
				presentation.replaceHistory([before, first, later]);
				const beforeComponent = new Text("ordinary earlier", 0, 0);
				transcript.addChild(beforeComponent);
				presentation.messagePresented(before, beforeComponent);
				const active = new Text("live manual chunk", 0, 0);
				presentation.addExplicitOutput(active);
				for (const message of [first, later]) {
					const component = new Text(message === first ? "first follower" : "later follower", 0, 0);
					transcript.addChild(component);
					presentation.messagePresented(message, component);
				}
				presentation.toggleFocus();
				getTheme.mockClear();
				const retained = survivor === "first" ? [first, later] : survivor === "later" ? [later] : [];
				presentation.rebuildHistory(retained, active, () => {
					transcript.clear();
					for (const message of retained) {
						const component = new Text(message === first ? "first follower" : "later follower", 0, 0);
						transcript.addChild(component);
						presentation.messagePresented(message, component);
					}
					return undefined;
				});
				expect(getTheme).toHaveBeenCalledTimes(retained.length);
				active.setText("latest manual chunk");
				for (let view = 0; view < 2; view++) {
					const output = presentation.document.render(80).join("\n");
					expect(output.match(/latest manual chunk/g)).toHaveLength(1);
					expect(output).not.toContain("removed earlier answer");
					if (survivor !== "none") {
						expect(output.indexOf("latest manual chunk")).toBeLessThan(
							output.indexOf(survivor === "first" ? "first follower" : "later follower"),
						);
					}
					presentation.toggleFocus();
				}
			},
		);

		it("does not duplicate append-only manual output or move docked output into the transcript", () => {
			const { pending, presentation } = setup();
			const mounted = new Text("mounted manual", 0, 0);
			const docked = new Text("docked manual", 0, 0);
			presentation.addExplicitOutput(mounted);
			pending.addChild(docked);
			presentation.toggleFocus();
			presentation.rebuildHistory([], mounted, () => undefined);
			presentation.rebuildHistory([], docked, () => undefined);
			for (let view = 0; view < 2; view++) {
				const output = presentation.document.render(80).join("\n");
				expect(output.match(/mounted manual/g)).toHaveLength(1);
				expect(output).not.toContain("docked manual");
				expect(pending.render(80).join("\n")).toContain("docked manual");
				presentation.toggleFocus();
			}
		});

		it.each(["throw", "nested"] as const)(
			"unwinds a %s rebuild without losing active output or freezing refreshes",
			(failure) => {
				const { transcript, getTheme, presentation } = setup();
				const active = new Text("active through failure", 0, 0);
				presentation.addExplicitOutput(active);
				presentation.toggleFocus();
				getTheme.mockClear();
				const retained = fauxAssistantMessage("partial retained answer");
				expect(() =>
					presentation.rebuildHistory([retained], active, () => {
						transcript.clear();
						const component = new Text("ordinary partial answer", 0, 0);
						transcript.addChild(component);
						presentation.messagePresented(retained, component);
						if (failure === "nested") presentation.rebuildHistory([], undefined, () => undefined);
						throw new Error("render failed");
					}),
				).toThrow(failure === "nested" ? "Cannot nest transcript history rebuilds" : "render failed");
				expect(getTheme).toHaveBeenCalledOnce();
				let output = presentation.document.render(80).join("\n");
				expect(output).toContain("partial retained answer");
				expect(output.match(/active through failure/g)).toHaveLength(1);
				presentation.messageEnded(fauxAssistantMessage("later live completion"));
				expect(presentation.document.render(80).join("\n")).toContain("later live completion");
				presentation.toggleFocus();
				output = presentation.document.render(80).join("\n");
				expect(output).toContain("ordinary partial answer");
				expect(output.match(/active through failure/g)).toHaveLength(1);
			},
		);

		it("deduplicates message identities without collapsing equal text or changing history order", () => {
			const { presentation } = setup();
			presentation.toggleFocus();
			const user: AgentMessage = { role: "user", content: "repeated user", timestamp: 1 };
			const first = fauxAssistantMessage("equal answer");
			const second = structuredClone(first);
			presentation.messageStarted(user);
			presentation.messageStarted(user);
			presentation.messageEnded(user);
			presentation.messageEnded(first);
			presentation.messageEnded(first);
			presentation.messageEnded(second);
			let output = presentation.document.render(80).join("\n");
			expect(output.match(/repeated user/g)).toHaveLength(1);
			expect(output.match(/equal answer/g)).toHaveLength(2);
			expect(output.indexOf("repeated user")).toBeLessThan(output.indexOf("equal answer"));
			presentation.replaceHistory([second, user, second]);
			output = presentation.document.render(80).join("\n");
			expect(output.match(/equal answer/g)).toHaveLength(1);
			expect(output.indexOf("equal answer")).toBeLessThan(output.indexOf("repeated user"));
		});

		it("keeps finalized message references ordered through completion and authoritative reconciliation", () => {
			const { transcript, presentation } = setup();
			const partial = fauxAssistantMessage("partial text", { stopReason: "toolUse" });
			const component = new Text("ordinary assistant", 0, 0);
			transcript.addChild(component);
			presentation.messagePresented(partial, component);
			presentation.addExplicitOutput(new Text("command during streaming", 0, 0));
			presentation.toggleFocus();
			const completed = fauxAssistantMessage("final transformed answer");
			presentation.messageEnded(completed);
			presentation.messagePresented(completed, component);
			presentation.replaceHistory([completed]);
			const output = presentation.document.render(80).join("\n");
			expect(output.match(/final transformed answer/g)).toHaveLength(1);
			expect(output.indexOf("final transformed answer")).toBeLessThan(output.indexOf("command during streaming"));
			expect(output).not.toContain("partial text");
			presentation.replaceHistory([]);
			expect(presentation.document.render(80).join("\n")).not.toContain("final transformed answer");
		});
	});

	it("defers focused component construction until enabled and uses current history and rendering inputs", () => {
		const transcript = new Container();
		const getTheme = vi.fn(getMarkdownTheme);
		let label = "before";
		const presentation = new TranscriptPresentation({
			header: new Text("header"),
			resources: new Text("resources"),
			transcript,
			pendingOutput: new Container(),
			getMarkdownTheme: getTheme,
			getOutputPad: () => 1,
			getMarkdownTransformers: () => [(markdown) => markdown.replace("answer", label)],
		});
		const history = Array.from({ length: 300 }, (_, i) => fauxAssistantMessage(`answer ${i}`));
		presentation.replaceHistory(history);
		for (const message of history) {
			const component = new Text("ordinary");
			transcript.addChild(component);
			presentation.messagePresented(message, component);
		}
		expect(getTheme).not.toHaveBeenCalled();
		label = "latest";
		presentation.refreshConversation();
		expect(getTheme).not.toHaveBeenCalled();
		presentation.toggleFocus();
		expect(getTheme).toHaveBeenCalledTimes(history.length);
		let output = presentation.document.render(80).join("\n");
		expect(output).toContain("latest 299");
		expect(output).not.toContain("before");
		presentation.toggleFocus();
		getTheme.mockClear();
		transcript.clear();
		presentation.replaceHistory([fauxAssistantMessage("answer replacement")]);
		presentation.refreshConversation();
		expect(getTheme).not.toHaveBeenCalled();
		presentation.toggleFocus();
		expect(getTheme).toHaveBeenCalledOnce();
		output = presentation.document.render(80).join("\n");
		expect(output).toContain("latest replacement");
		expect(output).not.toContain("latest 299");
	});

	it("routes output blocks once without wrapping native children or losing explicit ordering", () => {
		const transcript = new Container();
		const presentation = new TranscriptPresentation({
			header: new Text("header"),
			resources: new Text("resources"),
			transcript,
			pendingOutput: new Container(),
			getMarkdownTheme,
			getOutputPad: () => 1,
			getMarkdownTransformers: () => [],
		});
		presentation.toggleFocus();
		const refresh = vi.spyOn(presentation, "refreshConversation");
		const user = { role: "user", content: "first user", timestamp: 1 } as const;
		const ordinary = new Text("ordinary user");
		transcript.addChild(ordinary);
		presentation.messageStarted(user);
		presentation.messagePresented(user, ordinary);
		refresh.mockClear();
		const spacer = new Text("");
		const warning = new Text("explicit warning");
		presentation.addDiagnostic("warning", [spacer, warning], "explicit");
		expect(refresh).toHaveBeenCalledOnce();
		expect(transcript.children).toEqual([ordinary, spacer, warning]);
		presentation.addDiagnostic("error", [new Text("background error")]);
		expect(refresh).toHaveBeenCalledOnce();
		presentation.messageEnded(fauxAssistantMessage("later answer"));
		const output = presentation.document.render(80).join("\n");
		expect(output.indexOf("first user")).toBeLessThan(output.indexOf("explicit warning"));
		expect(output.indexOf("explicit warning")).toBeLessThan(output.indexOf("later answer"));
		expect(output).not.toContain("background error");
		expect(presentation.getStatus()).toBe("Focus W:1 E:1");
		warning.setText("live warning update");
		expect(presentation.document.render(80).join("\n")).toContain("live warning update");
		presentation.toggleFocus();
		expect(presentation.document.render(80).join("\n")).toContain("background error");
	});

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

	it("retains live counts through turns and reconciliation, but resets their interval on toggles and session changes", () => {
		const presentation = new TranscriptPresentation({
			header: new Text("header", 0, 0),
			resources: new Text("resources", 0, 0),
			transcript: pendingOutput("ordinary diagnostic details"),
			pendingOutput: pendingOutput("pending"),
			getMarkdownTheme,
			getOutputPad: () => 1,
			getMarkdownTransformers: () => [],
		});
		const historical = fauxAssistantMessage("historical failure", { stopReason: "error" });
		presentation.replaceHistory([historical]);
		presentation.reportDiagnostic("warning");
		presentation.messageEnded(fauxAssistantMessage("ordinary failure", { stopReason: "aborted" }));
		expect(presentation.getStatus()).toBeUndefined();
		presentation.toggleFocus();
		expect(presentation.getStatus()).toBe("Focus W:0 E:0");
		presentation.reportDiagnostic("warning");
		const failed = fauxAssistantMessage("live failure", { stopReason: "error" });
		presentation.messageEnded(failed);
		presentation.messageStarted({ role: "user", content: "next turn", timestamp: 1 });
		presentation.messageEnded(fauxAssistantMessage("next completed answer"));
		expect(presentation.getStatus()).toBe("Focus W:1 E:1");
		presentation.replaceHistory([historical, failed]);
		presentation.refreshConversation();
		presentation.refreshConversation();
		expect(presentation.getStatus()).toBe("Focus W:1 E:1");
		expect(presentation.document.render(80).join("\n")).not.toContain("failure");
		presentation.toggleFocus();
		expect(presentation.getStatus()).toBeUndefined();
		expect(presentation.document.render(80).join("\n")).toContain("ordinary diagnostic details");
		presentation.toggleFocus();
		expect(presentation.getStatus()).toBe("Focus W:0 E:0");
		presentation.reportDiagnostic("error");
		presentation.resetSession();
		expect(presentation.getStatus()).toBe("Focus W:0 E:0");
		presentation.replaceHistory([historical]);
		expect(presentation.getStatus()).toBe("Focus W:0 E:0");
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
