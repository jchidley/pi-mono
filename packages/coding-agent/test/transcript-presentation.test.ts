import { Container, Text } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { TranscriptPresentation } from "../src/modes/interactive/transcript-presentation.ts";

describe("ordinary transcript presentation", () => {
	it("presents header, resources and live transcript in order, with pending output on its own surface", () => {
		const transcript = new Container();
		const assistant = new Text("assistant: starting", 0, 0);
		transcript.addChild(new Text("user: hello", 0, 0));
		transcript.addChild(assistant);
		const pending = new Text("pending bash: running", 0, 0);
		const presentation = new TranscriptPresentation({
			header: new Text("header", 0, 0),
			resources: new Text("loaded resources", 0, 0),
			transcript,
			pendingOutput: pending,
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
		pending.setText("pending bash: complete");
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
