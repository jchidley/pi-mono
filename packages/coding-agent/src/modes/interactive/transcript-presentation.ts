import { type Component, Container } from "@earendil-works/pi-tui";

export interface TranscriptPresentationOptions {
	readonly header: Component;
	readonly resources: Component;
	readonly transcript: Component;
	readonly pendingOutput: Component;
}

/**
 * Owns transcript document composition, independently of the renderer and input dock.
 * The host supplies the ordinary live component graph and keeps updating it through
 * session events and native commands. Mount these surfaces in either native renderer;
 * do not reconstruct messages or mix the pending dock into the scrollable document.
 */
export class TranscriptPresentation {
	readonly document: Component;
	readonly pendingOutput: Component;

	constructor(options: TranscriptPresentationOptions) {
		const document = new Container();
		document.addChild(options.header);
		document.addChild(options.resources);
		document.addChild(options.transcript);
		this.document = document;
		this.pendingOutput = options.pendingOutput;
	}
}
