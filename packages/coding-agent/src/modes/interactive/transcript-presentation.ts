import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai/compat";
import { type Component, Container, type MarkdownTheme, Spacer } from "@earendil-works/pi-tui";
import { parseSkillBlock } from "../../core/agent-session.ts";
import type { MarkdownTransformer } from "../../core/extensions/types.ts";
import { AssistantMessageComponent } from "./components/assistant-message.ts";
import { UserMessageComponent } from "./components/user-message.ts";

export type TranscriptOutputIntent = "explicit" | "background";

export interface TranscriptPresentationOptions {
	readonly header: Component;
	readonly resources: Component;
	readonly transcript: Container;
	readonly pendingOutput: Container;
	readonly getMarkdownTheme: () => MarkdownTheme;
	readonly getOutputPad: () => number;
	readonly getMarkdownTransformers: () => readonly MarkdownTransformer[];
}

type ConversationMessage = (UserMessage & { content: string }) | AssistantMessage;

export class TranscriptPresentation {
	readonly document = new Container();
	readonly pendingOutput: Component;
	private readonly ordinary = new Container();
	private readonly focused = new Container();
	private readonly conversation = new Container();
	private readonly options: TranscriptPresentationOptions;
	private messages = new Set<AgentMessage>();
	private readonly messageComponents = new Map<Component, AgentMessage>();
	private readonly explicitOutput = new Set<Component>();
	private focusEnabled = false;
	private rebuildingHistory = false;
	private warnings = 0;
	private errors = 0;

	constructor(options: TranscriptPresentationOptions) {
		this.options = options;
		this.ordinary.addChild(options.header);
		this.ordinary.addChild(options.resources);
		this.ordinary.addChild(options.transcript);
		this.focused.addChild(options.header);
		this.focused.addChild(this.conversation);
		this.document.addChild(this.ordinary);
		this.pendingOutput = options.pendingOutput;
	}

	getStatus(): string | undefined {
		return this.focusEnabled ? `Focus W:${this.warnings} E:${this.errors}` : undefined;
	}

	reportDiagnostic(severity: "warning" | "error"): void {
		if (!this.focusEnabled) return;
		if (severity === "warning") this.warnings++;
		else this.errors++;
	}

	toggleFocus(): void {
		this.warnings = 0;
		this.errors = 0;
		this.focusEnabled = !this.focusEnabled;
		if (this.focusEnabled) this.refreshConversation();
		else this.conversation.clear();
		this.document.clear();
		this.document.addChild(this.focusEnabled ? this.focused : this.ordinary);
	}

	disableFocus(): void {
		if (this.focusEnabled) this.toggleFocus();
	}

	replaceHistory(messages: readonly AgentMessage[]): void {
		this.messages = new Set(messages);
		this.refreshConversation();
	}

	messagePresented(message: AgentMessage, component: Component): void {
		this.messageComponents.set(component, message);
		this.refreshConversation();
	}

	addExplicitOutput(...components: Component[]): void {
		this.addOutputs(components, "explicit");
	}

	addOutput(component: Component, intent: TranscriptOutputIntent = "background"): void {
		this.addOutputs([component], intent);
	}

	addOutputs(components: readonly Component[], intent: TranscriptOutputIntent = "background"): void {
		for (const component of components) {
			this.options.transcript.addChild(component);
			if (intent === "explicit") this.explicitOutput.add(component);
		}
		if (intent === "explicit") this.refreshConversation();
	}

	addDiagnostic(
		severity: "warning" | "error",
		components: readonly Component[],
		intent: TranscriptOutputIntent = "background",
	): void {
		this.reportDiagnostic(severity);
		this.addOutputs(components, intent);
	}

	rebuildHistory(
		messages: readonly AgentMessage[],
		activeManualBash: Component | undefined,
		render: () => undefined,
	): void {
		if (this.rebuildingHistory) throw new Error("Cannot nest transcript history rebuilds");
		const component = activeManualBash;
		const children = this.options.transcript.children;
		const index = component ? children.indexOf(component) : -1;
		const followingMessages =
			index < 0
				? undefined
				: new Set(
						children.slice(index + 1).flatMap((child) => {
							const message = this.messageComponents.get(child);
							return message ? [message] : [];
						}),
					);
		this.rebuildingHistory = true;
		try {
			this.replaceHistory(messages);
			render();
		} finally {
			if (component && followingMessages) {
				const restoredChildren = this.options.transcript.children;
				if (!restoredChildren.includes(component)) {
					const before = restoredChildren.findIndex((child) => {
						const message = this.messageComponents.get(child);
						return message !== undefined && followingMessages.has(message);
					});
					restoredChildren.splice(before < 0 ? restoredChildren.length : before, 0, component);
				}
				this.explicitOutput.add(component);
			}
			this.rebuildingHistory = false;
			this.refreshConversation();
		}
	}

	resetSession(): void {
		this.warnings = 0;
		this.errors = 0;
		this.options.pendingOutput.clear();
		this.messageComponents.clear();
		this.explicitOutput.clear();
		this.replaceHistory([]);
	}

	messageStarted(message: AgentMessage): void {
		if (message.role !== "user") return;
		this.messages.add(message);
		this.refreshConversation();
	}

	messageEnded(message: AgentMessage): void {
		if (message.role === "assistant") {
			if (message.stopReason === "error" || message.stopReason === "aborted") this.reportDiagnostic("error");
			else if (message.stopReason === "length") this.reportDiagnostic("warning");
		}
		if (message.role !== "assistant" && message.role !== "user") return;
		this.messages.add(message);
		this.refreshConversation();
	}

	private renderConversationMessage(message: AgentMessage): void {
		let projected: ConversationMessage;
		if (message.role === "user") {
			const text =
				typeof message.content === "string"
					? message.content
					: message.content
							.filter((block) => block.type === "text")
							.map((block) => block.text)
							.join("");
			const skill = parseSkillBlock(text);
			const userText = (skill ? (skill.userMessage ?? `/skill:${skill.name}`) : text).replace(
				/<file name="[^"]*">[\s\S]*?<\/file>\n?/g,
				"",
			);
			if (!userText.trim()) return;
			projected = { ...message, content: userText };
		} else if (
			message.role === "assistant" &&
			message.stopReason === "stop" &&
			!message.deferred &&
			!message.content.some((block) => block.type === "toolCall")
		) {
			const content = message.content.filter((block) => block.type === "text").map((block) => ({ ...block }));
			if (!content.some((block) => block.text.trim())) return;
			projected = { ...message, content };
		} else {
			return;
		}
		this.renderMessage(projected);
	}

	refreshConversation(): void {
		if (this.rebuildingHistory) return;
		this.conversation.clear();
		const nativeChildren = new Set(this.options.transcript.children);
		for (const component of this.messageComponents.keys()) {
			if (!nativeChildren.has(component)) this.messageComponents.delete(component);
		}
		for (const component of this.explicitOutput) {
			if (!nativeChildren.has(component)) this.explicitOutput.delete(component);
		}
		if (!this.focusEnabled) return;
		const presented = new Set<AgentMessage>();
		for (const component of this.options.transcript.children) {
			if (this.explicitOutput.has(component)) this.conversation.addChild(component);
			const message = this.messageComponents.get(component);
			if (message && this.messages.has(message) && !presented.has(message)) {
				this.renderConversationMessage(message);
				presented.add(message);
			}
		}
		for (const message of this.messages) {
			if (!presented.has(message)) this.renderConversationMessage(message);
		}
	}

	private renderMessage(message: ConversationMessage): void {
		const markdownTheme = this.options.getMarkdownTheme();
		const outputPad = this.options.getOutputPad();
		const transformers = this.options.getMarkdownTransformers();
		if (message.role === "user") {
			if (this.conversation.children.length > 0) this.conversation.addChild(new Spacer(1));
			this.conversation.addChild(new UserMessageComponent(message.content, markdownTheme, outputPad, transformers));
		} else {
			this.conversation.addChild(
				new AssistantMessageComponent(message, false, markdownTheme, undefined, outputPad, transformers),
			);
		}
	}
}
