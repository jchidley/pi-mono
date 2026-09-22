import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Usage, UserMessage } from "@earendil-works/pi-ai";
import { type Component, Container, Text, type TUI } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { AgentSessionEvent } from "../src/core/agent-session.ts";
import type { SessionEntry } from "../src/core/session-manager.ts";
import { AssistantMessageComponent } from "../src/modes/interactive/components/assistant-message.ts";
import type { SettingsSelectorComponent } from "../src/modes/interactive/components/settings-selector.ts";
import { UserMessageComponent } from "../src/modes/interactive/components/user-message.ts";
import {
	InteractiveMode,
	isCompletedFinalAssistantMessage,
	shouldShowInFocusedTranscript,
} from "../src/modes/interactive/interactive-mode.ts";
import { getMarkdownTheme, initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

const EMPTY_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "test-api",
		provider: "test-provider",
		model: "test-model",
		usage: EMPTY_USAGE,
		stopReason,
		timestamp: Date.now(),
	};
}

function user(text: string): UserMessage {
	return { role: "user", content: [{ type: "text", text }], timestamp: Date.now() };
}

function messageEntries(messages: AgentMessage[]): SessionEntry[] {
	return messages.map((message, index) => ({
		type: "message",
		id: `entry-${index}`,
		parentId: index === 0 ? null : `entry-${index - 1}`,
		timestamp: new Date().toISOString(),
		message,
	}));
}

function render(container: Container): string {
	return stripAnsi(container.render(160).join("\n"));
}

function createTuiStub(): TUI {
	return {
		addInterval: () => ({ dispose: () => {} }),
		removeInterval: () => {},
		requestRender: vi.fn(),
	} as unknown as TUI;
}

function createFocusedContext(entries: SessionEntry[] | (() => SessionEntry[])) {
	const getEntries = typeof entries === "function" ? entries : () => entries;
	const context = Object.assign(Object.create(InteractiveMode.prototype), {
		focusedTranscript: true,
		focusedTranscriptContainer: new Container(),
		focusedFeedbackContainer: new Container(),
		chatContainer: new Container(),
		pendingMessagesContainer: new Container(),
		pendingBashComponents: [],
		compactionQueuedMessages: [],
		runtimeHost: {
			session: {
				sessionManager: {
					buildContextEntries: getEntries,
					getEntries,
					getCwd: () => process.cwd(),
				},
			},
		},
		outputPad: 1,
		hiddenThinkingLabel: "Thinking...",
		ui: createTuiStub(),
		getMarkdownThemeWithSettings: () => getMarkdownTheme(),
		getMarkdownTransformers: () => [],
	});
	return context as InstanceType<typeof InteractiveMode>;
}

describe("focused transcript filtering", () => {
	beforeAll(() => initTheme("dark"));

	test("defines final assistant messages as stop-only terminal turns without tool calls", () => {
		expect(isCompletedFinalAssistantMessage(assistant([{ type: "text", text: "done" }], "stop"))).toBe(true);
		expect(isCompletedFinalAssistantMessage(assistant([{ type: "text", text: "truncated" }], "length"))).toBe(false);
		expect(isCompletedFinalAssistantMessage(assistant([{ type: "text", text: "partial" }], "pending"))).toBe(false);
		expect(isCompletedFinalAssistantMessage(assistant([{ type: "text", text: "deferred" }], "deferred"))).toBe(false);
		expect(isCompletedFinalAssistantMessage(assistant([{ type: "text", text: "failed" }], "error"))).toBe(false);
		expect(isCompletedFinalAssistantMessage(assistant([{ type: "text", text: "cancelled" }], "aborted"))).toBe(false);
		expect(
			isCompletedFinalAssistantMessage(
				assistant([{ type: "toolCall", id: "tool-1", name: "read", arguments: {} }], "stop"),
			),
		).toBe(false);
		expect(
			isCompletedFinalAssistantMessage(
				assistant(
					[
						{ type: "text", text: "calling" },
						{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "secret" } },
					],
					"toolUse",
				),
			),
		).toBe(false);
	});

	test("filters restored entries to user and final assistant text", () => {
		const toolTurn = assistant(
			[
				{ type: "text", text: "HIDDEN_TOOL_PREAMBLE" },
				{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "secret" } },
			],
			"toolUse",
		);
		const finalTurn = assistant(
			[
				{ type: "thinking", thinking: "HIDDEN_THINKING" },
				{ type: "text", text: "VISIBLE_FINAL" },
			],
			"stop",
		);
		const entries: SessionEntry[] = [
			...messageEntries([
				user("VISIBLE_USER"),
				toolTurn,
				{
					role: "toolResult",
					toolCallId: "tool-1",
					toolName: "read",
					content: [{ type: "text", text: "HIDDEN_TOOL_RESULT" }],
					isError: false,
					timestamp: Date.now(),
				},
				finalTurn,
				{
					role: "bashExecution",
					command: "echo hidden",
					output: "HIDDEN_BASH",
					exitCode: 0,
					cancelled: false,
					truncated: false,
					timestamp: Date.now(),
				},
			]),
			{
				type: "custom",
				id: "custom-entry",
				parentId: null,
				timestamp: new Date().toISOString(),
				customType: "test",
				data: "HIDDEN_CUSTOM_ENTRY",
			},
			{
				type: "compaction",
				id: "summary-entry",
				parentId: null,
				timestamp: new Date().toISOString(),
				summary: "HIDDEN_SUMMARY",
				firstKeptEntryId: "entry-0",
				tokensBefore: 100,
			},
		];
		const context = createFocusedContext(entries);
		const prototype = InteractiveMode.prototype as unknown as {
			rebuildFocusedTranscriptIfActive(this: InstanceType<typeof InteractiveMode>): void;
		};

		prototype.rebuildFocusedTranscriptIfActive.call(context);

		const output = render(
			(context as unknown as { focusedTranscriptContainer: Container }).focusedTranscriptContainer,
		);
		expect(output).toContain("VISIBLE_USER");
		expect(output).toContain("VISIBLE_FINAL");
		for (const hidden of [
			"HIDDEN_TOOL_PREAMBLE",
			"HIDDEN_TOOL_RESULT",
			"HIDDEN_THINKING",
			"HIDDEN_BASH",
			"HIDDEN_CUSTOM_ENTRY",
			"HIDDEN_SUMMARY",
		]) {
			expect(output).not.toContain(hidden);
		}
		expect(shouldShowInFocusedTranscript(finalTurn)).toBe(true);
		expect(shouldShowInFocusedTranscript(toolTurn)).toBe(false);
	});

	test("toggles both ways during assistant streaming and preserves partial ordinary output", () => {
		const header = new Text("HEADER", 0, 0);
		const loaded = new Text("LOADED", 0, 0);
		const ordinary = new Container();
		ordinary.addChild(new Text("PARTIAL_ASSISTANT_OUTPUT", 0, 0));
		const focused = new Container();
		focused.addChild(new Text("PURE_TRANSCRIPT", 0, 0));
		const feedback = new Container();
		const document = new Container();
		const rebuildFocusedTranscriptIfActive = vi.fn();
		const updatePendingMessagesDisplay = vi.fn();
		const context = Object.assign(Object.create(InteractiveMode.prototype), {
			focusedTranscript: false,
			focusedTranscriptContainer: focused,
			focusedFeedbackContainer: feedback,
			headerContainer: header,
			loadedResourcesContainer: loaded,
			chatContainer: ordinary,
			documentContainer: document,
			runtimeHost: { session: { isIdle: false, isStreaming: true } },
			ui: { requestRender: vi.fn() },
			rebuildFocusedTranscriptIfActive,
			updatePendingMessagesDisplay,
		});
		const toggle = (
			InteractiveMode.prototype as unknown as {
				toggleFocusedTranscript(this: typeof context): void;
			}
		).toggleFocusedTranscript;

		toggle.call(context);
		expect(context.focusedTranscript).toBe(true);
		expect(document.children).toEqual([header, focused, feedback]);
		expect(rebuildFocusedTranscriptIfActive).toHaveBeenCalledOnce();

		toggle.call(context);
		expect(context.focusedTranscript).toBe(false);
		expect(document.children).toEqual([header, loaded, ordinary]);
		expect(render(ordinary)).toContain("PARTIAL_ASSISTANT_OUTPUT");
		expect(updatePendingMessagesDisplay).toHaveBeenCalledTimes(2);
	});

	test("keeps the focused transcript stable across the full live event lifecycle using persisted entries", async () => {
		let persistedEntries: SessionEntry[] = [];
		const context = createFocusedContext(() => persistedEntries) as unknown as {
			isInitialized: boolean;
			focusedTranscript: boolean;
			focusedTranscriptContainer: Container;
			focusedFeedbackContainer: Container;
			chatContainer: Container;
			footer: { invalidate(): void };
			runtimeHost: {
				session: {
					retryAttempt: number;
					settingsManager: {
						getShowImages(): boolean;
						getImageWidthCells(): number;
						getShowTerminalProgress(): boolean;
					};
					sessionManager: { getCwd(): string; buildContextEntries(): SessionEntry[] };
				};
			};
			pendingTools: Map<string, unknown>;
			streamingComponent: unknown;
			streamingMessage: AssistantMessage | undefined;
			toolOutputExpanded: boolean;
			hideThinkingBlock: boolean;
			updatePendingMessagesDisplay(): void;
			getRegisteredToolDefinition(): undefined;
			maybeShowAssistantDiagnostics(): void;
			maybeShowCacheMissNotice(): void;
			clearStatusIndicator(): void;
		};
		Object.assign(context, {
			isInitialized: true,
			chatContainer: new Container(),
			headerContainer: new Container(),
			loadedResourcesContainer: new Container(),
			documentContainer: new Container(),
			footer: { invalidate: vi.fn() },
			runtimeHost: {
				session: {
					retryAttempt: 0,
					settingsManager: {
						getShowImages: () => false,
						getImageWidthCells: () => 60,
						getShowTerminalProgress: () => false,
						getShowCacheMissNotices: () => false,
					},
					sessionManager: { getCwd: () => process.cwd(), buildContextEntries: () => persistedEntries },
				},
			},
			pendingTools: new Map(),
			streamingComponent: undefined,
			streamingMessage: undefined,
			toolOutputExpanded: false,
			hideThinkingBlock: false,
			updatePendingMessagesDisplay: vi.fn(),
			getRegisteredToolDefinition: () => undefined,
			maybeShowAssistantDiagnostics: vi.fn(),
			maybeShowCacheMissNotice: vi.fn(),
			clearStatusIndicator: vi.fn(),
		});
		const { handleEvent, toggleFocusedTranscript: toggle } = InteractiveMode.prototype as unknown as {
			handleEvent(this: typeof context, event: AgentSessionEvent): Promise<void>;
			toggleFocusedTranscript(this: typeof context): void;
		};
		context.focusedFeedbackContainer.addChild(new Text("STALE_FEEDBACK", 0, 0));
		const liveUser = user("LIVE_USER");
		const toolTurn = assistant(
			[
				{ type: "text", text: "HIDDEN_LIVE_TOOL_TURN" },
				{ type: "toolCall", id: "live-tool", name: "read", arguments: { path: "secret" } },
			],
			"toolUse",
		);

		await handleEvent.call(context, { type: "message_start", message: liveUser });
		expect(context.focusedFeedbackContainer.children).toHaveLength(0);
		await handleEvent.call(context, { type: "message_start", message: assistant([], "pending") });
		await handleEvent.call(context, {
			type: "message_update",
			message: toolTurn,
			assistantMessageEvent: { type: "done", reason: "toolUse", message: toolTurn },
		});
		expect(render(context.focusedTranscriptContainer)).toContain("LIVE_USER");
		expect(render(context.focusedTranscriptContainer)).not.toContain("HIDDEN_LIVE_TOOL_TURN");

		await handleEvent.call(context, { type: "message_end", message: toolTurn });
		persistedEntries = messageEntries([liveUser, toolTurn]);
		await handleEvent.call(context, {
			type: "tool_execution_start",
			toolCallId: "live-tool",
			toolName: "read",
			args: { path: "secret" },
		});
		const liveTool = context.pendingTools.get("live-tool");
		toggle.call(context);
		expect(context.focusedTranscript).toBe(false);
		await handleEvent.call(context, {
			type: "tool_execution_update",
			toolCallId: "live-tool",
			toolName: "read",
			args: { path: "secret" },
			partialResult: { content: [{ type: "text", text: "PARTIAL_TOOL_OUTPUT" }], details: {} },
		});
		expect(render(context.chatContainer)).toContain("PARTIAL_TOOL_OUTPUT");
		toggle.call(context);
		expect(context.focusedTranscript).toBe(true);
		await handleEvent.call(context, {
			type: "tool_execution_update",
			toolCallId: "live-tool",
			toolName: "read",
			args: { path: "secret" },
			partialResult: { content: [{ type: "text", text: "UPDATED_TOOL_OUTPUT" }], details: {} },
		});
		expect(context.pendingTools.get("live-tool")).toBe(liveTool);
		expect(render(context.focusedTranscriptContainer)).not.toContain("UPDATED_TOOL_OUTPUT");
		toggle.call(context);
		expect(render(context.chatContainer)).toContain("UPDATED_TOOL_OUTPUT");
		await handleEvent.call(context, {
			type: "tool_execution_end",
			toolCallId: "live-tool",
			toolName: "read",
			isError: false,
			result: { content: [{ type: "text", text: "COMPLETED_TOOL_OUTPUT" }], details: {} },
		});
		expect(context.pendingTools.size).toBe(0);
		expect(render(context.chatContainer)).toContain("COMPLETED_TOOL_OUTPUT");
		toggle.call(context);
		const partialFinal = assistant([{ type: "text", text: "HIDDEN_STREAMING_FINAL" }], "pending");
		await handleEvent.call(context, { type: "message_start", message: partialFinal });
		await handleEvent.call(context, {
			type: "message_update",
			message: partialFinal,
			assistantMessageEvent: {
				type: "text_delta",
				contentIndex: 0,
				delta: "HIDDEN_STREAMING_FINAL",
				partial: partialFinal,
			},
		});
		expect(render(context.focusedTranscriptContainer)).not.toContain("HIDDEN_STREAMING_FINAL");

		toggle.call(context);
		expect(context.focusedTranscript).toBe(false);
		expect(render(context.chatContainer)).toContain("HIDDEN_STREAMING_FINAL");
		toggle.call(context);
		expect(context.focusedTranscript).toBe(true);
		expect(render(context.focusedTranscriptContainer)).not.toContain("HIDDEN_STREAMING_FINAL");

		const finalTurn = assistant(
			[
				{ type: "thinking", thinking: "HIDDEN_LIVE_THINKING" },
				{ type: "text", text: "VISIBLE_LIVE_FINAL" },
			],
			"stop",
		);
		await handleEvent.call(context, { type: "message_end", message: finalTurn });
		expect(render(context.focusedTranscriptContainer).match(/VISIBLE_LIVE_FINAL/g)).toHaveLength(1);
		persistedEntries = messageEntries([liveUser, toolTurn, finalTurn]);
		toggle.call(context);
		expect(render(context.chatContainer).match(/VISIBLE_LIVE_FINAL/g)).toHaveLength(1);
		toggle.call(context);
		expect(render(context.focusedTranscriptContainer).match(/VISIBLE_LIVE_FINAL/g)).toHaveLength(1);
		await handleEvent.call(context, {
			type: "agent_end",
			messages: [liveUser, toolTurn, finalTurn],
			willRetry: false,
		});

		const output = render(context.focusedTranscriptContainer);
		expect(output).toContain("LIVE_USER");
		expect(output).toContain("VISIBLE_LIVE_FINAL");
		expect(output.match(/VISIBLE_LIVE_FINAL/g)).toHaveLength(1);
		expect(output).not.toContain("HIDDEN_STREAMING_FINAL");
		expect(output).not.toContain("HIDDEN_LIVE_TOOL_TURN");
		expect(output).not.toContain("HIDDEN_LIVE_THINKING");
	});

	test("toggles during normal bash streaming while preserving its ordinary output", async () => {
		let finishBash!: () => void;
		const bashFinished = new Promise<void>((resolve) => {
			finishBash = resolve;
		});
		const pending = new Container();
		const chat = new Container();
		const focused = new Container();
		focused.addChild(new Text("PURE_TRANSCRIPT", 0, 0));
		const session = {
			isStreaming: true,
			isIdle: false,
			isBashRunning: true,
			extensionRunner: { emitUserBash: vi.fn(async () => undefined) },
			executeBash: vi.fn(async (_command: string, onOutput: (chunk: string) => void) => {
				onOutput("BASH_STREAM_SECRET");
				await bashFinished;
				return { output: "BASH_STREAM_SECRET", exitCode: 0, cancelled: false, truncated: false };
			}),
			getSteeringMessages: () => [],
			getFollowUpMessages: () => [],
			sessionManager: {
				getCwd: () => process.cwd(),
				buildContextEntries: () => messageEntries([user("PURE_TRANSCRIPT")]),
			},
		};
		const context = Object.assign(Object.create(InteractiveMode.prototype), {
			focusedTranscript: false,
			focusedTranscriptContainer: focused,
			focusedFeedbackContainer: new Container(),
			pendingMessagesContainer: pending,
			pendingBashComponents: [],
			compactionQueuedMessages: [],
			chatContainer: chat,
			headerContainer: new Container(),
			loadedResourcesContainer: new Container(),
			documentContainer: new Container(),
			bashCommandRunning: false,
			runtimeHost: { session },
			ui: createTuiStub(),
			outputPad: 1,
			hiddenThinkingLabel: "Thinking...",
			getMarkdownThemeWithSettings: () => getMarkdownTheme(),
			getMarkdownTransformers: () => [],
		});
		const prototype = InteractiveMode.prototype as unknown as {
			handleBashCommand(this: typeof context, command: string, excluded?: boolean): Promise<void>;
			toggleFocusedTranscript(this: typeof context): void;
		};

		const commandPromise = prototype.handleBashCommand.call(context, "echo secret");
		await vi.waitFor(() => expect(render(pending)).toContain("BASH_STREAM_SECRET"));
		prototype.toggleFocusedTranscript.call(context);
		expect(context.focusedTranscript).toBe(true);
		expect(render(focused)).not.toContain("BASH_STREAM_SECRET");
		expect(render(pending)).not.toContain("BASH_STREAM_SECRET");

		prototype.toggleFocusedTranscript.call(context);
		expect(context.focusedTranscript).toBe(false);
		expect(render(pending)).toContain("$ echo secret");
		expect(render(pending)).toContain("BASH_STREAM_SECRET");
		finishBash();
		await commandPromise;
	});

	test("toggles while an asynchronous user_bash hook is pending", async () => {
		let releaseHook!: (value: {
			result: { output: string; exitCode: number; cancelled: boolean; truncated: boolean };
		}) => void;
		const hookResult = new Promise<{
			result: { output: string; exitCode: number; cancelled: boolean; truncated: boolean };
		}>((resolve) => {
			releaseHook = resolve;
		});
		const session = {
			isStreaming: false,
			isIdle: true,
			isBashRunning: false,
			extensionRunner: { emitUserBash: vi.fn(() => hookResult) },
			recordBashResult: vi.fn(),
			getSteeringMessages: () => [],
			getFollowUpMessages: () => [],
			sessionManager: { getCwd: () => process.cwd(), buildContextEntries: () => [] },
		};
		const focused = new Container();
		focused.addChild(new Text("PURE_TRANSCRIPT", 0, 0));
		const feedback = new Container();
		const context = Object.assign(Object.create(InteractiveMode.prototype), {
			focusedTranscript: true,
			focusedTranscriptContainer: focused,
			focusedFeedbackContainer: feedback,
			pendingMessagesContainer: new Container(),
			pendingBashComponents: [],
			compactionQueuedMessages: [],
			chatContainer: new Container(),
			headerContainer: new Container(),
			loadedResourcesContainer: new Container(),
			documentContainer: new Container(),
			bashCommandRunning: false,
			runtimeHost: { session },
			ui: createTuiStub(),
			outputPad: 1,
		});
		const prototype = InteractiveMode.prototype as unknown as {
			handleBashCommand(this: typeof context, command: string, excluded?: boolean): Promise<void>;
			toggleFocusedTranscript(this: typeof context): void;
		};

		const commandPromise = prototype.handleBashCommand.call(context, "hooked");
		expect(context.bashCommandRunning).toBe(true);
		prototype.toggleFocusedTranscript.call(context);
		expect(context.focusedTranscript).toBe(false);
		prototype.toggleFocusedTranscript.call(context);
		expect(context.focusedTranscript).toBe(true);
		expect(render(focused)).not.toContain("hook output");
		expect(feedback.children).toHaveLength(0);

		releaseHook({ result: { output: "hook output", exitCode: 0, cancelled: false, truncated: false } });
		await commandPromise;
		expect(context.bashCommandRunning).toBe(false);
		expect(session.recordBashResult).toHaveBeenCalledOnce();
		expect(render(context.documentContainer)).not.toContain("hook output");
		prototype.toggleFocusedTranscript.call(context);
		expect(render(context.documentContainer)).toContain("hook output");
	});

	test("shows only the latest operational error or warning outside the focused conversation", () => {
		const context = createFocusedContext([]) as unknown as {
			focusedTranscriptContainer: Container;
			focusedFeedbackContainer: Container;
			chatContainer: Container;
		};
		context.focusedTranscriptContainer.addChild(new Text("PURE_TRANSCRIPT", 0, 0));

		InteractiveMode.prototype.showError.call(context, "FIRST_OPERATIONAL_ERROR");
		expect(render(context.focusedFeedbackContainer)).toContain("FIRST_OPERATIONAL_ERROR");
		expect(render(context.focusedTranscriptContainer).trimEnd()).toBe("PURE_TRANSCRIPT");

		InteractiveMode.prototype.showWarning.call(context, "LATEST_OPERATIONAL_WARNING");
		const feedback = render(context.focusedFeedbackContainer);
		expect(feedback).toContain("LATEST_OPERATIONAL_WARNING");
		expect(feedback).not.toContain("FIRST_OPERATIONAL_ERROR");
		const ordinary = render(context.chatContainer);
		expect(ordinary).toContain("FIRST_OPERATIONAL_ERROR");
		expect(ordinary).toContain("LATEST_OPERATIONAL_WARNING");
	});

	test.each(["error", "aborted", "length"] as const)(
		"surfaces a live %s outcome as feedback without exposing unfinished assistant text",
		async (stopReason) => {
			const context = createFocusedContext([]);
			Object.assign(context, {
				isInitialized: true,
				footer: { invalidate: vi.fn() },
				workingVisible: false,
				clearStatusIndicator: vi.fn(),
			});
			const fields = context as unknown as {
				focusedTranscriptContainer: Container;
				focusedFeedbackContainer: Container;
				runtimeHost: { session: { settingsManager?: { getShowTerminalProgress(): boolean } } };
			};
			fields.runtimeHost.session.settingsManager = { getShowTerminalProgress: () => false };
			const handleEvent = (
				InteractiveMode.prototype as unknown as {
					handleEvent(event: AgentSessionEvent): Promise<void>;
				}
			).handleEvent;
			const message = assistant([{ type: "text", text: "UNFINISHED_ASSISTANT_TEXT" }], stopReason);
			await handleEvent.call(context, { type: "message_end", message });
			expect(render(fields.focusedTranscriptContainer)).not.toContain("UNFINISHED_ASSISTANT_TEXT");
			const feedback = render(fields.focusedFeedbackContainer);
			expect(feedback).not.toContain("UNFINISHED_ASSISTANT_TEXT");
			expect(feedback).toContain(
				stopReason === "length"
					? "Response was truncated before completion."
					: stopReason === "aborted"
						? "Operation aborted"
						: "Unknown error",
			);
			await handleEvent.call(context, { type: "turn_start" });
			expect(fields.focusedFeedbackContainer.children).toHaveLength(0);
		},
	);

	test("clears focused feedback and pending bash output when the current session is replaced", () => {
		const feedback = new Container();
		feedback.addChild(new Text("OLD_SESSION_FEEDBACK", 0, 0));
		const renderInitialMessages = vi.fn();
		const context = Object.assign(Object.create(InteractiveMode.prototype), {
			focusedFeedbackContainer: feedback,
			loadedResourcesContainer: new Container(),
			chatContainer: new Container(),
			pendingMessagesContainer: new Container(),
			pendingBashComponents: [new Text("OLD_SESSION_BASH", 0, 0)],
			compactionQueuedMessages: [],
			pendingTools: new Map(),
			streamingComponent: undefined,
			streamingMessage: undefined,
			renderInitialMessages,
		});

		(
			InteractiveMode.prototype as unknown as {
				renderCurrentSessionState(this: typeof context): void;
			}
		).renderCurrentSessionState.call(context);

		expect(feedback.children).toHaveLength(0);
		expect(context.pendingBashComponents).toHaveLength(0);
		expect(renderInitialMessages).toHaveBeenCalledOnce();
	});

	test("forwards explicit hotkeys and session command output to focused feedback", () => {
		const feedback = new Container();
		const chat = new Container();
		const stats = {
			sessionFile: undefined,
			sessionId: "focused-session-id",
			userMessages: 2,
			assistantMessages: 1,
			toolCalls: 0,
			toolResults: 0,
			totalMessages: 3,
			tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 },
			cost: 0,
		};
		const context = Object.assign(Object.create(InteractiveMode.prototype), {
			focusedTranscript: true,
			focusedTranscriptContainer: new Container(),
			focusedFeedbackContainer: feedback,
			chatContainer: chat,
			ui: createTuiStub(),
			keybindings: { getEffectiveConfig: () => ({}) },
			runtimeHost: {
				session: {
					extensionRunner: { getShortcuts: () => new Map() },
					settingsManager: { getCacheWarmingMode: () => "off" },
					cacheWarmingStatus: undefined,
					getSessionStats: () => stats,
					modelRuntime: {},
					sessionManager: {
						getSessionName: () => undefined,
						getEntries: () => [],
					},
				},
			},
			getEditorKeyDisplay: () => "EditorKey",
			getAppKeyDisplay: () => "AppKey",
			getMarkdownThemeWithSettings: () => getMarkdownTheme(),
		});
		const prototype = InteractiveMode.prototype as unknown as {
			handleHotkeysCommand(this: typeof context): void;
			handleSessionCommand(this: typeof context): void;
		};

		prototype.handleHotkeysCommand.call(context);
		expect(render(feedback)).toContain("Keyboard Shortcuts");
		expect(render(context.focusedTranscriptContainer)).not.toContain("Keyboard Shortcuts");

		prototype.handleSessionCommand.call(context);
		const sessionFeedback = render(feedback);
		expect(sessionFeedback).toContain("Session Info");
		expect(sessionFeedback).toContain("focused-session-id");
		expect(sessionFeedback).not.toContain("Keyboard Shortcuts");
	});

	test("toggles during compaction and rebuilds both views on completion and reload", async () => {
		const entries = messageEntries([
			user("REBUILT_USER"),
			assistant([{ type: "text", text: "REBUILT_FINAL" }], "stop"),
		]);
		const context = createFocusedContext(entries) as unknown as {
			focusedTranscript: boolean;
			focusedTranscriptContainer: Container;
			chatContainer: Container;
			runtimeHost: {
				session: {
					settingsManager: { getShowCacheMissNotices(): boolean; getShowTerminalProgress(): boolean };
					modelRuntime: object;
					sessionManager: {
						buildContextEntries(): SessionEntry[];
						getEntries(): SessionEntry[];
					};
				};
			};
			pendingTools: Map<string, unknown>;
		};
		context.focusedTranscriptContainer.addChild(new Text("STALE_FOCUSED_OUTPUT", 0, 0));
		Object.assign(context.runtimeHost.session, {
			settingsManager: { getShowCacheMissNotices: () => false, getShowTerminalProgress: () => false },
			modelRuntime: {},
			isIdle: false,
			isCompacting: true,
		});
		Object.assign(context, {
			isInitialized: true,
			headerContainer: new Container(),
			loadedResourcesContainer: new Container(),
			documentContainer: new Container(),
			defaultEditor: { onEscape: vi.fn() },
			footer: { invalidate: vi.fn() },
			showStatusIndicator: vi.fn(),
			clearStatusIndicator: vi.fn(),
			updatePendingMessagesDisplay: vi.fn(),
			flushCompactionQueue: vi.fn(),
		});
		context.pendingTools = new Map();
		const { handleEvent, toggleFocusedTranscript: toggle } = InteractiveMode.prototype as unknown as {
			handleEvent(this: typeof context, event: AgentSessionEvent): Promise<void>;
			toggleFocusedTranscript(this: typeof context): void;
		};
		await handleEvent.call(context, { type: "compaction_start", reason: "manual" });
		toggle.call(context);
		expect(context.focusedTranscript).toBe(false);
		toggle.call(context);
		expect(context.focusedTranscript).toBe(true);
		context.chatContainer.addChild(new Text("STALE_ORDINARY_OUTPUT", 0, 0));
		context.focusedTranscriptContainer.addChild(new Text("STALE_FOCUSED_OUTPUT", 0, 0));
		const result = { summary: "COMPACTION_SUMMARY", tokensBefore: 100, firstKeptEntryId: "entry-0" };
		entries.unshift({
			type: "compaction",
			id: "compaction-entry",
			parentId: null,
			timestamp: new Date().toISOString(),
			...result,
		});
		await handleEvent.call(context, {
			type: "compaction_end",
			reason: "manual",
			result,
			aborted: false,
			willRetry: false,
		});
		expect(render(context.chatContainer)).toContain("Compacted from 100 tokens");
		expect(render(context.chatContainer)).not.toContain("STALE_ORDINARY_OUTPUT");
		expect(render(context.chatContainer)).toContain("REBUILT_FINAL");
		expect(render(context.focusedTranscriptContainer)).not.toContain("Compacted from");
		expect(render(context.focusedTranscriptContainer)).not.toContain("COMPACTION_SUMMARY");

		const rebuild = (
			InteractiveMode.prototype as unknown as {
				rebuildChatFromMessages(this: typeof context): void;
			}
		).rebuildChatFromMessages;

		const output = render(context.focusedTranscriptContainer);
		expect(output).toContain("REBUILT_USER");
		expect(output).toContain("REBUILT_FINAL");
		expect(output).not.toContain("STALE_FOCUSED_OUTPUT");

		// Reload replaces renderer inputs, so existing focused components must be recreated too.
		Object.assign(context, {
			outputPad: 3,
			getMarkdownTransformers: () => [(markdown: string) => markdown.replace("REBUILT", "RELOADED")],
		});
		rebuild.call(context);
		const refreshed = render(context.focusedTranscriptContainer);
		expect(refreshed).toContain("   RELOADED_USER");
		expect(refreshed).toContain("   RELOADED_FINAL");
		expect(refreshed).not.toContain("REBUILT");
	});

	test("updates output padding in both ordinary and focused containers during streaming", () => {
		const chatUser = new UserMessageComponent("CHAT_USER", getMarkdownTheme(), 1, []);
		const focusedUser = new UserMessageComponent("FOCUSED_USER", getMarkdownTheme(), 1, []);
		const streaming = new AssistantMessageComponent(
			assistant([{ type: "text", text: "STREAMING_ASSISTANT" }], "pending"),
			true,
			getMarkdownTheme(),
			"Thinking...",
			1,
			[],
		);
		const chatSetOutputPad = vi.spyOn(chatUser, "setOutputPad");
		const focusedSetOutputPad = vi.spyOn(focusedUser, "setOutputPad");
		const streamingSetOutputPad = vi.spyOn(streaming, "setOutputPad");
		const chat = new Container();
		chat.addChild(chatUser);
		chat.addChild(streaming);
		const focused = new Container();
		focused.addChild(focusedUser);
		let selector: SettingsSelectorComponent | undefined;
		const getterValues: Record<string, unknown> = {
			getDefaultProvider: undefined,
			getDefaultModel: undefined,
			getShowImages: false,
			getImageWidthCells: 60,
			getImageAutoResize: true,
			getBlockImages: false,
			getEnableSkillCommands: true,
			getTransport: "sse",
			getHttpIdleTimeoutMs: 300_000,
			getDefaultThinkingLevel: undefined,
			getAllModelThinkingLevels: {},
			getMermaidRenderingMode: "off",
			getCollapseChangelog: true,
			getEnableInstallTelemetry: false,
			getDoubleEscapeAction: "none",
			getTreeFilterMode: "default",
			getShowHardwareCursor: false,
			getShowCacheMissNotices: false,
			getDefaultProjectTrust: "ask",
			getEditorPaddingX: 1,
			getOutputPad: 1,
			getAutocompleteMaxVisible: 10,
			getQuietStartup: true,
			getClearOnShrink: true,
			getShowTerminalProgress: false,
			getFullscreenExitOutput: "resume-hint",
			getFullscreenScrollbar: "auto",
			getFullscreenCopyOnSelect: true,
			getWarnings: {},
		};
		const settingsManager = new Proxy(
			{},
			{
				get: (_target, property: string | symbol) => {
					if (typeof property !== "string") return undefined;
					return property.startsWith("get")
						? () => getterValues[property]
						: property.startsWith("set")
							? vi.fn()
							: undefined;
				},
			},
		);
		const context = Object.assign(Object.create(InteractiveMode.prototype), {
			chatContainer: chat,
			focusedTranscriptContainer: focused,
			streamingComponent: streaming,
			outputPad: 1,
			hideThinkingBlock: false,
			toolOutputExpanded: false,
			runtimeHost: {
				session: {
					settingsManager,
					autoCompactionEnabled: true,
					model: undefined,
					modelRuntime: { getAvailableSnapshot: () => [] },
					steeringMode: "all",
					followUpMode: "all",
					isStreaming: true,
				},
			},
			themeController: {
				getThemeSelection: () => "dark",
				getTerminalTheme: () => "dark",
			},
			ui: { ...createTuiStub(), mode: "regular" },
			showSelector: (factory: (done: () => void) => { component: Component }) => {
				selector = factory(() => {}).component as SettingsSelectorComponent;
			},
		});

		(
			InteractiveMode.prototype as unknown as {
				showSettingsSelector(this: typeof context): void;
			}
		).showSettingsSelector.call(context);
		const list = selector?.getSettingsList();
		expect(list).toBeDefined();
		list!.selectItem("output-padding");
		list!.handleInput("\r");

		expect(chatSetOutputPad).toHaveBeenCalledWith(0);
		expect(focusedSetOutputPad).toHaveBeenCalledWith(0);
		expect(streamingSetOutputPad).toHaveBeenCalledWith(0);
	});
});
