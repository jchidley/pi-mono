import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai/compat";
import { type Component, Container, type MarkdownTheme, Spacer } from "@earendil-works/pi-tui";
import { parseSkillBlock } from "../../core/agent-session.ts";
import type { MarkdownTransformer } from "../../core/extensions/types.ts";
import { AssistantMessageComponent } from "./components/assistant-message.ts";
import { UserMessageComponent } from "./components/user-message.ts";

export interface TranscriptPresentationOptions {
	readonly header: Component;
	readonly resources: Component;
	readonly transcript: Component;
	readonly pendingOutput: Container;
	readonly getMarkdownTheme: () => MarkdownTheme;
	readonly getOutputPad: () => number;
	readonly getMarkdownTransformers: () => readonly MarkdownTransformer[];
}

type ConversationMessage = (UserMessage & { content: string }) | AssistantMessage;

/**
 * Owns document selection and the text-only conversation projection. The host mounts
 * these stable surfaces, seeds current display history, and delivers live message
 * boundaries. Ordinary components continue receiving all updates while hidden.
 * Execution, persistence, fullscreen interactions and the pending dock belong to the host.
 */
export class TranscriptPresentation {
	readonly document = new Container();
	readonly pendingOutput: Component;
	private readonly ordinary = new Container();
	private readonly focused = new Container();
	private readonly conversation = new Container();
	private readonly options: TranscriptPresentationOptions;
	private messages: AgentMessage[] = [];
	private focusEnabled = false;

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

	toggleFocus(): void {
		this.focusEnabled = !this.focusEnabled;
		if (this.focusEnabled) this.refreshConversation();
		this.document.clear();
		this.document.addChild(this.focusEnabled ? this.focused : this.ordinary);
	}

	/** The caller supplies current branch, compaction-aware display history, not the archive. */
	replaceHistory(messages: readonly AgentMessage[]): void {
		this.messages = [...messages];
		this.refreshConversation();
	}

	/** Session-local presentation state is discarded, but the process-local viewing preference survives. */
	resetSession(): void {
		this.options.pendingOutput.clear();
		this.replaceHistory([]);
	}

	messageStarted(message: AgentMessage): void {
		if (message.role !== "user") return;
		this.messages.push(message);
		this.renderConversationMessage(message);
	}

	/** Consume the completed event directly: listeners run before session persistence. */
	messageEnded(message: AgentMessage): void {
		if (message.role !== "assistant" && message.role !== "user") return;
		if (!this.messages.includes(message)) this.messages.push(message);
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
			// CLI @file attachments use this envelope. Omit their bodies, not the user's surrounding text.
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

	/** Refresh rendering inputs without rebuilding the ordinary live component graph. */
	refreshConversation(): void {
		this.conversation.clear();
		for (const message of this.messages) this.renderConversationMessage(message);
	}

	private renderMessage(message: ConversationMessage): void {
		const markdownTheme = this.options.getMarkdownTheme();
		const outputPad = this.options.getOutputPad();
		const transformers = this.options.getMarkdownTransformers();
		if (message.role === "user") {
			if (this.conversation.children.length > 0) this.conversation.addChild(new Spacer(1));
			// User projections contain only their text, never media or expanded skill bodies.
			this.conversation.addChild(new UserMessageComponent(message.content, markdownTheme, outputPad, transformers));
		} else {
			this.conversation.addChild(
				new AssistantMessageComponent(message, false, markdownTheme, undefined, outputPad, transformers),
			);
		}
	}
}
